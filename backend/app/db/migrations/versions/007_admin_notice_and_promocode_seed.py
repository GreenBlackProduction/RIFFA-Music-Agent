"""Admin notice/ban-message + ensure default promocode exists.

Adds two nullable columns to ``users``:

* ``notice_message`` — текст предупреждения/причины бана. Показывается
  пользователю баннером на всех страницах с возможностью закрыть.
* ``notice_kind`` — ``'ban'`` или ``'warning'``. Влияет на стиль баннера
  и на то, режутся ли admin-чувствительные действия (генерация, пополнение).

Также seed-ит дефолтный промокод ``RIFFA2026`` (5 токенов, без лимитов
по числу использований и без срока), чтобы фронтовая логика, на котором
завязано требование пользователя, работала из коробки.

Revision ID: 007_admin_notice_and_promocode_seed
Revises:     006_normalize_mood_keys
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "007_admin_notice_and_promocode_seed"
down_revision = "006_normalize_mood_keys"
branch_labels = None
depends_on = None


_DEFAULT_PROMOCODE = "RIFFA2026"
_DEFAULT_PROMOCODE_TOKENS = 5


def upgrade() -> None:
    bind = op.get_bind()

    # 1. notice columns on users -------------------------------------------------
    op.add_column(
        "users",
        sa.Column("notice_message", sa.Text(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("notice_kind", sa.String(length=16), nullable=True),
    )

    # 2. seed default promocode (idempotent — ON CONFLICT DO NOTHING) ------------
    bind.exec_driver_sql(
        """
        INSERT INTO promocodes (code, tokens, max_uses, used_count, is_active,
                                created_at, updated_at)
        VALUES (%s, %s, 0, 0, true, NOW(), NOW())
        ON CONFLICT (code) DO NOTHING
        """,
        (_DEFAULT_PROMOCODE, _DEFAULT_PROMOCODE_TOKENS),
    )


def downgrade() -> None:
    op.drop_column("users", "notice_kind")
    op.drop_column("users", "notice_message")
