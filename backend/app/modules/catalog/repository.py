"""Catalog persistence. Commit/rollback belong to the calling use case."""

from dataclasses import asdict
from datetime import datetime, timezone
from typing import NamedTuple

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CatalogGesture, CatalogMedia, CatalogRevision, VideoFile
from .dto import DraftFields, GestureRecord, LessonRecord, RevisionRecord, ReviewStatus, UploadedVideo


class EditingState(NamedTuple):
    gesture: CatalogGesture
    lesson: VideoFile
    revision: CatalogRevision
    media: CatalogMedia | None


def _record(row: VideoFile, gesture_id: str | None, category: str | None, version: int | None) -> LessonRecord:
    return LessonRecord(
        id=row.id, lesson_id=row.lesson_id, filename=row.filename,
        description=row.description, object_name=row.object_name,
        is_published=row.is_published,
        title=row.title, category=category or None, gesture_id=gesture_id, version=version,
    )


def _published():
    return (
        select(VideoFile, CatalogGesture.id, CatalogRevision.category, CatalogRevision.version)
        .outerjoin(CatalogGesture, CatalogGesture.lesson_id == VideoFile.lesson_id)
        .outerjoin(CatalogRevision, and_(
            CatalogRevision.gesture_id == CatalogGesture.id,
            CatalogRevision.version == CatalogGesture.published_version,
        ))
        .where(VideoFile.is_published.is_(True), VideoFile.object_name.isnot(None))
    )


async def published_lessons(db: AsyncSession) -> list[LessonRecord]:
    rows = await db.execute(_published().order_by(VideoFile.id))
    return [_record(*row) for row in rows]


async def published_lesson(db: AsyncSession, lesson_id: str) -> LessonRecord | None:
    row = (await db.execute(_published().where(VideoFile.lesson_id == lesson_id))).one_or_none()
    return _record(*row) if row is not None else None


async def published_object(db: AsyncSession, object_name: str) -> LessonRecord | None:
    row = (await db.execute(_published().where(VideoFile.object_name == object_name))).one_or_none()
    return _record(*row) if row is not None else None


async def published_by_label(db: AsyncSession, label: str) -> list[LessonRecord]:
    rows = await db.execute(_published().where(
        or_(VideoFile.description == label, VideoFile.filename == label, VideoFile.title == label),
    ))
    return [_record(*row) for row in rows]


def revision_record(revision: CatalogRevision, media: CatalogMedia | None) -> RevisionRecord:
    created_at = revision.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return RevisionRecord(
        version=revision.version, title=revision.title, description=revision.description,
        category=revision.category, source=revision.source, consent_reference=revision.consent_reference,
        filename=media.filename if media else None, video_withdrawn=bool(media and media.withdrawn_at),
        review_status=revision.review_status, review_note=revision.review_note, action=revision.action,
        author_id=revision.author_id, created_at=created_at.astimezone(timezone.utc),
    )


def gesture_record(gesture: CatalogGesture, revision: CatalogRevision, media: CatalogMedia | None) -> GestureRecord:
    return GestureRecord(
        gesture.id, gesture.lesson_id, gesture.archived, gesture.published_version, revision_record(revision, media),
    )


def _current():
    return (
        select(CatalogGesture, VideoFile, CatalogRevision, CatalogMedia)
        .join(VideoFile, VideoFile.lesson_id == CatalogGesture.lesson_id)
        .join(CatalogRevision, and_(
            CatalogRevision.gesture_id == CatalogGesture.id,
            CatalogRevision.version == CatalogGesture.version,
        ))
        .outerjoin(CatalogMedia, CatalogMedia.id == CatalogRevision.media_id)
    )


async def current_gesture(db: AsyncSession, gesture_id: str, *, lock: bool) -> EditingState | None:
    # Acquire the lock in a separate statement. After waiting for another writer,
    # READ COMMITTED must see both its version pointer and the inserted revision.
    if lock:
        locked = await db.scalar(
            select(CatalogGesture.id).where(CatalogGesture.id == gesture_id).with_for_update()
        )
        if locked is None:
            return None
    row = (await db.execute(
        _current().where(CatalogGesture.id == gesture_id).execution_options(populate_existing=True)
    )).one_or_none()
    return EditingState(*row) if row is not None else None


async def gestures(db: AsyncSession, offset: int, limit: int) -> list[GestureRecord]:
    rows = await db.execute(_current().order_by(VideoFile.id.desc()).offset(offset).limit(limit))
    return [gesture_record(gesture, revision, media) for gesture, _, revision, media in rows]


def _history(gesture_id: str):
    return (
        select(CatalogRevision, CatalogMedia)
        .outerjoin(CatalogMedia, CatalogMedia.id == CatalogRevision.media_id)
        .where(CatalogRevision.gesture_id == gesture_id)
    )


async def history(db: AsyncSession, gesture_id: str, before: int, limit: int) -> list[RevisionRecord]:
    rows = await db.execute(
        _history(gesture_id).where(CatalogRevision.version < before)
        .order_by(CatalogRevision.version.desc()).limit(limit)
    )
    return [revision_record(revision, media) for revision, media in rows]


async def version_media(db: AsyncSession, gesture_id: str, version: int) -> CatalogMedia | None:
    row = (await db.execute(_history(gesture_id).where(CatalogRevision.version == version))).one_or_none()
    return row[1] if row else None


async def add_lesson(db: AsyncSession, *, lesson_id: str, title: str) -> VideoFile:
    row = VideoFile(lesson_id=lesson_id, filename="", title=title, is_published=False)
    db.add(row)
    await db.flush()
    return row


async def add_gesture(db: AsyncSession, gesture_id: str, lesson_id: str) -> CatalogGesture:
    gesture = CatalogGesture(id=gesture_id, lesson_id=lesson_id, version=1, archived=False)
    db.add(gesture)
    await db.flush()
    return gesture


async def add_video(db: AsyncSession, gesture_id: str, media_id: str, uploaded: UploadedVideo) -> CatalogMedia:
    media = CatalogMedia(id=media_id, gesture_id=gesture_id, **asdict(uploaded))
    db.add(media)
    await db.flush()
    return media


async def append_revision(
    db: AsyncSession, gesture: CatalogGesture, fields: DraftFields, media: CatalogMedia | None,
    *, action: str, author_id: int, review_status: ReviewStatus = "draft", review_note: str = "",
) -> CatalogRevision:
    revision = CatalogRevision(
        gesture_id=gesture.id, version=gesture.version, media_id=media.id if media else None,
        **asdict(fields), action=action, author_id=author_id, review_status=review_status, review_note=review_note,
    )
    db.add(revision)
    await db.flush()
    return revision


def publish(lesson: VideoFile, fields: DraftFields, media: CatalogMedia) -> None:
    lesson.title = fields.title
    lesson.description = fields.description
    lesson.filename = media.filename
    lesson.object_name = media.object_name
    lesson.is_published = True


def hide(lesson: VideoFile) -> None:
    lesson.is_published = False
    lesson.object_name = None


def withdraw(media: CatalogMedia, now: datetime) -> None:
    media.withdrawn_at = now
