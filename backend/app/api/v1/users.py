"""User endpoints (current user)."""

from __future__ import annotations

import secrets
from contextlib import suppress
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.email import hash_password, verify_password
from app.core.deps import current_user, current_user_loose, db_session
from app.db.models import User
from app.schemas.auth import CurrentUser
from app.services.promo import PromoError, redeem_promo

router = APIRouter(prefix="/users", tags=["users"])

# Allowed avatar mime types and corresponding file extensions.
_AVATAR_MIME_TO_EXT: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
}
_AVATAR_MAX_BYTES = 4 * 1024 * 1024  # 4 MB

# Where avatars live on disk. Mounted at /media in app.main.
AVATAR_DIR: Path = Path(__file__).resolve().parents[3] / "media" / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/me", response_model=CurrentUser)
def read_current_user(user: User = Depends(current_user_loose)) -> CurrentUser:
    """Return the currently authenticated user's profile.

    Uses the *loose* dep so even banned users can fetch their own profile
    (and therefore see the ban-banner). Sensitive endpoints still 403.
    """
    return CurrentUser(
        id=user.id,
        display_name=user.display_name,
        telegram_user_id=user.telegram_user_id,
        telegram_username=user.telegram_username,
        email=user.email,
        avatar_url=user.avatar_url,
        locale=user.locale,
        balance_tokens=user.balance_tokens,
        is_admin=user.is_admin,
        is_banned=user.is_banned,
        notice_message=user.notice_message,
        notice_kind=user.notice_kind,
        referral_code=user.referral_code,
    )


class RedeemPromoRequest(BaseModel):
    code: str


class RedeemPromoResponse(BaseModel):
    code: str
    tokens_granted: int
    balance_tokens: int


@router.post("/redeem-promo", response_model=RedeemPromoResponse, status_code=status.HTTP_200_OK)
async def redeem_promo_code(
    body: RedeemPromoRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> RedeemPromoResponse:
    """Активировать промокод: начисляет токены и записывает использование.

    Каждый код может быть использован пользователем только один раз.
    """
    code = body.code.strip().upper()
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Введите промокод")
    try:
        tokens_granted, new_balance = await redeem_promo(session, user.id, code)
    except PromoError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await session.commit()
    return RedeemPromoResponse(
        code=code,
        tokens_granted=tokens_granted,
        balance_tokens=new_balance,
    )


class UpdateDisplayNameRequest(BaseModel):
    display_name: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.patch("/display-name", status_code=status.HTTP_200_OK)
async def update_display_name(
    body: UpdateDisplayNameRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> dict[str, str]:
    name = body.display_name.strip()[:64]
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Имя не может быть пустым")
    user.display_name = name
    session.add(user)
    await session.commit()
    return {"display_name": user.display_name}


@router.post("/change-password", status_code=status.HTTP_200_OK)
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> dict[str, bool]:
    """Change password for email-authenticated users."""
    if not user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Смена пароля доступна только для email-аккаунтов",
        )
    if not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="У вашего аккаунта нет пароля — войдите через Telegram",
        )
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Текущий пароль неверный",
        )
    if len(body.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Новый пароль должен быть не менее 6 символов",
        )
    user.password_hash = hash_password(body.new_password)
    session.add(user)
    await session.commit()
    return {"ok": True}


@router.post("/avatar", status_code=status.HTTP_200_OK)
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> dict[str, str]:
    """Upload a user avatar (png / jpeg / webp, ≤4 MB).  Stored under
    /media/avatars/<id>-<token>.<ext> and the public URL goes into
    ``users.avatar_url``."""
    mime = (file.content_type or "").lower()
    ext = _AVATAR_MIME_TO_EXT.get(mime)
    if not ext:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Поддерживаются только PNG, JPEG и WebP изображения",
        )

    payload = await file.read(_AVATAR_MAX_BYTES + 1)
    if len(payload) > _AVATAR_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Файл больше 4 МБ",
        )
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пустой файл",
        )

    token = secrets.token_urlsafe(6)
    target = AVATAR_DIR / f"{user.id}-{token}.{ext}"
    # Drop any old avatar files for this user (keeps the disk tidy).
    for old in AVATAR_DIR.glob(f"{user.id}-*"):
        with suppress(OSError):
            old.unlink()
    target.write_bytes(payload)

    # The frontend serves /media/* via the FastAPI static mount.
    user.avatar_url = f"/media/avatars/{target.name}"
    session.add(user)
    await session.commit()
    return {"avatar_url": user.avatar_url}
