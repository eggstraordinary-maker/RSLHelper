"""Preserve user-scoped practice request IDs and their original results.

Revision ID: 0006_attempt_idempotency
Revises: 0005_username_uniqueness
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_attempt_idempotency"
down_revision = "0005_username_uniqueness"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "learning_attempt_receipts",
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("attempt_id", sa.String(36), primary_key=True),
        sa.Column("lesson_id", sa.String(36), sa.ForeignKey("video_files.lesson_id"), nullable=False),
        sa.Column("completed", sa.Boolean, nullable=False),
        sa.Column("response_payload", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    receipts = sa.table("learning_attempt_receipts", sa.column("attempt_id"))
    if op.get_bind().scalar(sa.select(receipts.c.attempt_id).limit(1)) is not None:
        raise RuntimeError(
            "Cannot remove practice attempt receipts while they contain data. "
            "Restore a pre-migration database backup instead."
        )
    op.drop_table("learning_attempt_receipts")
