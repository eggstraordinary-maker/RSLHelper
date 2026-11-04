"""Learning cleanup participates in the caller's account deletion transaction."""

from sqlalchemy.ext.asyncio import AsyncSession

from . import repository


async def remove_user_data(db: AsyncSession, user_id: int) -> None:
    await repository.delete_user_data(db, user_id)
