import os
from datetime import datetime, timedelta
import hashlib
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, MetaData, Table, select, text
from sqlalchemy.orm import Session

from app import models
from app.database import Base

ALEMBIC_INI = Path(__file__).parents[1] / "alembic.ini"


def _upgrade(database_url: str, revision: str = "head") -> None:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", database_url)
    previous_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    try:
        command.upgrade(config, revision)
    finally:
        if previous_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_url


def test_fresh_database_bootstraps_all_application_tables(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'fresh.db').as_posix()}"
    _upgrade(database_url)

    engine = create_engine(database_url)
    try:
        tables = set(inspect(engine).get_table_names())
        with engine.connect() as connection:
            context = MigrationContext.configure(connection, opts={"compare_type": True})
            assert compare_metadata(context, Base.metadata) == []
    finally:
        engine.dispose()
    assert {
        "users",
        "email_verifications",
        "refresh_tokens",
        "video_files",
        "user_progress",
    } <= tables
    assert "alembic_version" in tables


def test_legacy_database_is_adopted_without_losing_rows(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'legacy.db').as_posix()}"
    engine = create_engine(database_url)
    try:
        _upgrade(database_url, "0001_legacy_schema")
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE alembic_version"))
        with Session(engine) as session:
            session.add(
                models.User(
                    email="existing@example.com",
                    username="existing_user",
                    hashed_password="existing-hash",
                    verification_token="legacy-user-verification-token",
                    reset_token="legacy-reset-token",
                    reset_token_expires=datetime.utcnow() + timedelta(hours=1),
                )
            )
            session.add(
                models.RefreshToken(
                    token_hash="legacy-refresh-token",
                    user_id=1,
                    expires_at=datetime.utcnow() + timedelta(days=1),
                    is_revoked=False,
                )
            )
            session.add(
                models.EmailVerification(
                    email="existing@example.com",
                    token_hash="legacy-email-verification-token",
                    expires_at=datetime.utcnow() + timedelta(hours=1),
                )
            )
            session.commit()
        _upgrade(database_url)
        with Session(engine) as session:
            stored_user = (
                session.query(models.User).filter_by(email="existing@example.com").one()
            )
            assert stored_user.username == "existing_user"
            assert (
                stored_user.reset_token
                == hashlib.sha256(b"legacy-reset-token").hexdigest()
            )
            assert (
                stored_user.verification_token
                == hashlib.sha256(b"legacy-user-verification-token").hexdigest()
            )
            stored_refresh = session.query(models.RefreshToken).one()
            assert (
                stored_refresh.token_hash
                == hashlib.sha256(b"legacy-refresh-token").hexdigest()
            )
            stored_verification = session.query(models.EmailVerification).one()
            assert (
                stored_verification.token_hash
                == hashlib.sha256(b"legacy-email-verification-token").hexdigest()
            )
    finally:
        engine.dispose()


def test_progress_migration_preserves_unknown_ambiguous_and_duplicate_rows(
    tmp_path: Path,
):
    url = f"sqlite:///{(tmp_path / 'progress.db').as_posix()}"
    _upgrade(url, "0002_hash_auth_tokens")
    engine = create_engine(url)
    old = MetaData()
    videos = Table("video_files", old, autoload_with=engine)
    progress = Table("user_progress", old, autoload_with=engine)
    users = Table("users", old, autoload_with=engine)
    with engine.begin() as db:
        db.execute(
            users.insert().values(
                id=1,
                email="legacy@example.com",
                username="legacy",
                hashed_password="hash",
                role="user",
            )
        )
        db.execute(
            videos.insert(),
            [
                {
                    "id": 1,
                    "filename": "one.mp4",
                    "description": "One",
                    "object_name": "one",
                },
                {
                    "id": 2,
                    "filename": "two.mp4",
                    "description": "Same",
                    "object_name": "two",
                },
                {
                    "id": 3,
                    "filename": "three.mp4",
                    "description": "Same",
                    "object_name": "three",
                },
            ],
        )
        db.execute(
            progress.insert(),
            [
                {
                    "id": 1,
                    "user_id": 1,
                    "word": "One",
                    "completed": True,
                    "attempts": 2,
                    "completed_at": datetime(2026, 1, 1),
                },
                {
                    "id": 2,
                    "user_id": 1,
                    "word": "one.mp4",
                    "completed": False,
                    "attempts": 3,
                    "completed_at": None,
                },
                {
                    "id": 3,
                    "user_id": 1,
                    "word": "Same",
                    "completed": True,
                    "attempts": 4,
                    "completed_at": datetime(2026, 1, 2),
                },
                {
                    "id": 4,
                    "user_id": 1,
                    "word": "Unknown",
                    "completed": True,
                    "attempts": 1,
                    "completed_at": datetime(2026, 1, 3),
                },
            ],
        )
    _upgrade(url)
    current = MetaData()
    progress = Table("user_progress", current, autoload_with=engine)
    mapping = Table("legacy_progress_mapping", current, autoload_with=engine)
    videos = Table("video_files", current, autoload_with=engine)
    with engine.connect() as db:
        rows = db.execute(select(progress).order_by(progress.c.id)).mappings().all()
        audit = (
            db.execute(select(mapping).order_by(mapping.c.progress_id)).mappings().all()
        )
        identities = (
            db.execute(select(videos.c.lesson_id).order_by(videos.c.id)).scalars().all()
        )
    assert len(rows) == 4  # no original source row was deleted
    assert rows[0]["lesson_id"] == identities[0]
    assert rows[0]["attempts"] == 5
    assert rows[0]["completed_at"] == datetime(2026, 1, 1)
    assert all(row["lesson_id"] is None for row in rows[1:])
    assert [row["status"] for row in audit] == [
        "mapped",
        "duplicate",
        "ambiguous",
        "unmatched",
    ]
    assert [row["attempts"] for row in audit] == [2, 3, 4, 1]
    assert len(set(identities)) == 3
    assert "uq_user_progress_user_lesson" in {
        c["name"] for c in inspect(engine).get_unique_constraints("user_progress")
    }
    _upgrade(url)  # retrying upgrade preserves identities and audit
    with engine.connect() as db:
        assert (
            db.execute(select(videos.c.lesson_id).order_by(videos.c.id)).scalars().all()
            == identities
        )
    engine.dispose()


def test_legacy_token_column_sizes_are_aligned_without_changing_digests(tmp_path: Path):
    url = f"sqlite:///{(tmp_path / 'digest-columns.db').as_posix()}"
    _upgrade(url, "0002_hash_auth_tokens")
    engine = create_engine(url)
    before = inspect(engine)
    def sizes(table):
        return next(c["type"].length for c in inspect(engine).get_columns(table) if c["name"] == "token")
    assert (
        next(
            c["type"].length
            for c in before.get_columns("refresh_tokens")
            if c["name"] == "token"
        )
        == 500
    )
    digest = hashlib.sha256(b"existing-bearer-token").hexdigest()
    with Session(engine) as session:
        session.add(
            models.RefreshToken(
                token_hash=digest,
                user_id=1,
                expires_at=datetime.utcnow() + timedelta(days=1),
            )
        )
        session.add(
            models.EmailVerification(
                email="digest@example.com",
                token_hash=digest,
                expires_at=datetime.utcnow() + timedelta(hours=1),
            )
        )
        session.commit()
    _upgrade(url)
    assert sizes("refresh_tokens") == sizes("email_verifications") == 64
    with Session(engine) as session:
        assert session.query(models.RefreshToken).one().token_hash == digest
        assert session.query(models.EmailVerification).one().token_hash == digest
    engine.dispose()
