"""Split notification flags: morning broadcast vs generation-ready pushes.

Bot's morning broadcast is controlled in the bot (``morning_messages_enabled``).
Generation-ready pushes are controlled on the site
(``generation_notifications_enabled`` — new column, defaults to ON).

Revision ID: 011_split_notification_flags
Revises:     010_per_track_stats
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "011_split_notification_flags"
down_revision = "010_per_track_stats"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "generation_notifications_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "generation_notifications_enabled")
