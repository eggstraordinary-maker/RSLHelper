"""Check SMTP transport/authentication without sending mail or printing secrets."""
import json
import smtplib
import socket
import ssl

def check() -> dict:
    from app.config import settings
    result = {
        "ok": False,
        "port": settings.smtp_port,
        "security": settings.smtp_security,
        "authentication_enabled": settings.smtp_auth,
        "authenticated": False,
        "tls_verified": False,
        "credentials_present": bool(settings.smtp_user and settings.smtp_password),
        "sender_matches_login": settings.email_from == settings.smtp_user,
        "message_sent": False,
        "stage": "connect",
    }
    try:
        context = ssl.create_default_context()
        smtp = smtplib.SMTP_SSL if settings.smtp_security == "ssl" else smtplib.SMTP
        options = {"timeout": settings.smtp_timeout_seconds}
        if settings.smtp_security == "ssl":
            options["context"] = context
        with smtp(settings.smtp_host, settings.smtp_port, **options) as server:
            result["tls_verified"] = settings.smtp_security == "ssl"
            if settings.smtp_security == "starttls":
                result["stage"] = "starttls"
                server.starttls(context=context)
                result["tls_verified"] = True
            if settings.smtp_auth:
                result["stage"] = "authentication"
                server.login(settings.smtp_user, settings.smtp_password)
                result["authenticated"] = True
            result["stage"] = "noop"
            code, _ = server.noop()
            result["smtp_code"] = code
            result["ok"] = code == 250
            if result["ok"]:
                result["stage"] = "ready"
    except Exception as error:
        result["ok"] = False
        # Never include exception text: SMTP responses may echo private values.
        if isinstance(error, smtplib.SMTPResponseException):
            result["smtp_code"] = error.smtp_code
        result["error_type"] = type(error).__name__
        if isinstance(error, OSError) and error.errno is not None:
            result["errno"] = error.errno
        if isinstance(error, socket.gaierror):
            result["error"] = "dns_failure"
        elif isinstance(error, (TimeoutError, socket.timeout)):
            result["error"] = "timeout"
        elif isinstance(error, ssl.SSLError):
            result["error"] = "tls_failure"
        elif isinstance(error, smtplib.SMTPAuthenticationError):
            result["error"] = "authentication_rejected"
        elif isinstance(error, OSError):
            result["error"] = "connection_failure"
        else:
            result["error"] = "smtp_failure"
    return result


def main() -> int:
    try:
        result = check()
    except Exception:
        # Import-time Settings validation can contain environment input values.
        result = {"ok": False, "stage": "configuration", "error": "invalid_configuration", "message_sent": False}
    print(json.dumps(result))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
