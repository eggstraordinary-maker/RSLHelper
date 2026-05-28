from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_async_db
from app.dependencies import get_current_admin_user
from app import models, schemas, crud

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/users", response_model=list[schemas.UserResponse])
async def get_all_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_admin: models.User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Получить список всех пользователей (только для администратора)."""
    # Здесь нужна новая функция в crud, например, crud.get_users
    users = await crud.get_users(db, skip=skip, limit=limit)
    return users

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Удалить пользователя по ID (только для администратора)."""
    user = await crud.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.id == current_admin.id:
        raise HTTPException(status_code=400, detail="Администратор не может удалить сам себя")
    
    await crud.delete_user(db, user)
    return None # 204 No Content