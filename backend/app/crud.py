"""Compatibility facade while callers move to account module public services."""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models, schemas
from app.modules.accounts import public as accounts


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[models.User]:
    return await db.scalar(select(models.User).where(models.User.email == email))


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[models.User]:
    return await db.scalar(select(models.User).where(models.User.username == username))


async def get_user_by_public_id(db: AsyncSession, public_id: str) -> Optional[models.User]:
    return await db.scalar(select(models.User).where(models.User.public_id == public_id))


async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[models.User]:
    return await db.scalar(select(models.User).where(models.User.id == user_id))


async def get_users(db: AsyncSession, skip: int = 0, limit: int = 100):
    result = await db.execute(select(models.User).order_by(models.User.id).offset(skip).limit(limit))
    return result.scalars().all()


async def create_user(db: AsyncSession, user_data: schemas.UserCreate) -> models.User:
    return await accounts.create_user(db, user_data)


async def create_email_verification(db: AsyncSession, email: str):
    return await accounts.create_verification(db, email)


async def verify_email_token(db: AsyncSession, token: str) -> bool:
    return await accounts.verify_email(db, token)


async def update_user(db: AsyncSession, user: models.User, update_data: schemas.UserUpdate) -> models.User:
    return await accounts.update_profile(db, user.id, update_data)
