from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from fastapi.testclient import TestClient

from app import auth, crud, models
from app.database import Base
from app.main import app
from app.schemas import PasswordChange, PasswordResetConfirm, UserCreate, UserUpdate


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


def test_health_endpoint_starts_without_database_or_object_storage() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_password_rules_are_shared_by_all_password_flows() -> None:
    UserCreate(
        email="learner@example.com",
        username="learner_1",
        password="GoodPass1",
    )
    PasswordChange(current_password="old-password", new_password="GoodPass1")
    PasswordResetConfirm(token="one-time-token", new_password="GoodPass1")

    for schema in (UserCreate, PasswordChange, PasswordResetConfirm):
        with pytest.raises(ValidationError):
            if schema is UserCreate:
                schema(
                    email="learner@example.com",
                    username="learner_1",
                    password="weakpass",
                )
            elif schema is PasswordChange:
                schema(current_password="old-password", new_password="weakpass")
            else:
                schema(token="one-time-token", new_password="weakpass")


def test_password_does_not_exceed_bcrypt_byte_limit() -> None:
    with pytest.raises(ValidationError, match="72 UTF-8 bytes"):
        UserCreate(
            email="learner@example.com",
            username="learner_1",
            password="Aa1" + "x" * 70,
        )


@pytest.mark.asyncio
async def test_profile_update_and_duplicate_username_are_handled(
    db_session: AsyncSession,
) -> None:
    learner = models.User(
        email="learner@example.com",
        username="learner",
        hashed_password="hashed",
    )
    other = models.User(
        email="other@example.com",
        username="another",
        hashed_password="hashed",
    )
    db_session.add_all([learner, other])
    await db_session.commit()
    await db_session.refresh(learner)

    updated = await crud.update_user(
        db_session, learner, UserUpdate(username="new_name", full_name="Learner")
    )
    assert updated.username == "new_name"
    assert updated.full_name == "Learner"

    with pytest.raises(ValueError, match="already in use"):
        await crud.update_user(db_session, learner, UserUpdate(username="another"))


@pytest.mark.asyncio
async def test_email_verification_token_is_consumed_once(
    db_session: AsyncSession,
) -> None:
    learner = models.User(
        email="verify@example.com",
        username="verify_user",
        hashed_password="hashed",
    )
    db_session.add(learner)
    verification, raw_token = models.EmailVerification.create_for_email(learner.email)
    db_session.add(verification)
    await db_session.commit()

    assert verification.token_hash == auth.hash_token(raw_token)
    assert await crud.verify_email_token(db_session, raw_token) is True
    assert learner.is_verified is True
    assert await crud.verify_email_token(db_session, raw_token) is False
