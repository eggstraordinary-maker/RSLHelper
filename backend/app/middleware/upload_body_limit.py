"""Limit upload bodies before Starlette allocates multipart temporary files."""

from starlette.datastructures import Headers
from starlette.formparsers import MultiPartException
from starlette.responses import JSONResponse

from app.config import settings


class UploadBodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "POST" or scope.get("path", "").rstrip("/") != "/videos/upload":
            await self.app(scope, receive, send)
            return
        limit = settings.media_max_upload_bytes + settings.media_max_request_overhead_bytes
        raw_length = Headers(scope=scope).get("content-length")
        if raw_length is not None:
            try:
                length = int(raw_length)
                if length < 0:
                    raise ValueError
            except ValueError:
                await JSONResponse({"detail": "Invalid Content-Length"}, status_code=400)(scope, receive, send)
                return
            if length > limit:
                await JSONResponse({"detail": "Upload request exceeds the size limit"}, status_code=413)(scope, receive, send)
                return
        received = 0
        exceeded = False

        async def limited_receive():
            nonlocal received, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    exceeded = True
                    # This exception makes the multipart parser close every
                    # temporary file. Replace its normal 400 reply with 413.
                    raise MultiPartException("Upload request exceeds the size limit")
            return message

        async def bounded_send(message):
            if not exceeded:
                await send(message)

        await self.app(scope, limited_receive, bounded_send)
        if exceeded:
            await JSONResponse({"detail": "Upload request exceeds the size limit"}, status_code=413)(scope, receive, send)
