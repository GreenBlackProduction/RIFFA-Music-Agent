"""Sync user data from the Telegram bot's SQLite database into the web PostgreSQL.

Called on first-ever Telegram login so the web profile immediately reflects
the user's bot balance, referral history, and account age — no manual re-entry.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Referral, User, WalletTransaction

# Read-only mount from RiffaBot directory. SQLite opens it in readonly mode
# (no WAL/journal needed) so we can read directly without copying.
_BOT_DB_PATH = Path("/app/sync/bot.db")

_WEB_NEW_USER_BONUS = 5


class BotUser(NamedTuple):
    user_id: int
    username: str | None
    balance: int
    referred_by: int | None
    first_promocode: str | None
    email: str | None
    created_at: str | None


def _read_bot_user(telegram_user_id: int) -> BotUser | None:
    """Read a single user row from the bot's SQLite database."""
    if not _BOT_DB_PATH.exists():
        logger.debug("Bot DB not found at {} — skipping sync", _BOT_DB_PATH)
        return None
    try:
        conn = sqlite3.connect(f"file:{_BOT_DB_PATH}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT user_id, username, balance, referred_by, first_promocode, email, created_at "
            "FROM users WHERE user_id = ?",
            (telegram_user_id,),
        ).fetchone()
        conn.close()
        if row is None:
            return None
        return BotUser(
            user_id=row["user_id"],
            username=row["username"],
            balance=row["balance"] or 0,
            referred_by=row["referred_by"],
            first_promocode=row["first_promocode"],
            email=row["email"],
            created_at=row["created_at"],
        )
    except Exception as exc:
        logger.warning("Failed to read bot user {} from SQLite: {}", telegram_user_id, exc)
        return None


async def sync_bot_user_on_first_login(
    session: AsyncSession,
    web_user: User,
    telegram_user_id: int,
) -> None:
    """Pull bot-side data into the web account if this is a fresh login.

    Only runs when the web user was *just created* (balance == _WEB_NEW_USER_BONUS
    and no prior wallet activity beyond the welcome bonus). After the initial sync
    the bot DB is never consulted again for this user — the web becomes authoritative.
    """
    bot = _read_bot_user(telegram_user_id)
    if bot is None:
        return

    changes: list[str] = []

    # --- balance ---
    bot_balance = max(0, bot.balance)
    web_balance = web_user.balance_tokens
    if bot_balance > web_balance:
        delta = bot_balance - web_balance
        web_user.balance_tokens = bot_balance
        session.add(
            WalletTransaction(
                user_id=web_user.id,
                amount_tokens=delta,
                reason="sync:bot_balance",
            )
        )
        changes.append(f"balance {web_balance}→{bot_balance} (+{delta})")

    # --- email ---
    if bot.email and not web_user.email:
        existing = (
            await session.execute(select(User).where(User.email == bot.email))
        ).scalar_one_or_none()
        if existing is None:
            web_user.email = bot.email
            changes.append(f"email={bot.email}")

    # --- display name ---
    if bot.username and web_user.display_name in {"", "RIFFA user"}:
        web_user.display_name = bot.username
        changes.append(f"display_name={bot.username}")

    # --- created_at (backdate from bot registration) ---
    if bot.created_at and web_user.created_at:
        try:
            bot_dt = datetime.strptime(bot.created_at, "%Y-%m-%d %H:%M:%S").replace(
                tzinfo=timezone.utc
            )
            web_user.created_at = bot_dt
            changes.append(f"created_at={bot.created_at}")
        except (ValueError, TypeError):
            pass

    # --- referral (bot-side referred_by) ---
    if bot.referred_by:
        referrer = (
            await session.execute(
                select(User).where(User.telegram_user_id == bot.referred_by)
            )
        ).scalar_one_or_none()
        if referrer is not None and referrer.id != web_user.id:
            existing = (
                await session.execute(
                    select(Referral).where(Referral.referred_id == web_user.id)
                )
            ).scalar_one_or_none()
            if existing is None:
                session.add(
                    Referral(
                        referrer_id=referrer.id,
                        referred_id=web_user.id,
                        bonus_paid=True,
                        bonus_tokens=60,
                    )
                )
                changes.append(f"referral from bot: referrer_id={referrer.id}")

    if changes:
        await session.flush()
        logger.info("Bot sync for web user {} (tg={}): {}", web_user.id, telegram_user_id, changes)
    else:
        logger.debug("Bot sync for web user {}: nothing to sync", web_user.id)
