"""Mail/account transactions against independently migrated PostgreSQL databases."""

from urllib.parse import urlsplit

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import auth, models
from app.modules.accounts import repository
from app.routers import auth as router
import test_accounts_postgresql

pg_api = test_accounts_postgresql.pg_api
pytestmark = pytest.mark.asyncio
DATA = {"username": "mail_user", "email": "mail@example.com", "password": "GoodPass8"}


async def test_registration_and_verification_are_committed_before_smtp(pg_api, monkeypatch):
    client, engine, _ = pg_api
    captured = []

    async def deliver(_sender, email, url):
        with Session(engine) as db:
            user = db.scalar(select(models.User).where(models.User.email == email))
            credential = db.scalar(select(models.EmailVerification).where(models.EmailVerification.email == email))
            assert user is not None and credential is not None
            assert credential.token_hash == auth.hash_token(urlsplit(url).fragment)
        captured.append(urlsplit(url).fragment)
        return False

    monkeypatch.setattr(router, "_send_email_safely", deliver)
    response = await client.post("/auth/register", json=DATA)
    assert response.status_code == 503
    assert DATA["password"] not in response.text
    assert captured[0] not in response.text
    assert (await client.post("/auth/login", data={"username": DATA["email"], "password": DATA["password"]})).status_code == 401

    async def retry(*args):
        await deliver(*args)
        return True

    monkeypatch.setattr(router, "_send_email_safely", retry)
    assert (await client.post("/auth/resend-verification", json={"email": DATA["email"]})).status_code == 200
    assert (await client.post("/auth/verify-email", json={"token": captured[0]})).status_code == 400
    assert (await client.post("/auth/verify-email", json={"token": captured[-1]})).status_code == 200
    assert (await client.post("/auth/login", data={"username": DATA["email"], "password": DATA["password"]})).status_code == 200


async def test_initial_verification_write_failure_rolls_back_account_and_sends_nothing(pg_api, monkeypatch):
    client, engine, mail = pg_api

    async def fail(*_):
        raise RuntimeError("injected write failure")

    monkeypatch.setattr(repository, "replace_verification", fail)
    assert (await client.post("/auth/register", json=DATA)).status_code == 500
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(models.User)) == 0
        assert db.scalar(select(func.count()).select_from(models.EmailVerification)) == 0
    assert not mail
