"""Payment endpoints — Telegram Stars deep link, Robokassa URL, webhook."""

from __future__ import annotations

import hashlib
import secrets
import urllib.parse
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.deps import current_user, db_session
from app.db.models.user import User

router = APIRouter(prefix="/payments", tags=["payments"])

# ── Token packages (must match RiffaBot/main1.py STAR_PACKAGES) ─────────────

PACKAGES = {
    "starter":  {"tokens": 10,  "stars": 55,  "rub": 100, "name": "Стартовый"},
    "basic":    {"tokens": 25,  "stars": 110, "rub": 200, "name": "Базовый"},
    "advanced": {"tokens": 60,  "stars": 220, "rub": 400, "name": "Продвинутый"},
    "premium":  {"tokens": 150, "stars": 620, "rub": 999, "name": "Премиум"},
}

PackageCode = Literal["starter", "basic", "advanced", "premium"]


# ── Stars deep link ──────────────────────────────────────────────────────────

class StarsInvoiceRequest(BaseModel):
    package_code: PackageCode


class StarsInvoiceResponse(BaseModel):
    bot_url: str
    package_code: str
    tokens: int
    stars: int


@router.post("/stars/invoice", response_model=StarsInvoiceResponse)
async def create_stars_invoice(
    body: StarsInvoiceRequest,
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> StarsInvoiceResponse:
    """Generate a Telegram deep link that opens the bot with a Stars invoice."""
    if not settings.telegram_bot_username:
        raise HTTPException(status_code=503, detail="telegram bot not configured")

    pkg = PACKAGES[body.package_code]
    # Payload format matches main1.py: buy_stars_{package}_{user_id}_{nonce}
    # We don't store nonce server-side here — the bot validates the payment itself.
    nonce = secrets.token_hex(6)
    payload = f"buy_stars_{body.package_code}_{user.telegram_user_id or user.id}_{nonce}"
    bot_url = f"https://t.me/{settings.telegram_bot_username}?start={payload}"

    return StarsInvoiceResponse(
        bot_url=bot_url,
        package_code=body.package_code,
        tokens=pkg["tokens"],
        stars=pkg["stars"],
    )


# ── Robokassa ────────────────────────────────────────────────────────────────

class RobokassaLinkRequest(BaseModel):
    package_code: PackageCode


class RobokassaLinkResponse(BaseModel):
    url: str
    package_code: str
    tokens: int
    rub: int


def _robokassa_url(
    merchant_login: str,
    password_1: str,
    amount: int,
    inv_id: int,
    description: str,
    test_mode: bool,
) -> str:
    sig = hashlib.md5(
        f"{merchant_login}:{amount}.00:{inv_id}:{password_1}".encode()
    ).hexdigest()
    base = "https://auth.robokassa.ru/Merchant/Index.aspx"
    params = {
        "MrchLogin": merchant_login,
        "OutSum": f"{amount}.00",
        "InvId": inv_id,
        "Desc": description,
        "SignatureValue": sig,
        "IsTest": 1 if test_mode else 0,
        "Culture": "ru",
    }
    return f"{base}?{urllib.parse.urlencode(params)}"


@router.post("/robokassa/link", response_model=RobokassaLinkResponse)
async def create_robokassa_link(
    body: RobokassaLinkRequest,
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> RobokassaLinkResponse:
    """Generate a Robokassa payment URL."""
    if not settings.robokassa_merchant_login or not settings.robokassa_password_1:
        raise HTTPException(status_code=503, detail="robokassa not configured")

    pkg = PACKAGES[body.package_code]
    # Use user.id as invoice id base (simple, unique enough for demo)
    inv_id = (user.id * 100 + list(PACKAGES.keys()).index(body.package_code)) % 2_147_483_647
    description = f"RIFFA Studio: {pkg['name']} ({pkg['tokens']} токенов)"

    url = _robokassa_url(
        settings.robokassa_merchant_login,
        settings.robokassa_password_1,
        pkg["rub"],
        inv_id,
        description,
        settings.robokassa_test_mode,
    )

    return RobokassaLinkResponse(
        url=url,
        package_code=body.package_code,
        tokens=pkg["tokens"],
        rub=pkg["rub"],
    )
