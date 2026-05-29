"""Per-variant soft-delete for generations.

Each Suno generation produces two variants (V1 + V2). Users want to delete
one variant without losing the other. Adds a nullable JSON list column with
the indices of trashed variants; existing rows start with NULL (all variants
live).

Revision ID: 012_per_variant_trash
Revises:     011_split_notification_flags
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "012_per_variant_trash"
down_revision = "011_split_notification_flags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generations",
        sa.Column("deleted_track_indices", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("generations", "deleted_track_indices")
