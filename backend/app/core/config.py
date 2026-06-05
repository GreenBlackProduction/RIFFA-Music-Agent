"""Application configuration loaded from environment variables."""

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# Determine which .env file to use:
# 1. Explicit override via RIFFA_BACKEND_ENV_FILE
# 2. .env.dev if it exists next to this file's package root (local dev)
# 3. .env as fallback
def _find_env_file() -> str:
    explicit = os.environ.get("RIFFA_BACKEND_ENV_FILE")
    if explicit:
        return explicit
    # Walk up to the backend root (where .env.dev lives)
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / ".env.dev"
        if candidate.exists():
            return str(candidate)
    return ".env"


_ENV_FILE = _find_env_file()


class Settings(BaseSettings):
    """Strongly typed app settings."""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_env: Literal["development", "staging", "production"] = "development"
    app_name: str = "RIFFA Web"
    secret_key: str = "change-me"
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Database
    database_url: str = "postgresql+asyncpg://riffa:riffa@localhost:5432/riffa"

    # Redis / queue
    redis_url: str = "redis://localhost:6379/0"

    # Google sign-in (Google Identity Services ID-token flow).
    # Only the public OAuth Web client_id is needed — no client secret.
    google_client_id: str = ""

    # Telegram
    telegram_bot_token: str = ""
    telegram_bot_username: str = "The_Riffa_bot"
    telegram_channel_username: str = ""
    telegram_channel_bonus_tokens: int = 5

    # External AI APIs
    suno_api_key: str = ""
    suno_base_url: str = "https://api.sunoapi.org/api/v1"
    # Where Suno POSTs the async result. We poll regardless (source of truth),
    # but a real RIFFA endpoint beats pinging an unrelated third party.
    suno_callback_url: str = ""
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    apiyi_key: str = ""
    nanobanana_api_key: str = ""
    nanobanana_base_url: str = ""
    elevenlabs_api_key: str = ""
    lastfm_api_key: str = ""
    openrouter_api_key: str = ""

    # Payments — Robokassa
    robokassa_merchant_login: str = ""
    robokassa_password_1: str = ""
    robokassa_password_2: str = ""
    robokassa_test_mode: bool = True

    # Payments — Tinkoff
    tinkoff_terminal_key: str = ""
    tinkoff_password: str = ""
    tinkoff_enabled: bool = False

    # Payments — FreeKassa
    freekassa_merchant_id: str = ""
    freekassa_secret_1: str = ""
    freekassa_secret_2: str = ""
    freekassa_enabled: bool = False

    # Storage
    s3_endpoint: str = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_bucket_media: str = "riffa-media"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_public_base_url: str = "http://localhost:9000/riffa-media"

    # Admin
    admin_telegram_ids: str = ""  # comma-separated Telegram user IDs with god-mode access

    # Observability
    sentry_dsn: str = Field(default="")

    # Legal
    legal_terms_version: str = "1.0"

    @property
    def admin_id_set(self) -> set[int]:
        ids: set[int] = set()
        for part in self.admin_telegram_ids.split(","):
            part = part.strip()
            if part.isdigit():
                ids.add(int(part))
        return ids

    @property
    def cors_origins(self) -> list[str]:
        """Return CORS origins as a list."""
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings instance.

    Refuses to start in production if the secret key was left at the
    placeholder value. Catches deploy-mistakes that would otherwise let
    anyone forge session JWTs.
    """
    settings = Settings()
    if settings.app_env == "production" and settings.secret_key in {"", "change-me"}:
        raise RuntimeError(
            "SECRET_KEY is unset (or 'change-me') in production — "
            "set a strong random value in the backend env file before starting."
        )
    return settings
