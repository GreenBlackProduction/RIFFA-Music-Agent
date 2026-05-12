"""Health endpoints."""

from fastapi import APIRouter

from app import __version__
from app.core.config import get_settings

router = APIRouter(tags=["meta"])


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness probe."""
    settings = get_settings()
    return {"status": "ok", "env": settings.app_env, "version": __version__}
