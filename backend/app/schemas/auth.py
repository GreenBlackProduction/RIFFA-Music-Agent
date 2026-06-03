"""Auth-related Pydantic schemas."""

from typing import Any

from pydantic import BaseModel


class TelegramLoginPayload(BaseModel):
    """Body posted by the Telegram Login Widget."""

    id: int
    auth_date: int
    hash: str
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    referral_code: str | None = None  # ?ref=CODE from URL, stored client-side

    def to_widget_dict(self) -> dict[str, Any]:
        """Return the original key/value pairs for HMAC verification."""
        return self.model_dump(exclude={"referral_code"}, exclude_none=True)


class TelegramInitDataPayload(BaseModel):
    """Body posted from a Telegram Mini App with raw initData."""

    init_data: str
    referral_code: str | None = None


class EmailLoginRequest(BaseModel):
    """Initiate email magic-link flow (legacy)."""

    email: str
    referral_code: str | None = None


class EmailRegisterRequest(BaseModel):
    email: str
    password: str
    referral_code: str | None = None


class EmailPasswordLoginRequest(BaseModel):
    email: str
    password: str


class GoogleLoginPayload(BaseModel):
    """Body posted by the frontend after Google Identity Services returns an
    ID token (the ``credential`` field of the GIS callback)."""

    credential: str
    referral_code: str | None = None


class EmailVerifyResponse(BaseModel):
    ok: bool
    user_id: int


class CurrentUser(BaseModel):
    """Public user profile returned by /users/me."""

    id: int
    display_name: str
    telegram_user_id: int | None = None
    telegram_username: str | None = None
    email: str | None = None
    avatar_url: str | None = None
    locale: str
    balance_tokens: int
    is_admin: bool
    is_banned: bool = False
    notice_message: str | None = None
    notice_kind: str | None = None  # 'ban' | 'warning'
    referral_code: str | None = None
    created_at: str | None = None
    terms_accepted_at: str | None = None
    terms_version: str | None = None
    legal_version: str | None = None
    # Generation-ready pushes — controlled on the site.
    generation_notifications_enabled: bool = True
    # Morning broadcast — controlled in the bot only (read-only on the site).
    morning_messages_enabled: bool = True
