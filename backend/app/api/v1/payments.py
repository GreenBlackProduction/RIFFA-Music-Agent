"""Payment endpoints — Telegram Stars deep link, Robokassa link + webhook.

Every payment intent is now recorded as a :class:`Payment` row (status
``pending``) so the backend has first-class visibility into purchases and a
unique key (``external_id``) to deduplicate webhook deliveries — instead of the
crediting/dedup living only in the bot's private storage.
"""

from __future__ import annotations

import hashlib
import secrets
import urllib.parse
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.deps import current_user, db_session
from app.db.models.payment import Payment, PaymentProvider, PaymentStatus
from app.db.models.user import User
from app.services.users import credit_referrer_on_first_purchase
from app.services.wallet import credit_tokens

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
    session: AsyncSession = Depends(db_session),
) -> StarsInvoiceResponse:
    """Generate a Telegram deep link that opens the bot with a Stars invoice.

    Stars are paid inside Telegram, so the account must be linked to a Telegram
    user. Email-only accounts get a clear 409 telling the frontend to prompt
    Telegram linking (paying via Robokassa stays available for them).
    """
    if not settings.telegram_bot_username:
        raise HTTPException(status_code=503, detail="telegram bot not configured")

    if user.telegram_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "telegram_required",
                "message": "Оплата звёздами доступна только через Telegram. "
                           "Привяжите Telegram-аккаунт или оплатите через Robokassa.",
                "bot_url": f"https://t.me/{settings.telegram_bot_username}",
            },
        )

    pkg = PACKAGES[body.package_code]
    # Payload format matches main1.py: buy_stars_{package}_{tg_user_id}_{nonce}
    nonce = secrets.token_hex(6)
    payload = f"buy_stars_{body.package_code}_{user.telegram_user_id}_{nonce}"
    bot_url = f"https://t.me/{settings.telegram_bot_username}?start={payload}"

    # Record the intent so the backend has visibility. The bot completes the
    # payment in its own flow; this stays `pending` until that's wired to also
    # mark the shared row completed.
    session.add(
        Payment(
            user_id=user.id,
            provider=PaymentProvider.telegram_stars,
            status=PaymentStatus.pending,
            amount_minor=pkg["stars"],
            currency="XTR",
            tokens_added=pkg["tokens"],
            package_code=body.package_code,
            external_id=f"stars:{user.telegram_user_id}:{nonce}",
            raw_payload={"payload": payload},
        )
    )
    await session.commit()

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


async def _allocate_inv_id(session: AsyncSession) -> int:
    """Allocate a fresh, unique 9-digit Robokassa invoice id.

    Robokassa requires InvId to be unique per merchant; the old
    ``user.id * 100 + package_index`` scheme collided on a repeat purchase of
    the same package. We pick a random id and confirm no Payment owns it yet.
    """
    for _ in range(8):
        inv_id = secrets.randbelow(900_000_000) + 100_000_000  # 100000000..999999999
        ext = f"robokassa:{inv_id}"
        taken = (
            await session.execute(select(Payment.id).where(Payment.external_id == ext))
        ).scalar_one_or_none()
        if taken is None:
            return inv_id
    raise HTTPException(status_code=500, detail="could not allocate invoice id")


@router.post("/robokassa/link", response_model=RobokassaLinkResponse)
async def create_robokassa_link(
    body: RobokassaLinkRequest,
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
) -> RobokassaLinkResponse:
    """Generate a Robokassa payment URL and record a pending Payment."""
    if not settings.robokassa_merchant_login or not settings.robokassa_password_1:
        raise HTTPException(status_code=503, detail="robokassa not configured")

    pkg = PACKAGES[body.package_code]
    inv_id = await _allocate_inv_id(session)
    description = f"RIFFA Studio: {pkg['name']} ({pkg['tokens']} токенов)"

    session.add(
        Payment(
            user_id=user.id,
            provider=PaymentProvider.robokassa,
            status=PaymentStatus.pending,
            amount_minor=pkg["rub"] * 100,
            currency="RUB",
            tokens_added=pkg["tokens"],
            package_code=body.package_code,
            external_id=f"robokassa:{inv_id}",
            raw_payload={"inv_id": inv_id, "rub": pkg["rub"]},
        )
    )
    await session.commit()

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


@router.api_route("/robokassa/webhook", methods=["GET", "POST"])
async def robokassa_webhook(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
) -> Response:
    """Robokassa ResultURL callback — credits tokens once the payment clears.

    Robokassa signs the result with ``md5(OutSum:InvId:Password#2)``. We verify
    that, then credit the package tokens exactly once (the Payment row is the
    dedup key — a redelivered webhook just re-acknowledges). The body must be
    exactly ``OK{InvId}`` for Robokassa to stop retrying.

    NB: point the merchant's ResultURL at
    ``https://riffastudio.site/api/v1/payments/robokassa/webhook``.
    """
    if not settings.robokassa_password_2:
        raise HTTPException(status_code=503, detail="robokassa not configured")

    # ResultURL method is merchant-configurable — accept query string or form.
    params: dict[str, str] = dict(request.query_params)
    try:
        form = await request.form()
        for k, v in form.items():
            params.setdefault(k, str(v))
    except Exception:
        pass

    out_sum = params.get("OutSum") or params.get("outSum") or ""
    inv_id = params.get("InvId") or params.get("invId") or ""
    received_sig = (params.get("SignatureValue") or "").upper()
    if not out_sum or not inv_id or not received_sig:
        raise HTTPException(status_code=400, detail="missing robokassa params")

    expected_sig = hashlib.md5(
        f"{out_sum}:{inv_id}:{settings.robokassa_password_2}".encode()
    ).hexdigest().upper()
    if not secrets.compare_digest(expected_sig, received_sig):
        logger.warning("[ROBOKASSA] bad signature for InvId={}", inv_id)
        raise HTTPException(status_code=400, detail="bad signature")

    # Lock the payment row so a redelivered webhook can't double-credit.
    payment = (
        await session.execute(
            select(Payment)
            .where(Payment.external_id == f"robokassa:{inv_id}")
            .with_for_update()
        )
    ).scalar_one_or_none()
    if payment is None:
        logger.warning("[ROBOKASSA] unknown InvId={}", inv_id)
        raise HTTPException(status_code=404, detail="unknown invoice")

    if payment.status == PaymentStatus.completed:
        # Already processed — acknowledge so Robokassa stops retrying.
        return Response(content=f"OK{inv_id}", media_type="text/plain")

    await credit_tokens(
        session,
        payment.user_id,
        payment.tokens_added,
        reason="purchase:robokassa",
        reference_id=str(payment.id),
    )
    # First purchase by an invited user pays the inviter's referral bonus.
    await credit_referrer_on_first_purchase(session, payment.user_id)
    payment.status = PaymentStatus.completed
    payment.raw_payload = {**(payment.raw_payload or {}), "out_sum": out_sum}
    await session.commit()
    logger.info(
        "[ROBOKASSA] credited {} tokens to user {} (InvId={})",
        payment.tokens_added, payment.user_id, inv_id,
    )

    return Response(content=f"OK{inv_id}", media_type="text/plain")
