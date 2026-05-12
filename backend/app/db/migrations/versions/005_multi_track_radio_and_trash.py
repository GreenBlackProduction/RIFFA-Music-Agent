"""Multi-track radio publishing + soft-delete (trash) for generations.

Changes:
  * generations.published_track_indices (JSON, nullable) — stores the list of
    variant indices currently on Radio, e.g. [0], [1], or [0, 1].  Enables
    independent V1 / V2 radio toggles.  Falls back to published_track_index
    when NULL (backward compat with rows written before this migration).

  * generations.deleted_at (timestamptz, nullable) — soft-delete timestamp.
    NULL means the row is live; a non-NULL value means the user moved it to
    the trash.  Rows are hard-deleted by a background job after 7 days.

Revision ID: 005_multi_track_radio_and_trash
Revises:     004_user_password_hash
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "005_multi_track_radio_and_trash"
down_revision = "004_user_password_hash"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generations",
        sa.Column("published_track_indices", sa.JSON(), nullable=True),
    )
    op.add_column(
        "generations",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("generations", "deleted_at")
    op.drop_column("generations", "published_track_indices")
