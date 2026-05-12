"""Public Radio — list of community-published tracks, charts, votes, plays."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_user, current_user_optional, db_session
from app.db.models import (
    Generation,
    GenerationRating,
    GenerationStatus,
    GenerationType,
    RadioVote,
    User,
)

router = APIRouter(prefix="/radio", tags=["radio"])

# Generation types eligible for the Radio (Studio music modules).
RADIO_TYPES: tuple[GenerationType, ...] = (
    GenerationType.song,
    GenerationType.instrumental,
    GenerationType.cover_song,
    GenerationType.occasion,
)

# Mapping from backend type to public "kind" shown in the UI.
_TYPE_TO_KIND: dict[GenerationType, str] = {
    GenerationType.song: "song",
    GenerationType.instrumental: "instrumental",
    GenerationType.cover_song: "cover",
    GenerationType.occasion: "song",
}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class RadioTrackOut(BaseModel):
    id: str
    kind: str  # song | instrumental | cover
    title: str
    author: str  # @username or display name
    genre: str | None
    mood: str | None
    tempo: str | None
    vocal: str | None
    audio_url: str
    image_url: str | None = None
    duration: int = 0
    play_count: int
    like_count: int
    dislike_count: int
    score: int  # like_count - dislike_count
    my_vote: Literal["like", "dislike"] | None = None
    published_at: str
    is_own: bool = False


class RadioListResponse(BaseModel):
    items: list[RadioTrackOut]
    total: int
    page: int
    limit: int


class RadioStats(BaseModel):
    total_tracks: int
    total_plays: int
    total_likes: int
    today_tracks: int
    today_plays: int


class VoteRequest(BaseModel):
    rating: Literal["like", "dislike", "remove"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _first_track(gen: Generation) -> tuple[str, str | None, int]:
    """Return (audio_url, image_url, duration) of the variant published on Radio.

    Each generation may have multiple variants (V1/V2). When the user publishes
    on Radio, ``published_track_index`` records *which* variant they want
    broadcast — only that one should appear in the public feed. Falls back to
    the first track with audio if the index is missing or out of range
    (legacy generations / corrupt result blobs).
    """
    result: dict[str, Any] = gen.result or {}
    raw_tracks = result.get("tracks", []) or []
    target_idx = gen.published_track_index
    if isinstance(target_idx, int) and 0 <= target_idx < len(raw_tracks):
        t = raw_tracks[target_idx]
        url = t.get("audio_url") if isinstance(t, dict) else None
        if url:
            return (
                str(url),
                t.get("image_url"),
                int(t.get("duration", 0) or 0),
            )
    for t in raw_tracks:
        url = t.get("audio_url") if isinstance(t, dict) else None
        if url:
            return (
                str(url),
                t.get("image_url"),
                int(t.get("duration", 0) or 0),
            )
    return ("", None, 0)


def _author(user: User | None) -> str:
    if user is None:
        return "@anonymous"
    if user.telegram_username:
        return f"@{user.telegram_username}"
    if user.display_name:
        return user.display_name
    return f"user{user.id}"


def _to_out(
    gen: Generation,
    author_user: User | None,
    my_vote: str | None,
    is_own: bool,
) -> RadioTrackOut | None:
    audio_url, image_url, duration = _first_track(gen)
    if not audio_url:
        return None
    kind = _TYPE_TO_KIND.get(gen.type, "song")
    return RadioTrackOut(
        id=str(gen.id),
        kind=kind,
        title=gen.title or "Без названия",
        author=_author(author_user),
        genre=gen.genre,
        mood=gen.mood,
        tempo=gen.tempo,
        vocal=gen.vocal,
        audio_url=audio_url,
        image_url=image_url,
        duration=duration,
        play_count=gen.play_count,
        like_count=gen.like_count,
        dislike_count=gen.dislike_count,
        score=gen.like_count - gen.dislike_count,
        my_vote=my_vote,
        published_at=(gen.published_at or gen.created_at).isoformat(),
        is_own=is_own,
    )


def _period_threshold(period: str) -> datetime | None:
    now = datetime.now(UTC)
    if period == "today":
        return now - timedelta(days=1)
    if period == "week":
        return now - timedelta(days=7)
    if period == "month":
        return now - timedelta(days=30)
    return None  # "all" or unknown


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=RadioListResponse)
async def list_radio(
    mood: str | None = Query(default=None),
    genre: str | None = Query(default=None),
    vocal: Literal["vocal", "instrumental"] | None = Query(default=None),
    period: Literal["today", "week", "month", "all"] = Query(default="all"),
    sort: Literal["recent", "score", "plays"] = Query(default="recent"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=30, ge=1, le=100),
    me: User | None = Depends(current_user_optional),
    session: AsyncSession = Depends(db_session),
) -> RadioListResponse:
    """List public Radio tracks with filters and sort."""
    stmt = select(Generation).where(
        Generation.is_public.is_(True),
        Generation.status == GenerationStatus.completed,
        Generation.type.in_(RADIO_TYPES),
    )

    if mood:
        stmt = stmt.where(Generation.mood == mood)
    if genre:
        stmt = stmt.where(Generation.genre == genre)
    if vocal == "instrumental":
        stmt = stmt.where(Generation.type == GenerationType.instrumental)
    elif vocal == "vocal":
        stmt = stmt.where(Generation.type != GenerationType.instrumental)

    threshold = _period_threshold(period)
    if threshold is not None:
        stmt = stmt.where(Generation.published_at >= threshold)

    # Total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    # Sort
    if sort == "score":
        stmt = stmt.order_by(
            desc(Generation.like_count - Generation.dislike_count),
            desc(Generation.published_at),
        )
    elif sort == "plays":
        stmt = stmt.order_by(desc(Generation.play_count), desc(Generation.published_at))
    else:  # recent
        stmt = stmt.order_by(desc(Generation.published_at))

    stmt = stmt.offset((page - 1) * limit).limit(limit)
    gens = list((await session.execute(stmt)).scalars().all())

    if not gens:
        return RadioListResponse(items=[], total=total, page=page, limit=limit)

    # Fetch authors in one query
    user_ids = {g.user_id for g in gens}
    authors_map: dict[int, User] = {
        u.id: u
        for u in (
            await session.execute(select(User).where(User.id.in_(user_ids)))
        )
        .scalars()
        .all()
    }

    # Fetch my votes in one query
    my_votes: dict[uuid.UUID, str] = {}
    if me is not None:
        gen_ids = [g.id for g in gens]
        rows = (
            await session.execute(
                select(RadioVote.generation_id, RadioVote.vote).where(
                    RadioVote.user_id == me.id,
                    RadioVote.generation_id.in_(gen_ids),
                )
            )
        ).all()
        my_votes = {gid: v.value if hasattr(v, "value") else str(v) for gid, v in rows}

    items: list[RadioTrackOut] = []
    for g in gens:
        author = authors_map.get(g.user_id)
        my_vote = my_votes.get(g.id)
        is_own = me is not None and g.user_id == me.id
        out = _to_out(g, author, my_vote, is_own)
        if out is not None:
            items.append(out)

    return RadioListResponse(items=items, total=total, page=page, limit=limit)


class MoodCounts(BaseModel):
    counts: dict[str, int]
    total: int
    vocal: int
    instrumental: int


@router.get("/mood-counts", response_model=MoodCounts)
async def mood_counts(
    session: AsyncSession = Depends(db_session),
) -> MoodCounts:
    """Per-mood counts for the Mood grid on the Radio page."""
    rows = (
        await session.execute(
            select(Generation.mood, func.count(Generation.id)).where(
                Generation.is_public.is_(True),
                Generation.status == GenerationStatus.completed,
                Generation.type.in_(RADIO_TYPES),
                Generation.mood.is_not(None),  # Exclude tracks without mood
            ).group_by(Generation.mood)
        )
    ).all()
    counts: dict[str, int] = {str(m): int(c) for m, c in rows if m}
    total = sum(counts.values())

    instrumental = (
        await session.execute(
            select(func.count(Generation.id)).where(
                Generation.is_public.is_(True),
                Generation.status == GenerationStatus.completed,
                Generation.type == GenerationType.instrumental,
                Generation.mood.is_not(None),  # Exclude instrumentals without mood
            )
        )
    ).scalar_one()
    vocal = total - int(instrumental)

    return MoodCounts(counts=counts, total=total, vocal=vocal, instrumental=int(instrumental))


@router.get("/stats", response_model=RadioStats)
async def get_stats(
    session: AsyncSession = Depends(db_session),
) -> RadioStats:
    """Aggregate stats shown on the Radio hero."""
    base = select(Generation).where(
        Generation.is_public.is_(True),
        Generation.status == GenerationStatus.completed,
        Generation.type.in_(RADIO_TYPES),
    )

    total_tracks = (
        await session.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()
    total_plays = (
        await session.execute(
            select(func.coalesce(func.sum(Generation.play_count), 0)).where(
                Generation.is_public.is_(True),
                Generation.status == GenerationStatus.completed,
                Generation.type.in_(RADIO_TYPES),
            )
        )
    ).scalar_one()
    total_likes = (
        await session.execute(
            select(func.coalesce(func.sum(Generation.like_count), 0)).where(
                Generation.is_public.is_(True),
                Generation.status == GenerationStatus.completed,
                Generation.type.in_(RADIO_TYPES),
            )
        )
    ).scalar_one()

    threshold = datetime.now(UTC) - timedelta(days=1)
    today_q = select(Generation).where(
        Generation.is_public.is_(True),
        Generation.status == GenerationStatus.completed,
        Generation.type.in_(RADIO_TYPES),
        Generation.published_at >= threshold,
    )
    today_tracks = (
        await session.execute(select(func.count()).select_from(today_q.subquery()))
    ).scalar_one()
    today_plays = (
        await session.execute(
            select(func.coalesce(func.sum(Generation.play_count), 0)).where(
                Generation.is_public.is_(True),
                Generation.status == GenerationStatus.completed,
                Generation.type.in_(RADIO_TYPES),
                Generation.published_at >= threshold,
            )
        )
    ).scalar_one()

    return RadioStats(
        total_tracks=int(total_tracks),
        total_plays=int(total_plays),
        total_likes=int(total_likes),
        today_tracks=int(today_tracks),
        today_plays=int(today_plays),
    )


@router.get("/me/collection", response_model=RadioListResponse)
async def my_collection(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=30, ge=1, le=100),
    me: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> RadioListResponse:
    """Tracks the current user has liked — both votes for community tracks
    on Radio AND own generations the user thumbed-up in the library."""
    # IDs of tracks I voted "like" for on Radio (community tracks).
    radio_liked_stmt = select(RadioVote.generation_id).where(
        RadioVote.user_id == me.id,
        RadioVote.vote == GenerationRating.like,
    )
    # IDs of MY generations that I rated "like" in the library — also
    # belong here ("collection = everything I marked as liked"). Hidden if
    # the user trashed them or they didn't complete.
    own_liked_stmt = select(Generation.id).where(
        Generation.user_id == me.id,
        Generation.rating == GenerationRating.like,
        Generation.deleted_at.is_(None),
    )

    stmt = select(Generation).where(
        (Generation.id.in_(radio_liked_stmt) & Generation.is_public.is_(True))
        | Generation.id.in_(own_liked_stmt),
        Generation.status == GenerationStatus.completed,
        Generation.type.in_(RADIO_TYPES),
    )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(desc(Generation.published_at)).offset((page - 1) * limit).limit(limit)
    gens = list((await session.execute(stmt)).scalars().all())

    user_ids = {g.user_id for g in gens}
    authors_map: dict[int, User] = (
        {
            u.id: u
            for u in (
                await session.execute(select(User).where(User.id.in_(user_ids)))
            )
            .scalars()
            .all()
        }
        if user_ids
        else {}
    )

    items: list[RadioTrackOut] = []
    for g in gens:
        author = authors_map.get(g.user_id)
        is_own = g.user_id == me.id
        out = _to_out(g, author, "like", is_own)
        if out is not None:
            items.append(out)

    return RadioListResponse(items=items, total=total, page=page, limit=limit)


@router.post("/{gen_id}/vote")
async def vote_track(
    gen_id: str,
    body: VoteRequest,
    me: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> dict[str, int | str | None]:
    """Like, dislike or remove vote on a public Radio track.

    Updates denormalised counters atomically.
    """
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="not found"
        ) from exc

    gen = (
        await session.execute(
            select(Generation).where(
                Generation.id == gid,
                Generation.is_public.is_(True),
                Generation.status == GenerationStatus.completed,
            )
        )
    ).scalar_one_or_none()

    if gen is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="track not found"
        )

    existing = (
        await session.execute(
            select(RadioVote).where(
                RadioVote.generation_id == gid,
                RadioVote.user_id == me.id,
            )
        )
    ).scalar_one_or_none()

    prev = existing.vote.value if existing else None

    if body.rating == "remove":
        if existing is not None:
            await session.delete(existing)
        new_vote: str | None = None
    else:
        new_vote = body.rating
        new_enum = GenerationRating(body.rating)
        if existing is None:
            session.add(
                RadioVote(
                    generation_id=gid,
                    user_id=me.id,
                    vote=new_enum,
                    created_at=datetime.now(UTC),
                )
            )
        else:
            existing.vote = new_enum

    # Update denormalised counters.
    if prev == "like":
        gen.like_count = max(0, gen.like_count - 1)
    elif prev == "dislike":
        gen.dislike_count = max(0, gen.dislike_count - 1)

    if new_vote == "like":
        gen.like_count = gen.like_count + 1
    elif new_vote == "dislike":
        gen.dislike_count = gen.dislike_count + 1

    await session.commit()

    return {
        "my_vote": new_vote,
        "like_count": gen.like_count,
        "dislike_count": gen.dislike_count,
    }


@router.post("/{gen_id}/play", status_code=status.HTTP_204_NO_CONTENT)
async def record_play(
    gen_id: str,
    session: AsyncSession = Depends(db_session),
) -> Response:
    """Increment the play counter for a public track. Anonymous-friendly."""
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="not found"
        ) from exc

    gen = (
        await session.execute(
            select(Generation).where(
                Generation.id == gid,
                Generation.is_public.is_(True),
                Generation.status == GenerationStatus.completed,
            )
        )
    ).scalar_one_or_none()

    if gen is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="track not found"
        )

    gen.play_count = gen.play_count + 1
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
