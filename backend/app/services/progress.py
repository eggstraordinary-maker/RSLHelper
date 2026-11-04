"""User-scoped progress, with atomic updates on PostgreSQL and SQLite."""

from datetime import datetime, timezone

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserLearningProgress, VideoFile


def published_lessons():
    return (VideoFile.is_published.is_(True), VideoFile.object_name.isnot(None))


async def record_progress(
    db: AsyncSession,
    user_id: int,
    lesson: VideoFile,
    *,
    practice: bool,
    completed: bool,
) -> UserLearningProgress:
    table = UserLearningProgress.__table__
    dialect = db.get_bind().dialect.name
    insert = pg_insert if dialect == "postgresql" else sqlite_insert
    now = datetime.now(timezone.utc)
    values = {
        "user_id": user_id,
        "lesson_id": lesson.lesson_id,
        "word": (lesson.description or lesson.filename)[:100],
        "attempts": int(practice),
        "completed": completed,
        "completed_at": now if completed else None,
    }
    statement = insert(table).values(**values)
    updates = {"word": values["word"]}
    if practice:
        updates["attempts"] = func.coalesce(table.c.attempts, 0) + 1
    if completed:
        updates["completed"] = True
        updates["completed_at"] = case(
            (table.c.completed_at.is_(None), now), else_=table.c.completed_at
        )
    statement = statement.on_conflict_do_update(
        index_elements=[table.c.user_id, table.c.lesson_id], set_=updates
    )
    await db.execute(statement)
    await db.commit()
    return (
        await db.execute(
            select(UserLearningProgress)
            .where(
                UserLearningProgress.user_id == user_id,
                UserLearningProgress.lesson_id == lesson.lesson_id,
            )
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
