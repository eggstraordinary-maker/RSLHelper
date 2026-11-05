"""Verify real API/PostgreSQL/S3, or create scoped fixtures for browser E2E.

Run inside the backend container. No mail is sent. Cleanup deletes only this
script's explicitly tagged temporary rows and objects, never existing lessons.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import secrets
import uuid
import time

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import auth, models
from app.database import engine
from app.services.storage import storage


def create_fixture(video_path: Path) -> dict:
    for _ in range(40):
        try:
            httpx.get("http://localhost:8000/health", timeout=2).raise_for_status()
            break
        except httpx.HTTPError:
            time.sleep(0.5)
    else:
        raise RuntimeError(
            "Backend did not become ready within the smoke-test deadline"
        )
    run_id = uuid.uuid4().hex
    email = f"e2e_{run_id}@example.com"
    password = secrets.token_urlsafe(24) + "aA1"
    with Session(engine) as db:
        user = models.User(
            email=email,
            username=f"e2e_{run_id}",
            hashed_password=auth.get_password_hash(password),
            is_verified=True,
            is_active=True,
            role="admin",
        )
        db.add(user)
        db.commit()
        user_id = user.id
    objects = []
    lesson_ids = []
    fixture = dict(
        run_id=run_id,
        email=email,
        password=password,
        user_id=user_id,
        objects=objects,
        lesson_ids=lesson_ids,
    )
    try:
        payload = video_path.read_bytes()
        with httpx.Client(base_url="http://localhost:8000", timeout=30) as client:
            login = client.post(
                "/auth/login", data={"username": email, "password": password}
            )
            login.raise_for_status()
            headers = {"Authorization": "Bearer " + login.json()["access_token"]}
            for index in range(2):
                upload = client.post(
                    "/videos/upload",
                    headers=headers,
                    data={"description": f"E2E practice {run_id}"},
                    files={"file": (f"e2e-{run_id}-{index}.mp4", payload, "video/mp4")},
                )
                upload.raise_for_status()
                lesson_ids.append(upload.json()["lesson_id"])
                objects.append(upload.json()["object_name"])
    except BaseException:
        cleanup_fixture(fixture)
        raise
    return fixture


def cleanup_fixture(fixture: dict) -> None:
    run_id = fixture["run_id"]
    if (not isinstance(run_id, str) or len(run_id) != 32
            or any(char not in "0123456789abcdef" for char in run_id)
            or fixture["email"] != f"e2e_{run_id}@example.com"
            or len(fixture["lesson_ids"]) != len(fixture["objects"])):
        raise ValueError("Refusing to clean up an untagged fixture")
    objects_to_delete = []
    with Session(engine) as db:
        user = db.scalar(
            select(models.User).where(
                models.User.id == fixture["user_id"],
                models.User.email == fixture["email"],
            )
        )
        if user:
            db.execute(
                delete(models.UserLearningProgress).where(
                    models.UserLearningProgress.user_id == user.id
                )
            )
            db.execute(
                delete(models.LegacyProgressMapping).where(
                    models.LegacyProgressMapping.user_id == user.id
                )
            )
            db.execute(
                delete(models.RefreshToken).where(
                    models.RefreshToken.user_id == user.id
                )
            )
            db.execute(delete(models.EmailVerification).where(models.EmailVerification.email == user.email))
            db.delete(user)
        for lesson_id, object_name in zip(fixture["lesson_ids"], fixture["objects"]):
            video = db.scalar(
                select(models.VideoFile).where(
                    models.VideoFile.lesson_id == lesson_id,
                    models.VideoFile.object_name == object_name,
                )
            )
            if video:
                # Keys are now opaque UUIDs. The server-side record, not its
                # key's spelling, proves that this clip belongs to this run.
                if (not video.filename.startswith(f"e2e-{run_id}-")
                        or video.description != f"E2E practice {run_id}"):
                    raise ValueError("Refusing to delete an untagged lesson")
                db.delete(video)
                objects_to_delete.append(object_name)
            elif storage.object_exists(object_name):
                raise ValueError("Missing tagged lesson: explicitly review orphan-object cleanup")
        db.commit()
    # A failed SQL commit must not remove a still-referenced object.
    for object_name in objects_to_delete:
        storage.delete_object(object_name)


def smoke(fixture: dict) -> None:
    with httpx.Client(base_url="http://localhost:8000", timeout=30) as client:
        login = client.post(
            "/auth/login",
            data={"username": fixture["email"], "password": fixture["password"]},
        )
        login.raise_for_status()
        headers = {"Authorization": "Bearer " + login.json()["access_token"]}
        lesson = fixture["lesson_ids"][1]

        def practice(_):
            response = client.post(
                f"/progress/lessons/{lesson}/attempts", json={}, headers=headers
            )
            response.raise_for_status()

        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(practice, range(12)))
        first = client.put(f"/progress/lessons/{lesson}/completion", headers=headers)
        first.raise_for_status()
        again = client.put(f"/progress/lessons/{lesson}/completion", headers=headers)
        again.raise_for_status()
        assert first.json() == again.json()
        rows = client.get("/progress/lessons", headers=headers).json()
        assert len(rows) == 1 and rows[0]["attempts"] == 12
        assert rows[0]["lesson_id"] == lesson
        assert (
            client.get("/progress/stats", headers=headers).json()["completed_lessons"]
            == 1
        )
        assert client.put(f"/progress/lessons/{lesson}/completion").status_code == 401
        assert client.get("/recognition/status").json()["available"] is False
        catalog = client.get("/videos/lessons").json()
        assert all("object_name" not in record for record in catalog)
        for lesson_id, object_name in zip(fixture["lesson_ids"], fixture["objects"]):
            content_url = f"/videos/lessons/{lesson_id}/content"
            body = client.get(content_url)
            body.raise_for_status()
            assert len(body.content) > 0
            part = client.get(content_url, headers={"Range": "bytes=0-15"})
            assert part.status_code == 206 and part.content == body.content[:16]
            assert client.get(content_url, headers={"Range": f"bytes={len(body.content)}-"}).status_code == 416
            stored = storage.get_object(object_name)
            try:
                assert stored.read() == body.content
            finally:
                stored.close()
        refresh = login.json()["refresh_token"]
        rotated = client.post("/auth/refresh", json={"refresh_token": refresh})
        rotated.raise_for_status()
        assert (
            client.post("/auth/refresh", json={"refresh_token": refresh}).status_code
            == 401
        )
        logout = client.post(
            "/auth/logout", json={"refresh_token": rotated.json()["refresh_token"]}
        )
        logout.raise_for_status()
        assert (
            client.post(
                "/auth/refresh", json={"refresh_token": rotated.json()["refresh_token"]}
            ).status_code
            == 401
        )
    print(
        "API/PostgreSQL/S3: upload, playback bytes, 12 parallel attempts, completion, reload, auth rotation/revoke OK"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", type=Path)
    parser.add_argument("--keep-fixture", type=Path)
    parser.add_argument("--cleanup", type=Path)
    args = parser.parse_args()
    if args.cleanup:
        cleanup_fixture(json.loads(args.cleanup.read_text(encoding="utf-8-sig")))
        args.cleanup.unlink()
        print("Temporary E2E user, sessions, progress and S3 clips removed")
        return
    if not args.video:
        parser.error("--video is required")
    fixture = create_fixture(args.video)
    if args.keep_fixture:
        args.keep_fixture.write_text(json.dumps(fixture), encoding="utf-8")
        print(
            "Temporary browser fixture created; credentials saved without console output"
        )
        return
    try:
        smoke(fixture)
    finally:
        cleanup_fixture(fixture)


if __name__ == "__main__":
    main()
