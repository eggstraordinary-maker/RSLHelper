"""Add a versioned catalog without replacing legacy lesson IDs or progress."""

from uuid import uuid4

from alembic import op
import sqlalchemy as sa

revision = "0008_catalog_revisions"
down_revision = "0007_auth_rate_limits"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("video_files", sa.Column("title", sa.String(200), nullable=True))
    gestures = op.create_table(
        "catalog_gestures",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("lesson_id", sa.String(36), sa.ForeignKey("video_files.lesson_id", ondelete="CASCADE"),
                  unique=True, nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("published_version", sa.Integer),
        sa.Column("archived", sa.Boolean, server_default=sa.false(), nullable=False),
        sa.CheckConstraint("version > 0", name="ck_catalog_gesture_version"),
        sa.CheckConstraint(
            "published_version IS NULL OR (published_version BETWEEN 1 AND version AND NOT archived)",
            name="ck_catalog_publication",
        ),
    )
    media = op.create_table(
        "catalog_media",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("gesture_id", sa.String(36), sa.ForeignKey("catalog_gestures.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("object_name", sa.String(255), unique=True, nullable=False),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("gesture_id", "id", name="uq_catalog_media_owner"),
    )
    revisions = op.create_table(
        "catalog_revisions",
        sa.Column("gesture_id", sa.String(36), sa.ForeignKey("catalog_gestures.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("version", sa.Integer, primary_key=True),
        sa.Column("media_id", sa.String(36)),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("source", sa.String(500), nullable=False),
        sa.Column("consent_reference", sa.String(500), nullable=False),
        sa.Column("review_status", sa.String(20), nullable=False),
        sa.Column("review_note", sa.String(2000), nullable=False),
        sa.Column("action", sa.String(24), nullable=False),
        sa.Column("author_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["gesture_id", "media_id"], ["catalog_media.gesture_id", "catalog_media.id"],
            name="fk_catalog_revision_media_owner", ondelete="CASCADE",
        ),
        sa.CheckConstraint("version > 0", name="ck_catalog_revision_version"),
        sa.CheckConstraint(
            "review_status IN ('draft', 'approved', 'changes_requested')", name="ck_catalog_review_status",
        ),
    )
    op.create_index("ix_catalog_revisions_author_id", "catalog_revisions", ["author_id"])

    db = op.get_bind()
    rows = db.execute(sa.text(
        "SELECT lesson_id, filename, description, object_name, is_published FROM video_files"
    )).mappings().all()
    for row in rows:
        gesture_id = str(uuid4())
        media_id = str(uuid4()) if row["object_name"] is not None else None
        db.execute(gestures.insert().values(
            id=gesture_id, lesson_id=row["lesson_id"], version=1,
            published_version=1 if row["is_published"] and media_id else None,
        ))
        if media_id:
            db.execute(media.insert().values(
                id=media_id, gesture_id=gesture_id, filename=row["filename"], object_name=row["object_name"],
            ))
        description = row["description"] or ""
        db.execute(revisions.insert().values(
            gesture_id=gesture_id, version=1, media_id=media_id,
            title=(description.strip() or row["filename"])[:200], description=description,
            category="", source="", consent_reference="", review_status="draft", review_note="", action="imported",
        ))


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM catalog_revisions")):
        raise RuntimeError("Cannot remove catalog revision history. Restore the pre-upgrade backup to roll back.")
    op.drop_table("catalog_revisions")
    op.drop_table("catalog_media")
    op.drop_table("catalog_gestures")
    op.drop_column("video_files", "title")
