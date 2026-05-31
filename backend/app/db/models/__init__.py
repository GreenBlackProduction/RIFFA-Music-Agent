"""SQLAlchemy ORM models for RIFFA Web."""

from app.db.models.generation import (
    Generation,
    GenerationRating,
    GenerationStatus,
    GenerationType,
    RadioVote,
)
from app.db.models.payment import Payment, PaymentProvider, PaymentStatus
from app.db.models.promocode import Promocode, PromocodeUsage
from app.db.models.referral import Referral
from app.db.models.review import Review
from app.db.models.user import User
from app.db.models.wallet import WalletTransaction

__all__ = [
    "Generation",
    "GenerationRating",
    "GenerationStatus",
    "GenerationType",
    "Payment",
    "PaymentProvider",
    "PaymentStatus",
    "Promocode",
    "PromocodeUsage",
    "RadioVote",
    "Referral",
    "Review",
    "User",
    "WalletTransaction",
]
