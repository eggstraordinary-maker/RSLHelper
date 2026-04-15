from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.dependencies import get_current_active_user
from app import models, schemas

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=schemas.UserResponse)
async def read_users_me(
        current_user: models.User = Depends(get_current_active_user)
):
    """Получение информации о текущем пользователе"""
    return current_user


@router.put("/me")
async def update_user_profile(
        update_data: schemas.UserUpdate,
        current_user: models.User = Depends(get_current_active_user),
        db: AsyncSession = Depends(get_async_db)
):
    """Обновление профиля пользователя"""
    # Здесь логика обновления профиля
    pass
