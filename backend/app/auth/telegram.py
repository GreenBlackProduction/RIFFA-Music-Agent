"""Verify data from Telegram Login Widget and Mini App ``initData``.

Specs:
- Login Widget:    https://core.telegram.org/widgets/login#checking-authorization
- Web Apps init:   https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qsl


class TelegramAuthError(Exception):
    """Raised when Telegram-supplied auth data fails verification."""


@dataclass(frozen=True)
class TelegramAccount:
    """Verified Telegram identity returned to the application layer."""

    id: int
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    language_code: str | None = None


def _login_widget_secret(bot_token: str) -> bytes:
    """Login widget secret is sha256(bot_token) — see Telegram docs."""
    return hashlib.sha256(bot_token.encode()).digest()


def _initdata_secret(bot_token: str) -> bytes:
    """Mini App initData secret is HMAC-SHA256("WebAppData", bot_token)."""
    return hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()


def verify_login_widget(
    payload: dict[str, Any], bot_token: str, *, max_age_seconds: int = 24 * 3600
) -> TelegramAccount:
    """Verify the payload returned by Telegram Login Widget.

    The widget posts a JSON object with at least ``id``, ``auth_date`` and ``hash``.
    Raises :class:`TelegramAuthError` on any verification failure.
    """
    if not bot_token:
        raise TelegramAuthError("bot token is not configured")

    payload = dict(payload)
    received_hash = payload.pop("hash", None)
    if not isinstance(received_hash, str):
        raise TelegramAuthError("missing hash")

    auth_date = payload.get("auth_date")
    if not isinstance(auth_date, int | str):
        raise TelegramAuthError("missing auth_date")
    try:
        auth_date_int = int(auth_date)
    except ValueError as exc:
        raise TelegramAuthError("invalid auth_date") from exc
    if max_age_seconds and time.time() - auth_date_int > max_age_seconds:
        raise TelegramAuthError("auth_date is too old")

    data_check_string = "\n".join(
        f"{k}={payload[k]}" for k in sorted(payload) if payload[k] is not None
    )
    expected = hmac.new(
        _login_widget_secret(bot_token), data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, received_hash):
        raise TelegramAuthError("hash mismatch")

    raw_id = payload.get("id")
    try:
        account_id = int(raw_id) if raw_id is not None else 0
    except (TypeError, ValueError) as exc:
        raise TelegramAuthError("invalid user id") from exc
    if account_id <= 0:
        raise TelegramAuthError("missing user id")

    return TelegramAccount(
        id=account_id,
        first_name=payload.get("first_name") or None,
        last_name=payload.get("last_name") or None,
        username=payload.get("username") or None,
        photo_url=payload.get("photo_url") or None,
    )


def verify_init_data(
    init_data: str, bot_token: str, *, max_age_seconds: int = 24 * 3600
) -> TelegramAccount:
    """Verify the ``initData`` query string forwarded by Telegram Mini App."""
    if not bot_token:
        raise TelegramAuthError("bot token is not configured")
    if not init_data:
        raise TelegramAuthError("init_data is empty")

    pairs = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=False))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise TelegramAuthError("missing hash")

    auth_date = pairs.get("auth_date")
    if not auth_date:
        raise TelegramAuthError("missing auth_date")
    try:
        auth_date_int = int(auth_date)
    except ValueError as exc:
        raise TelegramAuthError("invalid auth_date") from exc
    if max_age_seconds and time.time() - auth_date_int > max_age_seconds:
        raise TelegramAuthError("auth_date is too old")

    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    expected = hmac.new(
        _initdata_secret(bot_token), data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, received_hash):
        raise TelegramAuthError("hash mismatch")

    user_raw = pairs.get("user")
    if not user_raw:
        raise TelegramAuthError("missing user payload")
    try:
        user = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise TelegramAuthError("invalid user json") from exc

    user_id = user.get("id")
    try:
        account_id = int(user_id) if user_id is not None else 0
    except (TypeError, ValueError) as exc:
        raise TelegramAuthError("invalid user id") from exc
    if account_id <= 0:
        raise TelegramAuthError("missing user id")

    return TelegramAccount(
        id=account_id,
        first_name=user.get("first_name") or None,
        last_name=user.get("last_name") or None,
        username=user.get("username") or None,
        photo_url=user.get("photo_url") or None,
        language_code=user.get("language_code") or None,
    )
