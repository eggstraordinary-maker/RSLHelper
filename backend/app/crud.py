from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from datetime import datetime
from typing import Optional

from app import models, schemas, auth
from app.models import EmailVerification


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[models.User]:
    result = await db.execute(
        select(models.User).where(models.User.email == email)
    )
    return result.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[models.User]:
    result = await db.execute(
        select(models.User).where(models.User.username == username)
    )
    return result.scalar_one_or_none()


async def get_user_by_public_id(db: AsyncSession, public_id: str) -> Optional[models.User]:
    """Находит пользователя по public_id (UUID строка)"""
    result = await db.execute(
        select(models.User).where(models.User.public_id == public_id)
    )
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, user_data: schemas.UserCreate) -> models.User:
    """Создает нового пользователя в базе данных"""
    # Проверяем, существует ли пользователь с таким email
    existing_user = await get_user_by_email(db, user_data.email)
    if existing_user:
        raise ValueError("Пользователь с таким email уже существует")

    # Проверяем, существует ли пользователь с таким username
    existing_username = await get_user_by_username(db, user_data.username)
    if existing_username:
        raise ValueError("Пользователь с таким именем уже существует")

    # Хэшируем пароль с помощью bcrypt
    hashed_password = auth.get_password_hash(user_data.password)

    # Создаем объект пользователя
    db_user = models.User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hashed_password,
    )

    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)

    return db_user


async def verify_user_email(db: AsyncSession, token: str) -> bool:
    result = await db.execute(
        select(models.User).where(
            models.User.verification_token == auth.hash_token(token),
            models.User.verification_token_expires > datetime.utcnow()
        )
    )

    user = result.scalar_one_or_none()
    if not user:
        return False

    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires = None

    await db.commit()
    return True


async def update_password(db: AsyncSession, user: models.User, new_password: str) -> None:
    user.hashed_password = auth.get_password_hash(new_password)
    user.reset_token = None
    user.reset_token_expires = None
    await revoke_user_refresh_tokens(db, user.id)
    await db.commit()


async def revoke_user_refresh_tokens(db: AsyncSession, user_id: int) -> None:
    await db.execute(
        update(models.RefreshToken)
        .where(
            models.RefreshToken.user_id == user_id,
            models.RefreshToken.is_revoked.is_(False),
        )
        .values(is_revoked=True)
    )


async def create_email_verification(
    db: AsyncSession, email: str
) -> tuple[EmailVerification, str]:
    """Создает запись для подтверждения email"""
    # Удаляем старые верификации
    await db.execute(
        delete(EmailVerification).where(EmailVerification.email == email)
    )

    # Создаем новую
    verification, token = EmailVerification.create_for_email(email)
    db.add(verification)
    await db.commit()
    await db.refresh(verification)
    return verification, token


async def verify_email_token(db: AsyncSession, token: str) -> bool:
    """Consume a valid email token once, without exposing it in logs."""
    result = await db.execute(
        select(EmailVerification)
        .where(
            EmailVerification.token_hash == auth.hash_token(token),
            EmailVerification.expires_at > datetime.utcnow(),
            EmailVerification.is_used.is_(False),
        )
        .with_for_update()
    )
    verification = result.scalar_one_or_none()
    if verification is None:
        return False

    result = await db.execute(
        select(models.User).where(models.User.email == verification.email)
    )
    user = result.scalar_one_or_none()
    verification.is_used = True
    if user is None:
        await db.commit()
        return False

    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    await db.commit()
    return True
async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[models.User]:
    """Находит пользователя по его ID."""
    result = await db.execute(
        select(models.User).where(models.User.id == user_id)
    )
    return result.scalar_one_or_none()

async def get_users(db: AsyncSession, skip: int = 0, limit: int = 100):
    """Получает список пользователей с пагинацией."""
    result = await db.execute(
        select(models.User).offset(skip).limit(limit)
    )
    return result.scalars().all()


async def update_user(
    db: AsyncSession, user: models.User, update_data: schemas.UserUpdate
) -> models.User:
    """Update the editable profile fields after checking username uniqueness."""
    changes = update_data.model_dump(exclude_unset=True)
    username = changes.get("username")
    if username and username != user.username:
        existing_user = await get_user_by_username(db, username)
        if existing_user and existing_user.id != user.id:
            raise ValueError("Username is already in use")

    for field, value in changes.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user: models.User):
    """Удаляет пользователя из базы данных."""
    await revoke_user_refresh_tokens(db, user.id)
    await db.delete(user)
    await db.commit()
