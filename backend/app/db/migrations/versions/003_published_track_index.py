"""Per-variant radio: track which variant of a generation is on radio.

Adds ``generations.published_track_index`` (nullable integer). Publishing on
radio is now per-track-variant: clicking the radio button on V1 sets index 0,
on V2 sets index 1, mutually exclusive. NULL means nothing is published.

Revision ID: 003_published_track_index
Revises: 002_radio_columns
Create Date: 2026-05-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "003_published_track_index"
down_revision = "002_radio_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generations",
        sa.Column("published_track_index", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("generations", "published_track_index")
