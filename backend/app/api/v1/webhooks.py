"""Inbound webhooks from external providers.

Suno: the music API requires a ``callBackUrl`` and POSTs the task result there
when generation finishes. We *poll* for results as the source of truth (see
``services/suno.py``), so this receiver only acknowledges the delivery — it
gives Suno a real RIFFA endpoint to hit instead of an unrelated third-party
domain, and a hook point for future push-based completion.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from loguru import logger

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.api_route("/suno", methods=["GET", "POST"])
async def suno_callback(request: Request) -> dict[str, Any]:
    """Acknowledge a Suno callback. Polling remains the source of truth."""
    task_id = ""
    try:
        if request.method == "POST":
            payload = await request.json()
            data = payload.get("data") if isinstance(payload, dict) else None
            if isinstance(data, dict):
                task_id = str(data.get("task_id") or data.get("taskId") or "")
    except Exception:
        pass
    logger.info("[SUNO callback] received (task_id={})", task_id or "?")
    return {"status": "ok"}
