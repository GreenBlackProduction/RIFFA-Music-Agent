"""Arq background worker — generation tasks."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, ClassVar

from arq import cron
from arq.connections import RedisSettings
from loguru import logger
from sqlalchemy import delete as sql_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.db.models import Generation, GenerationStatus, GenerationType
from app.db.models.user import User
from app.services.lyrics import make_lyrics_client
from app.services.nanobanana import NanoBananaError, make_nanobanana_client
from app.services.notifications import notify_generation_done
from app.services.prompt_engineering import SongParams, build_suno_style, vocal_gender
from app.services.suno import SunoError, make_suno_client
from app.services.mirror import mirror_generation_result
from app.services.wallet import InsufficientBalance, credit_tokens, deduct_tokens

# ---------------------------------------------------------------------------
# Logging setup — duplicate to file for easy tailing
# ---------------------------------------------------------------------------

_LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
_LOG_DIR.mkdir(parents=True, exist_ok=True)
_LOG_FILE = _LOG_DIR / "generations.log"

_LOG_CONFIGURED = False


def _ensure_log_sink() -> None:
    global _LOG_CONFIGURED
    if _LOG_CONFIGURED:
        return
    logger.add(
        _LOG_FILE,
        rotation="10 MB",
        retention="7 days",
        level="INFO",
        enqueue=True,
        encoding="utf-8",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}",
    )
    _LOG_CONFIGURED = True


def _dump_payload(gen_id: str, gen_type: str, payload: dict[str, Any]) -> None:
    """Emit a clearly framed log block with the final Suno payload."""
    pretty = json.dumps(payload, ensure_ascii=False, indent=2)
    logger.info(
        "\n"
        "═══════════════════════════════════════════════════════════════\n"
        "  SUNO PAYLOAD  ·  type={} · gen_id={}\n"
        "───────────────────────────────────────────────────────────────\n"
        "{}\n"
        "═══════════════════════════════════════════════════════════════",
        gen_type, gen_id, pretty,
    )

# ---------------------------------------------------------------------------
# Progress channel
# ---------------------------------------------------------------------------

_PROGRESS_CHANNEL = "gen:progress:{}"


async def _publish(ctx: dict[str, Any], gen_id: str, payload: dict[str, Any]) -> None:
    redis = ctx["redis"]
    await redis.publish(_PROGRESS_CHANNEL.format(gen_id), json.dumps(payload))


# ---------------------------------------------------------------------------
# Worker lifecycle
# ---------------------------------------------------------------------------


async def _purge_expired_trash(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    retention_days: int = 7,
) -> int:
    """Hard-delete generations soft-deleted more than ``retention_days`` ago.

    Returns the number of rows removed so the caller can log it.
    """
    from datetime import timedelta

    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    async with session_factory() as session:
        result = await session.execute(
            sql_delete(Generation).where(
                Generation.deleted_at.is_not(None),
                Generation.deleted_at <= cutoff,
            )
        )
        await session.commit()
    return int(result.rowcount or 0)


async def startup(ctx: dict[str, Any]) -> None:
    _ensure_log_sink()
    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    ctx["session_factory"] = session_factory
    ctx["settings"] = settings
    logger.info("Arq worker started — logs duplicated to {}", _LOG_FILE)

    # Auto-purge trash items older than 7 days on every worker start. The
    # daily cron below also runs but the boot-time pass catches up on any
    # purges missed while the worker was down.
    removed = await _purge_expired_trash(session_factory)
    if removed:
        logger.info("Trash auto-purge (startup): hard-deleted {} old generation(s)", removed)


async def purge_trash(ctx: dict[str, Any]) -> None:
    """Arq cron task — daily sweep of soft-deleted generations older than 7d."""
    session_factory: async_sessionmaker[AsyncSession] = ctx["session_factory"]
    removed = await _purge_expired_trash(session_factory)
    if removed:
        logger.info("Trash auto-purge (cron): hard-deleted {} old generation(s)", removed)


async def shutdown(ctx: dict[str, Any]) -> None:
    logger.info("Arq worker shutting down")


# ---------------------------------------------------------------------------
# Main task
# ---------------------------------------------------------------------------


async def run_generation(ctx: dict[str, Any], gen_id: str) -> None:
    """Dispatch a queued Generation to the appropriate service."""
    session_factory: async_sessionmaker[AsyncSession] = ctx["session_factory"]
    settings = ctx["settings"]

    # ---- load and mark as processing ----
    async with session_factory() as session:
        gen = (
            await session.execute(
                select(Generation).where(Generation.id == uuid.UUID(gen_id))
            )
        ).scalar_one_or_none()

        if gen is None:
            logger.error("generation {} not found", gen_id)
            return

        if gen.status != GenerationStatus.queued:
            logger.warning("generation {} already in status {}", gen_id, gen.status)
            return

        gen.status = GenerationStatus.processing
        await session.commit()

    await _publish(ctx, gen_id, {"status": "processing", "step": "start"})

    # ---- deduct tokens ----
    async with session_factory() as session:
        gen = (
            await session.execute(
                select(Generation).where(Generation.id == uuid.UUID(gen_id))
            )
        ).scalar_one()

        if gen.cost_tokens > 0:
            try:
                await deduct_tokens(
                    session,
                    gen.user_id,
                    gen.cost_tokens,
                    reason=f"generation:{gen.type.value}",
                    reference_id=str(gen.id),
                )
                await session.commit()
            except InsufficientBalance as exc:
                gen.status = GenerationStatus.failed
                gen.error_message = "Недостаточно токенов"
                await session.commit()
                await _publish(ctx, gen_id, {"status": "failed", "error": str(exc)})
                return

    # ---- build progress callback ----
    import asyncio

    def progress_cb(payload: dict[str, Any]) -> None:
        asyncio.get_event_loop().create_task(
            _publish(ctx, gen_id, {"status": "processing", **payload})
        )

    # ---- dispatch ----
    suno = make_suno_client(settings)
    lyrics_client = make_lyrics_client(settings)
    params: dict[str, Any] = gen.params or {}
    result: dict[str, Any] = {}
    error_msg: str | None = None

    try:
        if gen.type == GenerationType.song:
            await _publish(ctx, gen_id, {"status": "processing", "step": "lyrics"})

            text_mode = params.get("text_mode", "ai")
            lyrics = ""
            if text_mode == "ai":
                lyrics = await lyrics_client.generate_lyrics(
                    params.get("description", ""),
                    style_hint=params.get("genre", ""),
                )
            elif text_mode == "custom":
                lyrics = params.get("lyrics", "")

            if not gen.title:
                gen.title = await lyrics_client.generate_title(params.get("description", ""))

            # Agent-provided structured params override form fields
            agent_mp = params.get("agent_music_params") or {}
            agent_research = params.get("agent_research_notes", "")
            agent_prompt_text = params.get("agent_prompt", "")

            song_params = SongParams(
                user_description=params.get("description", ""),
                genre=agent_mp.get("genre") or params.get("genre", ""),
                custom_genre=agent_mp.get("custom_genre") or params.get("custom_genre", ""),
                subgenre=agent_mp.get("subgenre", ""),
                mood=agent_mp.get("mood") or params.get("mood", ""),
                tempo=agent_mp.get("tempo") or params.get("tempo", ""),
                vocal=agent_mp.get("vocal") or params.get("vocal", ""),
                era=agent_mp.get("era", ""),
                techniques=agent_mp.get("techniques", []),
                constraints=agent_mp.get("constraints", ""),
                suggested_bpm=agent_mp.get("suggested_bpm", ""),
                style_prompt=(agent_research + "\n" + agent_prompt_text).strip(),
            )
            preset_style, weight, constraint = build_suno_style(
                song_params,
                user_id=gen.user_id,
            )

            # GPT-4o composes the adaptive Suno music prompt; falls back to preset on failure.
            await _publish(ctx, gen_id, {"status": "processing", "step": "enriching_music"})
            style = await lyrics_client.enrich_music_prompt(
                user_description=params.get("description", ""),
                genre=song_params.genre,
                custom_genre=song_params.custom_genre,
                mood=song_params.mood,
                tempo=song_params.tempo,
                vocal=song_params.vocal,
                instrumental=False,
                approved_lyrics=lyrics,
                agent_prompt=agent_prompt_text,
                preset_style_hint=preset_style,
            ) or preset_style

            _dump_payload(gen_id, "song", {
                "title": gen.title,
                "style": style,
                "lyrics": lyrics,
                "instrumental": False,
                "vocal_gender": vocal_gender(params.get("vocal", "")),
                "style_weight": weight,
                "weirdness_constraint": constraint,
            })
            await _publish(ctx, gen_id, {"status": "processing", "step": "music"})
            suno_result = await suno.generate_music(
                prompt=lyrics,
                style=style,
                title=gen.title,
                instrumental=False,
                vocal_gender=vocal_gender(params.get("vocal", "")),
                style_weight=weight,
                weirdness_constraint=constraint,
                progress_cb=progress_cb,
            )
            result = {
                "tracks": [
                    {
                        "audio_url": t.audio_url,
                        "audio_id": t.audio_id,
                        "image_url": t.image_url,
                        "duration": t.duration,
                        "title": t.title or gen.title,
                    }
                    for t in suno_result.tracks
                ],
                "lyrics": lyrics,
                "enriched_style": style,
                "suno_task_id": suno_result.task_id,
            }

        elif gen.type == GenerationType.instrumental:
            agent_mp = params.get("agent_music_params") or {}
            agent_research = params.get("agent_research_notes", "")
            agent_prompt_text = params.get("agent_prompt", "")

            song_params = SongParams(
                user_description=params.get("description", ""),
                genre=agent_mp.get("genre") or params.get("genre", ""),
                custom_genre=agent_mp.get("custom_genre") or params.get("custom_genre", ""),
                subgenre=agent_mp.get("subgenre", ""),
                mood=agent_mp.get("mood") or params.get("mood", ""),
                tempo=agent_mp.get("tempo") or params.get("tempo", ""),
                vocal="no_vocal",
                era=agent_mp.get("era", ""),
                techniques=agent_mp.get("techniques", []),
                constraints=agent_mp.get("constraints", ""),
                suggested_bpm=agent_mp.get("suggested_bpm", ""),
                style_prompt=(agent_research + "\n" + agent_prompt_text).strip(),
            )
            preset_style, weight, constraint = build_suno_style(
                song_params,
                user_id=gen.user_id,
            )
            title = gen.title or params.get("description", "Instrumental")[:80]

            await _publish(ctx, gen_id, {"status": "processing", "step": "enriching_music"})
            style = await lyrics_client.enrich_music_prompt(
                user_description=params.get("description", ""),
                genre=song_params.genre,
                custom_genre=song_params.custom_genre,
                mood=song_params.mood,
                tempo=song_params.tempo,
                vocal="",
                instrumental=True,
                approved_lyrics="",
                agent_prompt=params.get("agent_prompt", ""),
                preset_style_hint=preset_style,
            ) or preset_style

            _dump_payload(gen_id, "instrumental", {
                "title": title,
                "style": style,
                "instrumental": True,
                "style_weight": weight,
                "weirdness_constraint": constraint,
            })
            suno_result = await suno.generate_music(
                prompt="",
                style=style,
                title=title,
                instrumental=True,
                style_weight=weight,
                weirdness_constraint=constraint,
                progress_cb=progress_cb,
            )
            result = {
                "tracks": [
                    {
                        "audio_url": t.audio_url,
                        "audio_id": t.audio_id,
                        "image_url": t.image_url,
                        "duration": t.duration,
                        "title": t.title or title,
                    }
                    for t in suno_result.tracks
                ],
                "enriched_style": style,
                "suno_task_id": suno_result.task_id,
            }

        elif gen.type == GenerationType.sound_effect:
            await _publish(ctx, gen_id, {"status": "processing", "step": "enriching"})
            sfx_prompt = await lyrics_client.enrich_sfx_prompt(params.get("prompt", ""))
            _dump_payload(gen_id, "sound_effect", {
                "original": params.get("prompt", ""),
                "enriched": sfx_prompt,
            })
            suno_result = await suno.generate_sound_effect(
                prompt=sfx_prompt,
                progress_cb=progress_cb,
            )
            result = {
                "tracks": [
                    {
                        "audio_url": t.audio_url,
                        "audio_id": t.audio_id,
                        "duration": t.duration,
                    }
                    for t in suno_result.tracks
                ],
                "suno_task_id": suno_result.task_id,
            }

        elif gen.type == GenerationType.cover_song:
            upload_url = params.get("upload_url", "")
            # Suno needs a publicly accessible URL — localhost won't work.
            if any(h in upload_url for h in ("localhost", "127.0.0.1", "0.0.0.0")):
                logger.warning(
                    "Cover upload URL is localhost-only: {} — Suno cannot access it",
                    upload_url,
                )

            # Build style from genre, mood, tempo, and additional details
            style_parts = []
            genre = params.get("genre", "") or params.get("custom_genre", "")
            if genre:
                style_parts.append(genre)
            if params.get("mood"):
                style_parts.append(params["mood"])
            if params.get("tempo"):
                style_parts.append(params["tempo"])
            if params.get("style"):
                style_parts.append(params["style"])

            final_style = ", ".join(style_parts)[:1000]  # Suno limit

            _dump_payload(gen_id, "cover_song", {
                "upload_url": upload_url,
                "genre": genre,
                "mood": params.get("mood", ""),
                "tempo": params.get("tempo", ""),
                "style": final_style,
                "lyrics": params.get("lyrics", ""),
                "title": gen.title or "Cover",
                "instrumental": params.get("instrumental", False),
                "vocal_gender": params.get("vocal_gender"),
            })
            suno_result = await suno.generate_cover(
                upload_url=upload_url,
                style=final_style,
                prompt=params.get("lyrics", ""),
                title=gen.title or "Cover",
                instrumental=params.get("instrumental", False),
                vocal_gender=params.get("vocal_gender"),
                style_weight=params.get("style_weight"),
                weirdness_constraint=params.get("weirdness_constraint"),
                progress_cb=progress_cb,
            )
            result = {
                "tracks": [
                    {
                        "audio_url": t.audio_url,
                        "audio_id": t.audio_id,
                        "image_url": t.image_url,
                        "duration": t.duration,
                        "title": t.title or gen.title,
                    }
                    for t in suno_result.tracks
                ],
                "suno_task_id": suno_result.task_id,
            }

        elif gen.type == GenerationType.extend:
            suno_result = await suno.extend_music(
                audio_id=params["audio_id"],
                prompt=params.get("prompt", ""),
                style=params.get("style", ""),
                title=params.get("title", ""),
                continue_at=params.get("continue_at", 0),
                progress_cb=progress_cb,
            )
            result = {
                "tracks": [
                    {
                        "audio_url": t.audio_url,
                        "audio_id": t.audio_id,
                        "duration": t.duration,
                    }
                    for t in suno_result.tracks
                ],
                "suno_task_id": suno_result.task_id,
            }

        elif gen.type == GenerationType.wav_convert:
            # `params` has generation_id + audio_id from the frontend.
            # We need suno_task_id from the *original* generation record.
            source_gen_id = params.get("generation_id", "")
            suno_task_id = params.get("suno_task_id", "")
            _wav_source_title: str = ""
            if not suno_task_id and source_gen_id:
                async with session_factory() as _s:
                    src = (
                        await _s.execute(
                            select(Generation).where(Generation.id == uuid.UUID(source_gen_id))
                        )
                    ).scalar_one_or_none()
                    if src and src.suno_task_id:
                        suno_task_id = src.suno_task_id
                    if src and src.title:
                        _wav_source_title = src.title
            if not suno_task_id:
                raise ValueError(f"suno_task_id not found for source generation {source_gen_id}")
            wav_url = await suno.convert_to_wav(
                task_id=suno_task_id,
                audio_id=params["audio_id"],
                progress_cb=progress_cb,
            )
            result = {"wav_url": wav_url, "_wav_source_title": _wav_source_title}

        elif gen.type == GenerationType.lyrics:
            # Lyrics drafting via Suno. GPT-4o is used **only** as a prompt engineer:
            # it takes the user's raw topic + chosen music parameters and produces a tight,
            # context-rich prompt that Suno's /lyrics endpoint then turns into actual text.
            await _publish(ctx, gen_id, {"status": "processing", "step": "enriching"})
            enriched_prompt = await lyrics_client.enrich_lyrics_prompt(
                topic=params.get("topic", "") or params.get("description", ""),
                genre=params.get("genre", ""),
                mood=params.get("mood", ""),
                tempo=params.get("tempo", ""),
                vocal=params.get("vocal", ""),
                language=params.get("language", "ru"),
                agent_prompt=params.get("agent_prompt", ""),
            )
            await _publish(ctx, gen_id, {"status": "processing", "step": "lyrics"})
            lyrics_result = await suno.generate_lyrics(
                prompt=enriched_prompt,
                progress_cb=progress_cb,
            )
            primary = lyrics_result.variants[0]
            if not gen.title:
                gen.title = primary.title
            result = {
                "lyrics": primary.text,
                "title": primary.title,
                "enriched_prompt": enriched_prompt,
                "suno_task_id": lyrics_result.task_id,
                "variants": [
                    {"text": v.text, "title": v.title}
                    for v in lyrics_result.variants
                ],
            }

        elif gen.type == GenerationType.cover_art:
            nb = make_nanobanana_client(settings)
            prompt = params.get("prompt", "")
            model = params.get("model", "nano-banana")
            await _publish(ctx, gen_id, {"status": "processing", "step": "generating"})
            image_url = await nb.generate_cover_art(prompt, model=model)
            result = {"image_url": image_url}

        else:
            raise ValueError(f"unsupported generation type: {gen.type}")

    except NanoBananaError as exc:
        logger.error("NanoBananaError for gen {}: {}", gen_id, exc)
        error_msg = str(exc)
    except SunoError as exc:
        logger.error("SunoError for gen {}: {}", gen_id, exc)
        error_msg = str(exc)
    except Exception as exc:
        logger.exception("unexpected error for gen {}", gen_id)
        error_msg = f"Внутренняя ошибка: {type(exc).__name__}"

    # ---- mirror CDN assets to MinIO (makes audio_url permanent) ----
    if result and not error_msg:
        try:
            result = await mirror_generation_result(result, gen_id, get_settings())
        except Exception as _mirror_err:
            logger.warning("mirror_generation_result failed for {}: {}", gen_id, _mirror_err)

    # ---- save result or fail ----
    async with session_factory() as session:
        g = (
            await session.execute(
                select(Generation).where(Generation.id == uuid.UUID(gen_id))
            )
        ).scalar_one()

        if error_msg:
            g.status = GenerationStatus.failed
            g.error_message = error_msg[:512]
            # Refund tokens
            if g.cost_tokens > 0:
                try:
                    await credit_tokens(
                        session,
                        g.user_id,
                        g.cost_tokens,
                        reason="refund:generation_failed",
                        reference_id=str(g.id),
                    )
                except Exception as exc:
                    logger.error("token refund failed for gen {}: {}", gen_id, exc)
        else:
            g.status = GenerationStatus.completed
            g.result = result
            g.suno_task_id = result.get("suno_task_id")
            g.completed_at = datetime.now(UTC)
            if not g.title:
                if result.get("tracks"):
                    g.title = result["tracks"][0].get("title", "")
                elif result.get("_wav_source_title"):
                    g.title = f"{result['_wav_source_title']} (WAV)"

        await session.commit()

    if error_msg:
        await _publish(ctx, gen_id, {"status": "failed", "error": error_msg})
    else:
        await _publish(ctx, gen_id, {"status": "completed", "result": result})
        # Send Telegram notification (best-effort, never block the task)
        try:
            async with session_factory() as _ns:
                _gen = (await _ns.execute(
                    select(Generation).where(Generation.id == uuid.UUID(gen_id))
                )).scalar_one_or_none()
                _user = (await _ns.execute(
                    select(User).where(User.id == _gen.user_id)
                )).scalar_one_or_none() if _gen else None
            if _gen and _user:
                await notify_generation_done(
                    settings.telegram_bot_token,
                    settings.telegram_bot_username,
                    _user,
                    _gen,
                )
        except Exception as _notify_err:
            logger.warning("notify_generation_done failed: {}", _notify_err)


# ---------------------------------------------------------------------------
# WorkerSettings (used by arq CLI: arq app.tasks.WorkerSettings)
# ---------------------------------------------------------------------------


class WorkerSettings:
    functions: ClassVar[list[Any]] = [run_generation]
    redis_settings: ClassVar[RedisSettings] = RedisSettings.from_dsn(get_settings().redis_url)
    cron_jobs: ClassVar[list[Any]] = [
        # Daily 03:17 UTC sweep of the soft-delete trash. Off-peak time so the
        # query never collides with user-driven generation traffic.
        cron(purge_trash, hour=3, minute=17, run_at_startup=False),
    ]
    on_startup = startup
    on_shutdown = shutdown
    max_jobs = 50
    job_timeout = 900  # 15 min
    keep_result = 3600
