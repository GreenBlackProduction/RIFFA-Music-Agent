"""JWT helpers."""

from datetime import timedelta

import pytest

from app.core.security import (
    TokenError,
    encode_token,
    make_email_token,
    make_session_token,
    read_email_token,
    read_session_token,
)


def test_session_roundtrip() -> None:
    token = make_session_token(42)
    assert read_session_token(token) == 42


def test_email_roundtrip() -> None:
    token = make_email_token("Foo@Bar.com")
    assert read_email_token(token) == "foo@bar.com"


def test_email_token_rejects_session() -> None:
    token = make_session_token(1)
    with pytest.raises(TokenError, match="not an email token"):
        read_email_token(token)


def test_session_token_rejects_email() -> None:
    token = make_email_token("a@b.com")
    with pytest.raises(TokenError, match="not a session token"):
        read_session_token(token)


def test_expired_token() -> None:
    token = encode_token({"sub": "1", "type": "session"}, timedelta(seconds=-1))
    with pytest.raises(TokenError):
        read_session_token(token)
