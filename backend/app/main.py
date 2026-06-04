"""FastAPI application entrypoint."""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.limiter import limiter


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
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
    # Hide the interactive API schema in production. Endpoints are auth-gated,
    # but exposing the full surface + Swagger "try it out" is needless attack
    # recon. In dev/staging the docs stay on for convenience.
    _docs_enabled = settings.app_env != "production"
    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        lifespan=lifespan,
        docs_url="/docs" if _docs_enabled else None,
        redoc_url="/redoc" if _docs_enabled else None,
        openapi_url="/openapi.json" if _docs_enabled else None,
    )

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(
        RateLimitExceeded,
        _rate_limit_exceeded_handler,  # type: ignore[arg-type]
    )

    # Log validation errors with the offending payload so we can see what the
    # frontend sent when a request fails with 422.
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        try:
            body_bytes = await request.body()
            body_preview = body_bytes[:1500].decode("utf-8", errors="replace")
        except Exception:
            body_preview = "<unreadable>"
        logger.warning(
            "Validation error on {} {}: errors={} body={}",
            request.method,
            request.url.path,
            exc.errors(),
            body_preview,
        )
        # Format as a human-readable string so the frontend can display the
        # actual reason — `exc.errors()` is a list that apiFetch rejects
        # because it expects `detail` to be a string.
        readable = "; ".join(
            f"{'.'.join(str(p) for p in e.get('loc', []))}: {e.get('msg', 'invalid')}"
            for e in exc.errors()
        )
        return JSONResponse(status_code=422, content={"detail": readable})

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    app.include_router(api_router)

    # Mount /media for user-uploaded files (avatars). Created lazily — must
    # exist before StaticFiles is instantiated, so we ensure the directory.
    media_root = Path(__file__).resolve().parent.parent / "media"
    (media_root / "avatars").mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=media_root), name="media")

    # Serve pre-built frontend static files in production.
    static_dir = _resolve_static_dir()
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
