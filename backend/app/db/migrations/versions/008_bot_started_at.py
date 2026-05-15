"""Add bot_started_at column to users.

Tracks when a Telegram user first started the bot. Used by auth to require
/start before allowing Telegram login.

Revision ID: 008_bot_started_at
Revises:     007_admin_notice_and_promocode_seed
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "008_bot_started_at"
down_revision = "007_admin_notice_and_promocode_seed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("bot_started_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "bot_started_at")
