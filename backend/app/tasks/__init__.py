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
from app.db.models.wallet import WalletTransaction
from app.services.lyrics import make_lyrics_client
from app.services.nanobanana import NanoBananaError, make_nanobanana_client
from app.services.notifications import notify_generation_done
from app.services.prompt_engineering import SongParams, build_suno_style, vocal_gender
from app.services.track_naming import resolve_artist, compose_track_title
from app.services.suno import SunoError, SunoPending, make_suno_client
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


def _ensure_rich_style(enriched: str | None, preset_style: str) -> str:
    """Never ship a lazier prompt than the deterministic preset.

    ``enrich_music_prompt`` runs GPT at temperature 0.55 and, with a thin/empty
    user description, occasionally returns a 4-word stub ("aggressive rock
    instrumental") despite the system prompt forbidding it. The preset built by
    ``build_suno_style`` is always detailed (instruments, production, era,
    dynamics), so fall back to it whenever the enricher comes back short.
    """
    enriched = (enriched or "").strip()
    if len(enriched) < max(240, int(len(preset_style) * 0.6)):
        return preset_style
    return enriched


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


async def _persist_task_id(
    session_factory: async_sessionmaker[AsyncSession], gen_id: str, task_id: str
) -> None:
    """Save the Suno task id the moment it's known (queued step), so a later
    crash/restart can reconcile the result instead of blindly refunding."""
    try:
        async with session_factory() as s:
            g = (
                await s.execute(select(Generation).where(Generation.id == uuid.UUID(gen_id)))
            ).scalar_one_or_none()
            if g and not g.suno_task_id:
                g.suno_task_id = task_id
                await s.commit()
    except Exception as exc:
        logger.warning("persist suno_task_id failed for {}: {}", gen_id, exc)


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
            # Recovery path: previous worker run was killed mid-flight (status
            # stayed `processing`) or generation already terminal. Refund any
            # tokens that got deducted and mark as failed so the user can retry
            # instead of losing money to a silent stuck row.
            logger.warning(
                "generation {} already in status {} — entering recovery",
                gen_id, gen.status,
            )
            if gen.status == GenerationStatus.processing:
                # Reconcile with Suno FIRST — it may have delivered while we were
                # down. Only refund when we've confirmed it didn't (else we'd pay
                # Suno + refund the user + lose the track).
                if gen.suno_task_id:
                    try:
                        outcome = await _reconcile_generation(session_factory, settings, gen)
                    except Exception:
                        outcome = "skip"
                    if outcome == "completed":
                        await _publish(ctx, gen_id, {"status": "completed"})
                        return
                    if outcome == "pending":
                        # Still generating — leave it; the sweeper will finish it.
                        await _publish(ctx, gen_id, {"status": "processing", "step": "still_generating"})
                        return
                # No task_id, or Suno reported failure → refund + fail.
                existing_refund = (
                    await session.execute(
                        select(WalletTransaction.id)
                        .where(WalletTransaction.reference_id == str(gen.id))
                        .where(WalletTransaction.amount_tokens > 0)
                    )
                ).scalar_one_or_none()
                if existing_refund is None and gen.cost_tokens > 0:
                    try:
                        await credit_tokens(
                            session,
                            gen.user_id,
                            gen.cost_tokens,
                            reason="refund:worker_restart",
                            reference_id=str(gen.id),
                        )
                    except Exception as exc:
                        logger.error(
                            "[REFUND] worker-restart refund failed for {}: {}",
                            gen_id, exc,
                        )
                gen.status = GenerationStatus.failed
                gen.error_message = (
                    "Воркер перезапустился во время генерации. "
                    "Токены возвращены — запусти ещё раз."
                )[:512]
                await session.commit()
                await _publish(
                    ctx, gen_id,
                    {"status": "failed", "error": gen.error_message},
                )
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
        loop = asyncio.get_event_loop()
        loop.create_task(_publish(ctx, gen_id, {"status": "processing", **payload}))
        # Persist the Suno task id as soon as it's known (queued step) so an
        # interrupted poll can be reconciled rather than refunded.
        tid = payload.get("task_id")
        if tid:
            loop.create_task(_persist_task_id(session_factory, gen_id, str(tid)))

    # ---- dispatch ----
    suno = make_suno_client(settings)
    lyrics_client = make_lyrics_client(settings)
    params: dict[str, Any] = gen.params or {}
    result: dict[str, Any] = {}
    error_msg: str | None = None

    # Resolve the user's artist nickname once so the worker can prefix
    # auto-generated titles ("Artist — Track Name").
    async with session_factory() as _session:
        _user_obj = (
            await _session.execute(select(User).where(User.id == gen.user_id))
        ).scalar_one_or_none()
    track_artist: str = resolve_artist(_user_obj) if _user_obj else "RIFFA"

    try:
        if gen.type == GenerationType.song:
            await _publish(ctx, gen_id, {"status": "processing", "step": "lyrics"})

            text_mode = params.get("text_mode", "ai")
            # When description is empty (agent flow), fall back to the
            # agent_prompt so we still have something to feed the lyrics/title
            # generator.
            description_for_lyrics = (
                params.get("description")
                or params.get("agent_prompt")
                or ""
            )

            lyrics = ""
            if text_mode == "ai":
                lyrics = await lyrics_client.generate_lyrics(
                    description_for_lyrics,
                    style_hint=params.get("genre", ""),
                )
            elif text_mode == "custom":
                lyrics = params.get("lyrics", "")

            if not gen.title:
                short_title = await lyrics_client.generate_title(description_for_lyrics)
                gen.title = compose_track_title(track_artist, short_title)

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
                key_instruments=agent_mp.get("key_instruments", []),
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
                agent_research_notes=agent_research,
                preset_style_hint=preset_style,
            )
            style = _ensure_rich_style(style, preset_style)

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
                key_instruments=agent_mp.get("key_instruments", []),
                constraints=agent_mp.get("constraints", ""),
                suggested_bpm=agent_mp.get("suggested_bpm", ""),
                style_prompt=(agent_research + "\n" + agent_prompt_text).strip(),
            )
            preset_style, weight, constraint = build_suno_style(
                song_params,
                user_id=gen.user_id,
            )
            if not gen.title:
                short_title = (params.get("description", "") or "Instrumental")[:60]
                gen.title = compose_track_title(track_artist, short_title)
            title = gen.title

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
            )
            style = _ensure_rich_style(style, preset_style)

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
            raw_sfx_brief = params.get("prompt", "")
            # Detect lyric-leak so we can both log and append an explicit
            # vocal lock to the brief. The enrich system prompt already
            # rewrites these into wordless texture, but the safety net
            # keeps the Suno SFX model from improvising mumbled speech if
            # GPT slips.
            _LYRIC_MARKERS = (
                "слов", "текст", "поёт", "поют", "поющ", "припев",
                "куплет", "lyric", "word", "sing", "vocal", "narration",
                "voice line", "говорит", "speak", "phrase", "chant",
            )
            lower_brief = raw_sfx_brief.lower()
            if any(m in lower_brief for m in _LYRIC_MARKERS):
                logger.warning(
                    "[SFX] lyric markers detected in brief — relying on "
                    "enrich pipeline to reinterpret as wordless texture. "
                    "brief={!r}", raw_sfx_brief[:200],
                )
            sfx_prompt = await lyrics_client.enrich_sfx_prompt(raw_sfx_brief)
            # Force-append the vocal lock — cheap, idempotent, and the SFX
            # model honours short trailing constraints reliably.
            if "no words" not in sfx_prompt.lower():
                sfx_prompt = (sfx_prompt.rstrip(". ")
                              + ", no words, no language, purely textural")
            _dump_payload(gen_id, "sound_effect", {
                "original": raw_sfx_brief,
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

            if not gen.title:
                gen.title = compose_track_title(track_artist, "Cover")
            cover_title = gen.title
            _dump_payload(gen_id, "cover_song", {
                "upload_url": upload_url,
                "genre": genre,
                "mood": params.get("mood", ""),
                "tempo": params.get("tempo", ""),
                "style": final_style,
                "lyrics": params.get("lyrics", ""),
                "title": cover_title,
                "instrumental": params.get("instrumental", False),
                "vocal_gender": params.get("vocal_gender"),
            })
            suno_result = await suno.generate_cover(
                upload_url=upload_url,
                style=final_style,
                prompt=params.get("lyrics", ""),
                title=cover_title,
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

        elif gen.type == GenerationType.occasion:
            # Occasion is a song-with-vocals tailored to an event (birthday,
            # wedding, anniversary). Build a description from the occasion
            # type + answers dict, then run the song flow with AI lyrics.
            occasion_type = str(params.get("occasion_type", "") or "поздравление")
            answers = params.get("answers", {}) or {}
            answer_lines = "; ".join(
                f"{k}: {v}" for k, v in answers.items() if isinstance(v, str) and v.strip()
            )
            description = f"Песня к поводу: {occasion_type}. {answer_lines}".strip(". ")

            await _publish(ctx, gen_id, {"status": "processing", "step": "lyrics"})
            lyrics = await lyrics_client.generate_lyrics(
                description, style_hint=params.get("genre", "")
            )

            if not gen.title:
                short_title = await lyrics_client.generate_title(description)
                gen.title = compose_track_title(track_artist, short_title)

            agent_mp = params.get("agent_music_params") or {}
            agent_research = params.get("agent_research_notes", "")
            agent_prompt_text = params.get("agent_prompt", "")

            song_params = SongParams(
                user_description=description,
                genre=agent_mp.get("genre") or params.get("genre", ""),
                custom_genre=agent_mp.get("custom_genre", ""),
                subgenre=agent_mp.get("subgenre", ""),
                mood=agent_mp.get("mood") or params.get("mood", ""),
                tempo=agent_mp.get("tempo") or params.get("tempo", ""),
                vocal=agent_mp.get("vocal") or params.get("vocal", ""),
                era=agent_mp.get("era", ""),
                techniques=agent_mp.get("techniques", []),
                key_instruments=agent_mp.get("key_instruments", []),
                constraints=agent_mp.get("constraints", ""),
                suggested_bpm=agent_mp.get("suggested_bpm", ""),
                style_prompt=(agent_research + "\n" + agent_prompt_text).strip(),
            )
            preset_style, weight, constraint = build_suno_style(
                song_params, user_id=gen.user_id
            )

            await _publish(ctx, gen_id, {"status": "processing", "step": "enriching_music"})
            style = await lyrics_client.enrich_music_prompt(
                user_description=description,
                genre=song_params.genre,
                custom_genre=song_params.custom_genre,
                mood=song_params.mood,
                tempo=song_params.tempo,
                vocal=song_params.vocal,
                instrumental=False,
                approved_lyrics=lyrics,
                agent_prompt=agent_prompt_text,
                agent_research_notes=agent_research,
                preset_style_hint=preset_style,
            )
            style = _ensure_rich_style(style, preset_style)

            _dump_payload(gen_id, "occasion", {
                "title": gen.title,
                "occasion_type": occasion_type,
                "style": style,
                "lyrics": lyrics,
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
                "occasion_type": occasion_type,
                "enriched_style": style,
                "suno_task_id": suno_result.task_id,
            }

        else:
            raise ValueError(f"unsupported generation type: {gen.type}")

    except SunoPending as exc:
        # Not a failure — Suno is still working but outran our poll budget.
        # Leave the row in `processing` (tokens stay deducted) and let the
        # reconcile sweeper finish it by task_id. No refund, no fail.
        logger.warning("gen {} still pending after poll budget: {} — leaving for reconcile", gen_id, exc)
        await _publish(ctx, gen_id, {"status": "processing", "step": "still_generating"})
        return
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
# Reconciliation — recover generations Suno delivered but our polling missed
# (worker restart / poll-budget timeout / transient site error). Without this
# we'd refund the user while having already paid Suno, and lose the track.
# ---------------------------------------------------------------------------

RECONCILE_MIN_AGE_SEC = 240          # don't touch rows younger than this (active polls)
RECONCILE_GIVE_UP_MIN = 25           # past this (and job_timeout) → fail + refund


async def _reconcile_generation(
    session_factory: async_sessionmaker[AsyncSession], settings: Any, gen: Generation
) -> str:
    """Poll Suno once by the persisted task_id and finish a stuck `processing`
    generation. Returns 'completed' | 'pending' | 'failed' | 'skip'."""
    task_id = gen.suno_task_id
    if not task_id:
        return "skip"
    suno = make_suno_client(settings)
    try:
        tracks = await suno.fetch_tracks(task_id)
    except SunoError:
        return "failed"  # Suno reports the task itself failed
    if not tracks:
        return "pending"  # still generating

    params = gen.params or {}
    result: dict[str, Any] = {
        "tracks": [
            {
                "audio_url": t.audio_url,
                "audio_id": t.audio_id,
                "image_url": t.image_url,
                "duration": t.duration,
                "title": t.title or (gen.title or ""),
            }
            for t in tracks
        ],
        "suno_task_id": task_id,
    }
    if isinstance(params.get("lyrics"), str) and params["lyrics"]:
        result["lyrics"] = params["lyrics"]
    try:
        result = await mirror_generation_result(result, str(gen.id), settings)
    except Exception as exc:
        logger.warning("reconcile mirror failed for {}: {}", gen.id, exc)

    async with session_factory() as s:
        g = (
            await s.execute(select(Generation).where(Generation.id == gen.id))
        ).scalar_one_or_none()
        if g is None or g.status != GenerationStatus.processing:
            return "completed"  # someone else (the worker) already finished it
        g.status = GenerationStatus.completed
        g.result = result
        g.suno_task_id = task_id
        g.completed_at = datetime.now(UTC)
        if not g.title and result["tracks"]:
            g.title = result["tracks"][0].get("title", "")
        await s.commit()
    logger.info("reconciled gen {} → completed ({} tracks)", gen.id, len(tracks))
    return "completed"


async def _fail_and_refund(
    session_factory: async_sessionmaker[AsyncSession], gen_id: str, msg: str
) -> None:
    """Mark a stuck generation failed and refund tokens — idempotently (skips
    the refund if one was already recorded for this generation)."""
    async with session_factory() as s:
        g = (
            await s.execute(select(Generation).where(Generation.id == uuid.UUID(gen_id)))
        ).scalar_one_or_none()
        if g is None or g.status != GenerationStatus.processing:
            return
        existing_refund = (
            await s.execute(
                select(WalletTransaction.id)
                .where(WalletTransaction.reference_id == str(g.id))
                .where(WalletTransaction.amount_tokens > 0)
            )
        ).scalar_one_or_none()
        if existing_refund is None and g.cost_tokens > 0:
            try:
                await credit_tokens(
                    s, g.user_id, g.cost_tokens,
                    reason="refund:reconcile_failed", reference_id=str(g.id),
                )
            except Exception as exc:
                logger.error("reconcile refund failed for {}: {}", gen_id, exc)
        g.status = GenerationStatus.failed
        g.error_message = msg[:512]
        await s.commit()


async def reconcile_stuck(ctx: dict[str, Any]) -> None:
    """Sweeper: every couple of minutes, finish (or, only when truly dead,
    fail+refund) `processing` generations whose worker died or outran its poll
    budget — by polling Suno via the task_id we persisted at the queued step."""
    session_factory: async_sessionmaker[AsyncSession] = ctx["session_factory"]
    settings = ctx["settings"]
    now = datetime.now(UTC)
    async with session_factory() as s:
        rows = (
            await s.execute(
                select(Generation)
                .where(Generation.status == GenerationStatus.processing)
                .where(Generation.suno_task_id.is_not(None))
                .order_by(Generation.created_at)
                .limit(50)
            )
        ).scalars().all()

    for gen in rows:
        age = (now - gen.created_at).total_seconds()
        if age < RECONCILE_MIN_AGE_SEC:
            continue  # likely still being polled by a live worker
        try:
            outcome = await _reconcile_generation(session_factory, settings, gen)
        except Exception as exc:
            logger.warning("reconcile sweep error for {}: {}", gen.id, exc)
            continue
        if outcome == "completed":
            await _publish(ctx, str(gen.id), {"status": "completed"})
        elif outcome == "failed" or (outcome == "pending" and age > RECONCILE_GIVE_UP_MIN * 60):
            # Suno failed, or it's been far too long (well past job_timeout) — now
            # it's safe to fail + refund: we've confirmed Suno didn't deliver.
            await _fail_and_refund(
                session_factory, str(gen.id),
                "Suno: генерация не удалась" if outcome == "failed"
                else "Suno не вернул результат вовремя — токены возвращены, запусти ещё раз",
            )
            await _publish(ctx, str(gen.id), {"status": "failed"})
        # pending & not too old → leave for the next sweep


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
        # Every 2 minutes: reconcile generations Suno delivered but our polling
        # missed (worker restart / timeout), so we don't refund + lose paid tracks.
        cron(reconcile_stuck, minute=set(range(0, 60, 2)), run_at_startup=True),
    ]
    on_startup = startup
    on_shutdown = shutdown
    max_jobs = 50
    job_timeout = 900  # 15 min
    keep_result = 3600
