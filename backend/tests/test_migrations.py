import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from app import models
from app.database import Base

ALEMBIC_INI = Path(__file__).parents[1] / "alembic.ini"


def _upgrade(database_url: str) -> None:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", database_url)
    previous_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    try:
        command.upgrade(config, "head")
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
    finally:
        engine.dispose()
    assert {"users", "email_verifications", "refresh_tokens", "video_files", "user_progress"} <= tables
    assert "alembic_version" in tables


def test_legacy_database_is_adopted_without_losing_rows(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'legacy.db').as_posix()}"
    engine = create_engine(database_url)
    try:
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            session.add(
                models.User(
                    email="existing@example.com",
                    username="existing_user",
                    hashed_password="existing-hash",
                )
            )
            session.commit()
        _upgrade(database_url)
        with Session(engine) as session:
            stored_user = session.query(models.User).filter_by(
                email="existing@example.com"
            ).one()
            assert stored_user.username == "existing_user"
    finally:
        engine.dispose()
