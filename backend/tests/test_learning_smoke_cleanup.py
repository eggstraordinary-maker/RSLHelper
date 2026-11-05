"""Protect the scoped E2E cleanup while lesson object keys become opaque."""

from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import models
from app.database import Base
from scripts import learning_smoke


class FakeStorage:
    def __init__(self):
        self.deleted = []

    def delete_object(self, key):
        self.deleted.append(key)

    def object_exists(self, key):
        return False


@pytest.fixture
def scoped_fixture(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'cleanup.sqlite'}")
    Base.metadata.create_all(engine)
    run_id = uuid4().hex
    key = f"{uuid4()}.mp4"
    with Session(engine) as db:
        user = models.User(email=f"e2e_{run_id}@example.com", username=f"e2e_{run_id}", hashed_password="fixture")
        video = models.VideoFile(filename=f"e2e-{run_id}-0.mp4", description=f"E2E practice {run_id}", object_name=key)
        db.add_all([user, video])
        db.commit()
        fixture = {"run_id": run_id, "email": user.email, "user_id": user.id,
                   "lesson_ids": [video.lesson_id], "objects": [key]}
    storage = FakeStorage()
    monkeypatch.setattr(learning_smoke, "engine", engine)
    monkeypatch.setattr(learning_smoke, "storage", storage)
    try:
        yield fixture, engine, storage
    finally:
        engine.dispose()


def test_cleanup_accepts_opaque_key_only_for_its_tagged_database_record(scoped_fixture):
    fixture, engine, storage = scoped_fixture
    learning_smoke.cleanup_fixture(fixture)
    with Session(engine) as db:
        assert db.scalar(select(models.User)) is None
        assert db.scalar(select(models.VideoFile)) is None
    assert storage.deleted == fixture["objects"]


def test_cleanup_refuses_an_untagged_lesson_and_rolls_back(scoped_fixture):
    fixture, engine, storage = scoped_fixture
    with Session(engine) as db:
        db.scalar(select(models.VideoFile)).filename = "valuable-lesson.mp4"
        db.commit()
    with pytest.raises(ValueError, match="untagged lesson"):
        learning_smoke.cleanup_fixture(fixture)
    with Session(engine) as db:
        assert db.get(models.User, fixture["user_id"]) is not None
        assert db.scalar(select(models.VideoFile)) is not None
    assert storage.deleted == []


def test_cleanup_does_not_delete_s3_when_sql_commit_fails(scoped_fixture, monkeypatch):
    fixture, engine, storage = scoped_fixture

    class FailingCommitSession(Session):
        def commit(self):
            raise RuntimeError("Injected commit failure")

    monkeypatch.setattr(learning_smoke, "Session", FailingCommitSession)
    with pytest.raises(RuntimeError, match="Injected commit failure"):
        learning_smoke.cleanup_fixture(fixture)
    with Session(engine) as db:
        assert db.get(models.User, fixture["user_id"]) is not None
        assert db.scalar(select(models.VideoFile)) is not None
    assert storage.deleted == []
