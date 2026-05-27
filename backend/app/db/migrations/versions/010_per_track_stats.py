"""Per-track Radio stats and votes.

Changes:
  * generations.track_stats (JSONB, default '{}'): per-track stats keyed by
    string track_index, e.g. {"0": {"likes": 5, "dislikes": 1, "plays": 23}}.
    Replaces the all-or-nothing gen-level counters for Radio purposes.
    Backfilled from existing like_count/dislike_count/play_count on the
    track_index that was published (or 0 if unpublished).

  * radio_votes.track_index (int, default 0): which variant the vote
    applies to. Backfilled from the generation's published_track_index.
    The unique constraint is widened from (generation_id, user_id) to
    (generation_id, user_id, track_index) so a user can vote V1 and V2
    independently.

The gen-level counters (like_count, dislike_count, play_count) are kept
for backward compat but are no longer the source of truth for Radio
listings — they are now derived from track_stats at write-time.

Revision ID: 010_per_track_stats
Revises:     009_terms_acceptance
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "010_per_track_stats"
down_revision = "009_terms_acceptance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add track_stats column with empty default.
    op.add_column(
        "generations",
        sa.Column(
            "track_stats",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )

    # 2. Add track_index to radio_votes (default 0 for backfill).
    op.add_column(
        "radio_votes",
        sa.Column(
            "track_index",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    bind = op.get_bind()

    # 3. Backfill track_stats from existing per-gen counters.
    # For each gen with any non-zero counters: place all the counts on the
    # currently-published track (or 0 if not published).
    bind.exec_driver_sql(
        """
        UPDATE generations
        SET track_stats = jsonb_build_object(
            COALESCE(published_track_index, 0)::text,
            jsonb_build_object(
                'likes', like_count,
                'dislikes', dislike_count,
                'plays', play_count
            )
        )::json
        WHERE like_count > 0 OR dislike_count > 0 OR play_count > 0
        """
    )

    # 4. Backfill radio_votes.track_index from the generation's
    # published_track_index (best-effort — falls back to 0).
    bind.exec_driver_sql(
        """
        UPDATE radio_votes
        SET track_index = COALESCE(
            (SELECT published_track_index FROM generations WHERE id = radio_votes.generation_id),
            0
        )
        """
    )

    # 5. Replace the (generation_id, user_id) unique constraint with the
    # widened (generation_id, user_id, track_index) variant.
    op.drop_constraint(
        "uq_radio_votes_generation_user",
        "radio_votes",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_radio_votes_generation_user_track",
        "radio_votes",
        ["generation_id", "user_id", "track_index"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_radio_votes_generation_user_track",
        "radio_votes",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_radio_votes_generation_user",
        "radio_votes",
        ["generation_id", "user_id"],
    )
    op.drop_column("radio_votes", "track_index")
    op.drop_column("generations", "track_stats")
