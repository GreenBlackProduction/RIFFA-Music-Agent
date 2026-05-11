"""Payment model — incoming token purchases."""

import enum
import uuid
from typing import Any

from sqlalchemy import (
    JSON,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class PaymentProvider(str, enum.Enum):
    telegram_stars = "telegram_stars"
    robokassa = "robokassa"
    tinkoff = "tinkoff"
    freekassa = "freekassa"
    promocode = "promocode"
    referral = "referral"
    admin = "admin"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"
    refunded = "refunded"


class Payment(Base, TimestampMixin):
    """A payment / token-grant event.

    `external_id` is the unique id from the payment provider used to
    deduplicate webhook deliveries (mirrors `processed_payments` in the bot).
    """

    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    provider: Mapped[PaymentProvider] = mapped_column(Enum(PaymentProvider, name="payment_provider"), nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"), default=PaymentStatus.pending, nullable=False
    )

    amount_minor: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="RUB", nullable=False)
    tokens_added: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    package_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)

    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    __table_args__ = (
        Index("ix_payments_user_status", "user_id", "status"),
        Index("ix_payments_provider_external", "provider", "external_id"),
    )
