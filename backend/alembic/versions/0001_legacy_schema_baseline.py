"""Adopt the current application schema without replacing existing data.

Revision ID: 0001_legacy_schema
Revises:
"""
from alembic import op
from sqlalchemy import inspect

from pathlib import Path
import importlib.util

# This revision must continue to adopt the ORIGINAL schema after models evolve.
spec = importlib.util.spec_from_file_location(
    "legacy_schema", Path(__file__).parents[1] / "legacy_schema.py"
)
legacy_schema = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy_schema)
metadata = legacy_schema.metadata

revision = "0001_legacy_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # A populated database may predate Alembic. Refuse to stamp a visibly
    # incomplete legacy table; adding columns needs a reviewed data migration.
    for table in metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        existing_columns = {
            column["name"] for column in inspector.get_columns(table.name)
        }
        missing_columns = {column.name for column in table.columns} - existing_columns
        if missing_columns:
            names = ", ".join(sorted(missing_columns))
            raise RuntimeError(
                f"Legacy table {table.name!r} is missing columns: {names}. "
                "Back up the database and add an explicit Alembic migration."
            )

    # Empty databases are initialized; compatible legacy data is left untouched.
    metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    # This baseline adopts a legacy schema. Dropping it could destroy user data.
    pass
