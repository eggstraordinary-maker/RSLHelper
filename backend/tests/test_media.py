"""HTTP/media behavior with isolated DB and object-store failure boundaries."""

import io
import re
from uuid import uuid4

from botocore.exceptions import ClientError
import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from starlette import formparsers

from app import auth, models
from app.config import settings
from app.main import app
from app.modules.catalog import repository as repo
from app.modules.catalog import service
from app.modules.catalog.errors import MediaUnavailableError
from app.routers import videos as video_router
from app.services.storage import ObjectMetadata
from media_fixture import tiny_mp4_bytes
import test_auth_security_flows

api = test_auth_security_flows.api  # Register the shared pytest fixture.


class TrackedBody(io.BytesIO):
    def __init__(self, payload):
        super().__init__(payload)
        self.close_calls = 0
        self.read_failure = False

    def read(self, amount=-1):
        if self.read_failure:
            raise RuntimeError("SDK secret=must-not-appear")
        assert amount > 0  # Streaming never reads the entire object at once.
        return super().read(amount)

    def close(self):
        self.close_calls += 1
        super().close()


class MemoryStorage:
    def __init__(self):
        self.objects = {}
        self.content_types = {}
        self.read_calls = []
        self.bodies = []
        self.stat_calls = []
        self.put_failure = False
        self.delete_failure = False

    def put_object(self, name, data, length, content_type):
        payload = data.read()
        assert len(payload) == length
        assert content_type == "video/mp4"
        self.objects[name] = payload
        self.content_types[name] = content_type
        if self.put_failure:
            raise RuntimeError("Storage credential=must-not-appear")

    def stat_object(self, name):
        self.stat_calls.append(name)
        if name not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}, "ResponseMetadata": {"HTTPStatusCode": 404}}, "HeadObject")
        return ObjectMetadata(len(self.objects[name]), self.content_types.get(name, "video/mp4"))

    def get_object(self, name, byte_range=None):
        self.read_calls.append((name, byte_range))
        payload = self.objects[name]
        if byte_range:
            start, end = map(int, byte_range.removeprefix("bytes=").split("-"))
            payload = payload[start:end + 1]
        body = TrackedBody(payload)
        self.bodies.append(body)
        return body

    def delete_object(self, name):
        if self.delete_failure:
            raise RuntimeError("Delete password=must-not-appear")
        self.objects.pop(name, None)


@pytest.fixture
def media_api(api, monkeypatch):
    client, engine, _mail = api
    with Session(engine) as db:
        admin = models.User(
            email="media_admin@example.com", username="media_admin",
            hashed_password="unused-in-token-auth-fixture", is_verified=True,
            is_active=True, role="admin",
        )
        user = models.User(
            email="media_user@example.com", username="media_user",
            hashed_password="unused-in-token-auth-fixture", is_verified=True,
            is_active=True, role="user",
        )
        db.add_all([admin, user])
        db.commit()
        headers = {"Authorization": "Bearer " + auth.create_access_token({"sub": admin.public_id})}
        user_headers = {"Authorization": "Bearer " + auth.create_access_token({"sub": user.public_id})}
    store = MemoryStorage()
    monkeypatch.setattr(service, "storage", store)
    return client, engine, store, headers, user_headers


def _upload(client, headers, *, payload=None, filename="lesson.mp4", content_type="video/mp4"):
    return client.post(
        "/videos/upload", headers=headers,
        files={"file": (filename, tiny_mp4_bytes() if payload is None else payload, content_type)},
        data={"description": "Reference gesture"},
    )


def _row_count(engine):
    with Session(engine) as db:
        return db.scalar(select(func.count()).select_from(models.VideoFile))


def test_valid_upload_has_private_random_key_and_public_uuid_contract(media_api):
    client, engine, store, headers, _ = media_api
    response = _upload(client, headers, filename="C:\\unsafe\\nested\\gesture.mp4", content_type="application/octet-stream")
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["filename"] == "gesture.mp4"
    assert re.fullmatch(r"[0-9a-f]{32}\.mp4", saved["object_name"])
    assert store.objects[saved["object_name"]] == tiny_mp4_bytes()
    assert _row_count(engine) == 1
    lessons = client.get("/videos/lessons")
    assert lessons.status_code == 200
    lesson = lessons.json()[0]
    assert "object_name" not in lesson
    assert lesson["media_url"] == f"/videos/lessons/{saved['lesson_id']}/content"
    assert client.get("/videos/").json()[0]["object_name"] == saved["object_name"]


def test_upload_roles_remain_enforced(media_api):
    client, engine, store, headers, user_headers = media_api
    assert _upload(client, {}).status_code == 401
    assert _upload(client, user_headers).status_code == 403
    assert not store.objects and _row_count(engine) == 0
    assert _upload(client, headers).status_code == 200


@pytest.mark.parametrize("payload,filename,content_type", [
    (b"", "empty.mp4", "video/mp4"),
    (b"GIF89a fake", "forged.mp4", "video/mp4"),
    (b"<html>not video</html>", "forged.mp4", "video/mp4"),
    (None, "gesture.gif", "video/mp4"),
    (None, "gesture.mp4", "text/html"),
    (None, "x" * 256 + ".mp4", "video/mp4"),
])
def test_unsupported_or_empty_uploads_do_not_touch_storage(media_api, payload, filename, content_type):
    client, engine, store, headers, _ = media_api
    response = _upload(client, headers, payload=payload, filename=filename, content_type=content_type)
    assert response.status_code == 415
    assert not store.objects and _row_count(engine) == 0


def test_truncated_mp4_is_rejected(media_api):
    client, engine, store, headers, _ = media_api
    assert _upload(client, headers, payload=tiny_mp4_bytes()[:-5]).status_code == 415
    assert not store.objects and _row_count(engine) == 0


def test_file_size_cap_rejects_before_storage(media_api, monkeypatch):
    client, engine, store, headers, _ = media_api
    monkeypatch.setattr(settings, "media_max_upload_bytes", len(tiny_mp4_bytes()) - 1)
    assert _upload(client, headers).status_code == 413
    assert not store.objects and _row_count(engine) == 0


def test_declared_request_size_rejected_before_body_is_read(media_api, monkeypatch):
    client, engine, store, headers, _ = media_api
    monkeypatch.setattr(settings, "media_max_upload_bytes", 32)
    monkeypatch.setattr(settings, "media_max_request_overhead_bytes", 32)
    response = client.post("/videos/upload", headers={**headers, "Content-Length": "65", "Origin": "http://localhost:5173"}, content=b"")
    assert response.status_code == 413
    assert response.headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
    assert not store.objects and _row_count(engine) == 0


@pytest.mark.asyncio
async def test_chunked_request_cap_closes_partially_spooled_upload(media_api, monkeypatch):
    _client, engine, store, _headers, _ = media_api
    monkeypatch.setattr(settings, "media_max_upload_bytes", 64)
    monkeypatch.setattr(settings, "media_max_request_overhead_bytes", 256)
    opened = []
    original = formparsers.SpooledTemporaryFile

    def track_spool(*args, **kwargs):
        spool = original(*args, **kwargs)
        opened.append(spool)
        return spool

    monkeypatch.setattr(formparsers, "SpooledTemporaryFile", track_spool)

    async def chunks():
        yield b'--BOUND\r\nContent-Disposition: form-data; name="file"; filename="x.mp4"\r\nContent-Type: video/mp4\r\n\r\nsmall'
        yield b"x" * 1024
        yield b"\r\n--BOUND--\r\n"

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/videos/upload", content=chunks(), headers={"Content-Type": "multipart/form-data; boundary=BOUND", "Origin": "http://localhost:5173"})
    assert response.status_code == 413
    assert response.headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
    assert opened and all(spool.closed for spool in opened)
    assert not store.objects and _row_count(engine) == 0


def test_s3_upload_failure_is_sanitized_and_compensated(media_api, caplog):
    client, engine, store, headers, _ = media_api
    store.put_failure = True
    response = _upload(client, headers)
    assert response.status_code == 503
    assert not store.objects and _row_count(engine) == 0
    assert "must-not-appear" not in response.text + caplog.text


def test_database_write_failure_rolls_back_and_removes_uploaded_object(media_api, monkeypatch, caplog):
    client, engine, store, headers, _ = media_api
    original = repo.add_lesson

    async def fail_after_flush(db, **kwargs):
        await original(db, **kwargs)
        raise IntegrityError("write", {}, Exception("Database password=must-not-appear"))

    monkeypatch.setattr(repo, "add_lesson", fail_after_flush)
    response = _upload(client, headers)
    assert response.status_code == 503
    assert not store.objects and _row_count(engine) == 0
    assert "must-not-appear" not in response.text + caplog.text


def test_cleanup_failure_does_not_expose_sdk_details(media_api, monkeypatch, caplog):
    client, engine, store, headers, _ = media_api
    store.delete_failure = True

    async def fail_write(db, **kwargs):
        raise IntegrityError("write", {}, Exception("Database password=must-not-appear"))

    monkeypatch.setattr(repo, "add_lesson", fail_write)
    response = _upload(client, headers)
    assert response.status_code == 503 and len(store.objects) == 1
    assert _row_count(engine) == 0
    assert "must-not-appear" not in response.text + caplog.text


def test_unknown_commit_outcome_retains_object_instead_of_breaking_possible_row(media_api, monkeypatch, caplog):
    client, engine, store, headers, _ = media_api

    async def uncertain_commit(_db):
        raise OperationalError("commit", {}, Exception("Connection secret=must-not-appear"), connection_invalidated=True)

    monkeypatch.setattr(AsyncSession, "commit", uncertain_commit)
    response = _upload(client, headers)
    assert response.status_code == 503 and len(store.objects) == 1
    assert _row_count(engine) == 0
    assert "must-not-appear" not in response.text + caplog.text


def test_post_commit_response_failure_does_not_delete_saved_media(media_api, monkeypatch):
    client, engine, store, headers, _ = media_api

    def fail_response(_lesson):
        raise RuntimeError("Response failure after commit")

    monkeypatch.setattr(video_router, "_legacy_response", fail_response)
    with pytest.raises(RuntimeError, match="Response failure after commit"):
        _upload(client, headers)
    assert len(store.objects) == 1 and _row_count(engine) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("stage,retained", [("write", False), ("confirmed_commit", False), ("unknown_commit", True)])
async def test_rollback_failure_keeps_compensation_and_errors_safe(monkeypatch, caplog, stage, retained):
    store = MemoryStorage()
    monkeypatch.setattr(service, "storage", store)

    class BrokenTransaction:
        async def rollback(self):
            raise RuntimeError("Rollback password=must-not-appear")

        async def commit(self):
            if stage == "confirmed_commit":
                raise IntegrityError("commit", {}, Exception("DB password=must-not-appear"))
            raise OperationalError("commit", {}, Exception("DB password=must-not-appear"), connection_invalidated=True)

    async def write(db, **kwargs):
        if stage == "write":
            raise IntegrityError("write", {}, Exception("DB password=must-not-appear"))
        return object()

    monkeypatch.setattr(repo, "add_lesson", write)
    with pytest.raises(MediaUnavailableError) as error:
        await service.upload_lesson(BrokenTransaction(), io.BytesIO(tiny_mp4_bytes()), "test.mp4", "video/mp4", "Test")
    assert bool(store.objects) is retained
    assert "must-not-appear" not in str(error.value) + caplog.text


def _content_fixture(media_api):
    client, engine, store, _headers, _ = media_api
    payload = bytes(range(100))
    with Session(engine) as db:
        lesson = models.VideoFile(filename="lesson.mp4", description="Hello", object_name="internal-key")
        db.add(lesson)
        db.commit()
        lesson_id = lesson.lesson_id
    store.objects["internal-key"] = payload
    return client, engine, store, f"/videos/lessons/{lesson_id}/content", payload


@pytest.mark.parametrize("range_value,status,start,end", [
    (None, 200, 0, 99), ("bytes=0-0", 206, 0, 0),
    ("bytes=10-20", 206, 10, 20), ("bytes=95-", 206, 95, 99),
    ("bytes=-7", 206, 93, 99), ("bytes=90-1000", 206, 90, 99),
    ("bytes=-1000", 206, 0, 99), ("bytes=0-1,3-4", 200, 0, 99),
    ("items=0-1", 200, 0, 99), ("malformed", 200, 0, 99),
])
def test_full_and_single_range_content(media_api, range_value, status, start, end):
    client, _engine, store, url, payload = _content_fixture(media_api)
    response = client.get(url, headers={"Range": range_value} if range_value else {})
    assert response.status_code == status
    assert response.content == payload[start:end + 1]
    assert response.headers["Content-Length"] == str(end - start + 1)
    assert response.headers["Content-Type"] == "video/mp4"
    assert response.headers["Accept-Ranges"] == "bytes"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert store.bodies[-1].close_calls == 1
    if status == 206:
        assert response.headers["Content-Range"] == f"bytes {start}-{end}/100"
        assert store.read_calls[-1][1] == f"bytes={start}-{end}"
    else:
        assert "Content-Range" not in response.headers


@pytest.mark.parametrize("value", ["bytes=100-", "bytes=101-200", "bytes=5-4", "bytes=-0"])
def test_unsatisfiable_range_does_not_open_body(media_api, value):
    client, _engine, store, url, _payload = _content_fixture(media_api)
    response = client.get(url, headers={"Range": value})
    assert response.status_code == 416 and response.headers["Content-Range"] == "bytes */100"
    assert not store.read_calls


def test_head_and_if_range_fallback_do_not_claim_partial_content(media_api):
    client, _engine, store, url, payload = _content_fixture(media_api)
    head = client.head(url, headers={"Range": "bytes=0-0"})
    assert head.status_code == 200 and head.content == b""
    assert head.headers["Content-Length"] == "100" and "Content-Range" not in head.headers
    assert not store.read_calls
    response = client.get(url, headers={"Range": "bytes=0-0", "If-Range": '"old-etag"'})
    assert response.status_code == 200 and response.content == payload


def test_missing_and_unpublished_lessons_are_hidden_before_storage(media_api):
    client, engine, store, url, _payload = _content_fixture(media_api)
    assert client.get(f"/videos/lessons/{uuid4()}/content").status_code == 404
    assert client.get("/videos/lessons/invalid/content").status_code == 422
    with Session(engine) as db:
        lesson = db.scalar(select(models.VideoFile))
        lesson.is_published = False
        db.commit()
    assert client.get(url).status_code == 404
    assert client.get("/videos/stream/internal-key").status_code == 404
    assert client.get("/videos/lessons").json() == []
    assert not store.stat_calls and not store.read_calls


def test_missing_storage_object_and_unsupported_metadata_are_not_served(media_api):
    client, _engine, store, url, _payload = _content_fixture(media_api)
    store.objects.clear()
    assert client.get(url).status_code == 404
    store.objects["internal-key"] = b"<html>inert</html>"
    store.content_types["internal-key"] = "text/html"
    assert client.get(url).status_code == 404
    assert not store.read_calls


@pytest.mark.asyncio
async def test_stream_closes_even_when_disconnected_before_first_yield():
    body = TrackedBody(b"video")
    response = video_router._ClosingStreamingResponse(video_router._BodyOwner(body), 5, headers={"Content-Length": "5"}, status_code=200)

    async def send(_message):
        raise OSError("Client disconnected before body")

    async def receive():
        return {"type": "http.disconnect"}

    with pytest.raises(Exception):
        await response({"type": "http", "asgi": {"spec_version": "2.4"}}, receive, send)
    assert body.closed and body.close_calls == 1


@pytest.mark.asyncio
async def test_stream_read_error_is_sanitized_and_closed(caplog):
    body = TrackedBody(b"video")
    body.read_failure = True
    response = video_router._ClosingStreamingResponse(video_router._BodyOwner(body), 5, headers={"Content-Length": "5"}, status_code=200)
    with pytest.raises(RuntimeError, match="Media stream unavailable"):
        await anext(response.body_iterator)
    assert body.closed and body.close_calls == 1
    assert "must-not-appear" not in caplog.text


def test_validation_reads_in_bounded_chunks_and_removes_temporary_file():
    class BoundedInput(io.BytesIO):
        def read(self, amount=-1):
            assert 0 < amount <= 64 * 1024
            return super().read(amount)

    prepared = service.prepare_upload(BoundedInput(tiny_mp4_bytes()), "test.mp4", "video/mp4")
    try:
        assert prepared.size == len(tiny_mp4_bytes()) and prepared.path.exists()
    finally:
        prepared.path.unlink()


def test_control_characters_in_filename_are_rejected_before_probe():
    from app.modules.catalog.errors import UnsupportedMediaError
    with pytest.raises(UnsupportedMediaError):
        service.prepare_upload(io.BytesIO(b"unread"), "bad\nname.mp4", "video/mp4")
