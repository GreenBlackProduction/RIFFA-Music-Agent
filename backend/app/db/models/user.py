"""User model."""

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    """RIFFA user account.

    Linked either to a Telegram account (`telegram_user_id`) or to an email-only
    registration. Balance is stored as integer tokens.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    telegram_user_id: Mapped[int | None] = mapped_column(
        BigInteger, unique=True, index=True, nullable=True
    )
    telegram_username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email: Mapped[str | None] = mapped_column(String(254), unique=True, nullable=True)
    display_name: Mapped[str] = mapped_column(String(64), default="RIFFA user", nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    locale: Mapped[str] = mapped_column(String(8), default="ru", nullable=False)

    balance_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    password_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)

    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    morning_messages_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    referral_code: Mapped[str | None] = mapped_column(
        String(32), unique=True, nullable=True, index=True
    )

    __table_args__ = (
        Index("ix_users_balance_tokens", "balance_tokens"),
        Index("ix_users_email_lower", "email"),
    )
