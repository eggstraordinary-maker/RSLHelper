from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app import crud, auth

security = HTTPBearer()


async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: AsyncSession = Depends(get_async_db)
):
    token = credentials.credentials
    token_data = auth.verify_token(token)

    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Ищем пользователя по public_id из токена
    user = await crud.get_user_by_public_id(db, token_data.public_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    return user


async def get_current_active_user(current_user=Depends(get_current_user)):
    if not current_user.is_verified:
        raise HTTPException(status_code=400, detail="Email not verified")
    return current_user
