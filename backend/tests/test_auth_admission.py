from datetime import datetime, timedelta, timezone
import io
import logging
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from uvicorn.logging import AccessFormatter
from app.config import Settings
from app.modules.accounts.admission import address_digest, reserve
from app.privacy import PrivateUrlFilter
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
