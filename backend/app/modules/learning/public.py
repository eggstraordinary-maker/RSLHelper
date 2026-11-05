"""Learning use cases; delegated cleanup joins the caller's transaction."""

from sqlalchemy.ext.asyncio import AsyncSession

from . import repository
from .errors import AmbiguousLessonError, LessonNotFoundError
from .service import get_stats, list_legacy, list_progress, record_progress

__all__ = [
    "remove_user_data",
    "get_stats",
    "list_legacy",
    "list_progress",
    "record_progress",
    "AmbiguousLessonError",
    "LessonNotFoundError",
]


async def remove_user_data(db: AsyncSession, user_id: int) -> None:
    await repository.delete_user_data(db, user_id)
