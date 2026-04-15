from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt  # Импортируем bcrypt напрямую
from app.config import settings
from app.schemas import TokenData


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Проверяет, соответствует ли пароль хэшу.

    Args:
        plain_password: Пароль в виде строки
        hashed_password: Хэш пароля в виде строки

    Returns:
        bool: True если пароль верный, иначе False

    Raises:
        ValueError: Если хэш имеет неверный формат
    """
    try:
        # bcrypt работает с байтами
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except (ValueError, TypeError) as e:
        # Логируем ошибку, но возвращаем False для безопасности
        print(f"Ошибка проверки пароля: {e}")
        return False


def get_password_hash(password: str) -> str:
    """
    Создает bcrypt хэш пароля.

    Args:
        password: Пароль в виде строки

    Returns:
        str: Хэшированный пароль в виде строки

    Note:
        bcrypt автоматически обрезает пароль до 72 байт.
        Пароли длиннее 72 байт будут усечены без предупреждения.
    """
    # Генерируем соль и хэшируем пароль
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Создает JWT access токен"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)

    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Создает JWT refresh токен"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def verify_token(token: str) -> Optional[TokenData]:
    """Проверяет валидность access токена"""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        public_id: str = payload.get("sub")  # В sub хранится public_id (строка)
        token_type: str = payload.get("type")

        if public_id is None or token_type != "access":
            return None

        # Возвращаем TokenData с public_id, а не user_id
        return TokenData(public_id=public_id)
    except JWTError:
        return None


def verify_refresh_token(token: str) -> Optional[TokenData]:
    """Проверяет валидность refresh токена"""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        public_id: str = payload.get("sub")
        token_type: str = payload.get("type")

        if public_id is None or token_type != "refresh":
            return None

        # Возвращаем TokenData с public_id, а не user_id
        return TokenData(public_id=public_id)
    except JWTError:
        return None
