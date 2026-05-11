"""Public share page endpoint — no authentication required."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import db_session
from app.db.models import Generation, GenerationStatus

router = APIRouter(prefix="/share", tags=["share"])


class PublicTrack(BaseModel):
    audio_url: str
    audio_id: str
    image_url: str | None = None
    duration: int = 0
    title: str = ""


class PublicGenerationOut(BaseModel):
    share_id: str
    title: str
    type: str
    genre: str | None
    mood: str | None
    share_views: int
    tracks: list[PublicTrack]
    lyrics: str | None
    created_at: str


@router.get("/{share_id}", response_model=PublicGenerationOut)
async def get_shared_generation(
    share_id: str,
    session: AsyncSession = Depends(db_session),
) -> PublicGenerationOut:
    gen = (
        await session.execute(
            select(Generation).where(
                Generation.share_id == share_id,
                Generation.status == GenerationStatus.completed,
            )
        )
    ).scalar_one_or_none()

    if gen is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    # Increment view count
    gen.share_views = (gen.share_views or 0) + 1
    await session.commit()

    result: dict[str, Any] = gen.result or {}
    raw_tracks = result.get("tracks", [])
    tracks = [
        PublicTrack(
            audio_url=t.get("audio_url", ""),
            audio_id=t.get("audio_id", ""),
            image_url=t.get("image_url"),
            duration=int(t.get("duration", 0)),
            title=t.get("title", gen.title),
        )
        for t in raw_tracks
        if t.get("audio_url")
    ]

    return PublicGenerationOut(
        share_id=share_id,
        title=gen.title,
        type=gen.type.value,
        genre=gen.genre,
        mood=gen.mood,
        share_views=gen.share_views,
        tracks=tracks,
        lyrics=result.get("lyrics"),
        created_at=gen.created_at.isoformat(),
    )
