from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from datetime import datetime, timedelta
from app.database import Base
import uuid


def generate_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String(36), unique=True, index=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Дополнительные поля для профиля
    full_name = Column(String(200))
    avatar_url = Column(String(500))

    # Поля для восстановления пароля
    verification_token = Column(String(100), unique=True, index=True)
    verification_token_expires = Column(DateTime)
    reset_token = Column(String(100), unique=True, index=True)
    reset_token_expires = Column(DateTime)


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    token = Column(String(100), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_used = Column(Boolean, default=False)

    @classmethod
    def create_for_email(cls, email: str) -> "EmailVerification":
        token = generate_uuid()
        expires_at = datetime.utcnow() + timedelta(hours=24)
        return cls(email=email, token=token, expires_at=expires_at)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(500), unique=True, index=True, nullable=False)
    user_id = Column(Integer, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_revoked = Column(Boolean, default=False)


class VideoFile(Base):
    __tablename__ = "video_files"

    id = Column(Integer, primary_key=True, index=True)

    filename = Column(String(255), nullable=False)

    description = Column(Text)

    object_name = Column(String(255), unique=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())