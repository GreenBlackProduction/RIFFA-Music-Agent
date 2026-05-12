"""Atomic token balance operations."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User, WalletTransaction


class InsufficientBalance(Exception):
    pass


async def deduct_tokens(
    session: AsyncSession,
    user_id: int,
    amount: int,
    reason: str,
    reference_id: str | None = None,
) -> int:
    """Atomically deduct tokens. Raises InsufficientBalance if balance too low.

    Uses SELECT ... FOR UPDATE to prevent concurrent overdrafts.
    Returns new balance.
    """
    result = await session.execute(
        select(User).where(User.id == user_id).with_for_update()
    )
    user = result.scalar_one()
    if user.is_admin:
        return user.balance_tokens
    if user.balance_tokens < amount:
        raise InsufficientBalance(
            f"need {amount} tokens, have {user.balance_tokens}"
        )
    user.balance_tokens -= amount
    session.add(
        WalletTransaction(
            user_id=user_id,
            amount_tokens=-amount,
            reason=reason,
            reference_id=reference_id,
        )
    )
    await session.flush()
    return user.balance_tokens


async def credit_tokens(
    session: AsyncSession,
    user_id: int,
    amount: int,
    reason: str,
    reference_id: str | None = None,
) -> int:
    """Add tokens to balance. Returns new balance."""
    result = await session.execute(
        select(User).where(User.id == user_id).with_for_update()
    )
    user = result.scalar_one()
    user.balance_tokens += amount
    session.add(
        WalletTransaction(
            user_id=user_id,
            amount_tokens=amount,
            reason=reason,
            reference_id=reference_id,
        )
    )
    await session.flush()
    return user.balance_tokens
