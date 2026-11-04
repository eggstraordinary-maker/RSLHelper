"""Enforce the existing exact, case-sensitive username uniqueness rule.

Revision ID: 0005_username_uniqueness
Revises: 0004_auth_digest_columns
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_username_uniqueness"
down_revision = "0004_auth_digest_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Prevent a writer adding duplicates after preflight and causing an
        # IntegrityError (with account values) in migration/deployment output.
        bind.execute(sa.text("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE"))
    users = sa.table("users", sa.column("username", sa.String(100)))
    duplicate = bind.scalar(
        sa.select(sa.literal(1)).select_from(users).group_by(users.c.username)
        .having(sa.func.count() > 1).limit(1)
    )
    if duplicate is not None:
        # Do not rename/delete accounts or print usernames into deployment logs.
        raise RuntimeError(
            "Cannot enforce username uniqueness: duplicate usernames exist. "
            "Back up the database and explicitly resolve duplicate account identities before retrying."
        )
    with op.batch_alter_table("users") as batch:
        batch.create_unique_constraint("uq_users_username", ["username"])


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_username", type_="unique")
