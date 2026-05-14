"""Telegram auth verification — both Login Widget and Mini App initData."""

from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import urlencode

import pytest

from app.auth.telegram import (
    TelegramAuthError,
    verify_init_data,
    verify_login_widget,
)

BOT_TOKEN = "test:abcdef"


def _login_widget_hash(payload: dict[str, str | int]) -> str:
    secret = hashlib.sha256(BOT_TOKEN.encode()).digest()
    data_check = "\n".join(f"{k}={payload[k]}" for k in sorted(payload))
    return hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()


def _initdata_hash(pairs: dict[str, str]) -> str:
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    data_check = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    return hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()


def test_verify_login_widget_ok() -> None:
    payload: dict[str, str | int] = {
        "id": 12345,
        "first_name": "Sergey",
        "username": "sergey",
        "auth_date": int(time.time()),
    }
    payload_with_hash = {**payload, "hash": _login_widget_hash(payload)}

    account = verify_login_widget(payload_with_hash, BOT_TOKEN)
    assert account.id == 12345
    assert account.username == "sergey"
    assert account.first_name == "Sergey"


def test_verify_login_widget_bad_hash() -> None:
    payload = {"id": 1, "auth_date": int(time.time()), "hash": "deadbeef"}
    with pytest.raises(TelegramAuthError, match="hash mismatch"):
        verify_login_widget(payload, BOT_TOKEN)


def test_verify_login_widget_expired() -> None:
    payload: dict[str, str | int] = {
        "id": 1,
        "auth_date": int(time.time()) - 60 * 60 * 25,
    }
    payload["hash"] = _login_widget_hash(payload)
    with pytest.raises(TelegramAuthError, match="too old"):
        verify_login_widget(payload, BOT_TOKEN)


def test_verify_init_data_ok() -> None:
    pairs = {
        "auth_date": str(int(time.time())),
        "query_id": "AAH",
        "user": '{"id":777,"first_name":"Sergey","username":"sergey","language_code":"ru"}',
    }
    pairs["hash"] = _initdata_hash(pairs)
    init_data = urlencode(pairs)

    account = verify_init_data(init_data, BOT_TOKEN)
    assert account.id == 777
    assert account.username == "sergey"
    assert account.language_code == "ru"


def test_verify_init_data_tampered() -> None:
    pairs = {
        "auth_date": str(int(time.time())),
        "user": '{"id":1}',
    }
    pairs["hash"] = _initdata_hash(pairs)
    pairs["user"] = '{"id":99}'  # tamper
    init_data = urlencode(pairs)
    with pytest.raises(TelegramAuthError, match="hash mismatch"):
        verify_init_data(init_data, BOT_TOKEN)


def test_verify_init_data_no_token() -> None:
    with pytest.raises(TelegramAuthError, match="bot token"):
        verify_init_data("auth_date=1&hash=abc&user=%7B%7D", "")
