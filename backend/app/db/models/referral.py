"""Referral relationships."""

from sqlalchemy import Boolean, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Referral(Base, TimestampMixin):
    """Referrer → referred user relation."""

    __tablename__ = "referrals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    referrer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    referred_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bonus_paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    bonus_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint("referred_id", name="uq_referral_referred"),
        Index("ix_referrals_referrer_paid", "referrer_id", "bonus_paid"),
    )
