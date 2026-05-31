"""Add terms acceptance tracking to users.

Stores when (and which version of) the legal documents the user accepted
on the website. Replaces the bot-side acceptance flow.

Revision ID: 009_terms_acceptance
Revises:     008_bot_started_at
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "009_terms_acceptance"
down_revision = "008_bot_started_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("terms_version", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "terms_version")
    op.drop_column("users", "terms_accepted_at")
