import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import timedelta, datetime

from app.database import get_async_db
from app import crud, auth, email_utils, models
from app.config import settings
from app.schemas import (
    UserCreate, UserResponse, Token,
    EmailVerificationRequest, PasswordResetRequest,
    PasswordResetConfirm
)

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/register", response_model=UserResponse)
async def register(
        user_data: UserCreate,
        db: AsyncSession = Depends(get_async_db)
):
    """Регистрация нового пользователя"""
    try:
        user = await crud.create_user(db, user_data)

        # Создаем верификацию email
        verification = await crud.create_email_verification(db, user.email)

        # Отправляем email для подтверждения
        verification_url = f"{settings.frontend_url}/verify-email/{verification.token}"
        email_utils.send_verification_email(user.email, verification_url)

        return user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=Token)
async def login(
        form_data: OAuth2PasswordRequestForm = Depends(),
        db: AsyncSession = Depends(get_async_db)
):
    """Аутентификация пользователя"""
    user = await crud.get_user_by_email(db, form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    # Создаем токены
    access_token = auth.create_access_token(
        data={"sub": user.public_id},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
    )
    refresh_token = auth.create_refresh_token(
        data={"sub": user.public_id}
    )

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer"
    )


@router.post("/verify-email/{token}")
async def verify_email(
        token: str,
        db: AsyncSession = Depends(get_async_db)
):
    """Подтверждение email по токену"""
    success = await crud.verify_email_token(db, token)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    return {"message": "Email verified successfully"}


@router.post("/resend-verification")
async def resend_verification(
        request: EmailVerificationRequest,
        db: AsyncSession = Depends(get_async_db)
):
    """Повторная отправка email для подтверждения"""
    user = await crud.get_user_by_email(db, request.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_verified:
        raise HTTPException(status_code=400, detail="Email already verified")

    # Создаем новую верификацию
    verification = await crud.create_email_verification(db, user.email)

    # Отправляем email
    verification_url = f"{settings.frontend_url}/verify-email/{verification.token}"
    email_utils.send_verification_email(user.email, verification_url)

    return {"message": "Verification email sent"}


@router.post("/forgot-password")
async def forgot_password(
        request: PasswordResetRequest,
        db: AsyncSession = Depends(get_async_db)
):
    """Запрос на сброс пароля"""
    user = await crud.get_user_by_email(db, request.email)
    if user:
        # Генерируем токен для сброса пароля
        reset_token = str(uuid.uuid4())
        reset_expires = datetime.utcnow() + timedelta(hours=1)

        user.reset_token = reset_token
        user.reset_token_expires = reset_expires
        await db.commit()

        # Отправляем email
        reset_url = f"{settings.frontend_url}/reset-password/{reset_token}"
        email_utils.send_password_reset_email(user.email, reset_url)

    return {"message": "If email exists, reset instructions sent"}


@router.post("/reset-password")
async def reset_password(
        request: PasswordResetConfirm,
        db: AsyncSession = Depends(get_async_db)
):
    """Сброс пароля с использованием токена"""
    result = await db.execute(
        select(models.User).where(
            models.User.reset_token == request.token,
            models.User.reset_token_expires > datetime.utcnow()
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    await crud.update_password(db, user, request.new_password)
    return {"message": "Password updated successfully"}


@router.post("/refresh")
async def refresh_token(
        refresh_token: str,
        db: AsyncSession = Depends(get_async_db)
):
    """Обновление access token"""
    token_data = auth.verify_refresh_token(refresh_token)
    if not token_data:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = await crud.get_user_by_public_id(db, token_data.public_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Создаем новый access token
    access_token = auth.create_access_token(
        data={"sub": user.public_id},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
    )

    return {"access_token": access_token, "token_type": "bearer"}
