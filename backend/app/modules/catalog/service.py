"""Bounded MP4 validation, catalog transactions and object-store coordination."""

from dataclasses import dataclass
from datetime import timedelta
import json
import logging
from pathlib import Path
import re
import subprocess
import tempfile
from typing import BinaryIO
from uuid import uuid4

import anyio
from botocore.exceptions import ClientError
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.services.storage import ObjectStorage, StoredObject, storage

from . import repository as repo
from .errors import (
    InvalidRangeError, MediaNotFoundError, MediaTooLargeError,
    MediaUnavailableError, UnsupportedMediaError,
)

logger = logging.getLogger(__name__)
CHUNK_SIZE = 64 * 1024
MP4_BRANDS = {b"isom", b"iso2", b"iso3", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"dash", b"M4V ", b"MSNV"}


@dataclass(frozen=True)
class PreparedUpload:
    path: Path
    size: int
    filename: str


@dataclass(frozen=True)
class MediaRead:
    size: int
    start: int
    end: int
    partial: bool
    body: StoredObject | None

    @property
    def length(self) -> int:
        return self.end - self.start + 1


def _check_mp4_envelope(path: Path, size: int) -> None:
    """Reject malformed/truncated BMFF boxes before invoking the bounded probe."""
    seen = set()
    with path.open("rb") as source:
        position = 0
        box_count = 0
        while position < size:
            box_count += 1
            if box_count > 10000 or size - position < 8:
                raise UnsupportedMediaError("Upload a valid MP4 video")
            source.seek(position)
            header = source.read(8)
            length, kind = int.from_bytes(header[:4], "big"), header[4:]
            header_size = 8
            if length == 1:
                extended = source.read(8)
                if len(extended) != 8:
                    raise UnsupportedMediaError("Upload a valid MP4 video")
                length, header_size = int.from_bytes(extended, "big"), 16
            elif length == 0:
                length = size - position
            if length < header_size or position + length > size:
                raise UnsupportedMediaError("Upload a valid MP4 video")
            if position == 0 and kind != b"ftyp":
                raise UnsupportedMediaError("Upload a valid MP4 video")
            if kind == b"ftyp":
                if length - header_size < 8 or length > 4096:
                    raise UnsupportedMediaError("Upload a valid MP4 video")
                payload = source.read(length - header_size)
                brands = {payload[:4]} | {payload[offset:offset + 4] for offset in range(8, len(payload), 4)}
                if not brands.intersection(MP4_BRANDS):
                    raise UnsupportedMediaError("Upload a valid MP4 video")
            if kind == b"mdat" and length == header_size:
                raise UnsupportedMediaError("Upload a valid MP4 video")
            seen.add(kind)
            position += length
    if not {b"ftyp", b"moov", b"mdat"}.issubset(seen):
        raise UnsupportedMediaError("Upload a valid MP4 video")


def _probe_mp4(path: Path) -> None:
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error", "-protocol_whitelist", "file",
                "-format_whitelist", "mov", "-enable_drefs", "0", "-use_absolute_path", "0",
                "-select_streams", "v:0",
                "-show_entries", "format=format_name:stream=codec_type,codec_name,width,height",
                "-of", "json", str(path),
            ],
            capture_output=True, text=True, check=True,
            timeout=settings.media_probe_timeout_seconds,
        )
        info = json.loads(result.stdout)
        streams = info.get("streams", [])
        if not any(
            stream.get("codec_type") == "video" and stream.get("codec_name")
            and int(stream.get("width", 0)) > 0 and int(stream.get("height", 0)) > 0
            for stream in streams
        ):
            raise UnsupportedMediaError("Upload an MP4 containing a video stream")
    except FileNotFoundError:
        raise MediaUnavailableError("Media validation is temporarily unavailable") from None
    except (subprocess.SubprocessError, json.JSONDecodeError, TypeError, ValueError):
        raise UnsupportedMediaError("Upload a valid MP4 video") from None


def prepare_upload(source: BinaryIO, filename: str | None, content_type: str | None) -> PreparedUpload:
    display_name = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    if (not display_name.lower().endswith(".mp4") or len(display_name) > 255
            or any(ord(character) < 32 for character in display_name)
            or content_type not in {"video/mp4", "application/octet-stream"}):
        raise UnsupportedMediaError("Only MP4 video uploads are supported")
    path = None
    try:
        with tempfile.NamedTemporaryFile(prefix="rsl-media-", suffix=".mp4", delete=False) as destination:
            path = Path(destination.name)
            count = 0
            while chunk := source.read(CHUNK_SIZE):
                count += len(chunk)
                if count > settings.media_max_upload_bytes:
                    raise MediaTooLargeError("Video exceeds the upload size limit")
                destination.write(chunk)
        if count == 0:
            raise UnsupportedMediaError("Upload a non-empty MP4 video")
        _check_mp4_envelope(path, count)
        _probe_mp4(path)
        return PreparedUpload(path=path, size=count, filename=display_name)
    except BaseException:
        if path is not None:
            path.unlink(missing_ok=True)
        raise


def _put(prepared: PreparedUpload, object_name: str, object_store: ObjectStorage):
    with prepared.path.open("rb") as source:
        object_store.put_object(object_name, source, prepared.size, "video/mp4")


async def _cleanup(object_store: ObjectStorage, object_name: str):
    try:
        await run_in_threadpool(object_store.delete_object, object_name)
    except Exception as exc:
        logger.warning("Media upload cleanup failed (%s)", type(exc).__name__)


async def _rollback_safely(db: AsyncSession):
    try:
        await db.rollback()
    except Exception as exc:
        # Connection loss during rollback must not prevent compensation or
        # replace the safe error with infrastructure diagnostics.
        logger.warning("Media transaction rollback failed (%s)", type(exc).__name__)


def _confirmed_commit_failure(exc: BaseException) -> bool:
    if isinstance(exc, IntegrityError):
        return True
    if isinstance(exc, DBAPIError) and not exc.connection_invalidated:
        original = exc.orig
        code = getattr(original, "sqlstate", None) or getattr(original, "pgcode", None)
        return bool(code and str(code).startswith(("23", "40")))
    return False


async def upload_lesson(
    db: AsyncSession, source: BinaryIO, filename: str | None,
    content_type: str | None, description: str,
):
    prepared = await run_in_threadpool(prepare_upload, source, filename, content_type)
    object_name = f"{uuid4().hex}.mp4"
    object_store = storage
    try:
        try:
            await run_in_threadpool(_put, prepared, object_name, object_store)
        except BaseException as exc:
            with anyio.CancelScope(shield=True):
                await _cleanup(object_store, object_name)
            if not isinstance(exc, Exception):
                raise
            logger.warning("Media upload failed (%s)", type(exc).__name__)
            raise MediaUnavailableError("Video storage is temporarily unavailable") from None
        try:
            lesson = await repo.add_lesson(
                db, lesson_id=str(uuid4()), filename=prepared.filename,
                description=description, object_name=object_name,
            )
        except BaseException as exc:
            with anyio.CancelScope(shield=True):
                await _rollback_safely(db)
                await _cleanup(object_store, object_name)
            if not isinstance(exc, Exception):
                raise
            logger.warning("Media metadata write failed (%s)", type(exc).__name__)
            raise MediaUnavailableError("Video could not be saved") from None
        try:
            await db.commit()
        except BaseException as exc:
            # A lost DB connection during commit has an unknown outcome. Retain
            # the object rather than break a possibly committed lesson record.
            with anyio.CancelScope(shield=True):
                await _rollback_safely(db)
                if _confirmed_commit_failure(exc):
                    await _cleanup(object_store, object_name)
            if not isinstance(exc, Exception):
                raise
            logger.warning("Media metadata commit failed (%s)", type(exc).__name__)
            raise MediaUnavailableError("Video could not be saved") from None
        return lesson
    finally:
        prepared.path.unlink(missing_ok=True)


async def list_lessons(db: AsyncSession):
    return await repo.published_lessons(db)


async def get_lesson(db: AsyncSession, lesson_id: str):
    lesson = await repo.published_lesson(db, lesson_id)
    if lesson is None:
        raise MediaNotFoundError("Video not found")
    return lesson


async def get_legacy_lesson(db: AsyncSession, object_name: str):
    lesson = await repo.published_object(db, object_name)
    if lesson is None:
        raise MediaNotFoundError("Video not found")
    return lesson


def single_range(value: str | None, size: int) -> tuple[int, int] | None:
    if value is None or len(value) > 256 or "," in value:
        return None
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value.strip(), flags=re.ASCII)
    if match is None or not any(match.groups()):
        return None  # Ignore unsupported units, malformed and multiple ranges.
    first, last = match.groups()
    if first:
        start = int(first)
        end = min(int(last), size - 1) if last else size - 1
        if start >= size or end < start:
            raise InvalidRangeError(size)
    else:
        count = int(last)
        if count == 0:
            raise InvalidRangeError(size)
        start, end = max(0, size - count), size - 1
    return start, end


def _not_found(exc: Exception) -> bool:
    if not isinstance(exc, ClientError):
        return False
    response = exc.response
    return response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404 or response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}


async def read_media(lesson: repo.LessonRecord, *, range_header: str | None, if_range: str | None, head: bool) -> MediaRead:
    try:
        metadata = await run_in_threadpool(storage.stat_object, lesson.object_name)
    except Exception as exc:
        logger.warning("Media metadata lookup failed (%s)", type(exc).__name__)
        if _not_found(exc):
            raise MediaNotFoundError("Video not found") from None
        raise MediaUnavailableError("Video storage is temporarily unavailable") from None
    if metadata.size <= 0 or metadata.content_type.split(";", 1)[0].lower() != "video/mp4":
        raise MediaNotFoundError("Video not found")
    selected = None if head or if_range is not None else single_range(range_header, metadata.size)
    start, end = selected or (0, metadata.size - 1)
    if head:
        return MediaRead(metadata.size, start, end, False, None)
    try:
        body = await run_in_threadpool(
            storage.get_object, lesson.object_name,
            f"bytes={start}-{end}" if selected else None,
        )
    except Exception as exc:
        logger.warning("Media retrieval failed (%s)", type(exc).__name__)
        if _not_found(exc):
            raise MediaNotFoundError("Video not found") from None
        raise MediaUnavailableError("Video storage is temporarily unavailable") from None
    return MediaRead(metadata.size, start, end, selected is not None, body)


async def legacy_url(lesson: repo.LessonRecord) -> str:
    try:
        return await run_in_threadpool(storage.presigned_get_object, lesson.object_name, timedelta(hours=2))
    except Exception as exc:
        logger.warning("Media link generation failed (%s)", type(exc).__name__)
        raise MediaNotFoundError("Video not found") from None
