"""Fast HTTP checks for catalog validation, conflicts and failed publication."""

from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app import models
from app.modules.catalog import repository as repo
from media_fixture import tiny_mp4_bytes
import test_media

api = test_media.api
media_api = test_media.media_api

METADATA = {
    "title": "Sign", "description": "Instructions", "category": "Basics",
    "source": "Fixture source", "consent_reference": "Fixture consent",
}


def create(client, admin):
    gesture_id = str(uuid4())
    response = client.post("/admin/catalog", headers=admin, json={"gesture_id": gesture_id, "title": "Draft"})
    assert response.status_code == 201
    return f"/admin/catalog/{gesture_id}", response.json()


def change(client, admin, url, record, action, **extra):
    return client.post(f"{url}/transitions", headers=admin, json={
        "expected_version": record["revision"]["version"], "action": action, **extra,
    })


def attach(client, admin, url, record, payload=None):
    return client.put(f"{url}/video", headers=admin, data={"expected_version": record["revision"]["version"]},
                      files={"file": ("example.mp4", payload if payload is not None else tiny_mp4_bytes(), "video/mp4")})


def test_incomplete_and_missing_clip_are_refused_then_admin_can_retry_publication(media_api):
    client, _, storage, admin, _ = media_api
    url, draft = create(client, admin)
    blocked = change(client, admin, url, draft, "approve")
    assert blocked.status_code == 409
    assert set(blocked.json()["detail"]["missing"]) == {"video", "category", "source", "consent_reference"}
    assert client.get(f"{url}/versions/1/content", headers=admin).status_code == 404
    assert attach(client, admin, url, draft, b"not an MP4").status_code == 415
    attached = attach(client, admin, url, draft)
    assert attached.status_code == 200
    filled = client.put(url, headers=admin, json={"expected_version": 2, **METADATA}).json()
    assert filled["revision"]["version"] == 3
    assert change(client, admin, url, filled, "publish").json()["detail"]["code"] == "review_required"
    approved = change(client, admin, url, filled, "approve", note="Reviewed").json()

    (key,) = storage.objects
    body = storage.objects.pop(key)
    unavailable = change(client, admin, url, approved, "publish")
    assert unavailable.status_code == 409 and unavailable.json()["detail"]["code"] == "video_unavailable"
    assert client.get(url, headers=admin).json() == approved
    assert client.get("/videos/lessons").json() == []
    storage.objects[key] = body
    published = change(client, admin, url, approved, "publish").json()
    assert published["published_version"] == published["revision"]["version"]
    lesson = client.get("/videos/lessons").json()[0]
    assert lesson["title"] == METADATA["title"]
    assert "source" not in lesson and "consent_reference" not in lesson
    assert change(client, admin, url, published, "publish").json()["detail"]["code"] == "already_published"


def test_conflicts_archived_edits_and_withdrawal_do_not_change_wrong_revision(media_api):
    client, _, storage, admin, _ = media_api
    url, initial = create(client, admin)
    assert client.get("/admin/catalog", headers=admin).json() == [initial]
    assert client.get("/admin/catalog?offset=1", headers=admin).json() == []
    assert client.get(f"/admin/catalog/{uuid4()}", headers=admin).status_code == 404
    duplicate = client.post("/admin/catalog", headers=admin, json={"gesture_id": initial["gesture_id"], **METADATA})
    assert duplicate.status_code == 409
    assert change(client, admin, url, initial, "restore").json()["detail"]["code"] == "not_archived"
    assert change(client, admin, url, initial, "unpublish").json()["detail"]["code"] == "not_published"
    assert change(client, admin, url, initial, "withdraw_consent").status_code == 422
    assert change(client, admin, url, initial, "withdraw_consent", media_version=1).status_code == 409
    rejected = change(client, admin, url, initial, "request_changes", note="Needs a better sample").json()
    assert rejected["revision"]["review_status"] == "changes_requested"
    attached = attach(client, admin, url, rejected).json()
    assert attach(client, admin, url, initial).json()["detail"]["code"] == "stale_version"
    assert len(storage.objects) == 1
    archived = change(client, admin, url, attached, "archive").json()
    result = client.put(url, headers=admin, json={"expected_version": archived["revision"]["version"], **METADATA})
    assert result.json()["detail"]["code"] == "gesture_archived"
    assert attach(client, admin, url, archived).json()["detail"]["code"] == "gesture_archived"
    restored = change(client, admin, url, archived, "restore").json()
    assert not restored["archived"] and restored["published_version"] is None
    version = restored["revision"]["version"]
    assert client.get(f"{url}/versions/{version}/content", headers=admin).status_code == 200
    withdrawn = change(client, admin, url, restored, "withdraw_consent", media_version=version).json()
    assert withdrawn["revision"]["video_withdrawn"]
    assert client.get(f"{url}/versions/{version}/content", headers=admin).status_code == 404
    assert change(client, admin, url, withdrawn, "withdraw_consent", media_version=version).status_code == 409
    older = client.get(f"{url}/versions?before_version={version}&limit=1", headers=admin).json()
    assert older[0]["version"] == version - 1


def test_publication_write_failure_and_retry_are_atomic(media_api, monkeypatch):
    client, _, _, admin, _ = media_api
    url, record = create(client, admin)
    attached = attach(client, admin, url, record).json()
    ready = client.put(url, headers=admin, json={
        "expected_version": attached["revision"]["version"], **METADATA,
    }).json()
    approved = change(client, admin, url, ready, "approve").json()
    original = repo.append_revision

    async def fail_after_flush(*args, **kwargs):
        await original(*args, **kwargs)
        raise RuntimeError("internal error canary")

    with monkeypatch.context() as patch:
        patch.setattr(repo, "append_revision", fail_after_flush)
        failed = change(client, admin, url, approved, "publish")
        assert failed.status_code == 503 and "internal error canary" not in failed.text
    assert client.get(url, headers=admin).json() == approved
    assert client.get("/videos/lessons").json() == []
    assert change(client, admin, url, approved, "publish").status_code == 200


@pytest.mark.parametrize("placement", [
    {"learning_section": "alphabet"},
    {"learning_section": "alphabet", "alphabet_letter": "A"},
    {"learning_section": "alphabet", "alphabet_letter": "ß"},
    {"learning_section": "basic", "alphabet_letter": "А"},
    {"alphabet_letter": "А"},
    {"learning_section": "advanced"},
])
def test_invalid_learning_placement_does_not_create_a_draft(media_api, placement):
    client, _, _, admin, _ = media_api
    rejected = client.post("/admin/catalog", headers=admin, json={
        "gesture_id": str(uuid4()), "title": "Draft", **placement,
    })
    assert rejected.status_code == 422
    assert client.get("/admin/catalog", headers=admin).json() == []


def test_learning_sections_require_login_and_keep_russian_order(media_api):
    client, engine, _, _, learner = media_api
    endpoint = "/learning/sections"
    assert client.get(endpoint).status_code == 401
    assert client.get("/videos/lessons").status_code == 200
    assert client.get(endpoint, headers=learner).json() == {"alphabet": [], "basic": []}

    def add_lesson(db, title, *, category="", letter=None, published=True):
        lesson = models.VideoFile(
            filename=f"{uuid4()}.mp4", title=title, object_name=f"{uuid4()}.mp4",
            is_published=published,
        )
        db.add(lesson)
        db.flush()
        gesture = models.CatalogGesture(
            id=str(uuid4()), lesson_id=lesson.lesson_id, version=1,
            published_version=1 if published else None,
        )
        db.add(gesture)
        db.flush()
        media = models.CatalogMedia(
            id=str(uuid4()), gesture_id=gesture.id, filename=lesson.filename, object_name=lesson.object_name,
        )
        db.add(media)
        db.flush()
        db.add(models.CatalogRevision(
            gesture_id=gesture.id, version=1, title=title, description="",
            media_id=media.id, action="publish" if published else "created",
            review_status="approved" if published else "draft", review_note="",
            category=category, source="Private source", consent_reference="Private consent",
            learning_section="alphabet" if letter else "basic", alphabet_letter=letter,
        ))
        return lesson.lesson_id

    with Session(engine) as db:
        alphabet_ids = {
            letter: add_lesson(db, title, letter=letter)
            for letter, title in [("Ж", "Первый"), ("Ё", "Второй"), ("Е", "Третий")]
        }
        latter_category = add_lesson(db, "Астра", category="Животные")
        latter_title = add_lesson(db, "Ёлка", category="Еда")
        first_title = add_lesson(db, "ель", category="еда")
        add_lesson(db, "Черновик", letter="А", published=False)
        legacy = models.VideoFile(filename="legacy.mp4", object_name="old-object.mp4")
        db.add(legacy)
        db.flush()
        legacy_id = legacy.lesson_id
        db.commit()

    response = client.get(endpoint, headers=learner)
    assert response.status_code == 200 and response.headers["Cache-Control"] == "no-store"
    sections = response.json()
    assert [row["lesson_id"] for row in sections["alphabet"]] == [alphabet_ids[letter] for letter in "ЕЁЖ"]
    assert [row["alphabet_letter"] for row in sections["alphabet"]] == list("ЕЁЖ")
    assert [row["lesson_id"] for row in sections["basic"]] == [first_title, latter_title, latter_category, legacy_id]
    for row in sections["alphabet"] + sections["basic"]:
        assert row["is_learning_material"]
        assert row["media_url"] == f"/videos/lessons/{row['lesson_id']}/content"
        assert {"source", "consent_reference", "object_name"}.isdisjoint(row)
