"""Public Radio — list of community-published tracks, charts, votes, plays."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.deps import current_user, current_user_optional, db_session
from app.services.mood_canonical import canonical_mood
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
    id: str  # generation_id (kept for backward compat — frontend uses this for vote URL)
    track_index: int = 0  # which variant of the generation (0 = V1, 1 = V2)
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
    track_index: int = 0


class PlayRequest(BaseModel):
    track_index: int = 0


def _track_stats(gen: Generation, idx: int) -> tuple[int, int, int]:
    """Return (likes, dislikes, plays) for the given variant of a gen."""
    stats = gen.track_stats if isinstance(gen.track_stats, dict) else {}
    entry = stats.get(str(idx)) or {}
    likes = int(entry.get("likes") or 0)
    dislikes = int(entry.get("dislikes") or 0)
    plays = int(entry.get("plays") or 0)
    return likes, dislikes, plays


def _published_indices(gen: Generation) -> list[int]:
    """Resolve which track indices are published, honouring both columns."""
    raw = gen.published_track_indices
    if isinstance(raw, list) and raw:
        return [int(i) for i in raw]
    if gen.published_track_index is not None:
        return [int(gen.published_track_index)]
    return []


def _bump_track_stat(gen: Generation, idx: int, field: str, delta: int) -> None:
    """Increment one counter in track_stats and the legacy gen-level mirror."""
    stats = dict(gen.track_stats) if isinstance(gen.track_stats, dict) else {}
    key = str(idx)
    entry = dict(stats.get(key) or {})
    entry[field] = max(0, int(entry.get(field) or 0) + delta)
    stats[key] = entry
    gen.track_stats = stats
    # Keep gen-level mirrors in sync (sum across all tracks). They're
    # convenient for "user dashboard" totals and existing code that
    # reads them directly.
    totals = {"likes": 0, "dislikes": 0, "plays": 0}
    for v in stats.values():
        if isinstance(v, dict):
            for k in totals:
                totals[k] += int(v.get(k) or 0)
    gen.like_count = totals["likes"]
    gen.dislike_count = totals["dislikes"]
    gen.play_count = totals["plays"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _track_at(gen: Generation, idx: int) -> tuple[str, str | None, int]:
    """Return (audio_url, image_url, duration) for the given variant of a gen."""
    result: dict[str, Any] = gen.result or {}
    raw_tracks = result.get("tracks", []) or []
    if 0 <= idx < len(raw_tracks):
        t = raw_tracks[idx]
        if isinstance(t, dict):
            url = t.get("audio_url")
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
    track_index: int,
    author_user: User | None,
    my_vote: str | None,
    is_own: bool,
) -> RadioTrackOut | None:
    """Compose a single radio row for one published variant of one generation."""
    raw_audio_url, image_url, duration = _track_at(gen, track_index)
    if not raw_audio_url:
        return None
    audio_url = f"/api/v1/tracks/{gen.id}/{track_index}/public-stream"
    kind = _TYPE_TO_KIND.get(gen.type, "song")
    likes, dislikes, plays = _track_stats(gen, track_index)
    return RadioTrackOut(
        id=str(gen.id),
        track_index=track_index,
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
        play_count=plays,
        like_count=likes,
        dislike_count=dislikes,
        score=likes - dislikes,
        my_vote=my_vote,
        published_at=(gen.published_at or gen.created_at).isoformat(),
        is_own=is_own,
    )


def _client_ip(request: Request) -> str:
    """Real client IP behind the nginx proxy (X-Forwarded-For first hop)."""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "anon"


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
        # Mood-coded playlists are instrumental-only: a song with vocals lands
        # in the "vocal" chip, never under a mood. Without this extra clause
        # mood chips bleed song+instrumental together and the user sees the
        # same songs both under "vocal" and under e.g. "calm".
        stmt = stmt.where(Generation.mood == mood)
        if vocal is None:
            stmt = stmt.where(Generation.type == GenerationType.instrumental)
    if genre:
        stmt = stmt.where(Generation.genre == genre)
    if vocal == "instrumental":
        stmt = stmt.where(Generation.type == GenerationType.instrumental)
    elif vocal == "vocal":
        stmt = stmt.where(Generation.type != GenerationType.instrumental)

    threshold = _period_threshold(period)
    if threshold is not None:
        stmt = stmt.where(Generation.published_at >= threshold)

    # Order generations first (sort is approximate when sorting by per-track stats;
    # we re-sort flattened rows in Python after expansion).
    stmt = stmt.order_by(desc(Generation.published_at))
    # Pull a generous slice so the per-track expansion can still fill `limit`.
    fetch_limit = max(limit * 3, limit)
    fetch_offset = (page - 1) * limit
    gens = list(
        (await session.execute(stmt.offset(fetch_offset).limit(fetch_limit)))
        .scalars()
        .all()
    )

    # Expand each generation into one row per published track index.
    expanded: list[tuple[Generation, int]] = []
    for g in gens:
        for idx in _published_indices(g):
            expanded.append((g, idx))

    if not expanded:
        return RadioListResponse(items=[], total=0, page=page, limit=limit)

    # Sort the expanded rows.
    def _key_score(pair: tuple[Generation, int]) -> tuple[int, str]:
        g, idx = pair
        likes, dislikes, _ = _track_stats(g, idx)
        return (-(likes - dislikes), (g.published_at or g.created_at).isoformat())

    def _key_plays(pair: tuple[Generation, int]) -> tuple[int, str]:
        g, idx = pair
        _, _, plays = _track_stats(g, idx)
        return (-plays, (g.published_at or g.created_at).isoformat())

    if sort == "score":
        expanded.sort(key=_key_score)
    elif sort == "plays":
        expanded.sort(key=_key_plays)
    # else "recent" — already by published_at via SQL.

    # Pagination over expanded rows.
    total = len(expanded)
    expanded = expanded[: limit]

    # Fetch authors in one query
    user_ids = {g.user_id for g, _ in expanded}
    authors_map: dict[int, User] = {
        u.id: u
        for u in (
            await session.execute(select(User).where(User.id.in_(user_ids)))
        )
        .scalars()
        .all()
    }

    # Fetch my votes in one query — keyed by (generation_id, track_index).
    my_votes: dict[tuple[uuid.UUID, int], str] = {}
    if me is not None:
        gen_ids = [g.id for g, _ in expanded]
        rows = (
            await session.execute(
                select(RadioVote.generation_id, RadioVote.track_index, RadioVote.vote)
                .where(
                    RadioVote.user_id == me.id,
                    RadioVote.generation_id.in_(gen_ids),
                )
            )
        ).all()
        my_votes = {
            (gid, int(idx)): v.value if hasattr(v, "value") else str(v)
            for gid, idx, v in rows
        }

    items: list[RadioTrackOut] = []
    for g, idx in expanded:
        author = authors_map.get(g.user_id)
        my_vote = my_votes.get((g.id, idx))
        is_own = me is not None and g.user_id == me.id
        out = _to_out(g, idx, author, my_vote, is_own)
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
    """Per-mood counts for the Mood grid on the Radio page.

    Mood chips on /radio cover instrumentals only (a vocal song belongs to
    the "vocal" chip instead), so the per-mood counts must mirror that —
    otherwise the chip says 20 and reveals fewer rows when tapped. The
    `vocal` field stays a separate total of every song-style track.
    """
    rows = (
        await session.execute(
            select(Generation.mood, func.count(Generation.id)).where(
                Generation.is_public.is_(True),
                Generation.status == GenerationStatus.completed,
                Generation.type == GenerationType.instrumental,
                Generation.mood.is_not(None),
            ).group_by(Generation.mood)
        )
    ).all()
    counts: dict[str, int] = {str(m): int(c) for m, c in rows if m}
    instrumental = sum(counts.values())

    vocal = int(
        (
            await session.execute(
                select(func.count(Generation.id)).where(
                    Generation.is_public.is_(True),
                    Generation.status == GenerationStatus.completed,
                    Generation.type != GenerationType.instrumental,
                    Generation.type.in_(RADIO_TYPES),
                )
            )
        ).scalar_one()
    )
    total = instrumental + vocal

    return MoodCounts(counts=counts, total=total, vocal=vocal, instrumental=instrumental)


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

    # Which track indices did I like? For community radio votes that's the
    # specific track_index; for own-rated gens it falls back to the published
    # index list (or [0] if nothing was published).
    radio_liked_pairs: dict[uuid.UUID, list[int]] = {}
    rows = (
        await session.execute(
            select(RadioVote.generation_id, RadioVote.track_index).where(
                RadioVote.user_id == me.id,
                RadioVote.vote == GenerationRating.like,
            )
        )
    ).all()
    for gid, idx in rows:
        radio_liked_pairs.setdefault(gid, []).append(int(idx))

    items: list[RadioTrackOut] = []
    for g in gens:
        author = authors_map.get(g.user_id)
        is_own = g.user_id == me.id
        # Decide which tracks to emit for this generation in the collection.
        if g.id in radio_liked_pairs:
            indices = sorted(set(radio_liked_pairs[g.id]))
        else:
            # own_liked path — emit the published variants (or 0 if none).
            indices = _published_indices(g) or [0]
        for idx in indices:
            out = _to_out(g, idx, author, "like", is_own)
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

    Per-track: ``track_index`` in the body selects which variant
    (0 = V1, 1 = V2) the vote applies to. Counters are stored in
    ``Generation.track_stats``; the gen-level mirrors (like_count etc.)
    are recomputed as the sum across variants.
    """
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="not found"
        ) from exc

    track_index = int(body.track_index or 0)

    # Lock the generation row for the duration of the vote so concurrent voters
    # on the same track can't lose each other's counter increments (the
    # track_stats JSON is read-modify-write).
    gen = (
        await session.execute(
            select(Generation).where(
                Generation.id == gid,
                Generation.is_public.is_(True),
                Generation.status == GenerationStatus.completed,
            ).with_for_update()
        )
    ).scalar_one_or_none()

    if gen is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="track not found"
        )

    # No self-voting — an author can't pad their own track's score.
    if gen.user_id == me.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="нельзя голосовать за свой трек",
        )

    existing = (
        await session.execute(
            select(RadioVote).where(
                RadioVote.generation_id == gid,
                RadioVote.user_id == me.id,
                RadioVote.track_index == track_index,
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
                    track_index=track_index,
                    vote=new_enum,
                    created_at=datetime.now(UTC),
                )
            )
        else:
            existing.vote = new_enum

    # Update per-track counters.
    if prev == "like":
        _bump_track_stat(gen, track_index, "likes", -1)
    elif prev == "dislike":
        _bump_track_stat(gen, track_index, "dislikes", -1)

    if new_vote == "like":
        _bump_track_stat(gen, track_index, "likes", +1)
    elif new_vote == "dislike":
        _bump_track_stat(gen, track_index, "dislikes", +1)

    await session.commit()

    likes, dislikes, _ = _track_stats(gen, track_index)
    return {
        "my_vote": new_vote,
        "like_count": likes,
        "dislike_count": dislikes,
    }


@router.post("/{gen_id}/play", status_code=status.HTTP_204_NO_CONTENT)
async def record_play(
    gen_id: str,
    request: Request,
    body: PlayRequest | None = None,
    me: User | None = Depends(current_user_optional),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
) -> Response:
    """Increment the per-track play counter. Anonymous-friendly.

    Anti-inflation: each viewer (user id when logged in, else client IP) counts
    at most once per track per 5 minutes — a Redis NX key throttles repeats so
    a curl loop can't pump the "by plays" chart. The 204 is returned either way
    so the player never sees an error.
    """
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="not found"
        ) from exc

    track_index = int(body.track_index) if body is not None else 0

    viewer = f"u{me.id}" if me is not None else _client_ip(request)
    throttle_key = f"radio:play:{viewer}:{gid}:{track_index}"
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        fresh = await redis.set(throttle_key, "1", ex=300, nx=True)
    except Exception:
        fresh = True  # Redis hiccup → don't block legitimate plays.
    finally:
        await redis.aclose()  # type: ignore[attr-defined]
    if not fresh:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # Lock the row so concurrent plays don't lose increments (track_stats is
    # read-modify-write on a JSON column).
    gen = (
        await session.execute(
            select(Generation).where(
                Generation.id == gid,
                Generation.is_public.is_(True),
                Generation.status == GenerationStatus.completed,
            ).with_for_update()
        )
    ).scalar_one_or_none()

    if gen is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="track not found"
        )

    _bump_track_stat(gen, track_index, "plays", +1)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Admin: manual classify ─────────────────────────────────────────────


class ClassifyRequest(BaseModel):
    mood: str | None = None
    has_vocals: bool | None = None


class ClassifyResponse(BaseModel):
    id: str
    mood: str | None
    vocal: str | None
    type: str


@router.patch("/{gen_id}/admin/classify", response_model=ClassifyResponse)
async def admin_classify(
    gen_id: str,
    body: ClassifyRequest,
    me: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> ClassifyResponse:
    """Admin-only manual sort. Lets an admin force the mood/vocal classification
    on a Radio track when the agent guessed wrong.

    `has_vocals=True` flips the row to a vocal song (`type=song`,
    `vocal=male` as a sensible default if it was empty). `has_vocals=False`
    flips it to instrumental (`type=instrumental`, `vocal=no_vocal`).
    `mood` is canonicalised through the same dictionary used at write-time
    so chip filters can find it.

    The mood/vocal mismatch was the root of the user-visible bug:
    instrumentals were leaking into the "vocal" chip and vocal songs were
    leaking into mood playlists. Admin-side reclassify is the manual
    escape hatch when our automatic detection mis-fires.
    """
    if not me.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="admin only"
        )
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="not found"
        ) from exc

    gen = (
        await session.execute(select(Generation).where(Generation.id == gid))
    ).scalar_one_or_none()
    if gen is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="not found"
        )

    if body.mood is not None:
        normalised = canonical_mood(body.mood) or body.mood.strip()
        gen.mood = normalised[:32] or None

    if body.has_vocals is True:
        # Flip to vocal song. If it was instrumental, change type; vocal
        # field gets a default so downstream Suno logic has something to
        # work with — admin can refine later via direct DB edit if needed.
        if gen.type == GenerationType.instrumental:
            gen.type = GenerationType.song
        if not gen.vocal or gen.vocal == "no_vocal":
            gen.vocal = "male"
    elif body.has_vocals is False:
        if gen.type != GenerationType.instrumental:
            gen.type = GenerationType.instrumental
        gen.vocal = "no_vocal"

    await session.commit()
    return ClassifyResponse(
        id=str(gen.id),
        mood=gen.mood,
        vocal=gen.vocal,
        type=gen.type.value if hasattr(gen.type, "value") else str(gen.type),
    )
