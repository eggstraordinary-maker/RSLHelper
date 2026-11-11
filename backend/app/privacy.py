"""Safe request correlation and redaction for legacy URL compatibility."""
from contextvars import ContextVar
import logging
import re
from uuid import UUID, uuid4

request_id = ContextVar("request_id", default="-")
_token_path = re.compile(r"(/(?:auth/)?(?:verify-email|reset-password)/)[^/?\s\"']+", re.I)
_credential_query = re.compile(r"([?&](?:token|access_token|refresh_token|password)=)[^&\s\"']+", re.I)


def redact(value: str) -> str:
    return _credential_query.sub(r"\1[redacted]", _token_path.sub(r"\1[redacted]", value))


class PrivateUrlFilter(logging.Filter):
    def filter(self, record):
        record.msg = redact(str(record.msg))
        # Uvicorn's AccessFormatter needs its original five positional fields.
        if isinstance(record.args, dict):
            record.args = {key: redact(value) if isinstance(value, str) else value for key, value in record.args.items()}
        else:
            record.args = tuple(redact(value) if isinstance(value, str) else value for value in record.args)
        return True


def install_log_filters():
    for name in ("uvicorn.access", "httpx"):
        logger = logging.getLogger(name)
        if not any(isinstance(value, PrivateUrlFilter) for value in logger.filters):
            logger.addFilter(PrivateUrlFilter())


def audit(event: str, *, actor_id=None, target_id=None):
    # Callers supply static event names and database IDs after a successful commit.
    logging.getLogger("rslhelper.audit").info("event=%s request_id=%s actor_id=%s target_id=%s",
        event, request_id.get(), actor_id, target_id)


class RequestCorrelationMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        try:
            identity = str(UUID(headers.get(b"x-request-id", b"").decode("ascii")))
        except (ValueError, UnicodeError):
            identity = str(uuid4())
        context = request_id.set(identity)

        async def correlated(message):
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", []), (b"x-request-id", identity.encode())]
            await send(message)
        try:
            await self.app(scope, receive, correlated)
        finally:
            request_id.reset(context)
