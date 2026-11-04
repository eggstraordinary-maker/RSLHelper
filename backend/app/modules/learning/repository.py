from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LegacyProgressMapping, UserLearningProgress


async def delete_user_data(db: AsyncSession, user_id: int):
    await db.execute(delete(UserLearningProgress).where(UserLearningProgress.user_id == user_id))
    await db.execute(delete(LegacyProgressMapping).where(LegacyProgressMapping.user_id == user_id))
