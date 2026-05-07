from http.client import HTTPException

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.dependencies import get_current_active_user
from app import models, schemas, crud, auth

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=schemas.UserResponse)
async def read_users_me(
        current_user: models.User = Depends(get_current_active_user)
):
    """Получение информации о текущем пользователе"""
    return current_user


@router.put("/me", response_model=schemas.UserResponse)
async def update_user_profile(
    update_data: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    try:
        updated_user = await crud.update_user(db, current_user, update_data)
        return updated_user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/me", status_code=204)
async def delete_user_account(
    request: schemas.DeleteAccountRequest,
    current_user: models.User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    if not auth.verify_password(request.password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password")
    await db.delete(current_user)
    await db.commit()
    return Response(status_code=204)