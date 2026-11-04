"""Accounts persistence. The calling service owns commit and rollback."""

from datetime import datetime
import re

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import models


async def user_by_id(db: AsyncSession, user_id: int, *, lock: bool = False):
    return await _user(db, models.User.id == user_id, lock=lock)


async def user_by_email(db: AsyncSession, email: str, *, lock: bool = False):
    return await _user(db, models.User.email == email, lock=lock)


async def user_by_public_id(db: AsyncSession, public_id: str, *, lock: bool = False):
    return await _user(db, models.User.public_id == public_id, lock=lock)


async def user_by_username(db: AsyncSession, username: str):
    return await _user(db, models.User.username == username)


async def _user(db: AsyncSession, predicate, *, lock: bool = False):
    query = select(models.User).where(predicate)
    if lock:
        # Authentication may already have populated this identity map before
        # another request changed credentials. Re-read after acquiring the lock.
        query = query.with_for_update().execution_options(populate_existing=True)
    return await db.scalar(query)


def identity_conflict(exc: IntegrityError) -> str | None:
    original = exc.orig
    code = getattr(original, "sqlstate", None) or getattr(original, "pgcode", None)
    diagnostic = getattr(original, "diag", None)
    constraint = getattr(diagnostic, "constraint_name", None)
    cause = original
    for _ in range(3):
        if cause is None:
            break
        constraint = constraint or getattr(cause, "constraint_name", None)
        code = code or getattr(cause, "sqlstate", None)
        cause = getattr(cause, "__cause__", None)
    if code == "23505":
        # Classify metadata, never words in actual conflicting values.
        return {"uq_users_username": "username", "ix_users_email": "email"}.get(constraint, "identity")
    sqlite = re.fullmatch(r"UNIQUE constraint failed: users\.(email|username)", str(original))
    return sqlite.group(1) if sqlite else None


async def revoke_refresh_tokens(db: AsyncSession, user_id: int):
    await db.execute(
        update(models.RefreshToken)
        .where(models.RefreshToken.user_id == user_id, models.RefreshToken.is_revoked.is_(False))
        .values(is_revoked=True)
    )


async def consume_reset(db: AsyncSession, token_hash: str, hashed_password: str):
    return await db.scalar(
        update(models.User)
        .where(models.User.reset_token == token_hash, models.User.reset_token_expires > datetime.utcnow())
        .values(hashed_password=hashed_password, reset_token=None, reset_token_expires=None)
        .returning(models.User.id)
    )


async def reset_eligible(db: AsyncSession, token_hash: str) -> bool:
    return await db.scalar(
        select(models.User.id).where(
            models.User.reset_token == token_hash,
            models.User.reset_token_expires > datetime.utcnow(),
        )
    ) is not None


async def consume_refresh(db: AsyncSession, token_hash: str, user_id: int):
    return await db.scalar(
        update(models.RefreshToken)
        .where(
            models.RefreshToken.token_hash == token_hash,
            models.RefreshToken.user_id == user_id,
            models.RefreshToken.is_revoked.is_(False),
            models.RefreshToken.expires_at > datetime.utcnow(),
        )
        .values(is_revoked=True)
        .returning(models.RefreshToken.id)
    )


async def delete_credentials(db: AsyncSession, user: models.User):
    await db.execute(delete(models.EmailVerification).where(models.EmailVerification.email == user.email))
    await db.execute(delete(models.RefreshToken).where(models.RefreshToken.user_id == user.id))


async def delete_user(db: AsyncSession, user: models.User):
    await db.delete(user)
    await db.flush()


async def verification(db: AsyncSession, digest: str, *, lock: bool = False):
    query = select(models.EmailVerification).where(
        models.EmailVerification.token_hash == digest,
        models.EmailVerification.expires_at > datetime.utcnow(),
        models.EmailVerification.is_used.is_(False),
    )
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    return await db.scalar(query)


async def replace_verification(db: AsyncSession, email: str):
    await db.execute(delete(models.EmailVerification).where(models.EmailVerification.email == email))
    verification_row, token = models.EmailVerification.create_for_email(email)
    db.add(verification_row)
    await db.flush()
    return verification_row, token
