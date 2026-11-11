import asyncio
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app import models
from app.config import settings
from app.modules.accounts.admission import address_digest
from app.modules.accounts import rate_repository
from sqlalchemy.exc import SQLAlchemyError
from app.routers import auth as auth_router
import test_accounts_postgresql
from test_accounts_postgresql import PASSWORD, seed_user

pg_api = test_accounts_postgresql.pg_api
pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def enabled(monkeypatch):
    monkeypatch.setattr(settings, "auth_rate_limits_enabled", True)


async def test_parallel_failed_logins_cannot_reset_or_overrun_shared_limit(pg_api):
    client, engine, _ = pg_api
    async def login(address):
        return await client.post("/auth/login", data={"username": address, "password": "incorrect"})
    results = await asyncio.gather(*[login("quota@example.com") for _ in range(20)])
    assert sum(r.status_code == 401 for r in results) == 10
    assert sum(r.status_code == 429 for r in results) == 10
    denied = await login("QUOTA@example.com")
    assert denied.status_code == 429 and 1 <= int(denied.headers["Retry-After"]) <= 60
    assert (await login("another@example.com")).status_code == 401
    with Session(engine) as db:
        row = db.scalar(select(models.AuthRateBucket).where(models.AuthRateBucket.key_digest == address_digest("login", "quota@example.com")))
        assert len(row.admissions) == 10
        row.admissions = [datetime.now(timezone.utc).timestamp() - 61]
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    assert (await login("quota@example.com")).status_code == 401


async def test_shared_mail_limit_survives_delivery_failure_and_denies_before_account_creation(pg_api, monkeypatch):
    client, engine, _ = pg_api
    async def fail(*_args): return False
    monkeypatch.setattr(auth_router, "_send_email_safely", fail)
    address = "quota_mail@example.com"
    response = await client.post("/auth/register", json={"email": address, "username": "quota_mail", "password": "SafeQuotaPass8"})
    assert response.status_code == 503
    for _ in range(2):
        assert (await client.post("/auth/resend-verification", json={"email": address})).status_code == 503
    assert (await client.post("/auth/resend-verification", json={"email": address})).status_code == 429
    before = None
    with Session(engine) as db:
        before = db.scalar(select(func.count()).select_from(models.EmailVerification))
    hidden = await client.post("/auth/forgot-password", json={"email": address})
    assert hidden.status_code == 200
    unknown = "no_account@example.com"
    for _ in range(4):
        assert (await client.post("/auth/forgot-password", json={"email": unknown})).json() == hidden.json()
    blocked = await client.post("/auth/register", json={"email": unknown, "username": "never_created", "password": "SafeQuotaPass8"})
    assert blocked.status_code == 429
    with Session(engine) as db:
        assert db.scalar(select(models.User).where(models.User.email == unknown)) is None
        assert db.scalar(select(func.count()).select_from(models.EmailVerification)) == before


async def test_successful_login_is_counted_and_request_ids_are_safe(pg_api):
    client, engine, _ = pg_api
    user = seed_user(engine)
    first = await client.post("/auth/login", headers={"X-Request-ID": "not-a-valid-id"}, data={"username": user["email"], "password": PASSWORD})
    assert first.status_code == 200 and first.headers["X-Request-ID"] != "not-a-valid-id"
    with Session(engine) as db:
        row = db.scalar(select(models.AuthRateBucket))
        assert len(row.admissions) == 1 and len(row.key_digest) == 64


async def test_unavailable_admission_fails_closed_without_creating_an_account(pg_api, monkeypatch):
    client, engine, _ = pg_api
    async def unavailable(*_args):
        raise SQLAlchemyError("private-database-sentinel")
    monkeypatch.setattr(rate_repository, "locked_bucket", unavailable)
    response = await client.post("/auth/register", json={
        "email": "unavailable@example.com", "username": "unavailable", "password": "SafeQuotaPass8"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "auth_admission_unavailable"
    assert "private-database-sentinel" not in response.text
    with Session(engine) as db:
        assert db.scalar(select(models.User).where(models.User.email == "unavailable@example.com")) is None
