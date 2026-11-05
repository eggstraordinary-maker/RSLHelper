"""Learning HTTP/service/repository regressions on migrated PostgreSQL."""

import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.modules.learning import repository as repo
import test_accounts_postgresql
from test_accounts_postgresql import headers, seed_user

pg_api = test_accounts_postgresql.pg_api
pytestmark = pytest.mark.asyncio


def lessons(engine):
    with Session(engine) as db:
        rows = [
            models.VideoFile(
                filename=f"{index}.mp4",
                description="Same",
                object_name=f"{uuid4()}.mp4",
            )
            for index in range(2)
        ]
        db.add_all(rows)
        db.commit()
        return [row.lesson_id for row in rows]


async def test_parallel_attempts_and_idempotent_completion_survive_reload(pg_api):
    client, engine, _ = pg_api
    user = seed_user(engine)
    lesson_id = lessons(engine)[0]
    url = f"/progress/lessons/{lesson_id}"
    responses = await asyncio.gather(
        *[
            client.post(url + "/attempts", headers=headers(user), json={})
            for _ in range(12)
        ]
    )
    assert [response.status_code for response in responses] == [200] * 12
    first = await client.put(url + "/completion", headers=headers(user))
    second = await client.put(url + "/completion", headers=headers(user))
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert first.json()["attempts"] == 12
    reloaded = await client.get("/progress/lessons", headers=headers(user))
    assert reloaded.json() == [first.json()]
    with Session(engine) as db:
        assert (
            db.scalar(select(func.count()).select_from(models.UserLearningProgress))
            == 1
        )


async def test_ownership_unpublish_and_legacy_resolution_keep_existing_contract(pg_api):
    client, engine, _ = pg_api
    user = seed_user(engine)
    other = seed_user(engine, "another")
    ids = lessons(engine)
    assert (
        await client.post("/progress/complete/Same", headers=headers(user))
    ).status_code == 409
    assert (
        await client.post("/progress/complete/unknown", headers=headers(user))
    ).status_code == 404
    assert (
        await client.post(
            f"/progress/lessons/{ids[0]}/attempts",
            headers=headers(user),
            json={"user_id": other["id"]},
        )
    ).status_code == 422
    assert (
        await client.put(
            f"/progress/lessons/{ids[0]}/completion", headers=headers(user)
        )
    ).status_code == 200
    assert (await client.get("/progress/lessons", headers=headers(other))).json() == []
    with Session(engine) as db:
        row = db.scalar(
            select(models.VideoFile).where(models.VideoFile.lesson_id == ids[0])
        )
        row.is_published = False
        db.add(
            models.LegacyProgressMapping(
                progress_id=97,
                user_id=user["id"],
                word="legacy",
                candidate_lesson_ids="[]",
                status="unmatched",
            )
        )
        db.commit()
    assert (await client.get("/progress/lessons", headers=headers(user))).json() == []
    assert (
        await client.put(
            f"/progress/lessons/{ids[0]}/completion", headers=headers(user)
        )
    ).status_code == 404
    # With the other matching lesson unpublished, the legacy name is unique.
    resolved = await client.post("/progress/complete/Same", headers=headers(user))
    assert resolved.status_code == 200 and resolved.json()["lesson_id"] == ids[1]
    stats = (await client.get("/progress/stats", headers=headers(user))).json()
    assert (
        stats["total_lessons"] == stats["completed_lessons"] == 1
        and stats["unresolved_legacy_records"] == 1
    )
    assert (await client.get("/progress/legacy", headers=headers(user))).json()[0][
        "word"
    ] == "legacy"
    assert (await client.get("/progress/legacy", headers=headers(other))).json() == []
    assert (await client.get("/progress/stats", headers=headers(other))).json()[
        "unresolved_legacy_records"
    ] == 0


async def test_progress_write_failure_rolls_back_and_can_retry(pg_api, monkeypatch):
    client, engine, _ = pg_api
    user = seed_user(engine)
    lesson_id = lessons(engine)[0]
    original = repo.upsert_progress

    async def fail_after_write(*args, **kwargs):
        await original(*args, **kwargs)
        raise RuntimeError("Injected failure after persistence, before commit")

    monkeypatch.setattr(repo, "upsert_progress", fail_after_write)
    url = f"/progress/lessons/{lesson_id}/attempts"
    assert (await client.post(url, headers=headers(user), json={})).status_code == 500
    with Session(engine) as db:
        assert (
            db.scalar(select(func.count()).select_from(models.UserLearningProgress))
            == 0
        )
    monkeypatch.setattr(repo, "upsert_progress", original)
    assert (await client.post(url, headers=headers(user), json={})).json()[
        "attempts"
    ] == 1
