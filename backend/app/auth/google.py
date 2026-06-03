"""Verify Google Identity Services ID tokens — no ``google-auth`` dependency.

The frontend uses Google Identity Services (GIS) to obtain an ID token (a
signed JWT). We verify its signature against Google's published JWKS, check the
issuer / audience / expiry, and extract the *Google-verified* email. Only the
public ``client_id`` is needed — no client secret — because the ID-token flow
proves the user directly to our backend.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import httpx
from jose import jwt
from jose.exceptions import JWTError

_GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
_VALID_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}

# Small in-process JWKS cache. Google rotates keys slowly; an hour is safe and
# we force-refresh once if the requested ``kid`` is missing.
_jwks_cache: dict[str, object] = {"keys": [], "exp": 0.0}


class GoogleAuthError(Exception):
    """Raised when a Google ID token fails verification."""


@dataclass(frozen=True)
class GoogleAccount:
    """Verified Google identity returned to the application layer."""

    email: str
    email_verified: bool
    name: str | None = None
    picture: str | None = None
    sub: str | None = None


async def _get_jwks(force: bool = False) -> list[dict]:
    now = time.time()
    cached = _jwks_cache.get("keys") or []
    if cached and not force and float(_jwks_cache.get("exp", 0.0)) > now:
        return cached  # type: ignore[return-value]
    async with httpx.AsyncClient(timeout=httpx.Timeout(8.0)) as client:
        resp = await client.get(_GOOGLE_CERTS_URL)
        resp.raise_for_status()
        keys = resp.json().get("keys", [])
    _jwks_cache["keys"] = keys
    _jwks_cache["exp"] = now + 3600
    return keys


async def verify_google_id_token(token: str, client_id: str) -> GoogleAccount:
    """Verify a Google ID token and return the verified account.

    Raises :class:`GoogleAuthError` on any failure (bad signature, wrong
    audience, expired, unverified email, etc.).
    """
    if not client_id:
        raise GoogleAuthError("google client id is not configured")
    if not token:
        raise GoogleAuthError("missing token")

    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise GoogleAuthError("malformed token") from exc

    kid = header.get("kid")
    keys = await _get_jwks()
    key = next((k for k in keys if k.get("kid") == kid), None)
    if key is None:
        # Google may have rotated keys — refresh once and retry.
        keys = await _get_jwks(force=True)
        key = next((k for k in keys if k.get("kid") == kid), None)
    if key is None:
        raise GoogleAuthError("signing key not found")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=client_id,
            options={"verify_at_hash": False},
        )
    except JWTError as exc:
        raise GoogleAuthError(f"token verification failed: {exc}") from exc

    if claims.get("iss") not in _VALID_ISSUERS:
        raise GoogleAuthError("bad issuer")

    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise GoogleAuthError("no email in token")
    if not claims.get("email_verified", False):
        raise GoogleAuthError("email not verified by google")

    return GoogleAccount(
        email=email,
        email_verified=True,
        name=(claims.get("name") or None),
        picture=(claims.get("picture") or None),
        sub=(claims.get("sub") or None),
    )
