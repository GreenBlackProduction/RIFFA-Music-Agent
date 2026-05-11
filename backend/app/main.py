"""FastAPI application entrypoint."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.api.v1.router import api_router
from app.core.config import get_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Application lifespan: init external clients."""
    settings = get_settings()
    if settings.sentry_dsn:
        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.app_env, traces_sample_rate=0.1)
    yield


def _resolve_static_dir() -> Path | None:
    """Find the built frontend dist/ if present. Configurable via FRONTEND_DIST env."""
    explicit = os.environ.get("FRONTEND_DIST")
    if explicit:
        p = Path(explicit)
        return p if p.is_dir() else None
    # Default candidates relative to repo layout.
    here = Path(__file__).resolve()
    candidates = [
        here.parents[2] / "frontend" / "dist",
        here.parents[1] / "static_dist",
        Path("/app/static_dist"),
    ]
    for c in candidates:
        if c.is_dir():
            return c
    return None


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        lifespan=lifespan,
    )
    # Temporarily disable CORS to test
    if False:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    app.include_router(api_router)

    # Temporarily disable media mount to test
    if False:
        # Mount /media for user-uploaded files (avatars). Created lazily — must
        # exist before StaticFiles is instantiated, so we ensure the directory.
        media_root = Path(__file__).resolve().parent.parent / "media"
        (media_root / "avatars").mkdir(parents=True, exist_ok=True)
        app.mount("/media", StaticFiles(directory=media_root), name="media")

    # IMPORTANT: Do NOT serve static frontend files in development.
    # The Vite dev server handles this. Only serve in production.
    static_dir = None  # Force disable static serving
    if static_dir is not None:
        index_html = static_dir / "index.html"

        # Serve hashed asset bundles directly.
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

        # Custom 404 handler for SPA fallback
        @app.exception_handler(StarletteHTTPException)
        async def spa_404_handler(request, exc):
            # If it's a 404 and not an API/media path, serve index.html for SPA routing
            if exc.status_code == 404:
                path = request.url.path
                if not path.startswith("/api") and not path.startswith("/media"):
                    # Check if it's a real file first
                    candidate = static_dir / path.lstrip("/")
                    if candidate.is_file():
                        return FileResponse(candidate)
                    # Otherwise serve index.html for SPA
                    if index_html.is_file():
                        return FileResponse(index_html)
            # For API/media 404s or other errors, return the original exception
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail}
            )

    return app


app = create_app()
