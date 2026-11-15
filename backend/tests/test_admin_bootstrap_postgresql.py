"""Operator role changes on migrated, disposable PostgreSQL databases."""
import asyncio
import json
import os
import subprocess
import sys

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app import models
from app.modules.accounts import public as accounts
from app.modules.accounts import repository as account_repo
from app.modules.accounts.errors import AccountNotFoundError, AccountPermissionError
import test_accounts_postgresql

pytestmark = pytest.mark.asyncio
pg_api = test_accounts_postgresql.pg_api
seed_user = test_accounts_postgresql.seed_user


def snapshot(engine, user_id):
    with Session(engine) as db:
        user = db.get(models.User, user_id)
        return (user.role, user.email, user.hashed_password, user.is_active, user.is_verified, user.public_id)


async def run(engine, user_id, *, dry_run=True):
    engine_async = create_async_engine(engine.url.set(drivername="postgresql+asyncpg"), poolclass=NullPool)
    try:
        async with async_sessionmaker(engine_async, expire_on_commit=False)() as db:
            return await accounts.bootstrap_admin(db, user_id, dry_run=dry_run)
    finally:
        await engine_async.dispose()


async def test_dry_run_apply_repeat_and_other_accounts_are_preserved(pg_api):
    _, engine, _ = pg_api
    target = seed_user(engine)
    other = seed_user(engine, "other")
    before = snapshot(engine, target["id"])
    untouched = snapshot(engine, other["id"])
    preview = await run(engine, target["id"])
    assert preview.dry_run and preview.change_required
    assert bool(snapshot(engine, target["id"]) == before), "Dry run must preserve all account fields"
    changed = await run(engine, target["id"], dry_run=False)
    repeated = await run(engine, target["id"], dry_run=False)
    assert changed.change_required and not repeated.change_required
    after = snapshot(engine, target["id"])
    assert after[0] == "admin"
    assert bool(after[1:] == before[1:]), "Credentials and verification must be preserved"
    assert bool(snapshot(engine, other["id"]) == untouched), "Other account must be preserved"


@pytest.mark.parametrize("active,verified,role", [(False, True, "user"), (True, False, "user"),
    (False, False, "admin"), (True, True, "unsupported")])
async def test_ineligible_account_is_unchanged(pg_api, active, verified, role):
    _, engine, _ = pg_api
    target = seed_user(engine)
    with Session(engine) as db:
        user = db.get(models.User, target["id"])
        user.is_active, user.is_verified, user.role = active, verified, role
        db.commit()
    before = snapshot(engine, target["id"])
    with pytest.raises(AccountPermissionError):
        await run(engine, target["id"], dry_run=False)
    assert bool(snapshot(engine, target["id"]) == before), "Rejected account must be unchanged"


async def test_unknown_account_is_not_created(pg_api):
    _, engine, _ = pg_api
    with pytest.raises(AccountNotFoundError):
        await run(engine, 2147483647, dry_run=False)


async def test_concurrent_apply_is_idempotent(pg_api):
    _, engine, _ = pg_api
    target = seed_user(engine)
    results = await asyncio.gather(*(run(engine, target["id"], dry_run=False) for _ in range(2)))
    assert sum(result.change_required for result in results) == 1
    assert snapshot(engine, target["id"])[0] == "admin"


async def test_write_failure_rolls_back_real_role_change(pg_api, monkeypatch):
    _, engine, _ = pg_api
    target = seed_user(engine)
    before = snapshot(engine, target["id"])
    original = account_repo.set_role

    async def fail_after_flush(db, user, role):
        await original(db, user, role)
        raise RuntimeError("Simulated persistence failure")

    monkeypatch.setattr(account_repo, "set_role", fail_after_flush)
    with pytest.raises(RuntimeError):
        await run(engine, target["id"], dry_run=False)
    assert bool(snapshot(engine, target["id"]) == before), "Failed transaction must not grant admin"


async def test_real_cli_uses_isolated_db_without_exposing_identity(pg_api):
    _, engine, _ = pg_api
    target = seed_user(engine)
    env = {**os.environ, "DATABASE_URL": engine.url.render_as_string(hide_password=False),
           "DATABASE_URL_ASYNC": engine.url.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False)}
    result = await asyncio.to_thread(subprocess.run, [sys.executable, "-m", "scripts.bootstrap_admin",
        "--user-id", str(target["id"]), "--apply"], env=env, capture_output=True, text=True, timeout=30, check=False)
    assert result.returncode == 0, "Operator CLI must succeed against migrated PostgreSQL"
    assert json.loads(result.stdout)["role"] == "admin"
    assert target["email"] not in result.stdout + result.stderr
    assert snapshot(engine, target["id"])[0] == "admin"
