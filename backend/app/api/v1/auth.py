"""Authentication endpoints â€” Telegram Login Widget, Mini App initData and email magic-link."""

import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from loguru import logger
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.email import InvalidEmailError, normalize_email, send_magic_link
from app.auth.google import GoogleAuthError, verify_google_id_token
from app.auth.telegram import (
    TelegramAuthError,
    verify_init_data,
    verify_login_widget,
)
from app.core.config import Settings, get_settings
from app.core.deps import SESSION_COOKIE, db_session
from app.core.limiter import limiter
from app.core.security import (
    TokenError,
    make_email_token,
    make_session_token,
    read_email_token,
)
from app.db.models import User
from app.schemas.auth import (
    EmailLoginRequest,
    EmailPasswordLoginRequest,
    EmailRegisterRequest,
    EmailVerifyResponse,
    GoogleLoginPayload,
    TelegramInitDataPayload,
    TelegramLoginPayload,
)
from app.services.users import (
    AuthError,
    get_or_create_user_by_email,
    get_or_create_user_by_telegram,
    login_user_by_email,
    register_user_by_email,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Bot-link login flow uses Redis to store short-lived nonces. Frontend asks
# the backend to mint one (`/bot-link/start`), the user goes to the bot via a
# deep link, the bot calls `/bot-link/approve`, and the frontend polls
# `/bot-link/poll` until it sees the nonce flipped from pending → approved.
# TTL: 5 minutes — matches the LoginPage poll loop budget.
_BOT_LINK_NONCE_KEY = "auth:bot_link:{}"
_BOT_LINK_TTL = 60 * 5


def _set_session_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.app_env != "development",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


@router.post("/telegram/widget", status_code=status.HTTP_200_OK)
@limiter.limit("20/minute")
async def telegram_widget_login(
    request: Request,
    payload: TelegramLoginPayload,
    response: Response,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
) -> dict[str, int | bool]:
    """Verify Telegram Login Widget payload, set session cookie."""
    if not settings.telegram_bot_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="telegram bot token is not configured",
        )
    try:
        account = verify_login_widget(payload.to_widget_dict(), settings.telegram_bot_token)
    except TelegramAuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    user, created = await get_or_create_user_by_telegram(session, account, referral_code=payload.referral_code)
    await session.commit()

    if not user.bot_started_at:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "bot_not_started",
                "bot_url": f"https://t.me/{settings.telegram_bot_username}?start=weblogin",
            },
        )

    _set_session_cookie(response, settings, make_session_token(user.id))
    return {"user_id": user.id, "created": created}


@router.post("/telegram/initdata", status_code=status.HTTP_200_OK)
@limiter.limit("20/minute")
async def telegram_initdata_login(
    request: Request,
    payload: TelegramInitDataPayload,
    response: Response,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
) -> dict[str, int | bool]:
    """Verify Telegram Mini App initData, set session cookie."""
    if not settings.telegram_bot_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="telegram bot token is not configured",
        )
    try:
        account = verify_init_data(payload.init_data, settings.telegram_bot_token)
    except TelegramAuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    user, created = await get_or_create_user_by_telegram(session, account, referral_code=payload.referral_code)

    # initData proves the user is inside Telegram — set bot_started_at automatically
    # so they can use the site without needing to send /start to the bot separately.
    if not user.bot_started_at:
        from datetime import datetime, timezone
        user.bot_started_at = datetime.now(timezone.utc)

    await session.commit()
    _set_session_cookie(response, settings, make_session_token(user.id))
    return {"user_id": user.id, "created": created}


# ── Bot-link login flow (3 endpoints) ─────────────────────────────────────────


@router.post("/telegram/bot-link/start", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def bot_link_start(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    """Mint a one-shot nonce, return deep-link to the bot.

    Frontend then opens the bot via that link; bot calls ``/bot-link/approve``
    with the same nonce + the Telegram user_id; meanwhile the frontend polls
    ``/bot-link/poll`` until ``approved=true``.
    """
    if not settings.telegram_bot_username or not settings.telegram_bot_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="telegram bot is not configured",
        )

    nonce = secrets.token_urlsafe(24)
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        await redis.set(
            _BOT_LINK_NONCE_KEY.format(nonce),
            "pending",
            ex=_BOT_LINK_TTL,
        )
    finally:
        await redis.aclose()  # type: ignore[attr-defined]

    bot_url = f"https://t.me/{settings.telegram_bot_username}?start=weblogin_{nonce}"
    return {"nonce": nonce, "bot_url": bot_url}


@router.get("/telegram/bot-link/poll", status_code=status.HTTP_200_OK)
@limiter.limit("60/minute")
async def bot_link_poll(
    request: Request,
    response: Response,
    nonce: str,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
) -> dict[str, int | bool]:
    """Frontend polls every ~2 s. Returns ``approved=false`` while pending,
    sets the session cookie + returns ``approved=true`` once the bot confirms.
    410 Gone when the nonce expired.
    """
    if not nonce or len(nonce) > 64:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="bad nonce")

    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        value = await redis.get(_BOT_LINK_NONCE_KEY.format(nonce))
    finally:
        await redis.aclose()  # type: ignore[attr-defined]

    if value is None:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="nonce expired")
    if value == "pending":
        return {"approved": False}

    # Once approved, the value holds the telegram_user_id as a string.
    try:
        tg_user_id = int(value)
    except (TypeError, ValueError) as exc:
        logger.warning("[bot-link] poll: malformed nonce value: {!r}", value)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="malformed approval",
        ) from exc

    user = (
        await session.execute(select(User).where(User.telegram_user_id == tg_user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user not found",
        )

    # The bot's /start handler already calls pg_db.upsert_user_on_start so
    # bot_started_at is set. Treat poll-time login as a confirmation and update
    # last_seen_at to "now".
    user.last_seen_at = datetime.now(timezone.utc)
    if not user.bot_started_at:
        user.bot_started_at = datetime.now(timezone.utc)
    await session.commit()

    # Burn the nonce so a second poll/replay can't reuse the approval.
    redis2 = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        await redis2.delete(_BOT_LINK_NONCE_KEY.format(nonce))
    finally:
        await redis2.aclose()  # type: ignore[attr-defined]

    _set_session_cookie(response, settings, make_session_token(user.id))
    return {"approved": True, "user_id": user.id}


@router.post("/telegram/bot-link/approve", status_code=status.HTTP_200_OK)
async def bot_link_approve(
    payload: dict,
    x_bot_secret: str | None = Header(default=None, alias="X-Bot-Secret"),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
) -> dict[str, bool]:
    """Called by the bot when the user taps "Войти на сайт".

    Authenticated via the ``X-Bot-Secret`` header which must equal the bot's
    token (the bot already knows it; nobody else does). Flips the nonce from
    "pending" to the user's telegram_user_id so the next /poll can hand out
    a session cookie.
    """
    if not settings.telegram_bot_token or not x_bot_secret or x_bot_secret != settings.telegram_bot_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="bad bot secret",
        )

    nonce = str(payload.get("nonce") or "").strip()
    tg_user_id = payload.get("telegram_user_id")
    if not nonce or len(nonce) > 64 or not isinstance(tg_user_id, int):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="missing nonce or telegram_user_id",
        )

    user = (
        await session.execute(select(User).where(User.telegram_user_id == tg_user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user not found — open RIFFA first",
        )

    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        current = await redis.get(_BOT_LINK_NONCE_KEY.format(nonce))
        if current is None:
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="nonce expired")
        if current != "pending":
            # Already approved — bot is retrying or the user double-tapped.
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="already used")
        # Replace "pending" with the user id and keep the same short TTL so
        # the frontend has time to /poll.
        await redis.set(
            _BOT_LINK_NONCE_KEY.format(nonce),
            str(tg_user_id),
            ex=_BOT_LINK_TTL,
        )
    finally:
        await redis.aclose()  # type: ignore[attr-defined]

    return {"ok": True}


@router.post("/email/request", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
async def email_request_login(
    payload: EmailLoginRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    """Issue a short-lived magic-link token and dispatch the email."""
    try:
        email = normalize_email(payload.email)
    except InvalidEmailError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    token = make_email_token(email)
    base = str(request.base_url).rstrip("/")
    if settings.cors_origins:
        base = settings.cors_origins[0].rstrip("/")
    link = f"{base}/auth/email-callback?{urlencode({'token': token})}"
    await send_magic_link(email, link)
    return {"status": "sent"}


@router.get("/email/verify", response_model=EmailVerifyResponse)
@limiter.limit("20/minute")
async def email_verify_login(
    request: Request,
    token: str,
    response: Response,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
) -> EmailVerifyResponse:
    """Validate the magic-link token and create a session."""
    try:
        email = read_email_token(token)
    except TokenError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    # Magic-link possession proves email ownership → verified.
    user, _ = await get_or_create_user_by_email(session, email, verified=True)
    await session.commit()
    _set_session_cookie(response, settings, make_session_token(user.id))
    return EmailVerifyResponse(ok=True, user_id=user.id)


@router.post("/email/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def email_register(
    request: Request,
    body: EmailRegisterRequest,
    response: Response,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
) -> dict[str, int | bool]:
    """Register a new account with email + password."""
    try:
        email = normalize_email(body.email)
    except InvalidEmailError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if len(body.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль должен быть не менее 8 символов",
        )
    try:
        user = await register_user_by_email(session, email, body.password, body.referral_code)
    except AuthError as exc:
        code = str(exc)
        if code == "email_taken":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Этот email уже зарегистрирован. Войдите или используйте другой адрес.",
            ) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code) from exc
    await session.commit()
    _set_session_cookie(response, settings, make_session_token(user.id))
    return {"user_id": user.id, "created": True}


@router.post("/email/login", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def email_password_login(
    request: Request,
    body: EmailPasswordLoginRequest,
    response: Response,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
) -> dict[str, int]:
    """Login with email + password."""
    try:
        email = normalize_email(body.email)
    except InvalidEmailError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    try:
        user = await login_user_by_email(session, email, body.password)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        ) from exc
    await session.commit()
    _set_session_cookie(response, settings, make_session_token(user.id))
    return {"user_id": user.id}


@router.post("/google", status_code=status.HTTP_200_OK)
@limiter.limit("20/minute")
async def google_login(
    request: Request,
    payload: GoogleLoginPayload,
    response: Response,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
) -> dict[str, int | bool]:
    """Verify a Google Identity Services ID token, set the session cookie.

    Google has already verified the email, so this is a *verified* sign-in:
    the user gets the welcome bonus (once) and can use the service without the
    email magic-link step (which isn't wired in production).
    """
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured",
        )
    try:
        account = await verify_google_id_token(payload.credential, settings.google_client_id)
    except GoogleAuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        email = normalize_email(account.email)
    except InvalidEmailError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    user, created = await get_or_create_user_by_email(
        session,
        email,
        referral_code=payload.referral_code,
        verified=True,
        display_name=account.name,
        avatar_url=account.picture,
        source="google",
    )
    await session.commit()

    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="banned")

    _set_session_cookie(response, settings, make_session_token(user.id))
    return {"user_id": user.id, "created": created}


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    """Drop the session cookie."""
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}

