"""Stable catalog identity and lossless migration of word-based progress.

Revision ID: 0003_lesson_progress
Revises: 0002_hash_auth_tokens
"""

import json
import uuid

from alembic import op
import sqlalchemy as sa

revision = "0003_lesson_progress"
down_revision = "0002_hash_auth_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    op.add_column("video_files", sa.Column("lesson_id", sa.String(36), nullable=True))
    op.add_column(
        "video_files",
        sa.Column("is_published", sa.Boolean, nullable=False, server_default=sa.true()),
    )
    labels: dict[str, set[str]] = {}
    for video in bind.execute(
        sa.text("SELECT id, filename, description, object_name FROM video_files")
    ).mappings():
        lesson_id = str(uuid.uuid4())
        bind.execute(
            sa.text("UPDATE video_files SET lesson_id=:lesson_id WHERE id=:id"),
            {"lesson_id": lesson_id, "id": video["id"]},
        )
        # Exact, case-sensitive matching only. Never guess between similar labels.
        for label in (video["filename"], video["description"], video["object_name"]):
            if label:
                labels.setdefault(label, set()).add(lesson_id)
    with op.batch_alter_table("video_files") as batch:
        batch.alter_column("lesson_id", existing_type=sa.String(36), nullable=False)
        batch.create_unique_constraint("uq_video_files_lesson_id", ["lesson_id"])
    op.add_column("user_progress", sa.Column("lesson_id", sa.String(36), nullable=True))
    mapping = op.create_table(
        "legacy_progress_mapping",
        sa.Column("progress_id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, nullable=False),
        sa.Column("word", sa.String(100), nullable=False),
        sa.Column("candidate_lesson_ids", sa.Text, nullable=False),
        sa.Column("lesson_id", sa.String(36), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("completed", sa.Boolean, nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer, nullable=True),
    )
    progress = sa.Table("user_progress", sa.MetaData(), autoload_with=bind)
    rows = bind.execute(sa.select(progress).order_by(progress.c.id)).mappings().all()
    groups: dict[tuple[int, str], list] = {}
    # Persist the complete correspondence/audit table before changing progress.
    for row in rows:
        candidates = sorted(labels.get(row["word"], set()))
        lesson_id = candidates[0] if len(candidates) == 1 else None
        status = "mapped" if lesson_id else ("ambiguous" if candidates else "unmatched")
        bind.execute(
            mapping.insert().values(
                progress_id=row["id"],
                user_id=row["user_id"],
                word=row["word"],
                candidate_lesson_ids=json.dumps(candidates),
                lesson_id=lesson_id,
                status=status,
                completed=row["completed"],
                completed_at=row["completed_at"],
                attempts=row["attempts"],
            )
        )
        if lesson_id:
            groups.setdefault((row["user_id"], lesson_id), []).append(row)
    for (_user_id, lesson_id), group in groups.items():
        first = group[0]
        dates = [
            row["completed_at"]
            for row in group
            if row["completed"] and row["completed_at"]
        ]
        bind.execute(
            progress.update()
            .where(progress.c.id == first["id"])
            .values(
                lesson_id=lesson_id,
                completed=any(row["completed"] for row in group),
                completed_at=min(dates) if dates else None,
                attempts=sum(max(row["attempts"] or 0, 0) for row in group),
            )
        )
        # Keep duplicate source rows; only the canonical row contributes to stats.
        for row in group[1:]:
            bind.execute(
                mapping.update()
                .where(mapping.c.progress_id == row["id"])
                .values(status="duplicate")
            )
    # Legacy negative counters are preserved in the audit and normalized in use.
    bind.execute(progress.update().where(progress.c.attempts < 0).values(attempts=0))
    with op.batch_alter_table("user_progress") as batch:
        batch.create_foreign_key(
            "fk_user_progress_lesson", "video_files", ["lesson_id"], ["lesson_id"]
        )
        batch.create_unique_constraint(
            "uq_user_progress_user_lesson", ["user_id", "lesson_id"]
        )
        batch.create_check_constraint(
            "ck_user_progress_attempts_nonnegative", "attempts >= 0"
        )


def downgrade() -> None:
    raise RuntimeError(
        "0003 is a data migration. Restore a pre-migration database backup to roll back safely."
    )
