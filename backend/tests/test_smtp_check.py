import smtplib
import pytest
from app.config import settings
from scripts import smtp_check


@pytest.mark.parametrize("mode,auth", [("starttls", True), ("ssl", True), ("plain", False)])
def test_check_authenticates_without_sending_or_returning_private_values(monkeypatch, mode, auth):
    calls = []
    class Server:
        def __init__(self, *_args, **options):
            calls.append(("connect", options))
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def starttls(self, **_options): calls.append("tls")
        def login(self, *_args): calls.append("login")
        def noop(self): return 250, b"private-sentinel"
        def send_message(self, *_args): pytest.fail("Diagnostic must not send mail")
    monkeypatch.setattr(settings, "smtp_security", mode)
    monkeypatch.setattr(settings, "smtp_auth", auth)
    monkeypatch.setattr(settings, "smtp_password", "private-sentinel")
    monkeypatch.setattr(smtp_check.smtplib, "SMTP", Server)
    monkeypatch.setattr(smtp_check.smtplib, "SMTP_SSL", Server)
    result = smtp_check.check()
    assert result["ok"] and not result["message_sent"]
    assert result["authenticated"] == auth
    assert result["tls_verified"] == (mode != "plain")
    assert ("tls" in calls) == (mode == "starttls")
    assert ("login" in calls) == auth
    assert ("context" in calls[0][1]) == (mode == "ssl")
    assert "private-sentinel" not in str(result)


def test_check_reports_auth_code_without_server_payload(monkeypatch, capsys):
    class Server:
        def __init__(self, *_args, **_options): pass
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def login(self, *_args): raise smtplib.SMTPAuthenticationError(535, b"private-sentinel")
    monkeypatch.setattr(settings, "smtp_security", "ssl")
    monkeypatch.setattr(settings, "smtp_auth", True)
    monkeypatch.setattr(smtp_check.smtplib, "SMTP_SSL", Server)
    assert smtp_check.main() == 1
    output = capsys.readouterr().out
    assert "authentication_rejected" in output and "535" in output
    assert "private-sentinel" not in output


@pytest.mark.parametrize("failure", [smtplib.SMTPServerDisconnected("private-sentinel"),
    TimeoutError("private-sentinel"), OSError(111, "private-sentinel")])
def test_transport_failure_does_not_claim_authentication_or_leak_values(monkeypatch, capsys, failure):
    def fail(*_args, **_options): raise failure
    monkeypatch.setattr(settings, "smtp_security", "starttls")
    monkeypatch.setattr(smtp_check.smtplib, "SMTP", fail)
    assert smtp_check.main() == 1
    output = capsys.readouterr().out
    assert '"authenticated": false' in output
    assert "private-sentinel" not in output


def test_configuration_failure_is_safe(monkeypatch, capsys):
    def fail(): raise ValueError("private-sentinel")
    monkeypatch.setattr(smtp_check, "check", fail)
    assert smtp_check.main() == 1
    output = capsys.readouterr().out
    assert "invalid_configuration" in output
    assert "private-sentinel" not in output
