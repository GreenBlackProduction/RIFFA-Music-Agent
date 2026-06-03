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
from app.services.notifications import notify_admin_new_user
from app.services.telegram_sync import sync_bot_user_on_first_login

_NEW_USER_BONUS = 3          # free tokens on first registration
_REFERRAL_BONUS_REFERRER = 10  # tokens for the person who shared the link
_REFERRAL_BONUS_REFERRED = 4   # tokens for the new user who joined via link
# Итого для нового пользователя по реферальной ссылке:
#   _NEW_USER_BONUS + _REFERRAL_BONUS_REFERRED = 3 + 4 = 7 токенов


async def _notify_admin_signup(user: User, source: str) -> None:
    """Fire-and-forget Telegram ping to admins on new signup.

    Errors here must never break the signup flow — the user has already been
    persisted at this point. We swallow exceptions and log them.
    """
    try:
        settings = get_settings()
        await notify_admin_new_user(
            settings.telegram_bot_token,
            settings.admin_id_set,
            user,
            source,
        )
    except Exception as exc:
        logger.warning("admin signup notify failed for user {}: {}", user.id, exc)


async def _has_welcome_bonus(session: AsyncSession, user_id: int) -> bool:
    """True if this user already received the welcome bonus (any time)."""
    row = (
        await session.execute(
            select(WalletTransaction.id).where(
                WalletTransaction.user_id == user_id,
                WalletTransaction.reason == "welcome_bonus",
            )
        )
    ).first()
    return row is not None


async def _grant_welcome_bonus(session: AsyncSession, user: User) -> None:
    """Credit the one-time welcome bonus — but only once per user.

    Anti-farm: callers gate this behind a *verified* identity (Telegram or
    Google), so a flood of throwaway email+password signups can't mint free
    tokens. The idempotency check lets a password account that later verifies
    via Google collect the bonus exactly once.
    """
    if await _has_welcome_bonus(session, user.id):
        return
    user.balance_tokens += _NEW_USER_BONUS
    session.add(
        WalletTransaction(
            user_id=user.id,
            amount_tokens=_NEW_USER_BONUS,
            reason="welcome_bonus",
        )
    )
    await session.flush()


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

    await _notify_admin_signup(user, "telegram")

    return user, True


async def register_user_by_email(
    session: AsyncSession,
    email: str,
    password: str,
    referral_code: str | None = None,
    verified: bool = False,
) -> User:
    """Create a new account with email + password. Raises AuthError if email taken.

    The welcome bonus and any referral payout are withheld until the account is
    *verified* (``verified=True`` — only Telegram or Google today, since the
    email magic-link sender is not wired in production). Plain email+password
    signups therefore can't farm free tokens; the bonus is granted later, once,
    when the same email signs in through Google.
    """
    existing = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing is not None:
        raise AuthError("email_taken")

    user = User(
        email=email,
        password_hash=hash_password(password),
        display_name=email.split("@", 1)[0],
        last_seen_at=datetime.now(UTC),
        referral_code=await _generate_referral_code(session),
        balance_tokens=0,
    )
    session.add(user)
    await session.flush()

    if verified:
        await _grant_welcome_bonus(session, user)
        await _apply_referral(session, user, referral_code)

    await _notify_admin_signup(user, "email")
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
    *,
    verified: bool = False,
    display_name: str | None = None,
    avatar_url: str | None = None,
    source: str = "email_magic_link",
) -> tuple[User, bool]:
    """Look up or provision a user by email.

    ``verified=True`` (Google sign-in, email magic-link) means the email
    ownership is proven, so the welcome bonus + referral payout are released —
    once per user, even if the account was first created via password signup
    (``balance_tokens=0`` then). Unverified callers get the account with no
    bonus.
    """
    stmt = select(User).where(User.email == email)
    user = (await session.execute(stmt)).scalar_one_or_none()

    if user is not None:
        user.last_seen_at = datetime.now(UTC)
        # Backfill profile fields from the verified provider when ours are blank.
        if display_name and user.display_name in {"", "RIFFA user", email.split("@", 1)[0]}:
            user.display_name = display_name[:64]
        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url[:512]
        # Release any bonus/referral now that the email is verified (idempotent).
        if verified:
            await _grant_welcome_bonus(session, user)
            await _apply_referral(session, user, referral_code)
        await session.flush()
        return user, False

    user = User(
        email=email,
        display_name=(display_name or email.split("@", 1)[0])[:64],
        avatar_url=(avatar_url or None),
        last_seen_at=datetime.now(UTC),
        referral_code=await _generate_referral_code(session),
        balance_tokens=0,
    )
    session.add(user)
    await session.flush()

    if verified:
        await _grant_welcome_bonus(session, user)
        await _apply_referral(session, user, referral_code)

    await _notify_admin_signup(user, source)
    return user, True
