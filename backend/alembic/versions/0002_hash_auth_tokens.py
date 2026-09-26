"""Hash stored refresh and password-reset tokens.

Revision ID: 0002_hash_auth_tokens
Revises: 0001_legacy_schema
"""
from hashlib import sha256
import re

from alembic import op
import sqlalchemy as sa

revision = "0002_hash_auth_tokens"
down_revision = "0001_legacy_schema"
branch_labels = None
depends_on = None

_SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")


def _digest_legacy_values(table: str, key_column: str, value_column: str) -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            f"SELECT {key_column}, {value_column} FROM {table} "
            f"WHERE {value_column} IS NOT NULL"
        )
    ).all()
    for key, value in rows:
        if _SHA256_HEX.fullmatch(value):
            continue
        digest = sha256(value.encode("utf-8")).hexdigest()
        bind.execute(
            sa.text(
                f"UPDATE {table} SET {value_column} = :digest "
                f"WHERE {key_column} = :key"
            ),
            {"digest": digest, "key": key},
        )


def upgrade() -> None:
    # Keep existing sessions and unexpired reset links usable while removing
    # their bearer secrets from the database in place.
    _digest_legacy_values("refresh_tokens", "id", "token")
    _digest_legacy_values("users", "id", "reset_token")
    _digest_legacy_values("users", "id", "verification_token")
    _digest_legacy_values("email_verifications", "id", "token")


def downgrade() -> None:
    # A digest cannot be reversed into the original bearer token.
    pass
