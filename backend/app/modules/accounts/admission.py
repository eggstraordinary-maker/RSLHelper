"""Admission is committed before account operations so failures cannot reset quotas."""
from datetime import datetime, timezone
import hashlib
import hmac
import math
from sqlalchemy.exc import SQLAlchemyError
from app.config import settings
from . import rate_repository as repo


class RateLimitExceeded(Exception):
    def __init__(self, retry_after):
        self.retry_after = retry_after


class AdmissionUnavailable(Exception):
    pass


def address_digest(scope: str, address: str) -> str:
    key = f"rslhelper:auth-rate:v1:{scope}:{address.strip().casefold()}"
    return hmac.new(settings.secret_key.encode(), key.encode(), hashlib.sha256).hexdigest()


def reserve(events, now, window, limit):
    current = sorted(value for value in events if value > now - window)
    if len(current) >= limit:
        return current, max(1, math.ceil(current[len(current) - limit] + window - now))
    return [*current, now], None


async def admit(db, scope: str, address: str) -> None:
    if not settings.auth_rate_limits_enabled:
        return
    if scope not in {"login", "mail"}:
        raise ValueError("Unknown admission scope")
    limit = settings.auth_login_limit if scope == "login" else settings.auth_mail_limit
    window = settings.auth_login_window_seconds if scope == "login" else settings.auth_mail_window_seconds
    try:
        bucket = await repo.locked_bucket(db, scope, address_digest(scope, address), window)
        now = (await repo.clock(db)).timestamp()  # Database clock AFTER acquiring the row lock.
        events, retry = reserve(bucket.admissions, now, window, limit)
        bucket.admissions = events
        bucket.expires_at = datetime.fromtimestamp(events[-1] + window, timezone.utc)
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise AdmissionUnavailable() from None
    except BaseException:
        await db.rollback()
        raise
    if retry is not None:
        raise RateLimitExceeded(retry)
