"""Align adopted legacy token columns with SHA-256 digest models.

Revision ID: 0004_auth_digest_columns
Revises: 0003_lesson_progress
"""

from hashlib import sha256
import re

from alembic import op
import sqlalchemy as sa

revision = "0004_auth_digest_columns"
down_revision = "0003_lesson_progress"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    for table_name in ("email_verifications", "refresh_tokens"):
        table = sa.Table(table_name, sa.MetaData(), autoload_with=bind)
        # An already-adopted DB can still have legacy-sized columns. Preserve
        # digests byte-for-byte; defensively digest any old bearer value first.
        for row_id, token in bind.execute(sa.select(table.c.id, table.c.token)):
            if not re.fullmatch(r"[0-9a-f]{64}", token):
                bind.execute(
                    table.update()
                    .where(table.c.id == row_id)
                    .values(token=sha256(token.encode("utf-8")).hexdigest())
                )
        existing_type = table.c.token.type
        if getattr(existing_type, "length", None) != 64:
            with op.batch_alter_table(table_name) as batch:
                batch.alter_column(
                    "token",
                    existing_type=existing_type,
                    type_=sa.String(64),
                    existing_nullable=False,
                )


def downgrade() -> None:
    for table_name, length in (("email_verifications", 100), ("refresh_tokens", 500)):
        with op.batch_alter_table(table_name) as batch:
            batch.alter_column(
                "token",
                existing_type=sa.String(64),
                type_=sa.String(length),
                existing_nullable=False,
            )
