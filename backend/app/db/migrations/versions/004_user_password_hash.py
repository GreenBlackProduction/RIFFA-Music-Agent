"""Add password_hash column to users.

Revision ID: 004_user_password_hash
Revises: 003_published_track_index
Create Date: 2026-05-07
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "004_user_password_hash"
down_revision = "003_published_track_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(128), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_hash")
