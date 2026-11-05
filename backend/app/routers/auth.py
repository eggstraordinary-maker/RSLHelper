import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app import email_utils
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
from app.modules.accounts import public as accounts
from app.modules.accounts.errors import (
    AccountNotFoundError, EmailAlreadyVerifiedError, IncorrectPasswordError, InvalidCredentialsError,
    InvalidRefreshTokenError, InvalidResetTokenError,
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


@router.post("/register", response_model=UserResponse, summary="Создать аккаунт и отправить подтверждение",
             responses={503: {"description": "Аккаунт создан, доставка не завершена; повторите /auth/resend-verification"}})
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_async_db)):
    try:
        user, verification_token = await accounts.register_account(db, user_data)
        verification_url = (
            f"{settings.frontend_url}/verify-email#{verification_token}"
        )
        if not await _send_email_safely(
            email_utils.send_verification_email, user.email, verification_url
        ):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "verification_delivery_unavailable", "account_created": True,
                        "message": "Account created; retry /auth/resend-verification"},
            )
        return user
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_async_db),
):
    try:
        return await accounts.login(db, form_data.username, form_data.password)
    except InvalidCredentialsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None


@router.post("/verify-email/{token}")
async def verify_email(token: str, db: AsyncSession = Depends(get_async_db)):
    if not await accounts.verify_email(db, token):
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    return {"message": "Email verified successfully"}


@router.post("/verify-email")
async def verify_email_from_body(
    request: EmailVerificationTokenRequest,
    db: AsyncSession = Depends(get_async_db),
):
    if not await accounts.verify_email(db, request.token):
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    return {"message": "Email verified successfully"}


@router.post("/resend-verification", summary="Повторно отправить подтверждение",
             responses={503: {"description": "Доставка временно недоступна; запрос можно повторить"}})
async def resend_verification(
    request: EmailVerificationRequest,
    db: AsyncSession = Depends(get_async_db),
):
    try:
        verification_token = await accounts.create_verification(db, request.email)
    except AccountNotFoundError:
        raise HTTPException(status_code=404, detail="User not found") from None
    except EmailAlreadyVerifiedError:
        raise HTTPException(status_code=400, detail="Email already verified") from None
    verification_url = f"{settings.frontend_url}/verify-email#{verification_token}"
    if not await _send_email_safely(
        email_utils.send_verification_email, request.email, verification_url
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
    issued = await accounts.issue_password_reset(db, request.email)
    if issued:
        email, reset_token = issued
        reset_url = f"{settings.frontend_url}/reset-password#{reset_token}"
        await _send_email_safely(
            email_utils.send_password_reset_email, email, reset_url
        )

    # Keep the response identical whether or not the address is registered.
    return {"message": "If email exists, reset instructions sent"}


@router.post("/reset-password")
async def reset_password(
    request: PasswordResetConfirm,
    db: AsyncSession = Depends(get_async_db),
):
    try:
        await accounts.reset_password(db, request.token, request.new_password)
    except InvalidResetTokenError:
        raise HTTPException(status_code=400, detail="Invalid or expired token") from None
    return {"message": "Password updated successfully"}


@router.post("/refresh", response_model=Token)
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_async_db),
):
    try:
        return await accounts.rotate_refresh(db, request.refresh_token)
    except InvalidRefreshTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from None


@router.post("/logout")
async def logout(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_async_db),
):
    await accounts.logout(db, request.refresh_token)
    # Logout stays idempotent and does not reveal whether a token was stored.
    return {"message": "Logged out"}


@router.post("/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
):
    try:
        await accounts.change_password(db, current_user.id, password_data.current_password, password_data.new_password)
    except IncorrectPasswordError:
        raise HTTPException(status_code=400, detail="Incorrect current password") from None
    except AccountNotFoundError:
        raise HTTPException(status_code=404, detail="User not found") from None
    return {"message": "Password changed successfully"}
