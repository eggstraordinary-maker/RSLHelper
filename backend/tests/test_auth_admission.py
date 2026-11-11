from datetime import datetime, timedelta, timezone
import io
import logging
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from uvicorn.logging import AccessFormatter
from app.config import Settings, settings
from app.modules.accounts import admission
from app.modules.accounts.admission import AdmissionUnavailable, RateLimitExceeded
from sqlalchemy.exc import SQLAlchemyError
from app.modules.accounts.admission import address_digest, reserve
from app.privacy import PrivateUrlFilter, RequestCorrelationMiddleware
from scripts import storage_smoke


def test_window_expiry_denials_and_configuration_changes():
    assert reserve([50, 80], 100, 50, 2) == ([80, 100], None)
    assert reserve([80, 90], 100, 50, 2) == ([80, 90], 30)
    assert reserve([60, 70, 80], 100, 50, 1) == ([60, 70, 80], 30)


def test_only_limiter_keys_are_normalized_and_scopes_are_separate():
    assert address_digest("login", " User@Example.com ") == address_digest("login", "user@example.com")
    assert address_digest("login", "user@example.com") != address_digest("mail", "user@example.com")


@pytest.mark.parametrize("fields", [{"auth_login_limit": 0}, {"auth_mail_limit": 1001},
    {"auth_login_window_seconds": 0}, {"cors_origins": ["*"]},
    {"cors_origins": ["https://user:password@example.com"]}, {"cors_origins": ["https://example.com/path"]}])
def test_invalid_admission_or_cors_settings_are_rejected(fields):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **fields)


def test_legacy_token_redaction_preserves_uvicorn_access_formatter():
    record = logging.LogRecord("uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1", "POST", "/auth/verify-email/private-sentinel?token=another-sentinel", "1.1", 400), None)
    PrivateUrlFilter().filter(record)
    result = AccessFormatter('%(message)s').format(record)
    assert "private-sentinel" not in result and "another-sentinel" not in result
    assert len(record.args) == 5


def test_named_log_arguments_are_redacted_without_changing_numeric_metadata():
    record = logging.LogRecord('httpx', logging.INFO, __file__, 1, '%(url)s %(status)s', (), None)
    record.args = {'url': 'https://test/reset-password/private-sentinel', 'status': 400}
    PrivateUrlFilter().filter(record)
    assert 'private-sentinel' not in record.getMessage()
    assert record.args['status'] == 400


def test_storage_smoke_never_prints_a_presigned_capability(monkeypatch, capsys):
    class Store:
        present = False
        def put_object(self, *_args, **_kwargs): self.present = True
        def object_exists(self, _name): return self.present
        def get_object(self, _name): return io.BytesIO(b"rslhelper-seaweedfs-smoke")
        def presigned_get_object(self, name, _duration): return f"https://test/{name}?X-Amz-Signature=private-sentinel"
        def delete_object(self, _name): self.present = False
    monkeypatch.setattr(storage_smoke, "storage", Store())
    monkeypatch.setattr(storage_smoke, "parse_args", lambda: SimpleNamespace(delete=None, keep=False))
    storage_smoke.main()
    assert "private-sentinel" not in capsys.readouterr().out


@pytest.mark.asyncio
async def test_admission_persists_denials_and_fails_closed_on_commit_error(monkeypatch):
    now = datetime(2026, 11, 11, tzinfo=timezone.utc)
    bucket = SimpleNamespace(admissions=[now.timestamp()] * 10)
    class DB:
        commits = 0
        rollbacks = 0
        fail = False
        async def commit(self):
            if self.fail:
                raise SQLAlchemyError('private-sentinel')
            self.commits += 1
        async def rollback(self): self.rollbacks += 1
    db = DB()
    async def locked(*_args): return bucket
    async def clock(*_args): return now
    monkeypatch.setattr(settings, 'auth_rate_limits_enabled', True)
    monkeypatch.setattr(admission.repo, 'locked_bucket', locked)
    monkeypatch.setattr(admission.repo, 'clock', clock)
    with pytest.raises(RateLimitExceeded) as error:
        await admission.admit(db, 'login', 'quota@example.com')
    assert error.value.retry_after == 60 and db.commits == 1
    assert len(bucket.admissions) == 10
    bucket.admissions = []
    await admission.admit(db, 'mail', 'quota@example.com')
    assert bucket.admissions == [now.timestamp()]
    with pytest.raises(ValueError, match='Unknown admission scope'):
        await admission.admit(db, 'upload', 'quota@example.com')
    db.fail = True
    with pytest.raises(AdmissionUnavailable):
        await admission.admit(db, 'mail', 'quota@example.com')
    assert db.rollbacks == 1


@pytest.mark.asyncio
async def test_http_admission_errors_remain_safe_and_recovery_does_not_disclose_quota(monkeypatch):
    from fastapi import HTTPException
    from app.routers import auth
    async def denied(*_args): raise RateLimitExceeded(15)
    monkeypatch.setattr(auth.accounts, 'admit', denied)
    assert await auth._admit(None, 'mail', 'unknown@example.com', hide_limit=True) is False
    with pytest.raises(HTTPException) as error:
        await auth._admit(None, 'login', 'unknown@example.com')
    assert error.value.status_code == 429 and error.value.headers['Retry-After'] == '15'
    async def unavailable(*_args): raise AdmissionUnavailable()
    monkeypatch.setattr(auth.accounts, 'admit', unavailable)
    with pytest.raises(HTTPException) as error:
        await auth._admit(None, 'login', 'unknown@example.com')
    assert error.value.status_code == 503


@pytest.mark.asyncio
async def test_request_correlation_keeps_non_http_protocol_messages_unchanged():
    messages = []
    async def endpoint(scope, receive, send):
        assert scope['type'] == 'websocket'
        await send({'type': 'websocket.accept'})
    async def send(message): messages.append(message)
    await RequestCorrelationMiddleware(endpoint)({'type': 'websocket'}, None, send)
    assert messages == [{'type': 'websocket.accept'}]
