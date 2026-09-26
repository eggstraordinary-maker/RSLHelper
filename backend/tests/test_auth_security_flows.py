import asyncio
from urllib.parse import urlsplit
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app import auth, models
from app.database import Base, get_async_db, get_db
from app.main import app
from app.routers import auth as auth_router


@pytest.fixture
def api(tmp_path: Path, monkeypatch):
    database_path = tmp_path / "security-flows.sqlite"
    sync_engine = create_engine(
        URL.create("sqlite", database=str(database_path)),
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(sync_engine)
    async_engine = create_async_engine(
        URL.create("sqlite+aiosqlite", database=str(database_path)),
        poolclass=NullPool,
    )
    async_session_factory = async_sessionmaker(
        async_engine, expire_on_commit=False
    )
    sent_emails: list[tuple] = []

    async def override_async_db():
        async with async_session_factory() as session:
            yield session

    def override_db():
        with Session(sync_engine) as session:
            yield session

    async def capture_email(_sender, *args):
        sent_emails.append(args)
        return True

    app.dependency_overrides[get_async_db] = override_async_db
    app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(auth_router, "_send_email_safely", capture_email)

    try:
        with TestClient(app) as client:
            yield client, sync_engine, sent_emails
    finally:
        app.dependency_overrides.clear()
        asyncio.run(async_engine.dispose())
        sync_engine.dispose()


def _register_and_login(
    client: TestClient,
    engine,
    sent_emails: list[tuple],
    email: str = "learner@example.com",
    password: str = "GoodPass1",
    role: str = models.UserRole.USER.value,
) -> dict:
    response = client.post(
        "/auth/register",
        json={"username": email.split("@")[0], "email": email, "password": password},
    )
    assert response.status_code == 200, response.text

    with Session(engine) as db:
        user = db.scalar(select(models.User).where(models.User.email == email))
        assert user is not None
        verification = db.scalar(
            select(models.EmailVerification).where(
                models.EmailVerification.email == email
            )
        )
        assert verification is not None
        verification_hash = verification.token_hash
        user.role = role
        db.commit()

    verification_token = urlsplit(sent_emails[-1][1]).fragment
    assert verification_hash == auth.hash_token(verification_token)
    verify_response = client.post(
        "/auth/verify-email", json={"token": verification_token}
    )
    assert verify_response.status_code == 200, verify_response.text
    login_response = client.post(
        "/auth/login", data={"username": email, "password": password}
    )
    assert login_response.status_code == 200, login_response.text
    return login_response.json()


def test_login_requires_verified_email_and_expired_access_is_rejected(api):
    client, engine, sent_emails = api
    register_response = client.post(
        "/auth/register",
        json={
            "username": "unverified",
            "email": "unverified@example.com",
            "password": "GoodPass1",
        },
    )
    assert register_response.status_code == 200
    duplicate_registration = client.post(
        "/auth/register",
        json={
            "username": "unverified",
            "email": "unverified@example.com",
            "password": "GoodPass1",
        },
    )
    assert duplicate_registration.status_code == 400
    assert "GoodPass1" not in duplicate_registration.text
    assert client.post(
        "/auth/login",
        data={"username": "unverified@example.com", "password": "GoodPass1"},
    ).status_code == 401

    with Session(engine) as db:
        user = db.scalar(
            select(models.User).where(models.User.email == "unverified@example.com")
        )
        verification = db.scalar(
            select(models.EmailVerification).where(
                models.EmailVerification.email == "unverified@example.com"
            )
        )
        assert user is not None and verification is not None
        public_id = user.public_id
        token_hash = verification.token_hash

    token = urlsplit(sent_emails[-1][1]).fragment
    assert token_hash == auth.hash_token(token)
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 200
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 400
    assert client.post(
        "/auth/verify-email", json={"token": "not-a-valid-token"}
    ).status_code == 400
    expired = auth.create_access_token(
        {"sub": public_id}, expires_delta=timedelta(seconds=-1)
    )
    response = client.get(
        "/users/me", headers={"Authorization": f"Bearer {expired}"}
    )
    assert response.status_code == 401


def test_validation_errors_do_not_echo_submitted_password(api):
    client, _, _ = api
    password = "PrivatePasswordOnly"
    response = client.post(
        "/auth/register",
        json={
            "username": "private_user",
            "email": "private@example.com",
            "password": password,
        },
    )
    assert response.status_code == 422
    assert password not in response.text
    assert '"input"' not in response.text


def test_refresh_tokens_are_hashed_rotated_and_revocable(api):
    client, engine, sent_emails = api
    tokens = _register_and_login(client, engine, sent_emails)
    old_refresh = tokens["refresh_token"]

    with Session(engine) as db:
        stored = db.scalar(select(models.RefreshToken))
        assert stored is not None
        assert stored.token_hash == auth.hash_token(old_refresh)
        assert stored.token_hash != old_refresh
        assert len(stored.token_hash) == 64

    refreshed = client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert refreshed.status_code == 200, refreshed.text
    new_refresh = refreshed.json()["refresh_token"]
    assert new_refresh != old_refresh

    replay = client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert replay.status_code == 401
    assert client.post("/auth/logout", json={"refresh_token": new_refresh}).status_code == 200
    assert client.post(
        "/auth/refresh", json={"refresh_token": new_refresh}
    ).status_code == 401


def test_admin_and_video_upload_routes_enforce_roles(api, monkeypatch):
    client, engine, sent_emails = api
    user_tokens = _register_and_login(
        client, engine, sent_emails, email="learner@example.com"
    )
    admin_tokens = _register_and_login(
        client,
        engine,
        sent_emails,
        email="admin@example.com",
        role=models.UserRole.ADMIN.value,
    )

    assert client.get("/admin/users").status_code == 401
    user_headers = {"Authorization": f"Bearer {user_tokens['access_token']}"}
    admin_headers = {"Authorization": f"Bearer {admin_tokens['access_token']}"}
    assert client.get("/admin/users", headers=user_headers).status_code == 403
    assert client.get("/admin/users", headers=admin_headers).status_code == 200

    monkeypatch.setattr("app.routers.videos.storage.put_object", lambda *args, **kwargs: None)
    upload_data = {
        "file": ("lesson.mp4", b"video bytes", "video/mp4"),
        "description": (None, "Lesson"),
    }
    assert client.post("/videos/upload", files=upload_data).status_code == 401
    assert client.post(
        "/videos/upload", files=upload_data, headers=user_headers
    ).status_code == 403
    uploaded = client.post(
        "/videos/upload", files=upload_data, headers=admin_headers
    )
    assert uploaded.status_code == 200, uploaded.text


def test_password_reset_is_real_one_time_and_revokes_refresh(api):
    client, engine, sent_emails = api
    tokens = _register_and_login(client, engine, sent_emails)
    old_refresh = tokens["refresh_token"]
    request = client.post(
        "/auth/forgot-password", json={"email": "learner@example.com"}
    )
    assert request.status_code == 200
    assert request.json() == {"message": "If email exists, reset instructions sent"}

    reset_url = sent_emails[-1][1]
    reset_token = urlsplit(reset_url).fragment
    assert "/reset-password#" in reset_url
    with Session(engine) as db:
        user = db.scalar(
            select(models.User).where(models.User.email == "learner@example.com")
        )
        assert user is not None
        assert user.reset_token == auth.hash_token(reset_token)
        assert user.reset_token != reset_token

    unknown_email = client.post(
        "/auth/forgot-password", json={"email": "unknown@example.com"}
    )
    assert unknown_email.json() == request.json()

    reset = client.post(
        "/auth/reset-password",
        json={"token": reset_token, "new_password": "NewSecure9"},
    )
    assert reset.status_code == 200, reset.text
    assert reset_token not in reset.text
    assert "NewSecure9" not in reset.text
    assert client.post("/auth/reset-password", json={
        "token": reset_token,
        "new_password": "AnotherPass8",
    }).status_code == 400
    assert client.post("/auth/refresh", json={"refresh_token": old_refresh}).status_code == 401
    assert client.post(
        "/auth/login", data={"username": "learner@example.com", "password": "GoodPass1"}
    ).status_code == 401
    assert client.post(
        "/auth/login", data={"username": "learner@example.com", "password": "NewSecure9"}
    ).status_code == 200


def test_video_storage_errors_are_sanitized_and_progress_is_user_scoped(
    api, monkeypatch, caplog
):
    client, engine, sent_emails = api
    first_tokens = _register_and_login(client, engine, sent_emails)
    first_headers = {"Authorization": f"Bearer {first_tokens['access_token']}"}

    with Session(engine) as db:
        db.add(
            models.VideoFile(
                filename="lesson.mp4",
                description="Hello",
                object_name="lesson-object",
            )
        )
        db.commit()

    catalog = client.get("/videos/")
    assert catalog.status_code == 200
    assert catalog.json()[0]["object_name"] == "lesson-object"
    completed = client.post("/progress/complete/hello", headers=first_headers)
    assert completed.status_code == 200, completed.text
    stats = client.get("/progress/stats", headers=first_headers)
    assert stats.status_code == 200
    assert stats.json()["completed_lessons"] == 1
    assert stats.json()["recent_lessons"] == ["hello"]

    second_tokens = _register_and_login(
        client, engine, sent_emails, email="another@example.com"
    )
    second_stats = client.get(
        "/progress/stats",
        headers={"Authorization": f"Bearer {second_tokens['access_token']}"},
    )
    assert second_stats.status_code == 200
    assert second_stats.json()["completed_lessons"] == 0
    assert second_stats.json()["recent_lessons"] == []

    sensitive_storage_error = "storage credential=do-not-log"
    def fail_to_read(_object_name):
        raise RuntimeError(sensitive_storage_error)

    monkeypatch.setattr("app.routers.videos.storage.get_object", fail_to_read)
    caplog.clear()
    video_error = client.get("/videos/stream/missing-object")
    assert video_error.status_code == 404
    assert sensitive_storage_error not in video_error.text
    assert sensitive_storage_error not in caplog.text


@pytest.mark.asyncio
async def test_email_delivery_logs_never_include_addresses_or_tokenized_urls(caplog):
    email_address = "private-user@example.com"
    tokenized_url = "https://frontend.invalid/reset-password#private-token"

    def fail_delivery(email: str, url: str) -> bool:
        raise RuntimeError(f"SMTP rejected {email} {url}")

    delivered = await auth_router._send_email_safely(
        fail_delivery, email_address, tokenized_url
    )

    assert delivered is False
    assert "RuntimeError" in caplog.text
    assert email_address not in caplog.text
    assert tokenized_url not in caplog.text
