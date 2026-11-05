"""User-scoped learning use cases; no HTTP or cross-module repositories."""

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app import schemas
from app.modules.catalog import public as catalog
from . import repository as repo
from .errors import AmbiguousLessonError, LessonNotFoundError


async def get_stats(db: AsyncSession, user_id: int) -> schemas.ProgressStats:
    total, completed, recent, unresolved = await repo.stats_snapshot(db, user_id)
    return schemas.ProgressStats(
        total_lessons=total,
        completed_lessons=completed,
        completed_percentage=round(completed / total * 100, 2) if total else 0,
        recent_lessons=recent,
        unresolved_legacy_records=unresolved,
    )


async def list_progress(db: AsyncSession, user_id: int) -> list[schemas.UserProgress]:
    return [
        schemas.UserProgress.model_validate(row)
        for row in await repo.progress_rows(db, user_id)
    ]


async def list_legacy(db: AsyncSession, user_id: int) -> list[schemas.LegacyProgress]:
    return [
        schemas.LegacyProgress.model_validate(row)
        for row in await repo.legacy_rows(db, user_id)
    ]


async def record_progress(
    db: AsyncSession,
    user_id: int,
    lesson_id: str,
    *,
    practice: bool,
    completed: bool,
    legacy_label: str | None = None,
) -> schemas.UserProgress:
    try:
        if legacy_label is None:
            lesson = await catalog.get_lesson(db, lesson_id)
        else:
            lesson = await catalog.resolve_legacy_label(db, legacy_label)
        row = await repo.upsert_progress(
            db,
            user_id,
            lesson.lesson_id,
            (lesson.description or lesson.filename)[:100],
            practice=practice,
            completed=completed,
            now=datetime.now(timezone.utc),
        )
        # Materialize the response before commit; a failed write/DTO cannot
        # acknowledge a change or leave an implicit read transaction afterwards.
        result = schemas.UserProgress.model_validate(row)
        await db.commit()
        return result
    except catalog.MediaNotFoundError:
        await db.rollback()
        raise LessonNotFoundError("Lesson not found") from None
    except catalog.AmbiguousLessonError:
        await db.rollback()
        raise AmbiguousLessonError("Ambiguous lesson; use lesson_id") from None
    except BaseException:
        await db.rollback()
        raise
