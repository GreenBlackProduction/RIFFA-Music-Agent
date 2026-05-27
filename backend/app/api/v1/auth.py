"""Authentication endpoints â€” Telegram Login Widget, Mini App initData and email magic-link."""

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.email import InvalidEmailError, normalize_email, send_magic_link
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
from app.schemas.auth import (
    EmailLoginRequest,
    EmailPasswordLoginRequest,
    EmailRegisterRequest,
    EmailVerifyResponse,
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
    user, _ = await get_or_create_user_by_email(session, email)
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


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    """Drop the session cookie."""
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}

