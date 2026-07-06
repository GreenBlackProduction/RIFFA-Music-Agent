"""Self-learned genre presets — web-researched styles outside GENRE_STYLES.

Revision ID: 014_learned_genres
Revises:     013_reviews
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "014_learned_genres"
down_revision = "013_reviews"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "learned_genres",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("phrase_key", sa.String(length=120), nullable=False, unique=True),
        sa.Column("display", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("style", sa.Text(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False, server_default="0.85"),
        sa.Column("constraint_val", sa.Float(), nullable=False, server_default="0.35"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("meta", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_learned_genres_phrase_key", "learned_genres", ["phrase_key"], unique=True)


def downgrade() -> None:
    op.drop_table("learned_genres")
