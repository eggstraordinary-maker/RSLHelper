import os
from datetime import datetime, timedelta
import hashlib
from pathlib import Path
import re
from uuid import uuid4

import pytest

from alembic import command
from alembic.config import Config
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, MetaData, Table, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app import models
from app.database import Base

ALEMBIC_INI = Path(__file__).parents[1] / "alembic.ini"


@pytest.fixture
def migration_url(tmp_path: Path):
    """Every PostgreSQL test owns a new database, never the configured app DB."""
    backend = os.getenv("MIGRATION_TEST_BACKEND", "sqlite")
    if backend == "sqlite":
        yield f"sqlite:///{(tmp_path / 'migration.db').as_posix()}"
        return
    if backend != "postgresql" or not os.getenv("POSTGRES_TEST_URL"):
        pytest.fail("PostgreSQL migration checks require POSTGRES_TEST_URL")
    admin_url = make_url(os.environ["POSTGRES_TEST_URL"])
    if admin_url.get_backend_name() != "postgresql":
        pytest.fail("POSTGRES_TEST_URL must use PostgreSQL")
    name = "rsl_migration_test_" + uuid4().hex
    assert re.fullmatch(r"rsl_migration_test_[0-9a-f]{32}", name)
    assert name != admin_url.database
    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    created = False
    try:
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        created = True
        yield admin_url.set(database=name).render_as_string(hide_password=False)
    finally:
        if created:
            # Only the exact random database created by this fixture is removed.
            assert re.fullmatch(r"rsl_migration_test_[0-9a-f]{32}", name)
            assert name != admin_url.database
            with admin.connect() as connection:
                connection.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
        admin.dispose()


def _upgrade(database_url: str, revision: str = "head") -> None:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    previous_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    try:
        command.upgrade(config, revision)
    finally:
        if previous_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_url


def test_fresh_database_bootstraps_all_application_tables(migration_url: str) -> None:
    database_url = migration_url
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


def test_legacy_database_is_adopted_without_losing_rows(migration_url: str) -> None:
    database_url = migration_url
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
    migration_url: str,
):
    url = migration_url
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
                {
                    "id": 5,
                    "user_id": 1,
                    "word": "Unknown-negative",
                    "completed": False,
                    "attempts": -9,
                    "completed_at": None,
                },
                {
                    "id": 6,
                    "user_id": 1,
                    "word": "Unknown-null",
                    "completed": False,
                    "attempts": None,
                    "completed_at": None,
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
    assert len(rows) == 6  # no original source row was deleted
    assert rows[0]["lesson_id"] == identities[0]
    assert rows[0]["attempts"] == 5
    assert rows[0]["completed_at"].replace(tzinfo=None) == datetime(2026, 1, 1)
    assert all(row["lesson_id"] is None for row in rows[1:])
    assert [row["status"] for row in audit] == [
        "mapped",
        "duplicate",
        "ambiguous",
        "unmatched",
        "unmatched",
        "unmatched",
    ]
    assert [row["attempts"] for row in audit] == [2, 3, 4, 1, -9, None]
    assert rows[4]["attempts"] == 0
    assert rows[5]["attempts"] is None
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


def test_legacy_token_column_sizes_are_aligned_without_changing_digests(migration_url: str):
    url = migration_url
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


def test_data_migration_downgrade_requires_a_backup_and_preserves_data(migration_url):
    _upgrade(migration_url)
    engine = create_engine(migration_url)
    try:
        with engine.begin() as connection:
            connection.execute(
                models.User.__table__.insert().values(
                    email="rollback@example.test", username="rollback", hashed_password="fixture", role="user"
                )
            )
        config = Config(str(ALEMBIC_INI))
        config.set_main_option("sqlalchemy.url", migration_url.replace("%", "%%"))
        previous_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = migration_url
        try:
            with pytest.raises(RuntimeError, match="Restore a pre-migration database backup"):
                command.downgrade(config, "0002_hash_auth_tokens")
        finally:
            if previous_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous_url
        with engine.connect() as connection:
            assert connection.scalar(select(models.User.email)) == "rollback@example.test"
            if engine.dialect.name == "postgresql":
                assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0005_username_uniqueness"
                assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
    finally:
        engine.dispose()


def test_username_constraint_preserves_case_sensitive_identity_and_downgrades(migration_url):
    _upgrade(migration_url, "0004_auth_digest_columns")
    engine = create_engine(migration_url)
    try:
        with engine.begin() as connection:
            connection.execute(models.User.__table__.insert().values(
                email="first@example.test", username="Account", hashed_password="fixture", role="user"
            ))
            connection.execute(models.User.__table__.insert().values(
                email="second@example.test", username="account", hashed_password="fixture", role="user"
            ))
        _upgrade(migration_url)
        assert "uq_users_username" in {c["name"] for c in inspect(engine).get_unique_constraints("users")}
        with engine.connect() as connection:
            assert connection.execute(select(models.User.username).order_by(models.User.id)).scalars().all() == ["Account", "account"]
        config = Config(str(ALEMBIC_INI))
        config.set_main_option("sqlalchemy.url", migration_url.replace("%", "%%"))
        previous = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = migration_url
        try:
            command.downgrade(config, "0004_auth_digest_columns")
        finally:
            if previous is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous
        with engine.connect() as connection:
            assert connection.scalar(select(models.User.email).where(models.User.username == "Account")) == "first@example.test"
        _upgrade(migration_url)
    finally:
        engine.dispose()


def test_username_migration_refuses_legacy_duplicates_without_changing_data(migration_url):
    _upgrade(migration_url, "0004_auth_digest_columns")
    engine = create_engine(migration_url)
    try:
        with engine.begin() as connection:
            connection.execute(models.User.__table__.insert(), [
                {"email": "duplicate-a@example.test", "username": "same_name", "hashed_password": "fixture", "role": "user"},
                {"email": "duplicate-b@example.test", "username": "same_name", "hashed_password": "fixture", "role": "user"},
            ])
        with pytest.raises(RuntimeError, match="duplicate usernames exist"):
            _upgrade(migration_url)
        with engine.connect() as connection:
            assert connection.execute(select(models.User.email).order_by(models.User.id)).scalars().all() == [
                "duplicate-a@example.test", "duplicate-b@example.test"
            ]
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0004_auth_digest_columns"
    finally:
        engine.dispose()
