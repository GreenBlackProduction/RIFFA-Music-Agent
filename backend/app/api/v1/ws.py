"""WebSocket endpoint — streams generation progress from Redis pub/sub."""

from __future__ import annotations

import uuid as uuid_pkg

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from loguru import logger
from redis.asyncio import Redis
from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import TokenError, read_session_token
from app.db.base import get_session
from app.db.models import Generation

router = APIRouter(tags=["ws"])

_CHANNEL = "gen:progress:{}"
_SESSION_COOKIE = "riffa_session"


async def _authorize_ws(websocket: WebSocket, gen_id: str) -> bool:
    """Confirm the connecting client owns ``gen_id``.

    Reads the same ``riffa_session`` cookie the HTTP layer uses, then looks
    up the Generation and checks ``user_id``. Closes the socket with a
    policy-violation code on mismatch.
    """
    cookie = websocket.cookies.get(_SESSION_COOKIE)
    if not cookie:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return False
    try:
        user_id = read_session_token(cookie)
    except TokenError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return False
    try:
        gid = uuid_pkg.UUID(gen_id)
    except ValueError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return False

    async for session in get_session():
        gen = (
            await session.execute(
                select(Generation.user_id).where(Generation.id == gid)
            )
        ).scalar_one_or_none()
        if gen is None or int(gen) != user_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return False
        return True
    return False


@router.websocket("/ws/generation/{gen_id}")
async def ws_generation_progress(websocket: WebSocket, gen_id: str) -> None:
    """
    Subscribe to generation progress events.

    The client receives JSON messages:
      {"status": "queued"}
      {"status": "processing", "step": "lyrics", ...}
      {"status": "processing", "step": "music", "poll": 3, "elapsed": 45}
      {"status": "completed", "result": {...}}
      {"status": "failed", "error": "..."}
    """
    await websocket.accept()
    if not await _authorize_ws(websocket, gen_id):
        # _authorize_ws already closed the socket with a policy-violation code.
        return
    settings = get_settings()

    redis: Redis[str] = Redis.from_url(settings.redis_url, decode_responses=True)
    pubsub = redis.pubsub()
    channel = _CHANNEL.format(gen_id)
    await pubsub.subscribe(channel)

    logger.debug("WS client connected for gen {}", gen_id)

    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            data: str = message["data"]
            try:
                await websocket.send_text(data)
            except WebSocketDisconnect:
                break

            # Close after terminal events
            if '"completed"' in data or '"failed"' in data:
                break

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error("WS error for gen {}: {}", gen_id, exc)
    finally:
        await pubsub.unsubscribe(channel)
        await redis.aclose()  # type: ignore[attr-defined]
        logger.debug("WS client disconnected for gen {}", gen_id)
