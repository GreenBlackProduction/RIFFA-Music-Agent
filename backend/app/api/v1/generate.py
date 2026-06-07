"""Generation endpoints — queues Arq tasks and returns generation_id + ws_url."""

import random
import re as _re_naming
import secrets
import uuid
from contextlib import suppress
from typing import Any, Literal

import boto3
from arq import create_pool
from arq.connections import RedisSettings
from botocore.client import Config
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.deps import current_user, db_session
from app.core.limiter import limiter
from app.db.models import Generation, GenerationStatus, GenerationType, User
from app.services.mood_canonical import canonical_mood
from app.api.v1.tracks import _RIFFA_SUFFIX as _TRK_SUFFIX, _resolve_artist, format_track_name

router = APIRouter(prefix="/generate", tags=["generate"])

# Token costs per generation type.
# NB: balance_tokens stored as int — SFX по дизайну 0.5, но округляем до 1 пока
# не введём дробные токены на уровне БД. Лимиты выровнены со StudioPage UI.
COSTS: dict[GenerationType, int] = {
    GenerationType.song: 2,
    GenerationType.instrumental: 2,
    GenerationType.occasion: 2,
    GenerationType.sound_effect: 1,
    GenerationType.cover_song: 2,
    GenerationType.extend: 2,
    GenerationType.wav_convert: 1,
    GenerationType.cover_art: 1,   # cost varies by model; UI enforces the right amount
}

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class GenerateResponse(BaseModel):
    generation_id: str
    ws_url: str


class SongRequest(BaseModel):
    # Description can be empty when the agent supplies a finalised brief via
    # `agent_prompt` + `agent_music_params` — the worker uses those instead.
    description: str = Field(default="", max_length=1000)
    text_mode: Literal["ai", "custom", "none"] = "ai"
    lyrics: str = Field(default="", max_length=5000)
    genre: str = Field(default="", max_length=64)
    custom_genre: str = Field(default="", max_length=128)
    mood: str = Field(default="", max_length=32)
    tempo: str = Field(default="", max_length=32)
    vocal: str = Field(default="", max_length=32)
    # Optional pre-built music prompt from the AgentChat conversation. When present,
    # the music-prompt enricher uses it as the high-priority signal instead of
    # building a new one from the raw description+presets.
    agent_prompt: str = Field(default="", max_length=5000)
    agent_music_params: dict[str, object] = Field(default_factory=dict)
    agent_research_notes: str = Field(default="", max_length=2000)
    # A/B-test stamps echoed from /agent/chat — saved into generation.params
    # so we can correlate later user ratings back to a specific prompt
    # version and model. Empty when the user bypassed the agent.
    agent_prompt_version: str = Field(default="", max_length=32)
    agent_model: str = Field(default="", max_length=64)
    # User-facing track name. Suno V5.5 limit (`title`) is 80 chars.
    track_name: str = Field(default="", max_length=80)
    idempotency_key: str = Field(default="", max_length=64)


class InstrumentalRequest(BaseModel):
    description: str = Field(default="", max_length=500)
    genre: str = Field(default="", max_length=64)
    custom_genre: str = Field(default="", max_length=128)
    mood: str = Field(default="", max_length=32)
    tempo: str = Field(default="", max_length=32)
    agent_prompt: str = Field(default="", max_length=5000)
    agent_music_params: dict[str, object] = Field(default_factory=dict)
    agent_research_notes: str = Field(default="", max_length=2000)
    # A/B-test stamps echoed from /agent/chat — saved into generation.params
    # so we can correlate later user ratings back to a specific prompt
    # version and model. Empty when the user bypassed the agent.
    agent_prompt_version: str = Field(default="", max_length=32)
    agent_model: str = Field(default="", max_length=64)
    track_name: str = Field(default="", max_length=80)
    idempotency_key: str = Field(default="", max_length=64)


class SoundEffectRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=500)
    agent_prompt: str = Field(default="", max_length=5000)
    agent_music_params: dict[str, object] = Field(default_factory=dict)
    agent_research_notes: str = Field(default="", max_length=2000)
    # A/B-test stamps echoed from /agent/chat — saved into generation.params
    # so we can correlate later user ratings back to a specific prompt
    # version and model. Empty when the user bypassed the agent.
    agent_prompt_version: str = Field(default="", max_length=32)
    agent_model: str = Field(default="", max_length=64)
    track_name: str = Field(default="", max_length=80)
    idempotency_key: str = Field(default="", max_length=64)


class CoverArtRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    model: str = Field(default="nano-banana", max_length=64)
    title: str = Field(default="", max_length=80)
    idempotency_key: str = Field(default="", max_length=64)
    # When set, the cover is generated image→image from this source (used by
    # "enhance" to keep the original composition). Empty → plain text→image.
    reference_url: str = Field(default="", max_length=1024)


class OccasionRequest(BaseModel):
    occasion_type: str = Field(min_length=1, max_length=64)
    answers: dict[str, str] = Field(default_factory=dict)
    genre: str = Field(default="", max_length=64)
    mood: str = Field(default="", max_length=32)
    vocal: str = Field(default="", max_length=32)
    agent_prompt: str = Field(default="", max_length=5000)
    agent_music_params: dict[str, object] = Field(default_factory=dict)
    agent_research_notes: str = Field(default="", max_length=2000)
    # A/B-test stamps echoed from /agent/chat — saved into generation.params
    # so we can correlate later user ratings back to a specific prompt
    # version and model. Empty when the user bypassed the agent.
    agent_prompt_version: str = Field(default="", max_length=32)
    agent_model: str = Field(default="", max_length=64)
    idempotency_key: str = Field(default="", max_length=64)


class CoverSongRequest(BaseModel):
    upload_url: str = Field(min_length=1, max_length=1024)
    genre: str = Field(default="", max_length=64)
    custom_genre: str = Field(default="", max_length=128)
    mood: str = Field(default="", max_length=32)
    tempo: str = Field(default="", max_length=32)
    style: str = Field(default="", max_length=500)
    lyrics: str = Field(default="", max_length=5000)
    vocal_gender: str | None = None
    instrumental: bool = False
    # Suno styleWeight / weirdnessConstraint — both 0..1, sent verbatim to
    # /generate/upload-cover when provided. Optional.
    style_weight: float | None = Field(default=None, ge=0.0, le=1.0)
    weirdness_constraint: float | None = Field(default=None, ge=0.0, le=1.0)
    track_name: str = Field(default="", max_length=80)
    # Original uploaded filename (with or without extension). Used to seed the
    # cover title when the user didn't type a manual name.
    source_name: str = Field(default="", max_length=160)
    idempotency_key: str = Field(default="", max_length=64)


class ExtendRequest(BaseModel):
    generation_id: str
    audio_id: str
    prompt: str = Field(default="", max_length=5000)
    style: str = Field(default="", max_length=500)
    continue_at: int = Field(default=0, ge=0)
    idempotency_key: str = Field(default="", max_length=64)


class WavConvertRequest(BaseModel):
    generation_id: str
    audio_id: str
    idempotency_key: str = Field(default="", max_length=64)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _enqueue(ctx_redis_url: str, gen_id: str) -> None:
    redis_settings = RedisSettings.from_dsn(ctx_redis_url)
    pool = await create_pool(redis_settings)
    await pool.enqueue_job("run_generation", gen_id)
    await pool.aclose()  # type: ignore[attr-defined]


def _ws_url(request: Request, gen_id: str) -> str:
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    proto = forwarded_proto or request.url.scheme
    scheme = "wss" if proto == "https" else "ws"
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{scheme}://{host}/api/v1/ws/generation/{gen_id}"


async def _find_idempotent(
    session: AsyncSession,
    user_id: int,
    gen_type: GenerationType,
    idempotency_key: str,
) -> Generation | None:
    """Return a recent generation created by this user under the same
    idempotency key, if any. Guards against double-submits (network retry,
    double-click) that would otherwise create two generations and charge twice.

    Window is 1 hour — long enough to absorb retries, short enough that an
    intentional re-run an hour later still goes through.
    """
    if not idempotency_key:
        return None
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    return (
        await session.execute(
            select(Generation)
            .where(
                Generation.user_id == user_id,
                Generation.type == gen_type,
                Generation.deleted_at.is_(None),
                Generation.created_at >= cutoff,
                Generation.params["idempotency_key"].astext == idempotency_key,
            )
            .order_by(Generation.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _create_generation(
    session: AsyncSession,
    user: User,
    gen_type: GenerationType,
    params: dict[str, Any],
    title: str = "",
    genre: str = "",
    mood: str = "",
    tempo: str = "",
    vocal: str = "",
    idempotency_key: str = "",
) -> tuple[Generation, bool]:
    """Create a queued generation, or return an existing one for a repeated
    idempotency key. Returns ``(generation, created)`` — ``created=False`` means
    the caller must NOT re-enqueue or re-charge (it's a duplicate submit).
    """
    existing = await _find_idempotent(session, user.id, gen_type, idempotency_key)
    if existing is not None:
        return existing, False

    cost = COSTS.get(gen_type, 0)
    if not user.is_admin and user.balance_tokens < cost:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Недостаточно токенов: нужно {cost}, есть {user.balance_tokens}",
        )

    # Canonicalise mood at write-time so Radio filters can find the track.
    # Falls back to the raw value when no alias matches — the track stays
    # visible in "all" view, just not under a specific mood category.
    normalised_mood = canonical_mood(mood) or mood

    # Clamp the category columns to their DB widths — the full values live in
    # `params` (what the worker actually generates from). A long free-text
    # custom genre would otherwise overflow genre VARCHAR(64) and 500 the request.
    gen = Generation(
        id=uuid.uuid4(),
        user_id=user.id,
        type=gen_type,
        status=GenerationStatus.queued,
        title=title[:120],
        params=params,
        cost_tokens=cost,
        genre=(genre or "")[:64] or None,
        mood=(normalised_mood or "")[:32] or None,
        tempo=(tempo or "")[:32] or None,
        vocal=(vocal or "")[:32] or None,
    )
    session.add(gen)
    await session.flush()
    return gen, True


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/song", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/minute")
async def generate_song(
    body: SongRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    gen, created = await _create_generation(
        session,
        user,
        GenerationType.song,
        params=body.model_dump(),
        title=body.track_name,
        genre=body.genre or body.custom_genre,
        mood=body.mood,
        tempo=body.tempo,
        vocal=body.vocal,
        idempotency_key=body.idempotency_key,
    )
    await session.commit()
    if created:
        await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post(
    "/instrumental", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED
)
@limiter.limit("20/minute")
async def generate_instrumental(
    body: InstrumentalRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    gen, created = await _create_generation(
        session,
        user,
        GenerationType.instrumental,
        params=body.model_dump(),
        title=body.track_name,
        genre=body.genre or body.custom_genre,
        mood=body.mood,
        tempo=body.tempo,
        idempotency_key=body.idempotency_key,
    )
    await session.commit()
    if created:
        await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post(
    "/sound_effect", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED
)
@limiter.limit("20/minute")
async def generate_sound_effect(
    body: SoundEffectRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    # Use supplied track_name; fall back to first 60 chars of the user's prompt.
    title = body.track_name.strip() or body.prompt.strip()[:60]
    gen, created = await _create_generation(
        session,
        user,
        GenerationType.sound_effect,
        params=body.model_dump(),
        title=title,
        idempotency_key=body.idempotency_key,
    )
    await session.commit()
    if created:
        await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post(
    "/cover_art", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED
)
@limiter.limit("20/minute")
async def generate_cover_art(
    body: CoverArtRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    title = body.title.strip() or body.prompt.strip()[:60] or "Обложка"
    gen, created = await _create_generation(
        session,
        user,
        GenerationType.cover_art,
        params=body.model_dump(),
        title=title,
        idempotency_key=body.idempotency_key,
    )
    await session.commit()
    if created:
        await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post("/occasion", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/minute")
async def generate_occasion(
    body: OccasionRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    # Occasion uses song under the hood
    gen, created = await _create_generation(
        session,
        user,
        GenerationType.occasion,
        params=body.model_dump(),
        genre=body.genre,
        mood=body.mood,
        vocal=body.vocal,
        idempotency_key=body.idempotency_key,
    )
    await session.commit()
    if created:
        await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post(
    "/cover_song", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED
)
@limiter.limit("20/minute")
async def generate_cover_song(
    body: CoverSongRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    # Title seed: user's manual name wins; otherwise the uploaded filename
    # (extension stripped); otherwise a generic fallback. Then append "Cover V{N}"
    # where N counts the caller's existing covers of the same base.
    artist = _resolve_artist(user)
    manual = body.track_name.strip()
    if manual:
        base = _extract_short_title(manual)
    else:
        fname = body.source_name.strip()
        base = _re_naming.sub(r"\.[A-Za-z0-9]{1,5}$", "", fname).strip() if fname else ""
    if not base:
        base = "Cover"
    version = await _next_version(
        session,
        user_id=user.id,
        gen_type=GenerationType.cover_song,
        base_name=base,
        marker="Cover V",
        start=1,
    )
    cover_title = format_track_name(artist, f"{base} Cover V{version}")

    gen, created = await _create_generation(
        session,
        user,
        GenerationType.cover_song,
        params=body.model_dump(),
        title=cover_title,
        genre=body.genre or body.custom_genre,
        mood=body.mood,
        tempo=body.tempo,
        idempotency_key=body.idempotency_key,
    )
    await session.commit()
    if created:
        await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post("/extend", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/minute")
async def extend_track(
    body: ExtendRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    gen, created = await _create_generation(
        session,
        user,
        GenerationType.extend,
        params=body.model_dump(),
        idempotency_key=body.idempotency_key,
    )
    await session.commit()
    if created:
        await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post(
    "/wav_convert", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED
)
@limiter.limit("20/minute")
async def convert_to_wav(
    body: WavConvertRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    # Inherit title from parent generation so the WAV card has a meaningful name.
    parent_title = ""
    try:
        parent_gid = uuid.UUID(body.generation_id)
        parent_gen = (
            await session.execute(
                select(Generation).where(
                    Generation.id == parent_gid, Generation.user_id == user.id
                )
            )
        ).scalar_one_or_none()
        if parent_gen:
            parent_title = parent_gen.title or ""
    except (ValueError, Exception):
        pass

    wav_title = f"{parent_title} WAV" if parent_title else "WAV"

    gen, created = await _create_generation(
        session,
        user,
        GenerationType.wav_convert,
        params=body.model_dump(),
        title=wav_title,
        idempotency_key=body.idempotency_key,
    )
    await session.commit()
    if created:
        await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


# ── Active / recent generations — sidebar sync ─────────────────────────────


@router.get("/active", status_code=status.HTTP_200_OK)
async def list_active_generations(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> list[dict[str, Any]]:
    """Return generations that are still running or finished within the last
    hour so the sidebar "Active generations" tray can hydrate on app start.

    Frontend currently calls this on every page load — returning [] was OK
    (the page worked) but the 404 spam in DevTools made other regressions
    harder to spot. Now returns a real list, capped at 20 rows.
    """
    from datetime import datetime, timedelta, timezone
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    rows = (
        await session.execute(
            select(Generation)
            .where(
                Generation.user_id == user.id,
                Generation.deleted_at.is_(None),
                (Generation.status.in_(
                    [GenerationStatus.queued, GenerationStatus.processing]
                )) | (Generation.completed_at.is_not(None) & (Generation.completed_at >= cutoff)),
            )
            .order_by(Generation.created_at.desc())
            .limit(20)
        )
    ).scalars().all()

    return [
        {
            "id": str(g.id),
            "type": g.type.value if hasattr(g.type, "value") else str(g.type),
            "title": g.title or "",
            "status": g.status.value if hasattr(g.status, "value") else str(g.status),
            "progress": int((g.params or {}).get("progress", 0)) if g.status != GenerationStatus.completed else 100,
            "step": (g.params or {}).get("step"),
            "error": g.error_message,
            "result": g.result if g.status == GenerationStatus.completed else None,
        }
        for g in rows
    ]


# ── Similar track — remix a published Radio track ──────────────────────────


# Trailing version markers we add ourselves: " Vers2", " Cover V3", " (WAV)".
# Stripped before re-versioning so chains never stack ("Name Vers2 Vers3").
_VERSION_SUFFIX_RE = _re_naming.compile(
    r"\s*(?:[-–·]\s*)?(?:vers|version|v|cover\s*v)\s*\d+\s*$",
    _re_naming.IGNORECASE,
)


def _extract_short_title(title: str) -> str:
    """Strip 'Artist - ' prefix, '(RIFFAMusic)' suffix and any trailing version
    marker to get the bare base track name.

    Prevents title-duplication like 'Похожий — Похожий — ...' and version
    stacking like 'Name Vers2 Vers3' when chaining generate_similar calls.
    """
    t = title.strip()
    t = t.replace(f" {_TRK_SUFFIX}", "").replace(_TRK_SUFFIX, "").strip()
    # 'Artist - Track Name' → 'Track Name'
    if " - " in t:
        t = t.split(" - ", 1)[1].strip()
    # Drop a trailing 'Vers2' / 'Cover V3' so re-versioning starts from the base.
    base = _VERSION_SUFFIX_RE.sub("", t).strip()
    return base or t or title


async def _next_version(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    gen_type: GenerationType,
    base_name: str,
    marker: str,
    start: int,
) -> int:
    """Return the next version number for a versioned title family.

    Counts the caller's existing generations of ``gen_type`` whose title already
    carries ``marker`` (e.g. 'Vers', 'Cover V') for the same ``base_name``, then
    returns count + ``start``. ``start`` lets 'similar' begin at 2 (the source is
    implicitly version 1) while 'cover' begins at 1.
    """
    if not base_name:
        return start
    pattern = f"%{base_name}%{marker}%"
    existing = (
        await session.execute(
            select(func.count(Generation.id)).where(
                Generation.user_id == user_id,
                Generation.type == gen_type,
                Generation.deleted_at.is_(None),
                Generation.title.ilike(pattern),
            )
        )
    ).scalar_one()
    return int(existing or 0) + start


def _remix_agent_params(agent_mp: dict[str, Any]) -> dict[str, Any]:
    """Light remix: keep genre+mood, shuffle techniques/instruments, jitter BPM ±10 %.

    The point is to produce a track that's recognisably the same family as the
    source but not a clone — different drum pattern, different lead sound,
    nudged tempo. We intentionally don't touch genre or mood: those are the
    user's "I want more like this" signal.
    """
    if not isinstance(agent_mp, dict):
        return {}

    remixed = dict(agent_mp)

    # Shuffle techniques: keep up to 3 from source.
    techniques = remixed.get("techniques")
    if isinstance(techniques, list) and len(techniques) > 1:
        sample_size = min(3, max(1, len(techniques) - 1))
        remixed["techniques"] = random.sample(techniques, sample_size)

    # Shuffle key_instruments: keep up to 5, drop 1-2 randomly.
    key_instruments = remixed.get("key_instruments")
    if isinstance(key_instruments, list) and len(key_instruments) > 2:
        sample_size = max(2, len(key_instruments) - random.randint(1, 2))
        remixed["key_instruments"] = random.sample(key_instruments, sample_size)

    # BPM jitter: extract the first integer from "112 BPM" / "70-80 BPM" and
    # shift it ±10 %, then write back as "<bpm> BPM".
    bpm_str = str(remixed.get("suggested_bpm") or "").strip()
    if bpm_str:
        import re
        match = re.search(r"\d+", bpm_str)
        if match:
            base = int(match.group())
            shift = random.uniform(-0.10, 0.10)
            new_bpm = max(40, int(round(base * (1 + shift))))
            remixed["suggested_bpm"] = f"{new_bpm} BPM"

    # Drop subgenre about half the time — forces the prompt engineer to pick
    # a fresh angle within the parent genre.
    if "subgenre" in remixed and random.random() < 0.5:
        remixed.pop("subgenre", None)

    return remixed


@router.post(
    "/similar/{generation_id}",
    response_model=GenerateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit("20/minute")
async def generate_similar(
    generation_id: str,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    """Launch a fresh song/instrumental musically similar to ``generation_id``.

    The source must be a published (Radio) track so we don't leak private
    libraries. Cost equals a regular song/instrumental. The new generation
    lands in *the caller's* library — not the original author's.
    """
    try:
        src_gid = uuid.UUID(generation_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="bad generation_id"
        ) from exc

    src = (
        await session.execute(select(Generation).where(Generation.id == src_gid))
    ).scalar_one_or_none()
    if src is None or src.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="track not found")

    # Owner can always remix their own; others only if it's on Radio.
    if src.user_id != user.id and not src.is_public:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="track is not on radio",
        )

    # Source must be a vocal/instrumental track — covers/SFX/cover_art aren't
    # remixable through this flow.
    new_type = (
        GenerationType.instrumental
        if src.type == GenerationType.instrumental
        else GenerationType.song
    )
    if src.type not in (
        GenerationType.song,
        GenerationType.instrumental,
        GenerationType.occasion,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="similar generation supports only song / instrumental sources",
        )

    src_params = dict(src.params or {})
    src_agent_mp = src_params.get("agent_music_params") or {}
    remixed_mp = _remix_agent_params(src_agent_mp)

    # New params re-use the same agent envelope so the existing worker pipeline
    # (tasks/__init__.py::run_generation) picks up genre+mood+remixed knobs.
    new_params: dict[str, Any] = {
        "description": src_params.get("description") or src.prompt or "",
        "genre": src.genre or "",
        "custom_genre": src_params.get("custom_genre", ""),
        "mood": src.mood or "",
        "tempo": src.tempo or "",
        "agent_music_params": remixed_mp,
        # text_mode=ai so the model writes fresh lyrics — copying the original
        # would defeat the "similar but new" goal.
        "text_mode": "ai" if new_type == GenerationType.song else "none",
        "vocal": src.vocal or "" if new_type == GenerationType.song else "",
        "similar_source_generation_id": generation_id,
    }

    # Build canonical title for the new owner: "CurrentUser - Track Name (RIFFAMusic)".
    # Never carry over the source's artist name or prefix-stack "Похожий — Похожий".
    artist = _resolve_artist(user)
    src_short = _extract_short_title(src.title or "трек")
    # Source track is implicitly version 1 → similars start at Vers2 and count up.
    version = await _next_version(
        session,
        user_id=user.id,
        gen_type=new_type,
        base_name=src_short,
        marker="Vers",
        start=2,
    )
    new_title = format_track_name(artist, f"{src_short} Vers{version}")

    # Populate genre/mood/tempo — fall back to agent_music_params if src fields are blank.
    bpm_str = str(remixed_mp.get("suggested_bpm") or "").strip()
    genre_val = (src.genre or remixed_mp.get("genre") or "")[:64]
    mood_val = (src.mood or remixed_mp.get("mood") or "")[:32]
    tempo_val = (src.tempo or bpm_str or "")[:32]

    gen, created = await _create_generation(
        session,
        user,
        new_type,
        params=new_params,
        title=new_title,
        genre=genre_val,
        mood=mood_val,
        tempo=tempo_val,
        vocal=src.vocal or "" if new_type == GenerationType.song else "",
    )
    await session.commit()
    if created:
        await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


# ---------------------------------------------------------------------------
# Upload presigned URL endpoint (temporary workaround for upload router issue)
# ---------------------------------------------------------------------------


class PresignedUploadResponse(BaseModel):
    upload_url: str
    public_url: str
    expires_in: int


def _get_s3_client(settings: Settings) -> Any:
    """Create boto3 S3 client for MinIO/S3."""
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4"),
    )


def _ensure_bucket_cors(s3_client: Any, bucket_name: str) -> None:
    """Ensure bucket has CORS configuration for frontend uploads."""
    cors_config = {
        "CORSRules": [
            {
                "AllowedOrigins": [
                    "http://localhost:5173",
                    "http://127.0.0.1:5173",
                    "https://riffastudio.site",
                    "https://beta.riffastudio.site",
                ],
                "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
                "AllowedHeaders": ["*"],
                "ExposeHeaders": ["ETag"],
            }
        ]
    }
    # Ignore CORS errors in development — MinIO may not support them yet.
    with suppress(Exception):
        s3_client.put_bucket_cors(Bucket=bucket_name, CORSConfiguration=cors_config)


_COVER_ALLOWED_EXTS: frozenset[str] = frozenset({"mp3", "wav", "m4a", "ogg"})


class CoverUploadUrlRequest(BaseModel):
    # File extension hint (mp3 / wav / m4a / ogg). Defaults to mp3 for
    # backwards compatibility — older clients submitted no body at all.
    extension: str = Field(default="mp3", max_length=8)


@router.post("/upload-cover-url", response_model=PresignedUploadResponse)
async def get_cover_upload_url(
    body: CoverUploadUrlRequest | None = None,
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> PresignedUploadResponse:
    """Generate a presigned PUT URL for uploading a cover-song source audio.

    The client uploads the file directly to S3/MinIO using ``upload_url`` and
    then passes ``public_url`` to ``/api/v1/generate/cover_song``. If the
    storage backend is not reachable we raise 503 instead of silently
    handing out a mock URL — the cover flow used to fail downstream with a
    confusing error because Suno could not download a localhost mock path.
    """
    ext = (body.extension if body else "mp3").lower().lstrip(".")
    if ext not in _COVER_ALLOWED_EXTS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Поддерживаемые форматы кавера: {', '.join(sorted(_COVER_ALLOWED_EXTS))}.",
        )
    token = secrets.token_urlsafe(16)
    filename = f"covers/{user.id}/{token}.{ext}"
    expires_in = 900  # 15 minutes

    try:
        s3_client = _get_s3_client(settings)
        try:
            s3_client.head_bucket(Bucket=settings.s3_bucket_media)
        except Exception:
            s3_client.create_bucket(Bucket=settings.s3_bucket_media)
        _ensure_bucket_cors(s3_client, settings.s3_bucket_media)

        upload_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.s3_bucket_media,
                "Key": filename,
            },
            ExpiresIn=expires_in,
        )
        public_url = f"{settings.s3_public_base_url}/{filename}"
        # Replace internal Docker hostname with the public nginx proxy path so
        # browsers can reach MinIO. Nginx forwards Host: minio:9000 so the S3
        # signature (computed for that host) validates correctly.
        s3_internal = settings.s3_endpoint.rstrip("/")
        s3_public_base = settings.s3_public_base_url.rstrip("/").rsplit("/", 1)[0]
        upload_url = upload_url.replace(s3_internal, s3_public_base)
    except Exception as exc:
        # MinIO/S3 unavailable — fail loudly so the UI can show the real
        # cause instead of attempting a PUT against a non-existent host.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Хранилище для загрузки кавер-треков недоступно. "
                "Проверьте, что MinIO/S3 запущен и доступен."
            ),
        ) from exc

    return PresignedUploadResponse(
        upload_url=upload_url,
        public_url=public_url,
        expires_in=expires_in,
    )
