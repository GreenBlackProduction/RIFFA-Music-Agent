"""Generation history, rating, share-link, and Radio publishing."""

from __future__ import annotations

import contextlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import Settings, get_settings
from app.core.deps import current_user, db_session
from app.db.models import Generation, GenerationRating, GenerationStatus, GenerationType, User

# Generation types eligible for the Radio (Studio music modules).
RADIO_TYPES: tuple[GenerationType, ...] = (
    GenerationType.song,
    GenerationType.instrumental,
    GenerationType.cover_song,
    GenerationType.occasion,
)

router = APIRouter(prefix="/history", tags=["history"])

# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


# Trash retention window — variants older than this drop out of the trash view
# (and whole rows get hard-purged by the worker). Must match the worker.
TRASH_RETENTION_DAYS = 7


class TrackOut(BaseModel):
    audio_url: str
    audio_id: str
    image_url: str | None = None
    duration: int = 0
    title: str = ""
    # Index of this variant within the generation (0 = V1, 1 = V2).
    track_index: int = 0
    # This variant's own personal rating — independent per track.
    rating: str | None = None


class GenerationOut(BaseModel):
    id: str
    type: str
    status: str
    title: str
    genre: str | None
    mood: str | None
    tempo: str | None
    vocal: str | None
    cost_tokens: int
    rating: str | None
    share_id: str | None
    share_views: int
    is_public: bool
    published_at: str | None
    published_track_index: int | None
    published_track_indices: list[int] | None
    play_count: int
    like_count: int
    dislike_count: int
    tracks: list[TrackOut]
    lyrics: str | None
    wav_url: str | None
    image_url: str | None
    error_message: str | None
    created_at: str
    completed_at: str | None
    deleted_at: str | None


def _trashed_indices(gen: Generation, *, within_days: int | None = None) -> set[int]:
    """Indices of variants currently in the trash.

    ``within_days`` (trash view) keeps only variants trashed inside the
    retention window; older ones stay hidden from the library but drop out of
    the trash. ``None`` (library view) counts any trashed variant as hidden.
    """
    raw = gen.track_trashed_at if isinstance(gen.track_trashed_at, dict) else {}
    out: set[int] = set()
    cutoff = (
        datetime.now(UTC) - timedelta(days=within_days) if within_days is not None else None
    )
    for k, ts in raw.items():
        try:
            idx = int(k)
        except (TypeError, ValueError):
            continue
        if cutoff is not None:
            try:
                when = datetime.fromisoformat(str(ts))
            except (TypeError, ValueError):
                when = None
            if when is None or when < cutoff:
                continue
        out.add(idx)
    # Backward-compat: legacy rows may still carry deleted_track_indices only.
    if within_days is None:
        out |= set(gen.deleted_track_indices or [])
    return out


def _track_rating(gen: Generation, idx: int) -> str | None:
    """This variant's personal rating.

    Once the per-track map has ANY entry it is authoritative — an absent index
    means "not rated" (None), NOT a fall-back to the gen-level mirror. Falling
    back would re-couple the variants: rating one flips the gen-level mirror,
    and the untouched sibling would inherit it. Only a completely empty map
    (un-migrated legacy row) falls back to the old gen-level rating.
    """
    ratings = gen.track_ratings if isinstance(gen.track_ratings, dict) else {}
    if ratings:
        val = ratings.get(str(idx))
        return str(val) if val else None
    return gen.rating.value if isinstance(gen.rating, GenerationRating) else (gen.rating or None)


def _to_out(gen: Generation, *, trashed_view: bool = False) -> GenerationOut:
    result: dict[str, Any] = gen.result or {}
    raw_tracks = result.get("tracks", [])
    if trashed_view:
        # Show ONLY the variants that are in the trash (within retention).
        show_idx = _trashed_indices(gen, within_days=TRASH_RETENTION_DAYS)
        # Whole-row trash (deleted_at) with no per-variant entries → show all.
        if not show_idx and gen.deleted_at is not None:
            show_idx = {i for i, t in enumerate(raw_tracks) if t.get("audio_url")}
        keep = lambda i: i in show_idx  # noqa: E731
    else:
        hidden = _trashed_indices(gen)
        keep = lambda i: i not in hidden  # noqa: E731
    tracks = [
        TrackOut(
            # Route audio through our backend so crossOrigin="anonymous" works
            # in the player (Suno CDN doesn't send Access-Control-Allow-Origin).
            audio_url=f"/api/v1/tracks/{gen.id}/{i}/stream",
            audio_id=t.get("audio_id", ""),
            image_url=t.get("image_url"),
            duration=int(t.get("duration", 0)),
            title=t.get("title", gen.title),
            track_index=i,
            rating=_track_rating(gen, i),
        )
        for i, t in enumerate(raw_tracks)
        if t.get("audio_url") and keep(i)
    ]
    return GenerationOut(
        id=str(gen.id),
        type=gen.type.value,
        status=gen.status.value,
        title=gen.title,
        genre=gen.genre,
        mood=gen.mood,
        tempo=gen.tempo,
        vocal=gen.vocal,
        cost_tokens=gen.cost_tokens,
        rating=gen.rating if gen.rating else None,
        share_id=gen.share_id,
        share_views=gen.share_views,
        is_public=bool(gen.is_public),
        published_at=gen.published_at.isoformat() if gen.published_at else None,
        published_track_index=gen.published_track_index,
        play_count=gen.play_count,
        like_count=gen.like_count,
        dislike_count=gen.dislike_count,
        tracks=tracks,
        lyrics=result.get("lyrics"),
        wav_url=result.get("wav_url"),
        image_url=result.get("image_url"),
        published_track_indices=gen.published_track_indices,
        error_message=gen.error_message,
        created_at=gen.created_at.isoformat(),
        completed_at=gen.completed_at.isoformat() if gen.completed_at else None,
        deleted_at=gen.deleted_at.isoformat() if gen.deleted_at else None,
    )


class HistoryPage(BaseModel):
    items: list[GenerationOut]
    total: int
    page: int
    limit: int


class RatingRequest(BaseModel):
    rating: Literal["like", "dislike", "remove"]
    # Which variant to rate (0 = V1, 1 = V2). None → rate the whole generation
    # (legacy behaviour, used for single-output items: sfx / wav / cover art).
    track_index: int | None = None


class RenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    track_index: int | None = None


class ShareResponse(BaseModel):
    share_id: str
    share_url: str


class RadioToggleRequest(BaseModel):
    is_public: bool
    # Which variant of the generation to publish (0 = V1, 1 = V2). Optional;
    # if omitted, defaults to 0 when ``is_public`` is True. Ignored when
    # ``is_public`` is False (we always clear the column on un-publish).
    track_index: int | None = None


class RadioToggleResponse(BaseModel):
    id: str
    is_public: bool
    published_at: str | None
    published_track_index: int | None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=HistoryPage)
async def list_history(
    type: str | None = Query(default=None),
    mood: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> HistoryPage:
    stmt = select(Generation).where(
        Generation.user_id == user.id,
        Generation.deleted_at.is_(None),  # exclude trashed items
    )

    # Lyrics drafts are internal (not user-facing output) — hide them.
    # Cover-art IS user-facing output (the generated image) so we include it.
    stmt = stmt.where(Generation.type != GenerationType.lyrics)

    if type:
        with contextlib.suppress(ValueError):
            stmt = stmt.where(Generation.type == GenerationType(type))

    if mood:
        stmt = stmt.where(Generation.mood == mood)

    if status_filter:
        with contextlib.suppress(ValueError):
            stmt = stmt.where(Generation.status == GenerationStatus(status_filter))

    # Total count
    from sqlalchemy import func

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    # Paginated results
    stmt = stmt.order_by(desc(Generation.created_at)).offset((page - 1) * limit).limit(limit)
    rows = (await session.execute(stmt)).scalars().all()

    return HistoryPage(
        items=[_to_out(g) for g in rows],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/trash", response_model=HistoryPage)
async def list_trash(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> HistoryPage:
    """List trashed items — whole generations AND individual trashed variants.

    A row qualifies if it's fully trashed (``deleted_at``) or has any
    per-variant trash entry (``track_trashed_at``). We serialize each with
    ``trashed_view`` so only the trashed variants show, and drop rows whose
    trashed variants have all aged out of the 7-day retention window.
    """
    from sqlalchemy import String, cast

    stmt = (
        select(Generation)
        .where(
            Generation.user_id == user.id,
            (
                Generation.deleted_at.is_not(None)
                | (cast(Generation.track_trashed_at, String).notin_(("{}", "null", "")))
            ),
        )
        .order_by(Generation.deleted_at.desc().nullslast(), desc(Generation.created_at))
    )
    rows = (await session.execute(stmt)).scalars().all()
    # Serialize in trash view; keep only rows that still have a visible trashed
    # variant (something trashed within the retention window).
    serialized = [_to_out(g, trashed_view=True) for g in rows]
    visible = [
        out for out, g in zip(serialized, rows)
        if out.tracks or (g.deleted_at is not None and not (g.result or {}).get("tracks"))
    ]
    total = len(visible)
    start = (page - 1) * limit
    return HistoryPage(items=visible[start:start + limit], total=total, page=page, limit=limit)


@router.delete("/trash/purge", status_code=status.HTTP_204_NO_CONTENT)
async def purge_trash(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> Response:
    """Permanently empty the trash for this user.

    Fully-trashed rows are hard-deleted (frees storage). Rows that only have a
    single trashed variant (the sibling still lives in the library) can't be
    row-deleted — we age their trash timestamps far into the past so the
    variant leaves the trash for good while the sibling is untouched.
    """
    from sqlalchemy import String, cast
    from sqlalchemy import delete as sql_delete

    # 1) Fully-trashed generations → hard delete.
    await session.execute(
        sql_delete(Generation).where(
            Generation.user_id == user.id,
            Generation.deleted_at.is_not(None),
        )
    )
    # 2) Partially-trashed rows (live sibling) → drop the trashed variants out
    #    of the trash permanently, keeping them hidden from the library.
    rows = (
        await session.execute(
            select(Generation).where(
                Generation.user_id == user.id,
                Generation.deleted_at.is_(None),
                cast(Generation.track_trashed_at, String).notin_(("{}", "null", "")),
            )
        )
    ).scalars().all()
    for gen in rows:
        trashed = gen.track_trashed_at if isinstance(gen.track_trashed_at, dict) else {}
        gen.track_trashed_at = {k: "2000-01-01T00:00:00+00:00" for k in trashed}
        flag_modified(gen, "track_trashed_at")
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{gen_id}", response_model=GenerationOut)
async def get_generation(
    gen_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> GenerationOut:
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from exc

    gen = (
        await session.execute(
            select(Generation).where(
                Generation.id == gid,
                Generation.user_id == user.id,
            )
        )
    ).scalar_one_or_none()

    if gen is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    return _to_out(gen)


@router.post("/{gen_id}/rating")
async def rate_generation(
    gen_id: str,
    body: RatingRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> Response:
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from exc

    gen = (
        await session.execute(
            select(Generation).where(
                Generation.id == gid,
                Generation.user_id == user.id,
            )
        )
    ).scalar_one_or_none()

    if gen is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    raw_tracks = (gen.result or {}).get("tracks") or []

    if body.track_index is None:
        # Whole-generation rating (single-output items, or legacy callers).
        gen.rating = None if body.rating == "remove" else GenerationRating(body.rating)
        # Keep the per-track map aligned so both stay consistent.
        if raw_tracks:
            gen.track_ratings = (
                {} if body.rating == "remove"
                else {str(i): body.rating for i in range(len(raw_tracks))}
            )
            flag_modified(gen, "track_ratings")
    else:
        idx = body.track_index
        if not (0 <= idx < len(raw_tracks)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="track_index out of range"
            )
        ratings = dict(gen.track_ratings) if isinstance(gen.track_ratings, dict) else {}
        # Migrate-on-write: if this row still carries only the old gen-level
        # rating, expand it onto every variant BEFORE applying the per-track
        # change — otherwise the untouched sibling would keep inheriting the
        # legacy rating and the two would stay coupled.
        if not ratings and gen.rating is not None:
            legacy = gen.rating.value if isinstance(gen.rating, GenerationRating) else str(gen.rating)
            ratings = {str(i): legacy for i in range(len(raw_tracks))}
        if body.rating == "remove":
            ratings.pop(str(idx), None)
        else:
            ratings[str(idx)] = body.rating
        gen.track_ratings = ratings
        flag_modified(gen, "track_ratings")
        # Mirror to the gen-level field so "Моя коллекция" (which filters on
        # Generation.rating == like) still surfaces the row when ANY variant
        # is liked. dislike-only → dislike; nothing → None.
        vals = set(ratings.values())
        gen.rating = (
            GenerationRating.like if "like" in vals
            else GenerationRating.dislike if "dislike" in vals
            else None
        )

    # Rating never touches is_public — Radio publishing is a separate action.
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{gen_id}/title", response_model=GenerationOut)
async def rename_generation(
    gen_id: str,
    body: RenameRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> GenerationOut:
    """Rename a generation or a single track inside it.

    - body.track_index = None → rename the whole generation (`gen.title`).
    - body.track_index = 0/1 → rename one of the variants stored in
      `result.tracks[idx].title`. The umbrella `gen.title` is also bumped
      when the very first variant is renamed so library card titles stay
      consistent with what the player shows.
    """
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from exc

    gen = (
        await session.execute(
            select(Generation).where(
                Generation.id == gid,
                Generation.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if gen is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    new_title = body.title.strip()[:80]
    if not new_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="title is empty")

    if body.track_index is None:
        gen.title = new_title
    else:
        result = dict(gen.result or {})
        tracks = list(result.get("tracks") or [])
        if not (0 <= body.track_index < len(tracks)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="track_index out of range",
            )
        tracks[body.track_index] = {**tracks[body.track_index], "title": new_title}
        result["tracks"] = tracks
        gen.result = result
        # SQLAlchemy's JSON column needs an explicit flag — a fresh dict
        # assignment is fine in practice, but the helper is the documented
        # safe path.
        flag_modified(gen, "result")
        # Keep the umbrella title aligned with the first variant so library
        # rows render the same string the player shows.
        if body.track_index == 0:
            gen.title = new_title

    await session.commit()
    await session.refresh(gen)
    return _to_out(gen)


class TagsUpdateRequest(BaseModel):
    genre: str | None = Field(default=None, max_length=64)
    mood: str | None = Field(default=None, max_length=32)
    tempo: str | None = Field(default=None, max_length=32)


@router.patch("/{gen_id}/tags", response_model=GenerationOut)
async def update_tags(
    gen_id: str,
    body: TagsUpdateRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> GenerationOut:
    """Update genre / mood / tempo on an existing generation.

    Only non-None fields are written — pass only the fields you want to change.
    Empty string clears the field (sets it to NULL in the DB).
    """
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from exc

    gen = (
        await session.execute(
            select(Generation).where(Generation.id == gid, Generation.user_id == user.id)
        )
    ).scalar_one_or_none()
    if gen is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    if body.genre is not None:
        gen.genre = body.genre.strip()[:64] or None
    if body.mood is not None:
        gen.mood = body.mood.strip()[:32] or None
    if body.tempo is not None:
        gen.tempo = body.tempo.strip()[:32] or None

    await session.commit()
    await session.refresh(gen)
    return _to_out(gen)


@router.post("/{gen_id}/share", response_model=ShareResponse)
async def share_generation(
    gen_id: str,
    request_obj: Any = None,  # intentionally unused, host from header
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> ShareResponse:
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from exc

    gen = (
        await session.execute(
            select(Generation).where(
                Generation.id == gid,
                Generation.user_id == user.id,
                Generation.status == GenerationStatus.completed,
            )
        )
    ).scalar_one_or_none()

    if gen is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="generation not found or not completed",
        )

    if not gen.share_id:
        gen.share_id = secrets.token_urlsafe(8)[:12]
        await session.commit()

    return ShareResponse(
        share_id=gen.share_id,
        share_url=f"/s/{gen.share_id}",
    )


class RetryResponse(BaseModel):
    generation_id: str
    ws_url: str


@router.post("/{gen_id}/retry", response_model=RetryResponse, status_code=status.HTTP_202_ACCEPTED)
async def retry_generation(
    gen_id: str,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> RetryResponse:
    """Re-queue a failed or completed generation with the same parameters."""
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from exc

    orig = (
        await session.execute(
            select(Generation).where(Generation.id == gid, Generation.user_id == user.id)
        )
    ).scalar_one_or_none()

    if orig is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    if orig.status not in (GenerationStatus.failed, GenerationStatus.completed):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="only failed or completed generations can be retried",
        )

    new_gen = Generation(
        id=uuid.uuid4(),
        user_id=user.id,
        type=orig.type,
        status=GenerationStatus.queued,
        title=orig.title,
        params=orig.params,
        cost_tokens=orig.cost_tokens,
        genre=orig.genre,
        mood=orig.mood,
        tempo=orig.tempo,
        vocal=orig.vocal,
    )
    session.add(new_gen)
    await session.flush()

    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    pool = await create_pool(redis_settings)
    await pool.enqueue_job("run_generation", str(new_gen.id))
    await pool.aclose()  # type: ignore[attr-defined]

    await session.commit()

    fwd_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    proto = fwd_proto or request.url.scheme
    scheme = "wss" if proto == "https" else "ws"
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    ws_url = f"{scheme}://{host}/api/v1/ws/generation/{new_gen.id}"
    return RetryResponse(generation_id=str(new_gen.id), ws_url=ws_url)


@router.delete("/{gen_id}/share")
async def unshare_generation(
    gen_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> Response:
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from exc

    gen = (
        await session.execute(
            select(Generation).where(
                Generation.id == gid,
                Generation.user_id == user.id,
            )
        )
    ).scalar_one_or_none()

    if gen is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    gen.share_id = None
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{gen_id}/radio", response_model=RadioToggleResponse)
async def toggle_radio(
    gen_id: str,
    body: RadioToggleRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> RadioToggleResponse:
    """Publish (or un-publish) a completed song/instrumental/cover to the Radio.

    Only the owner of the generation can toggle this. SFX and cover-art are
    not eligible. Tracks must have a mood set to be published.
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
                Generation.user_id == user.id,
            )
        )
    ).scalar_one_or_none()

    if gen is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    if gen.status != GenerationStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="generation is not completed",
        )

    if gen.type not in RADIO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="this generation type is not eligible for the radio",
        )

    result_data = gen.result if isinstance(gen.result, dict) else {}
    tracks = result_data.get("tracks") if isinstance(result_data, dict) else None
    track_count = len(tracks) if isinstance(tracks, list) else 0

    # Work with the mutable list of currently-published indices.
    current_indices: list[int] = list(gen.published_track_indices or [])
    # Backward-compat: if new column is empty but old column has a value, seed it.
    if not current_indices and gen.published_track_index is not None:
        current_indices = [gen.published_track_index]

    if body.is_public:
        idx = 0 if body.track_index is None else int(body.track_index)
        if track_count == 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="generation has no playable tracks",
            )
        if idx < 0 or idx >= track_count:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"track_index out of range (have {track_count} tracks)",
            )
        if idx not in current_indices:
            current_indices.append(idx)
        current_indices = sorted(current_indices)
    else:
        # Remove the specific variant; if track_index is None, remove all.
        if body.track_index is not None:
            current_indices = [i for i in current_indices if i != body.track_index]
        else:
            current_indices = []

    gen.published_track_indices = current_indices if current_indices else None
    gen.published_track_index = current_indices[0] if current_indices else None
    gen.is_public = bool(current_indices)
    if gen.is_public:
        gen.published_at = datetime.now(UTC)
    else:
        gen.published_at = None

    await session.commit()
    return RadioToggleResponse(
        id=str(gen.id),
        is_public=bool(gen.is_public),
        published_at=gen.published_at.isoformat() if gen.published_at else None,
        published_track_index=gen.published_track_index,
    )


# ---------------------------------------------------------------------------
# Trash (soft-delete) endpoints
# ---------------------------------------------------------------------------


@router.delete("/{gen_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_generation(
    gen_id: str,
    track_index: int | None = None,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> Response:
    """Soft-delete a generation or just one of its variants.

    Each Suno generation produces V1 and V2; deleting one variant must
    never take its sibling with it. When ``track_index`` is set we add
    that index to ``deleted_track_indices`` and unpublish *only that
    variant* from Radio. When the index is omitted, or after the last
    surviving variant gets trashed, we set ``deleted_at`` on the whole
    row so it shows up in the trash list.
    """
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from exc

    gen = (
        await session.execute(
            select(Generation).where(Generation.id == gid, Generation.user_id == user.id)
        )
    ).scalar_one_or_none()

    if gen is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    now = datetime.now(UTC)
    raw_tracks = (gen.result or {}).get("tracks") or []
    trashed = dict(gen.track_trashed_at) if isinstance(gen.track_trashed_at, dict) else {}

    if track_index is not None:
        if not (0 <= track_index < len(raw_tracks)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="track_index out of range",
            )
        # Move ONLY this variant to the trash (recoverable for 7 days). The
        # sibling keeps living in the library — the two are fully independent.
        trashed[str(track_index)] = now.isoformat()
        gen.track_trashed_at = trashed
        flag_modified(gen, "track_trashed_at")
        # Keep the legacy hidden-index mirror consistent for any old readers.
        gen.deleted_track_indices = sorted({int(k) for k in trashed})
        flag_modified(gen, "deleted_track_indices")

        # Unpublish only the targeted variant from Radio.
        pub_indices = list(gen.published_track_indices or [])
        if gen.published_track_index == track_index:
            gen.published_track_index = None
        if track_index in pub_indices:
            pub_indices.remove(track_index)
            gen.published_track_indices = pub_indices or None

        live = [i for i in range(len(raw_tracks)) if str(i) not in trashed]
        if live:
            # At least one variant remains → the row stays in the library.
            if not pub_indices and gen.published_track_index is None:
                gen.is_public = False
                gen.published_at = None
            await session.commit()
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        # Otherwise every variant is trashed → fall through to whole-row trash.

    # Whole-generation soft-delete (no track_index, OR last variant just left).
    # Mark every variant trashed-now too, so the trash view + 7-day purge treat
    # single-output items and multi-variant rows uniformly.
    if raw_tracks:
        for i in range(len(raw_tracks)):
            trashed.setdefault(str(i), now.isoformat())
        gen.track_trashed_at = trashed
        flag_modified(gen, "track_trashed_at")
        gen.deleted_track_indices = sorted({int(k) for k in trashed})
        flag_modified(gen, "deleted_track_indices")
    gen.deleted_at = now
    if gen.is_public:
        gen.is_public = False
        gen.published_track_index = None
        gen.published_track_indices = None
        gen.published_at = None
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{gen_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
async def restore_generation(
    gen_id: str,
    track_index: int | None = None,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> Response:
    """Restore a trashed generation — or just one trashed variant — back to
    the library.

    - ``track_index`` set → restore only that variant (the sibling is
      untouched). If the row was fully trashed, clearing one variant also
      brings the row back out of the whole-row trash.
    - ``track_index`` omitted → restore the whole generation and all its
      variants.
    """
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from exc

    gen = (
        await session.execute(
            select(Generation).where(Generation.id == gid, Generation.user_id == user.id)
        )
    ).scalar_one_or_none()

    trashed = dict(gen.track_trashed_at) if gen and isinstance(gen.track_trashed_at, dict) else {}
    is_trashed = gen is not None and (gen.deleted_at is not None or bool(trashed))
    if gen is None or not is_trashed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    if track_index is not None:
        trashed.pop(str(track_index), None)
        gen.track_trashed_at = trashed
        flag_modified(gen, "track_trashed_at")
        gen.deleted_track_indices = sorted({int(k) for k in trashed}) or None
        flag_modified(gen, "deleted_track_indices")
        # Any variant back in the library → the row is no longer fully trashed.
        gen.deleted_at = None
    else:
        gen.deleted_at = None
        gen.track_trashed_at = {}
        gen.deleted_track_indices = None
        flag_modified(gen, "track_trashed_at")
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
