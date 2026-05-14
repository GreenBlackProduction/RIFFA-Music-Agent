"""Aggregate v1 router."""

from fastapi import APIRouter

from app.api.v1 import (
    admin,
    agent,
    auth,
    generate,
    health,
    history,
    lyrics,
    models,
    radio,
    share,
    tracks,
    upload,
    upload_new,
    users,
    ws,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(models.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(admin.router)
api_router.include_router(upload.router)
api_router.include_router(upload_new.router)
api_router.include_router(generate.router)
api_router.include_router(lyrics.router)
api_router.include_router(agent.router)
api_router.include_router(history.router)
api_router.include_router(radio.router)
api_router.include_router(share.router)
api_router.include_router(tracks.router)
api_router.include_router(ws.router)
