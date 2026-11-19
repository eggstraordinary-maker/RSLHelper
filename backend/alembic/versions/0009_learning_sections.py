"""Add versioned placement in the two learning sections."""

from alembic import op
import sqlalchemy as sa

revision = "0009_learning_sections"
down_revision = "0008_catalog_revisions"
branch_labels = None
depends_on = None


def upgrade():
    alphabet = ", ".join(repr(letter) for letter in "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ")
    with op.batch_alter_table("catalog_revisions") as batch:
        batch.add_column(sa.Column("learning_section", sa.String(8), server_default="basic", nullable=False))
        batch.add_column(sa.Column("alphabet_letter", sa.String(1)))
        batch.create_check_constraint(
            "ck_catalog_learning_placement",
            "(learning_section = 'basic' AND alphabet_letter IS NULL) OR "
            "(learning_section = 'alphabet' AND alphabet_letter IS NOT NULL AND "
            f"alphabet_letter IN ({alphabet}))",
        )


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT 1 FROM catalog_revisions WHERE learning_section = 'alphabet' LIMIT 1")):
        raise RuntimeError("Cannot remove alphabet placements. Restore the pre-upgrade backup to roll back.")
    with op.batch_alter_table("catalog_revisions") as batch:
        batch.drop_constraint("ck_catalog_learning_placement", type_="check")
        batch.drop_column("alphabet_letter")
        batch.drop_column("learning_section")
