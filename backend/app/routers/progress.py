from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.dependencies import get_current_active_user
from app.schemas import (
    LegacyProgress,
    PracticeAttempt,
    ProgressStats,
    UserProgress,
    UserResponse,
)
from app.modules.learning import public as learning

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/stats", response_model=ProgressStats)
async def get_progress_stats(
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    return await learning.get_stats(db, current_user.id)


@router.get("/lessons", response_model=list[UserProgress])
async def list_progress(
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    return await learning.list_progress(db, current_user.id)


@router.get("/legacy", response_model=list[LegacyProgress])
async def unresolved_progress(
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    return await learning.list_legacy(db, current_user.id)


async def _record(db, user_id, lesson_id, *, practice, completed, legacy_label=None):
    try:
        return await learning.record_progress(
            db,
            user_id,
            lesson_id,
            practice=practice,
            completed=completed,
            legacy_label=legacy_label,
        )
    except learning.LessonNotFoundError:
        raise HTTPException(status_code=404, detail="Lesson not found") from None
    except learning.AmbiguousLessonError:
        raise HTTPException(
            status_code=409, detail="Ambiguous lesson; use lesson_id"
        ) from None


@router.post("/lessons/{lesson_id}/attempts", response_model=UserProgress)
async def practice_lesson(
    lesson_id: UUID,
    attempt: PracticeAttempt,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    return await _record(
        db, current_user.id, str(lesson_id), practice=True, completed=attempt.completed
    )


@router.put("/lessons/{lesson_id}/completion", response_model=UserProgress)
async def complete_lesson(
    lesson_id: UUID,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    return await _record(
        db, current_user.id, str(lesson_id), practice=False, completed=True
    )


@router.post("/complete/{word}", response_model=UserProgress, deprecated=True)
async def complete_legacy_lesson(
    word: str,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    return await _record(
        db, current_user.id, "", practice=True, completed=True, legacy_label=word
    )
