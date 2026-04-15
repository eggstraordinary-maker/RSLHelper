from pydantic import BaseModel, EmailStr, validator, Field, field_validator
from typing import Optional
from datetime import datetime
import re


class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)

    @field_validator('username')
    def validate_username(cls, v):
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError(
                'Имя пользователя может содержать только буквы латиницы, цифры и подчеркивания')
        return v


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator('password')
    def validate_password(cls, v):
        # Проверка минимальной длины в символах
        if len(v) < 8:
            raise ValueError('Пароль должен содержать минимум 8 символов')

        # Проверка на кириллицу (опционально, можно убрать)
        if re.search(r'[а-яА-ЯёЁ]', v):
            raise ValueError('Пароль не должен содержать кириллицу')

        # Проверяем наличие хотя бы одной заглавной буквы
        if not any(c.isupper() for c in v):
            raise ValueError('Пароль должен содержать хотя бы одну заглавную букву')

        # Проверяем наличие хотя бы одной строчной буквы
        if not any(c.islower() for c in v):
            raise ValueError('Пароль должен содержать хотя бы одну строчную букву')

        # Проверяем наличие хотя бы одной цифры
        if not any(c.isdigit() for c in v):
            raise ValueError('Пароль должен содержать хотя бы одну цифру')

        # ВАЖНО: bcrypt сам обрабатывает ограничение в 72 байта
        # Предупреждаем пользователя, если пароль может быть обрезан
        byte_length = len(v.encode('utf-8'))
        if byte_length > 72:
            raise ValueError(
                f'Пароль слишком длинный ({byte_length} байт). '
                'Будет обрезан до 72 байт. Рекомендуем сократить пароль.'
            )

        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: int
    public_id: str
    is_active: bool
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None
    public_id: Optional[str] = None


class EmailVerificationRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)

    @field_validator('new_password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Пароль должен содержать минимум 8 символов')
        return v


class UserUpdate(BaseModel):
    """Схема для обновления профиля пользователя"""
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    full_name: Optional[str] = Field(None, max_length=200)

    @field_validator('username')
    def validate_username(cls, v):
        if v is not None and not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError(
                'Имя пользователя может содержать только буквы латиницы, цифры и подчеркивания')
        return v