import smtplib
import socket
from threading import Event, Thread

import pytest
from pydantic import ValidationError

from app import email_utils
from app.config import settings, Settings


@pytest.mark.parametrize("security,authenticate", [("starttls", True), ("ssl", True), ("plain", False)])
def test_mail_security_mode_auth_and_timeout(monkeypatch, security, authenticate):
    calls = []

    class Server:
        def __init__(self, host, port, **options):
            calls.append((host, port, options))

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def starttls(self, **options):
            calls.append(("tls", options))

        def login(self, *_):
            calls.append("login")

        def send_message(self, message):
            assert message["To"] == "test@example.com"
            calls.append("sent")

    monkeypatch.setattr(settings, "smtp_security", security)
    monkeypatch.setattr(settings, "smtp_auth", authenticate)
    monkeypatch.setattr(settings, "smtp_timeout_seconds", 0.25)
    monkeypatch.setattr(email_utils.smtplib, "SMTP", Server)
    monkeypatch.setattr(email_utils.smtplib, "SMTP_SSL", Server)
    assert email_utils.send_email("test@example.com", "Subject", "<p>Test</p>") is True
    assert calls[0][2]["timeout"] == 0.25
    assert ("context" in calls[0][2]) is (security == "ssl")
    assert any(isinstance(call, tuple) and call[0] == "tls" for call in calls) is (security == "starttls")
    assert ("login" in calls) is authenticate
    assert calls[-1] == "sent"


@pytest.mark.parametrize("failure", [TimeoutError, smtplib.SMTPAuthenticationError, ConnectionRefusedError])
def test_mail_failure_has_no_payload_in_logs(monkeypatch, caplog, failure):
    def fail(*_, **__):
        if failure is smtplib.SMTPAuthenticationError:
            raise failure(535, b"private SMTP payload")
        raise failure("private SMTP payload")
    monkeypatch.setattr(email_utils.smtplib, "SMTP", fail)
    assert email_utils.send_email("private@example.com", "Subject", "private SMTP payload") is False
    assert "private" not in caplog.text
    assert failure.__name__ in caplog.text


@pytest.mark.parametrize("value", [0, -1, 121, float("inf")])
def test_mail_timeout_must_be_bounded(value):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{**settings.model_dump(), "smtp_timeout_seconds": value})


def test_real_smtp_socket_timeout_is_enforced(monkeypatch):
    stop = Event()
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    listener.settimeout(2)

    def stall_greeting():
        connection, _ = listener.accept()
        with connection:
            stop.wait(2)

    thread = Thread(target=stall_greeting, daemon=True)
    thread.start()
    monkeypatch.setattr(settings, "smtp_host", "127.0.0.1")
    monkeypatch.setattr(settings, "smtp_port", listener.getsockname()[1])
    monkeypatch.setattr(settings, "smtp_timeout_seconds", 0.05)
    try:
        assert email_utils.send_email("test@example.com", "Subject", "Test") is False
    finally:
        stop.set()
        thread.join(3)
        listener.close()
    assert not thread.is_alive()
