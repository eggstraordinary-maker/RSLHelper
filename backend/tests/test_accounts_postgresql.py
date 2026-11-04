"""Real HTTP/account persistence checks on separately migrated PostgreSQL DBs."""

import asyncio
from datetime import datetime, timedelta
import os
import re
from uuid import uuid4
from urllib.parse import urlsplit

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app import auth, models
from app.database import get_async_db, get_db
from app.main import app
from app.modules.accounts import repository as account_repo
from app.routers import auth as auth_router
from test_migrations import _upgrade

pytestmark = pytest.mark.asyncio
PASSWORD = "AccountPass8"
PASSWORD_HASH = auth.get_password_hash(PASSWORD)


@pytest_asyncio.fixture
async def pg_api(monkeypatch):
    configured = os.getenv("POSTGRES_TEST_URL")
    if not configured:
        pytest.skip("POSTGRES_TEST_URL is required for real PostgreSQL account tests")
    admin_url = make_url(configured)
    if admin_url.get_backend_name() != "postgresql":
        pytest.fail("POSTGRES_TEST_URL must use PostgreSQL")
    name = "rsl_accounts_test_" + uuid4().hex
    assert re.fullmatch(r"rsl_accounts_test_[0-9a-f]{32}", name)
    assert name != admin_url.database
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    created = False
    engine = None
    async_engine = None
    mail = []
    try:
        with admin_engine.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        created = True
        url = admin_url.set(database=name)
        _upgrade(url.render_as_string(hide_password=False))
        engine = create_engine(url)
        async_engine = create_async_engine(url.set(drivername="postgresql+asyncpg"), poolclass=NullPool)
        sessions = async_sessionmaker(async_engine, expire_on_commit=False)

        async def override_async_db():
            async with sessions() as session:
                yield session

        def override_db():
            with Session(engine) as session:
                yield session

        async def capture_email(_sender, *args):
            mail.append(args)
            return True

        app.dependency_overrides[get_async_db] = override_async_db
        app.dependency_overrides[get_db] = override_db
        monkeypatch.setattr(auth_router, "_send_email_safely", capture_email)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
        ) as client:
            yield client, engine, mail
    finally:
        app.dependency_overrides.clear()
        if async_engine is not None:
            await async_engine.dispose()
        if engine is not None:
            engine.dispose()
        if created:
            assert re.fullmatch(r"rsl_accounts_test_[0-9a-f]{32}", name)
            assert name != admin_url.database
            with admin_engine.connect() as connection:
                connection.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
        admin_engine.dispose()


def seed_user(engine, username="learner", *, role="user"):
    with Session(engine) as db:
        user = models.User(
            username=username, email=f"{username}@example.com", hashed_password=PASSWORD_HASH,
            role=role, is_active=True, is_verified=True,
        )
        db.add(user)
        db.commit()
        return {"id": user.id, "email": user.email, "public_id": user.public_id}


def headers(user):
    return {"Authorization": "Bearer " + auth.create_access_token({"sub": user["public_id"]})}


async def login(client, user, password=PASSWORD):
    response = await client.post("/auth/login", data={"username": user["email"], "password": password})
    assert response.status_code == 200
    return response.json()


def seed_owned_data(engine, user):
    with Session(engine) as db:
        lesson = models.VideoFile(filename="sample.mp4", description="Lesson", object_name=f"test-lesson-{user['id']}")
        db.add(lesson)
        db.flush()
        db.add(models.UserLearningProgress(user_id=user["id"], lesson_id=lesson.lesson_id, word="Lesson", attempts=2))
        db.add(models.LegacyProgressMapping(
            progress_id=user["id"] * 100 + 91, user_id=user["id"], word="legacy", candidate_lesson_ids="[]", status="unmatched",
        ))
        for used in (False, True):
            verification, _ = models.EmailVerification.create_for_email(user["email"])
            verification.is_used = used
            db.add(verification)
        db.commit()


def remaining(engine, user):
    with Session(engine) as db:
        return {
            "user": db.scalar(select(func.count()).select_from(models.User).where(models.User.id == user["id"])),
            "progress": db.scalar(select(func.count()).select_from(models.UserLearningProgress).where(models.UserLearningProgress.user_id == user["id"])),
            "legacy": db.scalar(select(func.count()).select_from(models.LegacyProgressMapping).where(models.LegacyProgressMapping.user_id == user["id"])),
            "refresh": db.scalar(select(func.count()).select_from(models.RefreshToken).where(models.RefreshToken.user_id == user["id"])),
            "verification": db.scalar(select(func.count()).select_from(models.EmailVerification).where(models.EmailVerification.email == user["email"])),
        }


@pytest.mark.parametrize("as_admin", [False, True], ids=["self", "admin"])
async def test_delete_cleans_all_owned_rows_and_preserves_other_user(pg_api, as_admin):
    client, engine, _ = pg_api
    target = seed_user(engine)
    actor = seed_user(engine, "administrator", role="admin")
    other = seed_user(engine, "another")
    target_tokens = [await login(client, target), await login(client, target)]
    other_tokens = await login(client, other)
    seed_owned_data(engine, target)
    seed_owned_data(engine, other)
    other_before = remaining(engine, other)
    if as_admin:
        response = await client.delete(f"/admin/users/{target['id']}", headers=headers(actor))
    else:
        response = await client.request("DELETE", "/users/me", headers=headers(target), json={"password": PASSWORD})
    assert response.status_code == 204
    assert not any(remaining(engine, target).values())
    assert remaining(engine, other) == other_before
    for tokens in target_tokens:
        assert (await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 401
    assert (await client.get("/users/me", headers={"Authorization": "Bearer " + other_tokens["access_token"]})).status_code == 200


async def test_delete_permission_and_password_failures_preserve_data(pg_api):
    client, engine, _ = pg_api
    user = seed_user(engine)
    actor = seed_user(engine, "administrator", role="admin")
    await login(client, user)
    seed_owned_data(engine, user)
    before = remaining(engine, user)
    assert (await client.delete(f"/admin/users/{user['id']}" )).status_code == 401
    assert (await client.delete(f"/admin/users/{actor['id']}", headers=headers(user))).status_code == 403
    assert (await client.delete(f"/admin/users/{actor['id']}", headers=headers(actor))).status_code == 400
    assert (await client.delete("/admin/users/999999", headers=headers(actor))).status_code == 404
    assert (await client.request("DELETE", "/users/me", headers=headers(user), json={"password": "Incorrect8"})).status_code == 400
    assert remaining(engine, user) == before


async def test_delete_failure_rolls_back_every_cleanup_and_can_retry(pg_api, monkeypatch):
    client, engine, _ = pg_api
    user = seed_user(engine)
    actor = seed_user(engine, "administrator", role="admin")
    tokens = await login(client, user)
    seed_owned_data(engine, user)
    before = remaining(engine, user)
    original = account_repo.delete_user

    async def fail_after_cleanup(*_args):
        raise RuntimeError("Simulated database operation failure")

    monkeypatch.setattr(account_repo, "delete_user", fail_after_cleanup)
    assert (await client.delete(f"/admin/users/{user['id']}", headers=headers(actor))).status_code == 500
    assert remaining(engine, user) == before
    assert (await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 200
    monkeypatch.setattr(account_repo, "delete_user", original)
    assert (await client.delete(f"/admin/users/{user['id']}", headers=headers(actor))).status_code == 204
    assert not any(remaining(engine, user).values())


async def reset_ticket(client, user, mail):
    assert (await client.post("/auth/forgot-password", json={"email": user["email"]})).status_code == 200
    return urlsplit(mail[-1][1]).fragment


async def test_parallel_reset_has_one_winner_and_revokes_all_refresh(pg_api):
    client, engine, mail = pg_api
    user = seed_user(engine)
    tokens = [await login(client, user), await login(client, user)]
    ticket = await reset_ticket(client, user, mail)
    passwords = ["ResetWinner8", "OtherWinner9"]
    responses = await asyncio.gather(*[
        client.post("/auth/reset-password", json={"token": ticket, "new_password": password}) for password in passwords
    ])
    assert sorted(r.status_code for r in responses) == [200, 400]
    for password, response in zip(passwords, responses):
        logged_in = await client.post("/auth/login", data={"username": user["email"], "password": password})
        assert logged_in.status_code == (200 if response.status_code == 200 else 401)
    with Session(engine) as db:
        stored = db.get(models.User, user["id"])
        assert stored.reset_token is None and stored.reset_token_expires is None
    for pair in tokens:
        assert (await client.post("/auth/refresh", json={"refresh_token": pair["refresh_token"]})).status_code == 401


async def test_reset_failure_restores_password_token_and_refresh(pg_api, monkeypatch):
    client, engine, mail = pg_api
    user = seed_user(engine)
    tokens = await login(client, user)
    ticket = await reset_ticket(client, user, mail)
    original = account_repo.revoke_refresh_tokens

    async def fail_after_consume(*_args):
        raise RuntimeError("Simulated database operation failure")

    monkeypatch.setattr(account_repo, "revoke_refresh_tokens", fail_after_consume)
    response = await client.post("/auth/reset-password", json={"token": ticket, "new_password": "ResetWinner8"})
    assert response.status_code == 500
    with Session(engine) as db:
        stored = db.get(models.User, user["id"])
        assert auth.verify_password(PASSWORD, stored.hashed_password)
        assert stored.reset_token == auth.hash_token(ticket)
        assert db.scalar(select(models.RefreshToken.is_revoked).where(models.RefreshToken.token_hash == auth.hash_token(tokens["refresh_token"]))) is False
    monkeypatch.setattr(account_repo, "revoke_refresh_tokens", original)
    assert (await client.post("/auth/reset-password", json={"token": ticket, "new_password": "ResetWinner8"})).status_code == 200


@pytest.mark.parametrize("collision", ["username", "email"])
async def test_parallel_registration_conflicts_are_safe_and_single_identity(pg_api, collision):
    client, engine, _ = pg_api
    requests = [
        {"username": "same_name", "email": "username-marker@example.com", "password": PASSWORD},
        {"username": "same_name" if collision == "username" else "other_name",
         "email": "second@example.com" if collision == "username" else "username-marker@example.com", "password": PASSWORD},
    ]
    responses = await asyncio.gather(*[client.post("/auth/register", json=data) for data in requests])
    assert sorted(r.status_code for r in responses) == [200, 400]
    failed = next(r for r in responses if r.status_code == 400)
    assert PASSWORD not in failed.text and "INSERT" not in failed.text and "sqlalchemy" not in failed.text
    assert failed.json()["detail"] == ("Email is already in use" if collision == "email" else "Username is already in use")
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(models.User)) == 1
        assert db.scalar(select(func.count()).select_from(models.EmailVerification)) == 1


async def test_parallel_profile_rename_conflict_keeps_loser_name(pg_api):
    client, engine, _ = pg_api
    users = [seed_user(engine, "first"), seed_user(engine, "second")]
    responses = await asyncio.gather(*[
        client.put("/users/me", headers=headers(user), json={"username": "new_name"}) for user in users
    ])
    assert sorted(r.status_code for r in responses) == [200, 400]
    for user, response in zip(users, responses):
        current = await client.get("/users/me", headers=headers(user))
        assert current.status_code == 200
        assert current.json()["username"] == ("new_name" if response.status_code == 200 else user["email"].split("@")[0])


async def test_case_sensitive_usernames_and_duplicate_email_message(pg_api):
    client, _, _ = pg_api
    for username, email in [("UserName", "username-marker@example.com"), ("username", "other@example.com")]:
        assert (await client.post("/auth/register", json={"username": username, "email": email, "password": PASSWORD})).status_code == 200
    duplicate = await client.post("/auth/register", json={
        "username": "third_user", "email": "username-marker@example.com", "password": PASSWORD,
    })
    assert duplicate.status_code == 400
    assert duplicate.json()["detail"] == "Email is already in use"


@pytest.mark.parametrize("operation", ["login", "refresh"])
async def test_issuance_racing_with_reset_never_leaves_old_session_active(pg_api, operation):
    client, engine, mail = pg_api
    user = seed_user(engine)
    old = await login(client, user)
    ticket = await reset_ticket(client, user, mail)
    issuing = (
        client.post("/auth/login", data={"username": user["email"], "password": PASSWORD})
        if operation == "login" else client.post("/auth/refresh", json={"refresh_token": old["refresh_token"]})
    )
    reset, issued = await asyncio.gather(
        client.post("/auth/reset-password", json={"token": ticket, "new_password": "ResetWinner8"}), issuing,
    )
    assert reset.status_code == 200
    assert issued.status_code in (200, 401)
    if issued.status_code == 200:
        assert (await client.post("/auth/refresh", json={"refresh_token": issued.json()["refresh_token"]})).status_code == 401
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(models.RefreshToken).where(models.RefreshToken.is_revoked.is_(False))) == 0


@pytest.mark.parametrize("operation", ["login", "refresh", "forgot", "verify", "resend"])
async def test_credential_operation_racing_with_delete_cannot_leave_orphans(pg_api, operation):
    client, engine, _ = pg_api
    user = seed_user(engine)
    actor = seed_user(engine, "administrator", role="admin")
    tokens = await login(client, user)
    with Session(engine) as db:
        if operation == "resend":
            db.get(models.User, user["id"]).is_verified = False
        verification, ticket = models.EmailVerification.create_for_email(user["email"])
        db.add(verification)
        db.commit()
    call = {
        "login": lambda: client.post("/auth/login", data={"username": user["email"], "password": PASSWORD}),
        "refresh": lambda: client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]}),
        "forgot": lambda: client.post("/auth/forgot-password", json={"email": user["email"]}),
        "verify": lambda: client.post("/auth/verify-email", json={"token": ticket}),
        "resend": lambda: client.post("/auth/resend-verification", json={"email": user["email"]}),
    }[operation]
    deleted, competing = await asyncio.gather(
        client.delete(f"/admin/users/{user['id']}", headers=headers(actor)), call(),
    )
    assert deleted.status_code == 204
    assert competing.status_code in ((200, 404) if operation == "resend" else (200, 400, 401))
    assert not any(remaining(engine, user).values())


async def test_expired_reset_and_wrong_current_password_do_not_hash_new_password(pg_api, monkeypatch):
    client, engine, _ = pg_api
    user = seed_user(engine)
    ticket = "expired-test-token"
    with Session(engine) as db:
        stored = db.get(models.User, user["id"])
        stored.reset_token = auth.hash_token(ticket)
        stored.reset_token_expires = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
    def unexpected_hash(_password):
        pytest.fail("Invalid credentials must not trigger expensive password hashing")
    monkeypatch.setattr(auth, "get_password_hash", unexpected_hash)
    assert (await client.post("/auth/reset-password", json={"token": "random-invalid-token", "new_password": "ResetWinner8"})).status_code == 400
    assert (await client.post("/auth/reset-password", json={"token": ticket, "new_password": "ResetWinner8"})).status_code == 400
    assert (await client.post("/auth/change-password", headers=headers(user), json={"current_password": "Incorrect8", "new_password": "ResetWinner8"})).status_code == 400
    await login(client, user)


async def test_existing_identity_is_rejected_before_expensive_hashing(pg_api, monkeypatch):
    client, engine, _ = pg_api
    user = seed_user(engine)
    def unexpected_hash(_password):
        pytest.fail("Existing identity must not trigger expensive password hashing")
    monkeypatch.setattr(auth, "get_password_hash", unexpected_hash)
    for username, email in [("another", user["email"]), ("learner", "another@example.com")]:
        assert (await client.post("/auth/register", json={"username": username, "email": email, "password": PASSWORD})).status_code == 400


async def test_resend_rechecks_verified_precondition_after_waiting_for_user_lock(pg_api, monkeypatch):
    client, engine, mail = pg_api
    user = seed_user(engine)
    with Session(engine) as db:
        db.get(models.User, user["id"]).is_verified = False
        verification, token = models.EmailVerification.create_for_email(user["email"])
        db.add(verification)
        db.commit()
    precondition_read = asyncio.Event()
    verification_finished = asyncio.Event()
    original = auth_router.crud.create_email_verification

    async def pause_before_real_service(*args):
        # Scheduling instrumentation only: both HTTP requests execute the real
        # accounts service, transaction and PostgreSQL persistence unchanged.
        precondition_read.set()
        await verification_finished.wait()
        return await original(*args)

    monkeypatch.setattr(auth_router.crud, "create_email_verification", pause_before_real_service)
    resend = asyncio.create_task(client.post("/auth/resend-verification", json={"email": user["email"]}))
    try:
        await asyncio.wait_for(precondition_read.wait(), timeout=5)
        verified = await client.post("/auth/verify-email", json={"token": token})
        assert verified.status_code == 200
    finally:
        verification_finished.set()
    response = await asyncio.wait_for(resend, timeout=5)
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already verified"
    assert mail == []
    with Session(engine) as db:
        assert db.get(models.User, user["id"]).is_verified is True
        records = db.scalars(select(models.EmailVerification).where(models.EmailVerification.email == user["email"])).all()
        assert len(records) == 1 and records[0].is_used is True
