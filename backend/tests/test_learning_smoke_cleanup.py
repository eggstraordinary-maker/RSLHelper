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
    with Session(engine) as db:
        db.add(models.LearningAttemptReceipt(user_id=fixture["user_id"], attempt_id=str(uuid4()),
            lesson_id=fixture["lesson_ids"][0], completed=False, response_payload={}))
        db.commit()
    learning_smoke.cleanup_fixture(fixture)
    with Session(engine) as db:
        assert db.scalar(select(models.User)) is None
        assert db.scalar(select(models.VideoFile)) is None
        assert db.scalar(select(models.LearningAttemptReceipt)) is None
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


def test_public_manifest_has_no_credentials_and_still_cleans_only_owned_rows(scoped_fixture):
    fixture, engine, storage = scoped_fixture
    fixture["password"] = "not-a-real-password"
    manifest = learning_smoke.public_fixture(fixture)
    assert set(manifest) == {"run_id", "user_id", "lesson_ids", "objects"}
    learning_smoke.cleanup_fixture(manifest)
    with Session(engine) as db:
        assert db.get(models.User, fixture["user_id"]) is None
    assert storage.deleted == fixture["objects"]


def test_manifest_validator_rejects_any_extra_field(tmp_path, monkeypatch):
    import json
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps({"run_id": "test", "user_id": 1, "lesson_ids": [], "objects": [],
                                "password": "private-canary"}), encoding="utf8")
    monkeypatch.setattr("sys.argv", ["smoke", "--validate-fixture", str(path)])
    with pytest.raises(ValueError, match="credential-bearing"):
        learning_smoke.main()


def test_keep_fixture_requires_an_environment_credential_before_creating_data(tmp_path, monkeypatch):
    monkeypatch.delenv("RSL_E2E_PASSWORD", raising=False)
    monkeypatch.setattr("sys.argv", ["smoke", "--video", "unused.mp4", "--keep-fixture", str(tmp_path / "manifest.json")])
    def forbidden(*_, **__):
        pytest.fail("Must validate credentials before creating any account")
    monkeypatch.setattr(learning_smoke, "create_fixture", forbidden)
    with pytest.raises(SystemExit) as stopped:
        learning_smoke.main()
    assert stopped.value.code == 2
    assert not (tmp_path / "manifest.json").exists()


def test_manifest_write_failure_cleans_created_data(scoped_fixture, tmp_path, monkeypatch):
    fixture, engine, storage = scoped_fixture
    monkeypatch.setenv("RSL_E2E_PASSWORD", "NotARealPassword8")
    monkeypatch.setattr("sys.argv", ["smoke", "--video", "unused.mp4", "--keep-fixture", str(tmp_path)])
    monkeypatch.setattr(learning_smoke, "create_fixture", lambda *_, **__: fixture)
    with pytest.raises(IsADirectoryError):
        learning_smoke.main()
    with Session(engine) as db:
        assert db.get(models.User, fixture["user_id"]) is None
    assert storage.deleted == fixture["objects"]
