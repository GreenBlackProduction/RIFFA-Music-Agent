"""Email magic-link delivery.

In dev mode emails are written to ``backend/.dev_emails/`` so we can preview
the link locally without a real SMTP server. Production should route this
through SendGrid/Resend/Postmark — wire that in when the domain is configured.
"""

import re
from pathlib import Path

import bcrypt
from loguru import logger

from app.core.config import get_settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


class InvalidEmailError(ValueError):
    """Raised when an email address fails basic validation."""


def normalize_email(value: str) -> str:
    """Return a normalized email address or raise :class:`InvalidEmailError`."""
    if not isinstance(value, str):
        raise InvalidEmailError("email must be a string")
    candidate = value.strip().lower()
    if not EMAIL_RE.match(candidate):
        raise InvalidEmailError("email is not valid")
    return candidate


async def send_magic_link(email: str, link: str) -> None:
    """Send a magic-link email; in dev just dump the link to a file and log."""
    settings = get_settings()
    if settings.app_env == "production":
        logger.warning("send_magic_link: production SMTP not configured yet, link={}", link)
        return

    out_dir = Path(__file__).resolve().parent.parent.parent / ".dev_emails"
    out_dir.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^a-z0-9_]+", "_", email.lower())
    file_path = out_dir / f"magic-link-{safe}.txt"
    file_path.write_text(f"To: {email}\nLink: {link}\n", encoding="utf-8")
    logger.info("magic-link saved to {}: {}", file_path, link)
