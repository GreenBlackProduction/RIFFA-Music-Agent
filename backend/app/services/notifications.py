"""Telegram notifications sent from the backend after key events."""

import logging
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from app.db.models.generation import Generation
    from app.db.models.user import User

logger = logging.getLogger(__name__)

_TG_API = "https://api.telegram.org/bot{token}/sendMessage"


async def _send(token: str, chat_id: int, text: str, reply_markup: dict | None = None) -> None:
    if not token or not chat_id:
        return
    payload: dict = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(_TG_API.format(token=token), json=payload)
            if resp.status_code != 200:
                logger.warning("[notify] TG API %s: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("[notify] send failed: %s", exc)


async def notify_generation_done(
    bot_token: str,
    bot_username: str,
    user: "User",
    gen: "Generation",
) -> None:
    """Send a Telegram message when a generation finishes."""
    if not user.telegram_user_id:
        return

    gen_type_labels = {
        "song": "Трек",
        "instrumental": "Инструментал",
        "cover_song": "Кавер",
        "sound_effect": "Звуковой эффект",
        "occasion": "Песня к поводу",
        "lyrics": "Текст песни",
        "extend": "Продолжение трека",
    }
    label = gen_type_labels.get(gen.type.value if hasattr(gen.type, "value") else str(gen.type), "Генерация")
    title = gen.title or label

    text = (
        f"🎵 <b>{label} готов!</b>\n\n"
        f"<b>{title}</b>\n\n"
        "Открой студию чтобы послушать и скачать."
    )

    # Deep link to the generation in the mini app
    mini_app_url = f"https://t.me/{bot_username}/studio?startapp=gen_{gen.id}"
    reply_markup = {
        "inline_keyboard": [[
            {"text": "🎧 Открыть в студии", "url": mini_app_url}
        ]]
    }

    await _send(bot_token, user.telegram_user_id, text, reply_markup)


async def notify_balance_credited(
    bot_token: str,
    user: "User",
    tokens: int,
    source: str,
) -> None:
    """Notify user when tokens are added to their balance."""
    if not user.telegram_user_id:
        return

    source_labels = {
        "telegram_stars": "Telegram Stars",
        "robokassa": "Robokassa",
        "promocode": "промокод",
        "referral": "реферальный бонус",
        "admin": "администратор",
    }
    src_label = source_labels.get(source, source)
    new_balance = user.balance_tokens

    text = (
        f"✅ <b>Токены начислены!</b>\n\n"
        f"Начислено: <b>+{tokens} токенов</b> ({src_label})\n"
        f"Баланс: <b>{new_balance} токенов</b>"
    )
    await _send(bot_token, user.telegram_user_id, text)


async def notify_referral_joined(
    bot_token: str,
    referrer: "User",
    new_user: "User",
    bonus_tokens: int,
) -> None:
    """Tell referrer that someone joined via their link."""
    if not referrer.telegram_user_id:
        return

    invited_name = new_user.display_name or new_user.telegram_username or "Новый пользователь"
    text = (
        f"🎉 <b>Реферальный бонус!</b>\n\n"
        f"<b>{invited_name}</b> зарегистрировался по вашей ссылке.\n"
        f"Вам начислено <b>+{bonus_tokens} токенов</b>!"
    )
    await _send(bot_token, referrer.telegram_user_id, text)


async def notify_admin_new_user(
    bot_token: str,
    admin_chat_ids: set[int] | list[int],
    new_user: "User",
    source: str,
) -> None:
    """Ping the admin(s) when somebody finishes registration.

    ``source`` is a short label for HOW they signed up — "telegram_widget",
    "telegram_initdata", "email", "bot_link", etc. Shown verbatim in the
    notification so the admin sees the signup channel at a glance.
    """
    if not admin_chat_ids:
        return

    name = (
        new_user.display_name
        or new_user.telegram_username
        or (new_user.email.split("@", 1)[0] if new_user.email else None)
        or "Новый пользователь"
    )
    handle = ""
    if new_user.telegram_username:
        handle = f" (@{new_user.telegram_username})"
    elif new_user.email:
        handle = f" ({new_user.email})"

    text = (
        f"👤 <b>Новый пользователь</b>\n\n"
        f"<b>{name}</b>{handle}\n"
        f"ID: <code>{new_user.id}</code>\n"
        f"Канал: <i>{source}</i>"
    )
    if new_user.telegram_user_id:
        text += f"\nTG-id: <code>{new_user.telegram_user_id}</code>"

    for chat_id in admin_chat_ids:
        await _send(bot_token, int(chat_id), text)
