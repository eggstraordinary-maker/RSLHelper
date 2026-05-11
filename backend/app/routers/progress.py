from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_async_db
from app.models import User, UserLearningProgress, VideoFile
from app.dependencies import get_current_user
from app.schemas import UserProgress, ProgressStats, UserProgressCreate

router = APIRouter(prefix="/progress", tags=["progress"])

@router.get("/stats", response_model=ProgressStats)
async def get_progress_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):

    total_result = await db.execute(
        select(func.count()).select_from(VideoFile).where(VideoFile.filename.isnot(None))
    )
    total_lessons = total_result.scalar() or 0

    if total_lessons == 0:
        return ProgressStats(
            total_lessons=0,
            completed_lessons=0,
            completed_percentage=0.0,
            recent_lessons=[]
        )

    # 2. Получаем завершённые уроки пользователя
    completed_result = await db.execute(
        select(UserLearningProgress).where(
            UserLearningProgress.user_id == current_user.id,
            UserLearningProgress.completed == True
        )
    )
    completed = completed_result.scalars().all()
    completed_lessons = len(completed)
    completed_percentage = (completed_lessons / total_lessons * 100)


    recent = [p.word for p in sorted(completed, key=lambda x: x.completed_at, reverse=True)[:5]]

    return ProgressStats(
        total_lessons=total_lessons,
        completed_lessons=completed_lessons,
        completed_percentage=completed_percentage,
        recent_lessons=recent
    )


@router.post("/complete/{word}", response_model=UserProgress)
async def complete_lesson(
    word: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    # Проверяем, есть ли уже запись о прогрессе для этого слова
    result = await db.execute(
        select(UserLearningProgress).where(
            UserLearningProgress.user_id == current_user.id,
            UserLearningProgress.word == word
        )
    )
    progress = result.scalar_one_or_none()

    if progress:
        if not progress.completed:
            progress.completed = True
            progress.completed_at = func.now()
        progress.attempts += 1
    else:
        progress = UserLearningProgress(
            user_id=current_user.id,
            word=word,
            completed=True,
            completed_at=func.now(),
            attempts=1
        )
        db.add(progress)

    await db.commit()
    await db.refresh(progress)
    return progress