"""Public radio: is_public/published_at/counters on generations + radio_votes table.

Revision ID: 002_radio_columns
Revises: 001_generation_share_rating
Create Date: 2026-05-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "002_radio_columns"
down_revision = "001_generation_share_rating"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- generations: radio columns ---
    op.add_column(
        "generations",
        sa.Column(
            "is_public",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "generations",
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "generations",
        sa.Column("play_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "generations",
        sa.Column("like_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "generations",
        sa.Column("dislike_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index(
        "ix_generations_public_published",
        "generations",
        ["is_public", "published_at"],
        unique=False,
    )

    # --- radio_votes table ---
    op.create_table(
        "radio_votes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "generation_id",
            sa.dialects.postgresql.UUID(as_uuid=True)
            if op.get_context().dialect.name == "postgresql"
            else sa.String(length=36),
            sa.ForeignKey("generations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "vote",
            sa.Enum("like", "dislike", name="generation_rating"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "generation_id", "user_id", name="uq_radio_votes_generation_user"
        ),
    )
    op.create_index("ix_radio_votes_generation_id", "radio_votes", ["generation_id"])
    op.create_index("ix_radio_votes_user_id", "radio_votes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_radio_votes_user_id", table_name="radio_votes")
    op.drop_index("ix_radio_votes_generation_id", table_name="radio_votes")
    op.drop_table("radio_votes")

    op.drop_index("ix_generations_public_published", table_name="generations")
    op.drop_column("generations", "dislike_count")
    op.drop_column("generations", "like_count")
    op.drop_column("generations", "play_count")
    op.drop_column("generations", "published_at")
    op.drop_column("generations", "is_public")
