from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_async_db
from app.dependencies import get_current_admin_user
from app import schemas
from app.modules.accounts import public as accounts
from app.modules.accounts.errors import AccountNotFoundError, AccountPermissionError, SelfDeletionError

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/users", response_model=list[schemas.UserResponse])
async def get_all_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_admin: schemas.UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Получить список всех пользователей (только для администратора)."""
    try:
        return await accounts.list_users(db, current_admin.id, skip=skip, limit=limit)
    except AccountPermissionError:
        raise HTTPException(status_code=403, detail="Недостаточно прав доступа") from None

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    current_admin: schemas.UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Удалить пользователя по ID (только для администратора)."""
    try:
        await accounts.delete_account(db, user_id, admin_id=current_admin.id)
    except AccountNotFoundError:
        raise HTTPException(status_code=404, detail="Пользователь не найден") from None
    except SelfDeletionError:
        raise HTTPException(status_code=400, detail="Администратор не может удалить сам себя") from None
    except AccountPermissionError:
        raise HTTPException(status_code=403, detail="Недостаточно прав доступа") from None
    return None # 204 No Content
