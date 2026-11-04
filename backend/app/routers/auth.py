import logging
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app import auth, crud, email_utils, models
from app.config import settings
from app.database import get_async_db
from app.dependencies import get_current_active_user
from app.schemas import (
    EmailVerificationRequest,
    EmailVerificationTokenRequest,
    PasswordChange,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshTokenRequest,
    Token,
    UserCreate,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["authentication"])
logger = logging.getLogger(__name__)


async def _send_email_safely(sender, *args) -> bool:
    try:
        delivered = await run_in_threadpool(sender, *args)
    except Exception as exc:
        # Never log the message arguments: they contain addresses and tokenized URLs.
        logger.warning("Email delivery failed (%s)", type(exc).__name__)
        return False
    if not delivered:
        logger.warning("Email delivery failed")
    return bool(delivered)


def _issue_token_pair(db: AsyncSession, user: models.User) -> Token:
    access_token = auth.create_access_token(
        data={"sub": user.public_id},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    refresh_token = auth.create_refresh_token(data={"sub": user.public_id})
    db.add(
        models.RefreshToken(
            token_hash=auth.hash_token(refresh_token),
            user_id=user.id,
            expires_at=datetime.utcnow()
            + timedelta(days=settings.refresh_token_expire_days),
            is_revoked=False,
        )
    )
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_async_db)):
    try:
        user = await crud.create_user(db, user_data)
        _verification, verification_token = await crud.create_email_verification(
            db, user.email
        )
        verification_url = (
            f"{settings.frontend_url}/verify-email#{verification_token}"
        )
        if not await _send_email_safely(
            email_utils.send_verification_email, user.email, verification_url
        ):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Email delivery is temporarily unavailable; retry verification later",
            )
        return user
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_async_db),
):
    user = await crud.get_user_by_email(db, form_data.username)
    if (
        not user
        or not auth.verify_password(form_data.password, user.hashed_password)
        or not user.is_active
        or not user.is_verified
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_pair = _issue_token_pair(db, user)
    await db.commit()
    return token_pair


@router.post("/verify-email/{token}")
async def verify_email(token: str, db: AsyncSession = Depends(get_async_db)):
    if not await crud.verify_email_token(db, token):
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    return {"message": "Email verified successfully"}


@router.post("/verify-email")
async def verify_email_from_body(
    request: EmailVerificationTokenRequest,
    db: AsyncSession = Depends(get_async_db),
):
    if not await crud.verify_email_token(db, request.token):
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    return {"message": "Email verified successfully"}


@router.post("/resend-verification")
async def resend_verification(
    request: EmailVerificationRequest,
    db: AsyncSession = Depends(get_async_db),
):
    user = await crud.get_user_by_email(db, request.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Email already verified")

    _verification, verification_token = await crud.create_email_verification(
        db, user.email
    )
    verification_url = f"{settings.frontend_url}/verify-email#{verification_token}"
    if not await _send_email_safely(
        email_utils.send_verification_email, user.email, verification_url
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email delivery is temporarily unavailable; retry later",
        )
    return {"message": "Verification email sent"}


@router.post("/forgot-password")
async def forgot_password(
    request: PasswordResetRequest,
    db: AsyncSession = Depends(get_async_db),
):
    user = await crud.get_user_by_email(db, request.email)
    if user:
        reset_token = secrets.token_urlsafe(32)
        user.reset_token = auth.hash_token(reset_token)
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
        await db.commit()

        reset_url = f"{settings.frontend_url}/reset-password#{reset_token}"
        await _send_email_safely(
            email_utils.send_password_reset_email, user.email, reset_url
        )

    # Keep the response identical whether or not the address is registered.
    return {"message": "If email exists, reset instructions sent"}


@router.post("/reset-password")
async def reset_password(
    request: PasswordResetConfirm,
    db: AsyncSession = Depends(get_async_db),
):
    result = await db.execute(
        select(models.User).where(
            models.User.reset_token == auth.hash_token(request.token),
            models.User.reset_token_expires > datetime.utcnow(),
        )
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    await crud.update_password(db, user, request.new_password)
    return {"message": "Password updated successfully"}


@router.post("/refresh", response_model=Token)
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_async_db),
):
    token_data = auth.verify_refresh_token(request.refresh_token)
    if token_data is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    token_hash = auth.hash_token(request.refresh_token)
    consumed = await db.execute(
        update(models.RefreshToken)
        .where(
            models.RefreshToken.token_hash == token_hash,
            models.RefreshToken.is_revoked.is_(False),
            models.RefreshToken.expires_at > datetime.utcnow(),
        )
        .values(is_revoked=True)
    )
    if consumed.rowcount != 1:
        await db.rollback()
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(
        select(models.RefreshToken.user_id).where(
            models.RefreshToken.token_hash == token_hash
        )
    )
    user_id = result.scalar_one()
    user = await crud.get_user_by_id(db, user_id)
    if (
        user is None
        or user.public_id != token_data.public_id
        or not user.is_active
        or not user.is_verified
    ):
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    token_pair = _issue_token_pair(db, user)
    await db.commit()
    return token_pair


@router.post("/logout")
async def logout(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_async_db),
):
    token_data = auth.verify_refresh_token(request.refresh_token)
    if token_data is not None:
        await db.execute(
            update(models.RefreshToken)
            .where(
                models.RefreshToken.token_hash
                == auth.hash_token(request.refresh_token),
                models.RefreshToken.is_revoked.is_(False),
            )
            .values(is_revoked=True)
        )
        await db.commit()
    # Logout stays idempotent and does not reveal whether a token was stored.
    return {"message": "Logged out"}


@router.post("/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: models.User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    if not auth.verify_password(
        password_data.current_password, current_user.hashed_password
    ):
        raise HTTPException(status_code=400, detail="Incorrect current password")

    current_user.hashed_password = auth.get_password_hash(password_data.new_password)
    current_user.reset_token = None
    current_user.reset_token_expires = None
    await crud.revoke_user_refresh_tokens(db, current_user.id)
    await db.commit()
    return {"message": "Password changed successfully"}
