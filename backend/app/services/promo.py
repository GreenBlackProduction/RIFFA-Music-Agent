"""Promocode redemption service.

Atomic: validates the code, records a per-user usage row, and credits tokens
through the wallet service. Each user can redeem a given code at most once
(enforced by ``uq_promocode_user`` + an explicit pre-check that produces a
nicer error message than an IntegrityError).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Promocode, PromocodeUsage
from app.services.wallet import credit_tokens


class PromoError(Exception):
    """Raised when a promocode cannot be redeemed (invalid, expired, already used…)."""


async def redeem_promo(
    session: AsyncSession,
    user_id: int,
    code: str,
) -> tuple[int, int]:
    """Validate and redeem ``code`` for ``user_id``.

    Returns ``(tokens_granted, new_balance)``. Raises :class:`PromoError` on
    any validation failure. Caller is responsible for ``await session.commit()``.
    """
    normalized = code.strip().upper()
    promo = (
        await session.execute(
            select(Promocode).where(Promocode.code == normalized).with_for_update()
        )
    ).scalar_one_or_none()
    if promo is None or not promo.is_active:
        raise PromoError("Промокод не найден или отключён")

    if promo.expires_at is not None and promo.expires_at < datetime.now(UTC):
        raise PromoError("Срок действия промокода истёк")

    if promo.max_uses and promo.used_count >= promo.max_uses:
        raise PromoError("Лимит активаций исчерпан")

    # Idempotency: same user can't redeem twice.
    existing = (
        await session.execute(
            select(PromocodeUsage).where(
                PromocodeUsage.promocode_id == promo.id,
                PromocodeUsage.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise PromoError("Вы уже использовали этот промокод")

    session.add(
        PromocodeUsage(
            promocode_id=promo.id,
            user_id=user_id,
            tokens_granted=promo.tokens,
        )
    )
    promo.used_count += 1
    try:
        await session.flush()
    except IntegrityError as exc:  # pragma: no cover — race-safety net.
        raise PromoError("Вы уже использовали этот промокод") from exc

    new_balance = await credit_tokens(
        session,
        user_id=user_id,
        amount=promo.tokens,
        reason="promocode",
        reference_id=normalized,
    )
    return promo.tokens, new_balance
