from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from datetime import datetime, timedelta
from typing import Optional
import uuid

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

    # Создаем токен для верификации email
    verification_token = str(uuid.uuid4())
    token_expires = datetime.utcnow() + timedelta(hours=24)

    # Создаем объект пользователя
    db_user = models.User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hashed_password,
        verification_token=verification_token,
        verification_token_expires=token_expires
    )

    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)

    return db_user


async def verify_user_email(db: AsyncSession, token: str) -> bool:
    result = await db.execute(
        select(models.User).where(
            models.User.verification_token == token,
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
    await db.commit()


async def create_email_verification(db: AsyncSession, email: str) -> EmailVerification:
    """Создает запись для подтверждения email"""
    # Удаляем старые верификации
    await db.execute(
        delete(EmailVerification).where(EmailVerification.email == email)
    )

    # Создаем новую
    verification = EmailVerification.create_for_email(email)
    db.add(verification)
    await db.commit()
    await db.refresh(verification)
    return verification


async def verify_email_token(db: AsyncSession, token: str) -> bool:
    """Проверяет токен подтверждения email с логированием"""
    import logging
    logger = logging.getLogger(__name__)

    logger.info(f"Проверка токена: {token}")

    # ИСПРАВЛЕННЫЙ запрос - используем and_ для правильной логики
    from sqlalchemy import and_

    result = await db.execute(
        select(EmailVerification).where(
            and_(
                EmailVerification.token == token,
                EmailVerification.expires_at > datetime.utcnow(),
                EmailVerification.is_used.is_(False)
            )
        )
    )

    verification = result.scalar_one_or_none()

    if not verification:
        logger.error(f"Токен не найден, просрочен или уже использован: {token}")

        # Дополнительная диагностика: что именно не так?
        # Проверяем отдельно каждый критерий
        result1 = await db.execute(
            select(EmailVerification).where(EmailVerification.token == token)
        )
        v1 = result1.scalar_one_or_none()

        if not v1:
            logger.error("Токен вообще не существует в базе")
        else:
            if v1.expires_at <= datetime.utcnow():
                logger.error(
                    f"Токен просрочен. expires_at: {v1.expires_at}, текущее время: {datetime.utcnow()}")
            if v1.is_used:
                logger.error("Токен уже использован")

        return False

    logger.info(f"Токен найден для email: {verification.email}")

    # Помечаем как использованный
    verification.is_used = True

    # Находим пользователя и активируем его
    result = await db.execute(
        select(models.User).where(models.User.email == verification.email)
    )
    user = result.scalar_one_or_none()

    if not user:
        logger.error(f"Пользователь с email {verification.email} не найден")
        return False

    logger.info(f"Пользователь найден: {user.id}, {user.email}")
    user.is_verified = True
    await db.commit()

    logger.info(f"Email успешно подтвержден для {user.email}")
    return True
