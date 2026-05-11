"""WebSocket endpoint — streams generation progress from Redis pub/sub."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger
from redis.asyncio import Redis

from app.core.config import get_settings

router = APIRouter(tags=["ws"])

_CHANNEL = "gen:progress:{}"


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
