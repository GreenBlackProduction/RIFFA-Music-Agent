"""JWT helpers for session cookies."""

from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt

from app.core.config import get_settings

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL = timedelta(days=7)
EMAIL_TOKEN_TTL = timedelta(minutes=30)


class TokenError(Exception):
    """Raised when a JWT cannot be decoded or has expired."""


def _now() -> datetime:
    return datetime.now(UTC)


def encode_token(claims: dict[str, Any], ttl: timedelta) -> str:
    """Encode a JWT with the application secret key."""
    settings = get_settings()
    payload = dict(claims)
    payload["iat"] = int(_now().timestamp())
    payload["exp"] = int((_now() + ttl).timestamp())
    token: str = jwt.encode(payload, settings.secret_key, algorithm=JWT_ALGORITHM)
    return token


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT, raising :class:`TokenError` on failure."""
    settings = get_settings()
    try:
        payload: dict[str, Any] = jwt.decode(
            token, settings.secret_key, algorithms=[JWT_ALGORITHM]
        )
        return payload
    except JWTError as exc:
        raise TokenError(str(exc)) from exc


def make_session_token(user_id: int) -> str:
    """Create the cookie-bound session token for a user."""
    return encode_token({"sub": str(user_id), "type": "session"}, ACCESS_TOKEN_TTL)


def make_email_token(email: str) -> str:
    """Create a short-lived magic-link token for an email address."""
    return encode_token({"sub": email.lower(), "type": "email_magic_link"}, EMAIL_TOKEN_TTL)


def read_session_token(token: str) -> int:
    """Return the user id stored in a session token."""
    payload = decode_token(token)
    if payload.get("type") != "session":
        raise TokenError("not a session token")
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub.isdigit():
        raise TokenError("invalid subject")
    return int(sub)


def read_email_token(token: str) -> str:
    """Return the email stored in a magic-link token."""
    payload = decode_token(token)
    if payload.get("type") != "email_magic_link":
        raise TokenError("not an email token")
    sub = payload.get("sub")
    if not isinstance(sub, str) or "@" not in sub:
        raise TokenError("invalid subject")
    return sub
