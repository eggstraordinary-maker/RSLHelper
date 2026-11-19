"""Admin API, migrated PostgreSQL, and real SeaweedFS lifecycle regressions."""

import asyncio
from uuid import uuid4

from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.modules.catalog import repository as catalog_repo
from media_fixture import tiny_mp4_bytes
from test_accounts_postgresql import headers, seed_user
import test_media_storage_integration as media_tests

pg_api = media_tests.pg_api
real_media = media_tests.real_media
pytestmark = media_tests.pytestmark


def fields(title):
    return {
        "title": title, "description": "How to make the sign", "category": "Basics",
        "source": "Synthetic fixture", "consent_reference": "Fixture permission",
    }


async def draft(client, admin):
    gesture_id = str(uuid4())
    response = await client.post("/admin/catalog", headers=admin, json={"gesture_id": gesture_id, **fields("First title")})
    assert response.status_code == 201
    return f"/admin/catalog/{gesture_id}", response.json()


async def action(client, admin, url, record, name, **extra):
    return await client.post(f"{url}/transitions", headers=admin, json={
        "action": name, "expected_version": record["revision"]["version"], **extra,
    })


async def edit(client, admin, url, record, title, **placement):
    response = await client.put(url, headers=admin, json={
        "expected_version": record["revision"]["version"], **fields(title), **placement,
    })
    assert response.status_code == 200
    return response.json()


async def video(client, admin, url, record, payload, filename="sample.mp4"):
    return await client.put(f"{url}/video", headers=admin,
        files={"file": (filename, payload, "video/mp4")},
        data={"expected_version": record["revision"]["version"]})


async def publish(client, admin, url, record):
    checked = await action(client, admin, url, record, "approve", note="Reviewed")
    assert checked.status_code == 200
    published = await action(client, admin, url, checked.json(), "publish")
    assert published.status_code == 200
    return published.json()


async def test_revisions_keep_one_visible_video_and_archiving_keeps_progress(real_media):
    client, engine, admin, _, _ = real_media
    learner = headers(seed_user(engine, "catalog_learner"))
    stranger = headers(seed_user(engine, "catalog_stranger"))
    url, record = await draft(client, admin)
    lesson_id = record["lesson_id"]
    content_url = f"/videos/lessons/{lesson_id}/content"
    assert (await action(client, admin, url, record, "approve")).json()["detail"]["missing"] == ["video"]
    original = tiny_mp4_bytes()
    saved = await video(client, admin, url, record, original)
    assert saved.status_code == 200
    record = saved.json()
    assert record["revision"]["source"] == record["revision"]["consent_reference"] == ""
    assert "object_name" not in saved.text and (await client.get(content_url)).status_code == 404
    preview = f"{url}/versions/{record['revision']['version']}/content"
    assert (await client.get(preview)).status_code == 401
    assert (await client.get(preview, headers=learner)).status_code == 403
    assert (await client.get(preview, headers=admin)).content == original

    filled = await edit(client, admin, url, record, "First title")
    assert (await action(client, admin, url, filled, "publish")).json()["detail"]["code"] == "review_required"
    first = await publish(client, admin, url, filled)
    sections = (await client.get("/learning/sections", headers=learner)).json()
    assert not sections["alphabet"] and sections["basic"][0]["lesson_id"] == lesson_id
    assert (await client.post(
        f"/progress/lessons/{lesson_id}/attempts", headers=learner, json={"completed": True},
    )).status_code == 200
    replacement = tiny_mp4_bytes("1.2")
    updated = await video(client, admin, url, first, replacement, "replacement.mp4")
    assert updated.status_code == 200
    assert updated.json()["published_version"] == first["published_version"]
    assert (await client.get(content_url)).content == original
    assert (await client.get("/videos/lessons")).json()[0]["title"] == "First title"
    moved = await edit(client, admin, url, updated.json(), "Second title", learning_section="alphabet", alphabet_letter="ё")
    assert moved["revision"]["alphabet_letter"] == "Ё"
    assert (await client.get("/learning/sections", headers=learner)).json() == sections
    corrected = await edit(client, admin, url, moved, "Second title")  # Old clients omit placement.
    assert corrected["revision"]["learning_section"] == "alphabet" and corrected["revision"]["alphabet_letter"] == "Ё"
    reviewed = await action(client, admin, url, corrected, "request_changes", note="Check the name")
    assert reviewed.json()["revision"]["review_note"] == "Check the name"
    second = await publish(client, admin, url, reviewed.json())
    assert second["lesson_id"] == lesson_id
    assert (await client.get(content_url)).content == replacement
    visible = (await client.get("/videos/lessons")).json()
    assert len(visible) == 1 and visible[0]["title"] == "Second title"
    sections = (await client.get("/learning/sections", headers=learner)).json()
    assert not sections["basic"] and sections["alphabet"] == visible

    archived = await action(client, admin, url, second, "archive")
    assert archived.status_code == 200 and archived.json()["archived"]
    assert (await client.get(content_url)).status_code == 404
    assert (await client.get("/videos/lessons")).json() == []
    assert (await client.get("/learning/sections", headers=learner)).json() == {"alphabet": [], "basic": []}
    assert (await client.put(f"/progress/lessons/{lesson_id}/completion", headers=learner)).status_code == 404
    stats = (await client.get("/progress/stats", headers=learner)).json()
    assert stats["total_lessons"] == 0
    assert stats["unavailable_lessons"] == [{
        "lesson_id": lesson_id, "word": "First title", "attempts": 1, "completed": True,
    }]
    other = (await client.get("/progress/stats", headers=stranger)).json()
    assert other["unavailable_lessons"] == []
    restored = await action(client, admin, url, archived.json(), "restore")
    assert restored.status_code == 200 and restored.json()["published_version"] is None
    assert (await client.get(content_url)).status_code == 404
    assert restored.json()["revision"]["review_status"] == "draft"
    republished = await publish(client, admin, url, restored.json())
    sections = (await client.get("/learning/sections", headers=learner)).json()
    assert sections["alphabet"][0]["lesson_id"] == lesson_id and sections["alphabet"][0]["alphabet_letter"] == "Ё"
    assert (await client.get("/progress/lessons", headers=learner)).json()[0]["attempts"] == 1
    history = (await client.get(f"{url}/versions", headers=admin)).json()
    assert [item["version"] for item in history] == list(range(republished["revision"]["version"], 0, -1))
    assert all(item["author_id"] is not None and item["created_at"].endswith("Z") for item in history)
    first_snapshot = next(item for item in history if item["version"] == first["published_version"])
    assert first_snapshot["title"] == "First title" and first_snapshot["review_note"] == "Reviewed"
    assert (await action(client, admin, url, republished, "unpublish")).status_code == 200


async def test_withdrawal_hides_published_clip_and_preserves_replacement_draft(real_media):
    client, _, admin, _, owned = real_media
    original = await media_tests.upload(client, admin, tiny_mp4_bytes(), owned)
    url = f"/admin/catalog/{original['gesture_id']}"
    current = (await client.get(url, headers=admin)).json()
    replacement = tiny_mp4_bytes("1.2")
    updated = (await video(client, admin, url, current, replacement)).json()
    withdrawn = await action(client, admin, url, updated, "withdraw_consent", media_version=current["published_version"])
    assert withdrawn.status_code == 200 and withdrawn.json()["published_version"] is None
    assert not withdrawn.json()["revision"]["video_withdrawn"]
    assert (await client.get(f"/videos/stream/{original['object_name']}")).status_code == 404
    assert (await client.get(f"/videos/{original['object_name']}")).status_code == 404
    assert (await client.get(f"{url}/versions/1/content", headers=admin)).status_code == 404
    version = withdrawn.json()["revision"]["version"]
    assert (await client.get(f"{url}/versions/{version}/content", headers=admin)).content == replacement
    filled = await edit(client, admin, url, withdrawn.json(), "Replacement")
    current = await publish(client, admin, url, filled)
    result = await action(client, admin, url, current, "withdraw_consent", media_version=current["published_version"])
    assert result.status_code == 200
    assert (await client.get("/videos/lessons")).json() == []
    assert (await client.get("/learning/sections", headers=admin)).json() == {"alphabet": [], "basic": []}
    updated = await edit(client, admin, url, result.json(), "Replacement")
    assert (await action(client, admin, url, updated, "approve")).json()["detail"]["missing"] == ["video"]


async def test_roles_stale_versions_and_upload_limits(real_media, monkeypatch):
    client, engine, admin, s3, _ = real_media
    learner = headers(seed_user(engine, "catalog_ordinary"))
    pending = seed_user(engine, "catalog_pending", role="admin")
    inactive = seed_user(engine, "catalog_inactive", role="admin")
    with Session(engine) as db:
        db.get(models.User, pending["id"]).is_verified = False
        db.get(models.User, inactive["id"]).is_active = False
        db.commit()
    for auth, code in [({}, 401), (learner, 403), (headers(pending), 400), (headers(inactive), 400)]:
        assert (await client.get("/admin/catalog", headers=auth)).status_code == code
        denied = await client.post("/admin/catalog", headers=auth,
                                   json={"gesture_id": str(uuid4()), **fields("Protected")})
        assert denied.status_code == code
    for auth, code in [({}, 401), (learner, 200), (headers(pending), 400), (headers(inactive), 400)]:
        assert (await client.get("/learning/sections", headers=auth)).status_code == code
    url, record = await draft(client, admin)
    duplicate = await client.post("/admin/catalog", headers=admin,
                                  json={"gesture_id": record["gesture_id"], **fields("Duplicate")})
    assert duplicate.status_code == 409 and media_tests.row_count(engine) == 1
    results = await asyncio.gather(*(client.put(url, headers=admin, json={
        "expected_version": 1, **fields(title),
    }) for title in ("First edit", "Second edit")))
    assert sorted(result.status_code for result in results) == [200, 409]
    conflict = next(result for result in results if result.status_code == 409)
    assert conflict.json()["detail"]["code"] == "stale_version"
    current = (await client.get(url, headers=admin)).json()
    keys = media_tests.object_keys(s3)
    assert (await video(client, admin, url, record, tiny_mp4_bytes())).status_code == 409
    assert (await video(client, admin, url, current, b"invalid mp4")).status_code == 415
    monkeypatch.setattr(settings, "media_max_upload_bytes", 8)
    monkeypatch.setattr(settings, "media_max_request_overhead_bytes", 256)
    assert (await video(client, admin, url, current, tiny_mp4_bytes())).status_code == 413
    assert media_tests.object_keys(s3) == keys
    assert (await client.get(f"{url}/versions?limit=1", headers=admin)).json()[0]["version"] == 2
    assert (await client.get(f"{url}/versions?before_version=2", headers=admin)).json()[0]["version"] == 1


async def test_failed_replacement_rolls_back_and_cleans_only_staged_object(real_media, monkeypatch, caplog):
    client, _, admin, s3, owned = real_media
    original = tiny_mp4_bytes()
    saved = await media_tests.upload(client, admin, original, owned)
    url = f"/admin/catalog/{saved['gesture_id']}"
    initial = (await client.get(url, headers=admin)).json()
    keys = media_tests.object_keys(s3)
    append = catalog_repo.append_revision

    async def fail_after_write(*args, **kwargs):
        await append(*args, **kwargs)
        raise RuntimeError("private-infrastructure-canary")

    monkeypatch.setattr(catalog_repo, "append_revision", fail_after_write)
    failed = await video(client, admin, url, initial, tiny_mp4_bytes("1.2"))
    assert failed.status_code == 503
    assert "private-infrastructure-canary" not in failed.text + caplog.text
    assert media_tests.object_keys(s3) == keys
    assert (await client.get(url, headers=admin)).json() == initial
    assert (await client.get(f"/videos/lessons/{saved['lesson_id']}/content")).content == original
