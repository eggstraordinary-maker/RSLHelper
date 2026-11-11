"""Opt-in HTTP -> migrated PostgreSQL -> real private SeaweedFS checks."""

import os
from urllib.parse import quote
from uuid import UUID

from botocore.exceptions import ClientError
import httpx
import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.services.storage import S3Storage
from media_fixture import tiny_mp4_bytes
import test_accounts_postgresql
from test_accounts_postgresql import headers, seed_user

pg_api = test_accounts_postgresql.pg_api  # Register the shared pytest fixture.

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(
        os.getenv("MEDIA_INTEGRATION_TESTS") != "1" or not os.getenv("POSTGRES_TEST_URL"),
        reason="Real media integration requires explicit opt-in and a test PostgreSQL URL",
    ),
]
BUCKET = "media-tests"


def object_keys(client):
    keys = set()
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=BUCKET):
        keys.update(item["Key"] for item in page.get("Contents", []))
    return keys


def row_count(engine):
    with Session(engine) as db:
        return db.scalar(select(func.count()).select_from(models.VideoFile))


@pytest_asyncio.fixture
async def real_media(pg_api):
    # A developer's configured catalog bucket must never be a test cleanup target.
    if settings.s3_bucket != BUCKET:
        pytest.fail("Real media tests require the dedicated media-tests bucket")
    s3 = S3Storage(bucket=BUCKET).client
    try:
        s3.head_bucket(Bucket=BUCKET)
    except ClientError as exc:
        if exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 404:
            raise
        s3.create_bucket(Bucket=BUCKET)
    owned = set()
    client, engine, _ = pg_api
    admin = seed_user(engine, "media_admin", role="admin")
    try:
        yield client, engine, headers(admin), s3, owned
    finally:
        # Delete only objects returned by successful uploads in this fixture.
        for key in owned:
            s3.delete_object(Bucket=BUCKET, Key=key)
        assert not (object_keys(s3) & owned)


async def upload(client, admin_headers, payload, owned):
    response = await client.post(
        "/videos/upload", headers=admin_headers,
        files={"file": ("lesson.mp4", payload, "video/mp4")}, data={"description": "Integration lesson"},
    )
    assert response.status_code == 200
    record = response.json()
    owned.add(record["object_name"])
    assert record["object_name"].endswith(".mp4")
    UUID(record["object_name"][:-4])
    return record


async def test_real_media_upload_catalog_stream_ranges_head_and_publication(real_media):
    client, engine, admin_headers, s3, owned = real_media
    payload = tiny_mp4_bytes()
    record = await upload(client, admin_headers, payload, owned)
    lesson_id = record["lesson_id"]
    content_url = f"/videos/lessons/{lesson_id}/content"
    catalog = await client.get("/videos/lessons")
    assert catalog.status_code == 200
    lesson = next(row for row in catalog.json() if row["lesson_id"] == lesson_id)
    assert "object_name" not in lesson
    assert lesson["media_url"] == content_url
    assert set(lesson) == {"id", "lesson_id", "filename", "description", "is_published", "media_url"}
    assert row_count(engine) == 1
    metadata = s3.head_object(Bucket=BUCKET, Key=record["object_name"])
    assert metadata["ContentLength"] == len(payload)
    assert metadata["ContentType"] == "video/mp4"

    full = await client.get(content_url)
    assert full.status_code == 200
    assert full.content == payload
    assert full.headers["content-type"].split(";")[0] == "video/mp4"
    assert full.headers["content-length"] == str(len(payload))
    assert full.headers["accept-ranges"] == "bytes"
    for value, start, end in [
        ("bytes=0-9", 0, 9),
        ("bytes=12-", 12, len(payload) - 1),
        ("bytes=-7", len(payload) - 7, len(payload) - 1),
    ]:
        part = await client.get(content_url, headers={"Range": value})
        assert part.status_code == 206
        assert part.content == payload[start:end + 1]
        assert part.headers["content-range"] == f"bytes {start}-{end}/{len(payload)}"
        assert part.headers["content-length"] == str(end - start + 1)
    unsatisfiable = await client.get(content_url, headers={"Range": f"bytes={len(payload)}-"})
    assert unsatisfiable.status_code == 416
    assert unsatisfiable.headers["content-range"] == f"bytes */{len(payload)}"
    head = await client.head(content_url)
    assert head.status_code == 200 and head.content == b""
    assert head.headers["content-length"] == str(len(payload))
    head_range = await client.head(content_url, headers={"Range": "bytes=0-9"})
    assert head_range.status_code == 200 and head_range.content == b""
    assert head_range.headers["content-length"] == str(len(payload))
    assert "content-range" not in head_range.headers

    # This is an unsigned network request, not an SDK call or mocked transport.
    anonymous_url = f"{settings.s3_endpoint_url.rstrip('/')}/{BUCKET}/{quote(record['object_name'], safe='')}"
    async with httpx.AsyncClient(timeout=10) as network:
        anonymous = await network.get(anonymous_url)
    assert anonymous.status_code == 403

    with Session(engine) as db:
        video = db.scalar(select(models.VideoFile).where(models.VideoFile.lesson_id == lesson_id))
        video.is_published = False
        db.commit()
    assert (await client.get(content_url)).status_code == 404
    assert (await client.head(content_url)).status_code == 404
    catalog = await client.get("/videos/lessons")
    assert catalog.status_code == 200
    assert lesson_id not in {row["lesson_id"] for row in catalog.json()}


async def test_rejected_uploads_do_not_create_s3_objects_or_database_rows(real_media, monkeypatch):
    client, engine, admin_headers, s3, _ = real_media
    before_objects, before_rows = object_keys(s3), row_count(engine)
    invalid_uploads = [
        ("image.png", b"\x89PNG\r\n\x1a\n", "image/png"),
        ("forged.mp4", b"not a real MP4 container", "video/mp4"),
        ("long.mp4", tiny_mp4_bytes("15.2"), "video/mp4"),
        ("wrong-codec.mp4", tiny_mp4_bytes("0.4", "mpeg4"), "video/mp4"),
    ]
    for filename, data, content_type in invalid_uploads:
        rejected = await client.post(
            "/videos/upload", headers=admin_headers,
            files={"file": (filename, data, content_type)},
        )
        assert rejected.status_code == 415
        assert object_keys(s3) == before_objects and row_count(engine) == before_rows
    valid = tiny_mp4_bytes()
    monkeypatch.setattr(settings, "media_max_upload_bytes", len(valid) - 1)
    oversized = await client.post(
        "/videos/upload", headers=admin_headers,
        files={"file": ("oversized.mp4", valid, "video/mp4")},
    )
    assert oversized.status_code == 413
    assert object_keys(s3) == before_objects and row_count(engine) == before_rows
