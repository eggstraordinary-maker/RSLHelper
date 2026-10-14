from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
import test_auth_security_flows as security_tests

api = security_tests.api
_register_and_login = security_tests._register_and_login


def _setup(api):
    client, engine, mail = api
    tokens = _register_and_login(client, engine, mail)
    with Session(engine) as db:
        lessons = [
            models.VideoFile(
                filename=f"{i}.mp4", description="Same", object_name=f"clip-{i}"
            )
            for i in range(2)
        ]
        db.add_all(lessons)
        db.commit()
        ids = [lesson.lesson_id for lesson in lessons]
    return (
        client,
        engine,
        mail,
        {"Authorization": f"Bearer {tokens['access_token']}"},
        ids,
    )


def test_practice_completion_and_reload_use_stable_user_lesson_ids(api):
    client, engine, mail, headers, ids = _setup(api)
    url = f"/progress/lessons/{ids[1]}"
    assert (
        client.post(f"{url}/attempts", json={}, headers=headers).json()["attempts"] == 1
    )
    attempt = client.post(f"{url}/attempts", json={"completed": False}, headers=headers)
    assert attempt.status_code == 200
    assert attempt.json()["completed"] is False
    assert attempt.json()["attempts"] == 2
    first = client.put(f"{url}/completion", headers=headers).json()
    second = client.put(f"{url}/completion", headers=headers).json()
    assert first == second
    assert first["attempts"] == 2
    assert first["completed_at"] is not None
    client.post(f"{url}/attempts", json={}, headers=headers)
    reloaded = client.get("/progress/lessons", headers=headers).json()
    assert len(reloaded) == 1
    assert reloaded[0]["lesson_id"] == ids[1]
    assert reloaded[0]["attempts"] == 3
    assert reloaded[0]["completed_at"] == first["completed_at"]
    with Session(engine) as db:
        lesson = db.scalar(
            select(models.VideoFile).where(models.VideoFile.lesson_id == ids[1])
        )
        lesson.description = "Renamed"
        lesson.object_name = "replacement.mp4"
        db.commit()
    stats = client.get("/progress/stats", headers=headers).json()
    assert stats["completed_lessons"] == 1
    assert stats["completed_percentage"] == 50
    assert stats["recent_lessons"] == ["Renamed"]
    other = _register_and_login(client, engine, mail, email="second@example.com")
    other_headers = {"Authorization": f"Bearer {other['access_token']}"}
    assert client.get("/progress/lessons", headers=other_headers).json() == []
    assert (
        client.get("/progress/stats", headers=other_headers).json()["completed_lessons"]
        == 0
    )


def test_rejects_unknown_unpublished_invalid_and_ambiguous_lessons(api):
    client, engine, _mail, headers, ids = _setup(api)
    assert client.put(f"/progress/lessons/{ids[0]}/completion").status_code == 401
    assert (
        client.put(
            "/progress/lessons/not-a-uuid/completion", headers=headers
        ).status_code
        == 422
    )
    assert (
        client.put(
            f"/progress/lessons/{uuid4()}/completion", headers=headers
        ).status_code
        == 404
    )
    assert client.post("/progress/complete/Same", headers=headers).status_code == 409
    assert client.post("/progress/complete/made-up", headers=headers).status_code == 404
    assert (
        client.post(
            f"/progress/lessons/{ids[0]}/attempts",
            json={"user_id": 99},
            headers=headers,
        ).status_code
        == 422
    )
    with Session(engine) as db:
        lesson = db.scalar(
            select(models.VideoFile).where(models.VideoFile.lesson_id == ids[0])
        )
        lesson.is_published = False
        db.commit()
    assert (
        client.put(
            f"/progress/lessons/{ids[0]}/completion", headers=headers
        ).status_code
        == 404
    )
    assert client.get("/videos/stream/clip-0").status_code == 404
    assert client.get("/videos/clip-0").status_code == 404
    assert len(client.get("/videos/").json()) == 1
    assert client.get("/progress/stats", headers=headers).json()["total_lessons"] == 1


def test_atomic_parallel_attempts_never_create_duplicate_progress(api):
    client, engine, _mail, headers, ids = _setup(api)

    def practice(_):
        return client.post(
            f"/progress/lessons/{ids[0]}/attempts", json={}, headers=headers
        ).status_code

    with ThreadPoolExecutor(max_workers=5) as pool:
        assert list(pool.map(practice, range(12))) == [200] * 12
    with Session(engine) as db:
        rows = db.scalars(select(models.UserLearningProgress)).all()
        assert len(rows) == 1
        assert rows[0].attempts == 12


def test_unresolved_legacy_progress_is_visible_only_to_its_owner(api):
    client, engine, mail, headers, _ids = _setup(api)
    with Session(engine) as db:
        user = db.scalar(
            select(models.User).where(models.User.email == "learner@example.com")
        )
        db.add(
            models.LegacyProgressMapping(
                progress_id=90,
                user_id=user.id,
                word="Unknown",
                candidate_lesson_ids="[]",
                status="unmatched",
                completed=True,
                attempts=5,
            )
        )
        db.commit()
    assert (
        client.get("/progress/stats", headers=headers).json()[
            "unresolved_legacy_records"
        ]
        == 1
    )
    assert (
        client.get("/progress/legacy", headers=headers).json()[0]["word"] == "Unknown"
    )
    other = _register_and_login(client, engine, mail, email="other@example.com")
    assert (
        client.get(
            "/progress/legacy",
            headers={"Authorization": f"Bearer {other['access_token']}"},
        ).json()
        == []
    )


def test_account_deletion_removes_progress_and_legacy_audit(api):
    client, engine, _mail, headers, ids = _setup(api)
    client.post(f"/progress/lessons/{ids[0]}/attempts", json={}, headers=headers)
    with Session(engine) as db:
        user = db.scalar(
            select(models.User).where(models.User.email == "learner@example.com")
        )
        db.add(
            models.LegacyProgressMapping(
                progress_id=91,
                user_id=user.id,
                word="Unknown",
                candidate_lesson_ids="[]",
                status="unmatched",
                completed=False,
                attempts=0,
            )
        )
        db.commit()
    response = client.request(
        "DELETE", "/users/me", json={"password": "GoodPass1"}, headers=headers
    )
    assert response.status_code == 204
    with Session(engine) as db:
        assert db.scalars(select(models.UserLearningProgress)).all() == []
        assert db.scalars(select(models.LegacyProgressMapping)).all() == []
