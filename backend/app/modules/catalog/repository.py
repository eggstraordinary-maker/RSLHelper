"""Catalog persistence. Commit/rollback belong to the calling use case."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import VideoFile


@dataclass(frozen=True)
class LessonRecord:
    id: int
    lesson_id: str
    filename: str
    description: str | None
    object_name: str
    is_published: bool


def _record(row: VideoFile) -> LessonRecord:
    return LessonRecord(
        id=row.id, lesson_id=row.lesson_id, filename=row.filename,
        description=row.description, object_name=row.object_name,
        is_published=row.is_published,
    )


def _published():
    return VideoFile.is_published.is_(True), VideoFile.object_name.isnot(None)


async def published_lessons(db: AsyncSession) -> list[LessonRecord]:
    rows = await db.scalars(select(VideoFile).where(*_published()).order_by(VideoFile.id))
    return [_record(row) for row in rows]


async def published_lesson(db: AsyncSession, lesson_id: str) -> LessonRecord | None:
    row = await db.scalar(select(VideoFile).where(VideoFile.lesson_id == lesson_id, *_published()))
    return _record(row) if row is not None else None


async def published_object(db: AsyncSession, object_name: str) -> LessonRecord | None:
    row = await db.scalar(select(VideoFile).where(VideoFile.object_name == object_name, *_published()))
    return _record(row) if row is not None else None


async def add_lesson(db: AsyncSession, *, lesson_id: str, filename: str, description: str, object_name: str) -> LessonRecord:
    row = VideoFile(
        lesson_id=lesson_id, filename=filename, description=description,
        object_name=object_name, is_published=True,
    )
    db.add(row)
    await db.flush()
    return _record(row)
