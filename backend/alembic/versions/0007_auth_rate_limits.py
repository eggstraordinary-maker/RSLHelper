"""Shared, transient login and mail admission windows."""
from alembic import op
import sqlalchemy as sa

revision = "0007_auth_rate_limits"
down_revision = "0006_attempt_idempotency"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("auth_rate_buckets",
        sa.Column("scope", sa.String(16), primary_key=True),
        sa.Column("key_digest", sa.String(64), primary_key=True),
        sa.Column("admissions", sa.JSON, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_auth_rate_buckets_expires_at", "auth_rate_buckets", ["expires_at"])


def downgrade():
    # Only transient quotas are reset; no account, progress or receipt is lost.
    op.drop_index("ix_auth_rate_buckets_expires_at", table_name="auth_rate_buckets")
    op.drop_table("auth_rate_buckets")
