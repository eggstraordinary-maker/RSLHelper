from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.dependencies import get_current_active_user
from app.models import LegacyProgressMapping, User, UserLearningProgress, VideoFile
from app.schemas import LegacyProgress, PracticeAttempt, ProgressStats, UserProgress
from app.services.progress import published_lessons, record_progress

router = APIRouter(prefix="/progress", tags=["progress"])


async def _lesson(db: AsyncSession, lesson_id: UUID) -> VideoFile:
    lesson = await db.scalar(
        select(VideoFile).where(
            VideoFile.lesson_id == str(lesson_id), *published_lessons()
        )
    )
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


@router.get("/stats", response_model=ProgressStats)
async def get_progress_stats(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    total = (
        await db.scalar(
            select(func.count()).select_from(VideoFile).where(*published_lessons())
        )
        or 0
    )
    completed = (
        select(UserLearningProgress)
        .join(VideoFile, UserLearningProgress.lesson_id == VideoFile.lesson_id)
        .where(
            UserLearningProgress.user_id == current_user.id,
            UserLearningProgress.completed.is_(True),
            *published_lessons(),
        )
    )
    count = await db.scalar(select(func.count()).select_from(completed.subquery())) or 0
    recent = (
        (
            await db.execute(
                select(
                    func.coalesce(
                        func.nullif(VideoFile.description, ""), VideoFile.filename
                    )
                )
                .select_from(UserLearningProgress)
                .join(VideoFile, UserLearningProgress.lesson_id == VideoFile.lesson_id)
                .where(
                    UserLearningProgress.user_id == current_user.id,
                    UserLearningProgress.completed.is_(True),
                    *published_lessons(),
                )
                .order_by(
                    UserLearningProgress.completed_at.desc().nullslast(),
                    UserLearningProgress.id.desc(),
                )
                .limit(5)
            )
        )
        .scalars()
        .all()
    )
    unresolved = (
        await db.scalar(
            select(func.count())
            .select_from(LegacyProgressMapping)
            .where(
                LegacyProgressMapping.user_id == current_user.id,
                LegacyProgressMapping.status.in_(["ambiguous", "unmatched"]),
            )
        )
        or 0
    )
    return ProgressStats(
        total_lessons=total,
        completed_lessons=count,
        completed_percentage=round(count / total * 100, 2) if total else 0,
        recent_lessons=list(recent),
        unresolved_legacy_records=unresolved,
    )


@router.get("/lessons", response_model=list[UserProgress])
async def list_progress(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    return (
        (
            await db.execute(
                select(UserLearningProgress)
                .join(VideoFile, UserLearningProgress.lesson_id == VideoFile.lesson_id)
                .where(
                    UserLearningProgress.user_id == current_user.id,
                    *published_lessons(),
                )
                .order_by(UserLearningProgress.id)
            )
        )
        .scalars()
        .all()
    )


@router.get("/legacy", response_model=list[LegacyProgress])
async def unresolved_progress(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    return (
        (
            await db.execute(
                select(LegacyProgressMapping)
                .where(
                    LegacyProgressMapping.user_id == current_user.id,
                    LegacyProgressMapping.status.in_(["ambiguous", "unmatched"]),
                )
                .order_by(LegacyProgressMapping.progress_id)
            )
        )
        .scalars()
        .all()
    )


@router.post("/lessons/{lesson_id}/attempts", response_model=UserProgress)
async def practice_lesson(
    lesson_id: UUID,
    attempt: PracticeAttempt,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    return await record_progress(
        db,
        current_user.id,
        await _lesson(db, lesson_id),
        practice=True,
        completed=attempt.completed,
    )


@router.put("/lessons/{lesson_id}/completion", response_model=UserProgress)
async def complete_lesson(
    lesson_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    return await record_progress(
        db,
        current_user.id,
        await _lesson(db, lesson_id),
        practice=False,
        completed=True,
    )


@router.post("/complete/{word}", response_model=UserProgress, deprecated=True)
async def complete_legacy_lesson(
    word: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    # Compatibility only: reject unknown and ambiguous labels, never create them.
    lessons = (
        (
            await db.execute(
                select(VideoFile).where(
                    (VideoFile.description == word) | (VideoFile.filename == word),
                    *published_lessons(),
                )
            )
        )
        .scalars()
        .all()
    )
    if not lessons:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if len(lessons) > 1:
        raise HTTPException(status_code=409, detail="Ambiguous lesson; use lesson_id")
    return await record_progress(
        db, current_user.id, lessons[0], practice=True, completed=True
    )
