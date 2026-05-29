"""Generation history, rating, share-link, and Radio publishing."""

from __future__ import annotations

import contextlib
import secrets
import uuid
from datetime import UTC, datetime
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


class TrackOut(BaseModel):
    audio_url: str
    audio_id: str
    image_url: str | None = None
    duration: int = 0
    title: str = ""


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


def _to_out(gen: Generation) -> GenerationOut:
    result: dict[str, Any] = gen.result or {}
    raw_tracks = result.get("tracks", [])
    tracks = [
        TrackOut(
            # Route audio through our backend so crossOrigin="anonymous" works
            # in the player (Suno CDN doesn't send Access-Control-Allow-Origin).
            audio_url=f"/api/v1/tracks/{gen.id}/{i}/stream",
            audio_id=t.get("audio_id", ""),
            image_url=t.get("image_url"),
            duration=int(t.get("duration", 0)),
            title=t.get("title", gen.title),
        )
        for i, t in enumerate(raw_tracks)
        if t.get("audio_url")
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
    """List generations the user has moved to trash (not yet purged)."""
    from sqlalchemy import func

    stmt = (
        select(Generation)
        .where(Generation.user_id == user.id, Generation.deleted_at.is_not(None))
    )
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(desc(Generation.deleted_at)).offset((page - 1) * limit).limit(limit)
    rows = (await session.execute(stmt)).scalars().all()
    return HistoryPage(items=[_to_out(g) for g in rows], total=total, page=page, limit=limit)


@router.delete("/trash/purge", status_code=status.HTTP_204_NO_CONTENT)
async def purge_trash(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> Response:
    """Permanently delete all trashed items for this user."""
    from sqlalchemy import delete as sql_delete

    await session.execute(
        sql_delete(Generation).where(
            Generation.user_id == user.id,
            Generation.deleted_at.is_not(None),
        )
    )
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

    if body.rating == "remove":
        gen.rating = None
    else:
        gen.rating = GenerationRating(body.rating)

    # Rating (like/dislike/remove) only affects Generation.rating — never touches is_public.
    # Public Radio publishing is a separate explicit action via POST /history/{id}/radio.
    # Liked own tracks appear in "Моя коллекция" via the my_collection query filter,
    # but is_public stays false unless the user explicitly publishes via the Radio button.

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

    # Require mood for radio publication
    if body.is_public and not gen.mood:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Треки без настроения не могут быть опубликованы в радио. Укажите настроение при создании трека.",
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
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> Response:
    """Move a generation to the trash (soft-delete).  Auto-purged after 7 days."""
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

    gen.deleted_at = datetime.now(UTC)
    # Un-publish from Radio when trashed.
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
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> Response:
    """Restore a soft-deleted generation back to the user's library."""
    try:
        gid = uuid.UUID(gen_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from exc

    gen = (
        await session.execute(
            select(Generation).where(Generation.id == gid, Generation.user_id == user.id)
        )
    ).scalar_one_or_none()

    if gen is None or gen.deleted_at is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    gen.deleted_at = None
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
