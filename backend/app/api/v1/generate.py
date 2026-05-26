"""Generation endpoints — queues Arq tasks and returns generation_id + ws_url."""

from __future__ import annotations

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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.deps import current_user, db_session
from app.core.limiter import limiter
from app.db.models import Generation, GenerationStatus, GenerationType, User

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
    description: str = Field(min_length=1, max_length=1000)
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
    agent_music_params: dict[str, object] = Field(default_factory=dict)
    agent_research_notes: str = Field(default="", max_length=2000)
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
    track_name: str = Field(default="", max_length=80)
    idempotency_key: str = Field(default="", max_length=64)


class SoundEffectRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=500)
    agent_prompt: str = Field(default="", max_length=5000)
    agent_music_params: dict[str, object] = Field(default_factory=dict)
    agent_research_notes: str = Field(default="", max_length=2000)
    track_name: str = Field(default="", max_length=80)
    idempotency_key: str = Field(default="", max_length=64)


class CoverArtRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    model: str = Field(default="nano-banana", max_length=64)
    title: str = Field(default="", max_length=80)
    idempotency_key: str = Field(default="", max_length=64)


class OccasionRequest(BaseModel):
    occasion_type: str = Field(min_length=1, max_length=64)
    answers: dict[str, str] = Field(default_factory=dict)
    genre: str = Field(default="", max_length=64)
    mood: str = Field(default="", max_length=32)
    vocal: str = Field(default="", max_length=32)
    agent_prompt: str = Field(default="", max_length=5000)
    agent_music_params: dict[str, object] = Field(default_factory=dict)
    agent_research_notes: str = Field(default="", max_length=2000)
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
) -> Generation:
    cost = COSTS.get(gen_type, 0)
    if not user.is_admin and user.balance_tokens < cost:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Недостаточно токенов: нужно {cost}, есть {user.balance_tokens}",
        )

    gen = Generation(
        id=uuid.uuid4(),
        user_id=user.id,
        type=gen_type,
        status=GenerationStatus.queued,
        title=title,
        params=params,
        cost_tokens=cost,
        genre=genre or None,
        mood=mood or None,
        tempo=tempo or None,
        vocal=vocal or None,
    )
    session.add(gen)
    await session.flush()
    return gen


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/song", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("10/minute;50/hour")
async def generate_song(
    body: SongRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    gen = await _create_generation(
        session,
        user,
        GenerationType.song,
        params=body.model_dump(),
        title=body.track_name,
        genre=body.genre or body.custom_genre,
        mood=body.mood,
        tempo=body.tempo,
        vocal=body.vocal,
    )
    await session.commit()
    await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post(
    "/instrumental", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED
)
@limiter.limit("10/minute;50/hour")
async def generate_instrumental(
    body: InstrumentalRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    gen = await _create_generation(
        session,
        user,
        GenerationType.instrumental,
        params=body.model_dump(),
        title=body.track_name,
        genre=body.genre or body.custom_genre,
        mood=body.mood,
        tempo=body.tempo,
    )
    await session.commit()
    await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post(
    "/sound_effect", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED
)
@limiter.limit("10/minute;50/hour")
async def generate_sound_effect(
    body: SoundEffectRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    # Use supplied track_name; fall back to first 60 chars of the user's prompt.
    title = body.track_name.strip() or body.prompt.strip()[:60]
    gen = await _create_generation(
        session,
        user,
        GenerationType.sound_effect,
        params=body.model_dump(),
        title=title,
    )
    await session.commit()
    await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post(
    "/cover_art", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED
)
async def generate_cover_art(
    body: CoverArtRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    title = body.title.strip() or body.prompt.strip()[:60] or "Обложка"
    gen = await _create_generation(
        session,
        user,
        GenerationType.cover_art,
        params=body.model_dump(),
        title=title,
    )
    await session.commit()
    await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post("/occasion", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_occasion(
    body: OccasionRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    # Occasion uses song under the hood
    gen = await _create_generation(
        session,
        user,
        GenerationType.occasion,
        params=body.model_dump(),
        genre=body.genre,
        mood=body.mood,
        vocal=body.vocal,
    )
    await session.commit()
    await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post(
    "/cover_song", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED
)
async def generate_cover_song(
    body: CoverSongRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    gen = await _create_generation(
        session,
        user,
        GenerationType.cover_song,
        params=body.model_dump(),
        title=body.track_name,
        genre=body.genre or body.custom_genre,
        mood=body.mood,
        tempo=body.tempo,
    )
    await session.commit()
    await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post("/extend", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED)
async def extend_track(
    body: ExtendRequest,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    gen = await _create_generation(
        session,
        user,
        GenerationType.extend,
        params=body.model_dump(),
    )
    await session.commit()
    await _enqueue(settings.redis_url, str(gen.id))
    return GenerateResponse(generation_id=str(gen.id), ws_url=_ws_url(request, str(gen.id)))


@router.post(
    "/wav_convert", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED
)
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

    gen = await _create_generation(
        session,
        user,
        GenerationType.wav_convert,
        params=body.model_dump(),
        title=wav_title,
    )
    await session.commit()
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
                "AllowedOrigins": ["http://localhost:5173", "http://127.0.0.1:5173"],
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
