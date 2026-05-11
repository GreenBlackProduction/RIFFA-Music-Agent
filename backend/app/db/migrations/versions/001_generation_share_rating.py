"""Add share_id, share_views, rating, suno_task_id to generations.

Revision ID: 001_generation_share_rating
Revises:
Create Date: 2026-04-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "001_generation_share_rating"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enums if they don't exist
    generation_rating = sa.Enum("like", "dislike", name="generation_rating")
    generation_rating.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "generations",
        sa.Column("suno_task_id", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "generations",
        sa.Column("share_id", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "generations",
        sa.Column("share_views", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "generations",
        sa.Column(
            "rating",
            sa.Enum("like", "dislike", name="generation_rating"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_generations_share_id", "generations", ["share_id"], unique=True
    )
    op.create_index(
        "ix_generations_user_type", "generations", ["user_id", "type"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_generations_user_type", table_name="generations")
    op.drop_index("ix_generations_share_id", table_name="generations")
    op.drop_column("generations", "rating")
    op.drop_column("generations", "share_views")
    op.drop_column("generations", "share_id")
    op.drop_column("generations", "suno_task_id")
