from datetime import datetime

from sqlalchemy import case, delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningAttemptReceipt, LegacyProgressMapping, UserLearningProgress, VideoFile


def _published():
    # A read-only projection over the shared ORM registry; catalog remains the
    # only writer of lesson metadata. Keep aggregates in SQL, without N+1 calls.
    return VideoFile.is_published.is_(True), VideoFile.object_name.isnot(None)


async def progress_rows(db: AsyncSession, user_id: int):
    return (
        await db.scalars(
            select(UserLearningProgress)
            .join(
                VideoFile,
                UserLearningProgress.lesson_id == VideoFile.lesson_id,
            )
            .where(UserLearningProgress.user_id == user_id, *_published())
            .order_by(UserLearningProgress.id)
        )
    ).all()


async def legacy_rows(db: AsyncSession, user_id: int):
    return (
        await db.scalars(
            select(LegacyProgressMapping)
            .where(
                LegacyProgressMapping.user_id == user_id,
                LegacyProgressMapping.status.in_(["ambiguous", "unmatched"]),
            )
            .order_by(LegacyProgressMapping.progress_id)
        )
    ).all()


async def stats_snapshot(
    db: AsyncSession, user_id: int
) -> tuple[int, int, list[str], int]:
    total = (
        await db.scalar(
            select(func.count()).select_from(VideoFile).where(*_published())
        )
        or 0
    )
    completed = (
        select(UserLearningProgress)
        .join(VideoFile, UserLearningProgress.lesson_id == VideoFile.lesson_id)
        .where(
            UserLearningProgress.user_id == user_id,
            UserLearningProgress.completed.is_(True),
            *_published(),
        )
    )
    count = await db.scalar(select(func.count()).select_from(completed.subquery())) or 0
    recent = (
        await db.scalars(
            select(
                func.coalesce(
                    func.nullif(VideoFile.description, ""), VideoFile.filename
                )
            )
            .select_from(UserLearningProgress)
            .join(VideoFile, UserLearningProgress.lesson_id == VideoFile.lesson_id)
            .where(
                UserLearningProgress.user_id == user_id,
                UserLearningProgress.completed.is_(True),
                *_published(),
            )
            .order_by(
                UserLearningProgress.completed_at.desc().nullslast(),
                UserLearningProgress.id.desc(),
            )
            .limit(5)
        )
    ).all()
    unresolved = (
        await db.scalar(
            select(func.count())
            .select_from(LegacyProgressMapping)
            .where(
                LegacyProgressMapping.user_id == user_id,
                LegacyProgressMapping.status.in_(["ambiguous", "unmatched"]),
            )
        )
        or 0
    )
    return total, count, list(recent), unresolved


async def upsert_progress(
    db: AsyncSession,
    user_id: int,
    lesson_id: str,
    word: str,
    *,
    practice: bool,
    completed: bool,
    now: datetime,
):
    table = UserLearningProgress.__table__
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    values = dict(
        user_id=user_id,
        lesson_id=lesson_id,
        word=word,
        attempts=int(practice),
        completed=completed,
        completed_at=now if completed else None,
    )
    updates = {"word": word}
    if practice:
        updates["attempts"] = func.coalesce(table.c.attempts, 0) + 1
    if completed:
        updates["completed"] = True
        updates["completed_at"] = case(
            (table.c.completed_at.is_(None), now), else_=table.c.completed_at
        )
    await db.execute(
        insert(table)
        .values(**values)
        .on_conflict_do_update(
            index_elements=[table.c.user_id, table.c.lesson_id],
            set_=updates,
        )
    )
    return (
        await db.execute(
            select(UserLearningProgress)
            .where(
                UserLearningProgress.user_id == user_id,
                UserLearningProgress.lesson_id == lesson_id,
            )
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


async def delete_user_data(db: AsyncSession, user_id: int):
    await db.execute(
        delete(LearningAttemptReceipt).where(LearningAttemptReceipt.user_id == user_id)
    )
    await db.execute(
        delete(UserLearningProgress).where(UserLearningProgress.user_id == user_id)
    )
    await db.execute(
        delete(LegacyProgressMapping).where(LegacyProgressMapping.user_id == user_id)
    )


async def claim_attempt(db: AsyncSession, user_id: int, attempt_id: str, lesson_id: str, completed: bool) -> bool:
    table = LearningAttemptReceipt.__table__
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    claimed = await db.scalar(
        insert(table).values(user_id=user_id, attempt_id=attempt_id, lesson_id=lesson_id, completed=completed)
        .on_conflict_do_nothing(index_elements=[table.c.user_id, table.c.attempt_id])
        .returning(table.c.attempt_id)
    )
    return claimed is not None


async def attempt_receipt(db: AsyncSession, user_id: int, attempt_id: str):
    # This SELECT must be a separate statement after ON CONFLICT. Under
    # PostgreSQL READ COMMITTED it sees the competing transaction's commit.
    return await db.scalar(select(LearningAttemptReceipt).where(
        LearningAttemptReceipt.user_id == user_id,
        LearningAttemptReceipt.attempt_id == attempt_id,
    ))


async def finish_attempt(db: AsyncSession, user_id: int, attempt_id: str, response: dict) -> None:
    await db.execute(update(LearningAttemptReceipt).where(
        LearningAttemptReceipt.user_id == user_id,
        LearningAttemptReceipt.attempt_id == attempt_id,
    ).values(response_payload=response))
