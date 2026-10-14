"""Frozen schema for revision 0001; never import evolving application models."""

import sqlalchemy as sa

metadata = sa.MetaData()
sa.Table(
    "users",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, index=True),
    sa.Column("public_id", sa.String(36), unique=True, index=True),
    sa.Column("email", sa.String(255), unique=True, index=True, nullable=False),
    sa.Column("username", sa.String(100), nullable=False),
    sa.Column("hashed_password", sa.String(255), nullable=False),
    sa.Column("is_active", sa.Boolean),
    sa.Column("is_verified", sa.Boolean),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    sa.Column("updated_at", sa.DateTime(timezone=True)),
    sa.Column("role", sa.String, nullable=False),
    sa.Column("full_name", sa.String(200)),
    sa.Column("avatar_url", sa.String(500)),
    sa.Column("verification_token", sa.String(100), unique=True, index=True),
    sa.Column("verification_token_expires", sa.DateTime),
    sa.Column("reset_token", sa.String(100), unique=True, index=True),
    sa.Column("reset_token_expires", sa.DateTime),
)
sa.Table(
    "email_verifications",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, index=True),
    sa.Column("email", sa.String(255), nullable=False, index=True),
    sa.Column("token", sa.String(100), unique=True, index=True, nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("is_used", sa.Boolean),
)
sa.Table(
    "refresh_tokens",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, index=True),
    sa.Column("token", sa.String(500), unique=True, index=True, nullable=False),
    sa.Column("user_id", sa.Integer, nullable=False),
    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    sa.Column("is_revoked", sa.Boolean),
)
sa.Table(
    "video_files",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, index=True),
    sa.Column("filename", sa.String(255), nullable=False),
    sa.Column("description", sa.Text),
    sa.Column("object_name", sa.String(255), unique=True, index=True),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
)
sa.Table(
    "user_progress",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, index=True),
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
    sa.Column("word", sa.String(100), nullable=False),
    sa.Column("completed", sa.Boolean),
    sa.Column("completed_at", sa.DateTime(timezone=True)),
    sa.Column("attempts", sa.Integer),
)
