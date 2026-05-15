"""User lookup, provisioning, and referral bonus helpers."""

from __future__ import annotations

from datetime import UTC, datetime
from secrets import token_urlsafe

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.email import hash_password, verify_password
from app.auth.telegram import TelegramAccount
from app.core.config import get_settings
from app.db.models import Referral, User, WalletTransaction
from app.services.telegram_sync import sync_bot_user_on_first_login

_NEW_USER_BONUS = 5          # free tokens on first registration
_REFERRAL_BONUS_REFERRER = 10  # tokens for the person who shared the link
_REFERRAL_BONUS_REFERRED = 4   # tokens for the new user who joined via link


async def _generate_referral_code(session: AsyncSession) -> str:
    while True:
        candidate = token_urlsafe(6)
        stmt = select(User.id).where(User.referral_code == candidate)
        if not (await session.execute(stmt)).scalar_one_or_none():
            return candidate


async def _apply_referral(
    session: AsyncSession, new_user: User, referral_code: str | None
) -> None:
    """Credit both parties when a valid referral code is used on registration."""
    if not referral_code:
        return

    referrer = (
        await session.execute(select(User).where(User.referral_code == referral_code))
    ).scalar_one_or_none()

    if referrer is None or referrer.id == new_user.id:
        return

    # Prevent duplicate referrals
    existing = (
        await session.execute(
            select(Referral).where(Referral.referred_id == new_user.id)
        )
    ).scalar_one_or_none()
    if existing:
        return

    referral = Referral(
        referrer_id=referrer.id,
        referred_id=new_user.id,
        bonus_paid=True,
        bonus_tokens=_REFERRAL_BONUS_REFERRER,
    )
    session.add(referral)

    # Credit referrer (+10 tokens)
    referrer.balance_tokens += _REFERRAL_BONUS_REFERRER
    session.add(
        WalletTransaction(
            user_id=referrer.id,
            amount_tokens=_REFERRAL_BONUS_REFERRER,
            reason="referral_bonus",
            reference_id=str(new_user.id),
        )
    )

    # Credit new user (+4 tokens)
    new_user.balance_tokens += _REFERRAL_BONUS_REFERRED
    session.add(
        WalletTransaction(
            user_id=new_user.id,
            amount_tokens=_REFERRAL_BONUS_REFERRED,
            reason="referral_welcome_bonus",
            reference_id=str(referrer.id),
        )
    )

    await session.flush()
    logger.info(
        "Referral applied: referrer={} +{} tokens, referred={} +{} tokens",
        referrer.id, _REFERRAL_BONUS_REFERRER,
        new_user.id, _REFERRAL_BONUS_REFERRED,
    )


class AuthError(Exception):
    """Raised on login/registration failures."""


async def get_or_create_user_by_telegram(
    session: AsyncSession,
    account: TelegramAccount,
    referral_code: str | None = None,
) -> tuple[User, bool]:
    settings = get_settings()
    stmt = select(User).where(User.telegram_user_id == account.id)
    user = (await session.execute(stmt)).scalar_one_or_none()

    if user is not None:
        if account.username and user.telegram_username != account.username:
            user.telegram_username = account.username
        if account.first_name and user.display_name in {"", "RIFFA user"}:
            user.display_name = account.first_name
        if account.photo_url:
            user.avatar_url = account.photo_url
        if account.id in settings.admin_id_set and not user.is_admin:
            user.is_admin = True
        user.last_seen_at = datetime.now(UTC)
        await session.flush()
        return user, False

    user = User(
        telegram_user_id=account.id,
        telegram_username=account.username,
        display_name=account.first_name or "RIFFA user",
        avatar_url=account.photo_url,
        locale=(account.language_code or "ru")[:8],
        last_seen_at=datetime.now(UTC),
        referral_code=await _generate_referral_code(session),
        balance_tokens=_NEW_USER_BONUS,
        is_admin=account.id in settings.admin_id_set,
    )
    session.add(user)
    await session.flush()

    session.add(
        WalletTransaction(
            user_id=user.id,
            amount_tokens=_NEW_USER_BONUS,
            reason="welcome_bonus",
        )
    )

    await _apply_referral(session, user, referral_code)
    await session.flush()

    # Pull existing bot-side data so the web profile is immediately up-to-date.
    await sync_bot_user_on_first_login(session, user, account.id)

    return user, True


async def register_user_by_email(
    session: AsyncSession,
    email: str,
    password: str,
    referral_code: str | None = None,
) -> User:
    """Create a new account with email + password. Raises AuthError if email taken."""
    existing = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing is not None:
        raise AuthError("email_taken")

    user = User(
        email=email,
        password_hash=hash_password(password),
        display_name=email.split("@", 1)[0],
        last_seen_at=datetime.now(UTC),
        referral_code=await _generate_referral_code(session),
        balance_tokens=_NEW_USER_BONUS,
    )
    session.add(user)
    await session.flush()

    session.add(
        WalletTransaction(
            user_id=user.id,
            amount_tokens=_NEW_USER_BONUS,
            reason="welcome_bonus",
        )
    )

    await _apply_referral(session, user, referral_code)
    return user


async def login_user_by_email(
    session: AsyncSession,
    email: str,
    password: str,
) -> User:
    """Verify email + password. Raises AuthError on wrong credentials."""
    user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None or not user.password_hash or not verify_password(password, user.password_hash):
        raise AuthError("wrong_credentials")
    user.last_seen_at = datetime.now(UTC)
    await session.flush()
    return user


async def get_or_create_user_by_email(
    session: AsyncSession,
    email: str,
    referral_code: str | None = None,
) -> tuple[User, bool]:
    stmt = select(User).where(User.email == email)
    user = (await session.execute(stmt)).scalar_one_or_none()

    if user is not None:
        user.last_seen_at = datetime.now(UTC)
        await session.flush()
        return user, False

    user = User(
        email=email,
        display_name=email.split("@", 1)[0],
        last_seen_at=datetime.now(UTC),
        referral_code=await _generate_referral_code(session),
        balance_tokens=_NEW_USER_BONUS,
    )
    session.add(user)
    await session.flush()

    session.add(
        WalletTransaction(
            user_id=user.id,
            amount_tokens=_NEW_USER_BONUS,
            reason="welcome_bonus",
        )
    )

    await _apply_referral(session, user, referral_code)
    return user, True
