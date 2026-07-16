"""Per-track personal rating + per-track trash timestamps.

Two variants (V1/V2) of one generation share a single row, but must behave as
independent tracks: liking or trashing one must not affect the other.

Revision ID: 015_per_track_rating_trash
Revises:     014_learned_genres
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "015_per_track_rating_trash"
down_revision = "014_learned_genres"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generations",
        sa.Column("track_ratings", sa.JSON(), nullable=False, server_default="{}"),
    )
    op.add_column(
        "generations",
        sa.Column("track_trashed_at", sa.JSON(), nullable=False, server_default="{}"),
    )
    # Backfill existing partial-deletes (deleted_track_indices set, row not fully
    # trashed): mark those variants trashed at a far-past date so they stay
    # hidden from the library (as today) but do NOT resurface in the 7-day trash.
    op.execute(
        """
        UPDATE generations g
        SET track_trashed_at = (
            SELECT jsonb_object_agg(idx::text, '2000-01-01T00:00:00+00:00')
            FROM jsonb_array_elements_text(g.deleted_track_indices::jsonb) AS idx
        )
        WHERE g.deleted_track_indices IS NOT NULL
          AND g.deleted_track_indices::text NOT IN ('null', '[]')
          AND g.deleted_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("generations", "track_trashed_at")
    op.drop_column("generations", "track_ratings")
