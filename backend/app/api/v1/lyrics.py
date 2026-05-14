"""Async lyrics drafting.

Suno's `/lyrics` endpoint produces the actual text. GPT-4o is used **only** as
a prompt engineer — it converts the user's idea + selected music parameters
into a tight prompt before handing off to Suno (see ``LyricsClient.enrich_lyrics_prompt``)."""

from __future__ import annotations

import uuid

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.deps import current_user, db_session
from app.db.models import Generation, GenerationStatus, GenerationType, User

router = APIRouter(prefix="/lyrics", tags=["lyrics"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class LyricsRequest(BaseModel):
    """Topic + chosen music parameters that GPT will fold into the Suno lyrics prompt."""

    topic: str = Field(min_length=1, max_length=1000)
    genre: str = Field(default="", max_length=64)
    mood: str = Field(default="", max_length=32)
    tempo: str = Field(default="", max_length=32)
    vocal: str = Field(default="", max_length=32)
    language: str = Field(default="ru", max_length=16)
    agent_prompt: str = Field(default="", max_length=2000)
    idempotency_key: str = Field(default="", max_length=64)


class LyricsTaskResponse(BaseModel):
    """Returned right after enqueueing — frontend opens WS to follow progress."""

    task_id: str
    ws_url: str


class LyricsResult(BaseModel):
    """Full state of a lyrics task — used for polling / fetching after WS closes."""

    task_id: str
    status: str
    title: str | None = None
    lyrics: str | None = None
    error: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _enqueue(redis_url: str, gen_id: str) -> None:
    pool = await create_pool(RedisSettings.from_dsn(redis_url))
    await pool.enqueue_job("run_generation", gen_id)
    await pool.aclose()  # type: ignore[attr-defined]


def _ws_url(request: Request, gen_id: str) -> str:
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    proto = forwarded_proto or request.url.scheme
    scheme = "wss" if proto == "https" else "ws"
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{scheme}://{host}/api/v1/ws/generation/{gen_id}"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=LyricsTaskResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_lyrics_draft(
    body: LyricsRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> LyricsTaskResponse:
    """Enqueue a Suno lyrics draft (GPT pre-shapes the prompt). Free — drafts don't burn tokens."""
    gen = Generation(
        id=uuid.uuid4(),
        user_id=user.id,
        type=GenerationType.lyrics,
        status=GenerationStatus.queued,
        title="",
        params=body.model_dump(),
        cost_tokens=0,
        genre=body.genre or None,
        mood=body.mood or None,
    )
    session.add(gen)
    await session.commit()

    await _enqueue(settings.redis_url, str(gen.id))

    return LyricsTaskResponse(
        task_id=str(gen.id),
        ws_url=_ws_url(request, str(gen.id)),
    )


@router.get("/{task_id}", response_model=LyricsResult)
async def get_lyrics_draft(
    task_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> LyricsResult:
    try:
        tid = uuid.UUID(task_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from exc

    gen = (
        await session.execute(
            select(Generation).where(
                Generation.id == tid,
                Generation.user_id == user.id,
                Generation.type == GenerationType.lyrics,
            )
        )
    ).scalar_one_or_none()

    if gen is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    payload = gen.result or {}
    return LyricsResult(
        task_id=str(gen.id),
        status=gen.status.value,
        title=payload.get("title") or gen.title or None,
        lyrics=payload.get("lyrics"),
        error=gen.error_message,
    )
