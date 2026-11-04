from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.dependencies import get_current_active_user
from app import models, schemas, crud
from app.modules.accounts import public as accounts
from app.modules.accounts.errors import AccountNotFoundError, IncorrectPasswordError

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
    except AccountNotFoundError:
        raise HTTPException(status_code=404, detail="User not found") from None
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/me", status_code=204)
async def delete_user_account(
    request: schemas.DeleteAccountRequest,
    current_user: models.User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    try:
        await accounts.delete_account(db, current_user.id, password=request.password)
    except IncorrectPasswordError:
        raise HTTPException(status_code=400, detail="Incorrect password") from None
    except AccountNotFoundError:
        raise HTTPException(status_code=404, detail="User not found") from None
    return Response(status_code=204)
