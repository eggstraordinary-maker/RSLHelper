"""Account use cases and transaction boundaries.

Credential operations lock User before credential rows. A login/refresh cannot
issue a surviving session after a concurrent reset or account deletion.
"""

from datetime import datetime, timedelta
import secrets

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app import auth, models, schemas
from app.config import settings
from app.modules.learning import public as learning

from . import repository as repo
from .errors import (
    AccountConflictError, AccountNotFoundError, AccountPermissionError,
    AccountPersistenceError, EmailAlreadyVerifiedError, IncorrectPasswordError, InvalidCredentialsError,
    InvalidRefreshTokenError, InvalidResetTokenError, SelfDeletionError,
)


def _integrity_error(exc: IntegrityError):
    field = repo.identity_conflict(exc)
    return AccountConflictError(field) if field else AccountPersistenceError("Account operation could not be saved")


async def create_user(db: AsyncSession, data: schemas.UserCreate):
    try:
        if await repo.user_by_email(db, data.email):
            raise AccountConflictError("email")
        if await repo.user_by_username(db, data.username):
            raise AccountConflictError("username")
        hashed_password = await run_in_threadpool(auth.get_password_hash, data.password)
        user = models.User(email=data.email, username=data.username, hashed_password=hashed_password)
        db.add(user)
        await db.flush()  # DB uniqueness is authoritative even when prechecks race.
        await db.commit()
        await db.refresh(user)
        return user
    except IntegrityError as exc:
        await db.rollback()
        raise _integrity_error(exc) from None
    except BaseException:
        await db.rollback()
        raise


async def update_profile(db: AsyncSession, user_id: int, data: schemas.UserUpdate):
    try:
        user = await repo.user_by_id(db, user_id, lock=True)
        if user is None:
            raise AccountNotFoundError("User not found")
        changes = data.model_dump(exclude_unset=True)
        username = changes.get("username")
        if username and username != user.username:
            existing = await repo.user_by_username(db, username)
            if existing and existing.id != user.id:
                raise AccountConflictError("username")
        for name, value in changes.items():
            setattr(user, name, value)
        await db.flush()
        await db.commit()
        await db.refresh(user)
        return user
    except IntegrityError as exc:
        await db.rollback()
        raise _integrity_error(exc) from None
    except BaseException:
        await db.rollback()
        raise


def _issue_token_pair(db: AsyncSession, user: models.User) -> schemas.Token:
    access = auth.create_access_token({"sub": user.public_id})
    refresh = auth.create_refresh_token({"sub": user.public_id})
    db.add(models.RefreshToken(
        token_hash=auth.hash_token(refresh), user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days),
        is_revoked=False,
    ))
    return schemas.Token(access_token=access, refresh_token=refresh)


async def login(db: AsyncSession, email: str, password: str) -> schemas.Token:
    try:
        user = await repo.user_by_email(db, email, lock=True)
        if (user is None or not user.is_active or not user.is_verified
                or not await run_in_threadpool(auth.verify_password, password, user.hashed_password)):
            raise InvalidCredentialsError("Incorrect email or password")
        tokens = _issue_token_pair(db, user)
        await db.commit()
        return tokens
    except BaseException:
        await db.rollback()
        raise


async def rotate_refresh(db: AsyncSession, raw_token: str) -> schemas.Token:
    try:
        token_data = auth.verify_refresh_token(raw_token)
        if token_data is None:
            raise InvalidRefreshTokenError("Invalid refresh token")
        user = await repo.user_by_public_id(db, token_data.public_id, lock=True)
        if user is None or await repo.consume_refresh(db, auth.hash_token(raw_token), user.id) is None:
            raise InvalidRefreshTokenError("Invalid refresh token")
        if not user.is_active or not user.is_verified:
            await db.commit()
            raise InvalidRefreshTokenError("Invalid refresh token")
        tokens = _issue_token_pair(db, user)
        await db.commit()
        return tokens
    except BaseException:
        await db.rollback()
        raise


async def reset_password(db: AsyncSession, raw_token: str, new_password: str) -> None:
    try:
        digest = auth.hash_token(raw_token)
        # Cheap eligibility screening avoids bcrypt work for arbitrary input.
        # It never consumes the token; the conditional write is authoritative.
        if not await repo.reset_eligible(db, digest):
            raise InvalidResetTokenError("Invalid or expired token")
        hashed_password = await run_in_threadpool(auth.get_password_hash, new_password)
        # The conditional update consumes the token and locks User atomically;
        # PostgreSQL rechecks the predicate after another transaction commits.
        user_id = await repo.consume_reset(db, digest, hashed_password)
        if user_id is None:
            raise InvalidResetTokenError("Invalid or expired token")
        await repo.revoke_refresh_tokens(db, user_id)
        await db.commit()
    except BaseException:
        await db.rollback()
        raise


async def change_password(db: AsyncSession, user_id: int, current_password: str, new_password: str):
    try:
        user = await repo.user_by_id(db, user_id, lock=True)
        if user is None:
            raise AccountNotFoundError("User not found")
        if not await run_in_threadpool(auth.verify_password, current_password, user.hashed_password):
            raise IncorrectPasswordError("Incorrect current password")
        hashed_password = await run_in_threadpool(auth.get_password_hash, new_password)
        user.hashed_password = hashed_password
        user.reset_token = None
        user.reset_token_expires = None
        await repo.revoke_refresh_tokens(db, user.id)
        await db.commit()
    except BaseException:
        await db.rollback()
        raise


async def delete_account(db: AsyncSession, user_id: int, *, password: str | None = None, admin_id: int | None = None):
    try:
        if admin_id is not None:
            actor = await repo.user_by_id(db, admin_id)
            if actor is None or not actor.is_active or not actor.is_verified or actor.role != models.UserRole.ADMIN.value:
                raise AccountPermissionError("Недостаточно прав доступа")
            if admin_id == user_id:
                raise SelfDeletionError("Администратор не может удалить сам себя")
        user = await repo.user_by_id(db, user_id, lock=True)
        if user is None:
            raise AccountNotFoundError("User not found")
        if admin_id is None and (password is None or not await run_in_threadpool(auth.verify_password, password, user.hashed_password)):
            raise IncorrectPasswordError("Incorrect password")
        await learning.remove_user_data(db, user.id)
        await repo.delete_credentials(db, user)
        await repo.delete_user(db, user)
        await db.commit()
    except BaseException:
        await db.rollback()
        raise


async def create_verification(db: AsyncSession, email: str):
    try:
        user = await repo.user_by_email(db, email, lock=True)
        if user is None:
            raise AccountNotFoundError("User not found")
        if user.is_verified:
            raise EmailAlreadyVerifiedError("Email already verified")
        verification, token = await repo.replace_verification(db, user.email)
        await db.commit()
        return verification, token
    except BaseException:
        await db.rollback()
        raise


async def verify_email(db: AsyncSession, raw_token: str) -> bool:
    try:
        digest = auth.hash_token(raw_token)
        candidate = await repo.verification(db, digest)
        if candidate is None:
            await db.rollback()
            return False
        user = await repo.user_by_email(db, candidate.email, lock=True)
        if user is None:
            await db.rollback()
            return False
        verification = await repo.verification(db, digest, lock=True)
        if verification is None:
            await db.rollback()
            return False
        verification.is_used = True
        user.is_verified = True
        user.verification_token = None
        user.verification_token_expires = None
        await db.commit()
        return True
    except BaseException:
        await db.rollback()
        raise


async def issue_password_reset(db: AsyncSession, email: str):
    try:
        user = await repo.user_by_email(db, email, lock=True)
        if user is None:
            await db.rollback()
            return None
        token = secrets.token_urlsafe(32)
        user.reset_token = auth.hash_token(token)
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
        address = user.email
        await db.commit()
        return address, token
    except BaseException:
        await db.rollback()
        raise
