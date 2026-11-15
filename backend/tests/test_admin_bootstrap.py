import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.modules.accounts.dto import AdminBootstrapResult
from app.modules.accounts.errors import AccountNotFoundError, AccountPermissionError
from app.modules.accounts import service
from scripts import bootstrap_admin as cli


@pytest.mark.parametrize("flag,dry_run", [(None, True), ("--dry-run", True), ("--apply", False)])
def test_cli_requires_explicit_apply(monkeypatch, capsys, flag, dry_run):
    async def execute(user_id, *, dry_run):
        return AdminBootstrapResult(user_id, "admin", True, dry_run)
    monkeypatch.setattr(cli, "execute", execute)
    assert cli.main(["--user-id", "19", *([flag] if flag else [])]) == 0
    result = json.loads(capsys.readouterr().out)
    assert result == {"ok": True, "user_id": 19, "role": "admin", "change_required": True, "dry_run": dry_run}


@pytest.mark.parametrize("error,code", [(AccountNotFoundError, 3), (AccountPermissionError, 4), (RuntimeError, 1)])
def test_cli_reports_safe_errors(monkeypatch, capsys, error, code):
    async def execute(*_args, **_kwargs):
        raise error("private-credential-canary")
    monkeypatch.setattr(cli, "execute", execute)
    assert cli.main(["--user-id", "19"]) == code
    output = capsys.readouterr()
    assert "private-credential-canary" not in output.out + output.err
    assert json.loads(output.out)["ok"] is False


@pytest.mark.parametrize("arguments", [[], ["--user-id", "0"], ["--user-id", "private-address-canary"],
                                       ["--user-id", "1", "--apply", "--dry-run"]])
def test_invalid_arguments_are_rejected_without_echoing_input(capsys, arguments):
    with pytest.raises(SystemExit) as error:
        cli.main(arguments)
    assert error.value.code == 2
    assert "private-address-canary" not in capsys.readouterr().err


@pytest.mark.asyncio
@pytest.mark.parametrize("role,dry_run", [("user", True), ("user", False), ("admin", True), ("admin", False)])
async def test_service_changes_only_eligible_role(monkeypatch, role, dry_run):
    db = SimpleNamespace(commit=AsyncMock(), rollback=AsyncMock())
    user = SimpleNamespace(id=19, role=role, is_active=True, is_verified=True)
    load = AsyncMock(return_value=user)
    write = AsyncMock()
    monkeypatch.setattr(service.repo, "user_by_id", load)
    monkeypatch.setattr(service.repo, "set_role", write)
    result = await service.bootstrap_admin(db, 19, dry_run=dry_run)
    assert result == AdminBootstrapResult(19, "admin", role != "admin", dry_run)
    load.assert_awaited_once_with(db, 19, lock=True)
    assert write.await_count == int(not dry_run and role == "user")
    assert db.commit.await_count == int(not dry_run)
    assert db.rollback.await_count == int(dry_run)


@pytest.mark.asyncio
@pytest.mark.parametrize("user,error", [(None, AccountNotFoundError),
    (SimpleNamespace(id=19, is_active=False, is_verified=True, role="user"), AccountPermissionError),
    (SimpleNamespace(id=19, is_active=True, is_verified=False, role="user"), AccountPermissionError),
    (SimpleNamespace(id=19, is_active=True, is_verified=True, role="unsupported"), AccountPermissionError)])
async def test_service_rejects_missing_or_ineligible_accounts(monkeypatch, user, error):
    db = SimpleNamespace(commit=AsyncMock(), rollback=AsyncMock())
    monkeypatch.setattr(service.repo, "user_by_id", AsyncMock(return_value=user))
    with pytest.raises(error):
        await service.bootstrap_admin(db, 19, dry_run=False)
    db.commit.assert_not_awaited()
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_commit_failure_rolls_back(monkeypatch):
    db = SimpleNamespace(commit=AsyncMock(side_effect=RuntimeError("canary")), rollback=AsyncMock())
    monkeypatch.setattr(service.repo, "user_by_id", AsyncMock(return_value=SimpleNamespace(
        id=19, role="user", is_active=True, is_verified=True)))
    monkeypatch.setattr(service.repo, "set_role", AsyncMock())
    with pytest.raises(RuntimeError):
        await service.bootstrap_admin(db, 19, dry_run=False)
    db.rollback.assert_awaited_once()
