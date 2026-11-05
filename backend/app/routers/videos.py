"""Catalog HTTP transport; lesson URLs do not expose object-store keys."""

import logging
from threading import Lock
from uuid import UUID

import anyio
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.database import get_async_db
from app.dependencies import get_current_admin_user
from app.modules.catalog import public as catalog
from app.modules.catalog.errors import (
    InvalidRangeError, MediaNotFoundError, MediaTooLargeError,
    MediaUnavailableError, UnsupportedMediaError,
)
from app.schemas import LessonResponse, VideoResponse

router = APIRouter(prefix="/videos", tags=["videos"])
logger = logging.getLogger(__name__)


def _lesson_response(lesson) -> LessonResponse:
    return LessonResponse(
        id=lesson.id, lesson_id=lesson.lesson_id, filename=lesson.filename,
        description=lesson.description, is_published=lesson.is_published,
        media_url=f"/videos/lessons/{lesson.lesson_id}/content",
    )


def _legacy_response(lesson) -> VideoResponse:
    return VideoResponse(
        id=lesson.id, lesson_id=lesson.lesson_id, filename=lesson.filename,
        description=lesson.description, is_published=lesson.is_published,
        object_name=lesson.object_name,
    )


@router.post(
    "/upload", response_model=VideoResponse, deprecated=True,
    summary="Загрузить проверенный MP4 урока",
    description="Только администратор. Legacy-ответ содержит внутренний ключ; публичный каталог использует lesson_id.",
    responses={413: {"description": "Превышен лимит размера"}, 415: {"description": "Недопустимый MP4"}, 503: {"description": "Хранилище или проверка временно недоступны"}},
)
async def upload_video(
    file: UploadFile = File(...),
    description: str = Form("", max_length=10000),
    db: AsyncSession = Depends(get_async_db),
    _current_admin=Depends(get_current_admin_user),
):
    # Authentication performed read-only queries in this request's session.
    # Release that transaction/connection before disk probing and S3 I/O.
    try:
        await db.rollback()
    except Exception as exc:
        logger.warning("Media authentication transaction close failed (%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Video could not be saved") from None
    try:
        lesson = await catalog.upload_lesson(db, file.file, file.filename, file.content_type, description)
        return _legacy_response(lesson)
    except MediaTooLargeError:
        raise HTTPException(status_code=413, detail="Video exceeds the upload size limit") from None
    except UnsupportedMediaError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from None
    except MediaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None


@router.get("/lessons", response_model=list[LessonResponse], summary="Получить опубликованные уроки")
async def list_lessons(db: AsyncSession = Depends(get_async_db)):
    return [_lesson_response(lesson) for lesson in await catalog.list_lessons(db)]


class _BodyOwner:
    """Close a storage body exactly once across iterator/response cancellation."""

    def __init__(self, body):
        self.body = body
        self._closed = False
        self._lock = Lock()

    def close(self):
        with self._lock:
            if self._closed:
                return
            self._closed = True
        try:
            self.body.close()
        except Exception as exc:
            logger.warning("Media stream close failed (%s)", type(exc).__name__)


class _ClosingStreamingResponse(StreamingResponse):
    def __init__(self, owner: _BodyOwner, length: int, *, headers: dict, status_code: int):
        self._owner = owner

        async def chunks():
            remaining = length
            try:
                while remaining:
                    try:
                        chunk = await run_in_threadpool(owner.body.read, min(64 * 1024, remaining))
                    except Exception as exc:
                        logger.warning("Media stream read failed (%s)", type(exc).__name__)
                        raise RuntimeError("Media stream unavailable") from None
                    if not chunk:
                        raise RuntimeError("Media stream ended unexpectedly")
                    remaining -= len(chunk)
                    yield chunk
            finally:
                owner.close()

        super().__init__(chunks(), media_type="video/mp4", headers=headers, status_code=status_code)

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            # Includes disconnect while sending headers before the first yield.
            with anyio.CancelScope(shield=True):
                await run_in_threadpool(self._owner.close)


async def _content_response(request: Request, lesson, *, legacy: bool = False):
    try:
        media = await catalog.read_media(
            lesson, range_header=request.headers.get("range"),
            if_range=request.headers.get("if-range"), head=request.method == "HEAD",
        )
    except InvalidRangeError as exc:
        raise HTTPException(status_code=416, detail="Requested byte range is not satisfiable", headers={"Content-Range": f"bytes */{exc.size}"}) from None
    except MediaNotFoundError:
        raise HTTPException(status_code=404, detail="Video not found") from None
    except MediaUnavailableError:
        raise HTTPException(status_code=404 if legacy else 503, detail="Video not found" if legacy else "Video storage is temporarily unavailable") from None
    headers = {
        "Accept-Ranges": "bytes", "Content-Length": str(media.length),
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    }
    if media.partial:
        headers["Content-Range"] = f"bytes {media.start}-{media.end}/{media.size}"
    if request.method == "HEAD":
        return Response(media_type="video/mp4", headers=headers)
    return _ClosingStreamingResponse(_BodyOwner(media.body), media.length, headers=headers, status_code=206 if media.partial else 200)


async def _published_lesson(db: AsyncSession, lesson_id: UUID):
    try:
        return await catalog.get_lesson(db, str(lesson_id))
    except MediaNotFoundError:
        raise HTTPException(status_code=404, detail="Video not found") from None


@router.get(
    "/lessons/{lesson_id}/content", response_class=StreamingResponse,
    summary="Получить MP4 опубликованного урока",
    responses={206: {"description": "Один диапазон байтов"}, 416: {"description": "Диапазон вне файла"}, 404: {"description": "Урок не опубликован или отсутствует"}},
)
async def lesson_content(lesson_id: UUID, request: Request, db: AsyncSession = Depends(get_async_db)):
    return await _content_response(request, await _published_lesson(db, lesson_id))


@router.head("/lessons/{lesson_id}/content", summary="Проверить метаданные MP4 без загрузки тела")
async def lesson_content_head(lesson_id: UUID, request: Request, db: AsyncSession = Depends(get_async_db)):
    return await _content_response(request, await _published_lesson(db, lesson_id))


@router.get("/", response_model=list[VideoResponse], deprecated=True)
async def list_videos(db: AsyncSession = Depends(get_async_db)):
    return [_legacy_response(lesson) for lesson in await catalog.list_lessons(db)]


@router.get("/stream/{object_name:path}", deprecated=True, response_class=StreamingResponse)
async def stream_video(request: Request, object_name: str, db: AsyncSession = Depends(get_async_db)):
    try:
        lesson = await catalog.get_legacy_lesson(db, object_name)
    except MediaNotFoundError:
        raise HTTPException(status_code=404, detail="Video not found") from None
    return await _content_response(request, lesson, legacy=True)


@router.get("/{object_name:path}", deprecated=True)
async def get_video(object_name: str, db: AsyncSession = Depends(get_async_db)):
    try:
        lesson = await catalog.get_legacy_lesson(db, object_name)
        return {"url": await catalog.legacy_url(lesson)}
    except MediaNotFoundError:
        raise HTTPException(status_code=404, detail="Video not found") from None
