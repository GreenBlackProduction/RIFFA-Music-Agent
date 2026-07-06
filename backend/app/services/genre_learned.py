"""Self-learning genre base: research unknown genres once, reuse forever.

Resolution order in build_suno_style is: static GENRE_STYLES → learned preset
(this module, passed in by the caller) → hybrid blender → bare word. This
module owns the "learned" layer:

  * ``resolve_learned_presets`` — for the genre phrases of one generation,
    return already-learned presets and, when a phrase is truly unknown
    (no static preset, not blendable), research it via Perplexity and store
    it in ``learned_genres`` so the NEXT request hits the DB instantly.
  * ``prewarm_genre`` — fire-and-forget variant used by /agent/classify when
    it flags ``obscure_genre`` — by the time the user finishes the chips the
    preset is ready.

Safety: confidence gate (≥0.7) + "is_real_genre" flag + "empty over invented"
rule mirror the artist-research hardening — a hallucinated preset must not
poison the shared style base. Failures are negative-cached in-process for
10 minutes so a flaky lookup can't hammer Perplexity.
"""

from __future__ import annotations

import json
import re
import time
from typing import TYPE_CHECKING, Any

from loguru import logger
from openai import AsyncOpenAI
from sqlalchemy import select, update

from app.db.models import LearnedGenre
from app.services.genre_blend import blend_genre_preset
from app.services.genre_canonical import canonical_genre

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.core.config import Settings

_OPENROUTER_BASE = "https://openrouter.ai/api/v1"
_MODEL = "perplexity/sonar"
_TIMEOUT = 15.0

_GENRE_RESEARCH_PROMPT = (
    "You are a music genre researcher. Search the web for the music genre/style "
    "named below and return ONLY raw JSON (no markdown, no fences), exactly:\n"
    '{"is_real_genre":<true only if this is an actual recognized music genre/'
    'style/scene — false for gibberish, artist names, or non-music phrases>,'
    '"confidence":<0.0-1.0>,'
    '"canonical_name":"<the common English name of the genre>",'
    '"parent_genre":"<closest mainstream parent, e.g. Jazz, Electronic, Hip-Hop>",'
    '"style_fragments":["<8-12 short comma-free phrases describing the sound: '
    "instruments actually typical for the genre, rhythm character, production "
    'traits, atmosphere — the way a music journalist would describe it>"],'
    '"bpm_range":"<e.g. 140-150 BPM, or empty>",'
    '"era":"<decade(s) the style is rooted in, or empty>"}\n'
    "Ground everything in what the search actually says about this genre — "
    "reviews, scene descriptions, genre guides. NEVER invent: if the sources "
    "don't describe some aspect, leave that field empty. If you cannot find "
    "the genre, set is_real_genre:false. Genre: "
)

# phrase_key → (preset | None, expires_at). None = negative cache.
_mem: dict[str, tuple[dict[str, Any] | None, float]] = {}
_POS_TTL = 6 * 3600.0   # positive entries also live in the DB — this just skips queries
_NEG_TTL = 600.0


def phrase_key(raw: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]+", " ", (raw or "").strip().lower())).strip()[:120]


def _row_to_preset(row: LearnedGenre) -> dict[str, Any]:
    return {
        "style": row.style,
        "weight": row.weight,
        "constraint": row.constraint_val,
        "parent_genre": (row.meta or {}).get("parent_genre", ""),
        "learned": True,
    }


def _needs_learning(raw: str) -> bool:
    """True when neither the static base nor the blender covers the phrase."""
    if not raw:
        return False
    if canonical_genre(raw):
        return False
    if blend_genre_preset(raw):
        return False
    words = raw.split()
    # Gate out sentences and junk — genres are short noun phrases.
    return 1 <= len(words) <= 5 and 2 <= len(raw) <= 60


async def _load_from_db(session: AsyncSession, key: str) -> dict[str, Any] | None:
    row = (
        await session.execute(select(LearnedGenre).where(LearnedGenre.phrase_key == key))
    ).scalar_one_or_none()
    if row is None:
        return None
    await session.execute(
        update(LearnedGenre).where(LearnedGenre.id == row.id).values(usage_count=row.usage_count + 1)
    )
    return _row_to_preset(row)


async def _research_genre(raw: str, settings: Settings) -> dict[str, Any] | None:
    """Perplexity lookup → preset dict, or None (unknown / low confidence)."""
    if not settings.openrouter_api_key:
        return None
    try:
        client = AsyncOpenAI(
            api_key=settings.openrouter_api_key, base_url=_OPENROUTER_BASE, timeout=_TIMEOUT
        )
        resp = await client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "user", "content": _GENRE_RESEARCH_PROMPT + raw}],
            temperature=0.2,
            max_tokens=700,
        )
        data = json.loads(re.sub(r"```[a-z]*\n?|```", "", resp.choices[0].message.content or "").strip())
    except Exception as exc:
        logger.warning("genre_learned: research failed for «{}»: {}", raw, exc)
        return None

    confidence = float(data.get("confidence") or 0)
    fragments = [str(f).strip() for f in (data.get("style_fragments") or []) if str(f).strip()]
    if not data.get("is_real_genre") or confidence < 0.7 or len(fragments) < 5:
        logger.info(
            "genre_learned: «{}» rejected (real={} conf={:.2f} fragments={})",
            raw, data.get("is_real_genre"), confidence, len(fragments),
        )
        return None

    bpm = str(data.get("bpm_range") or "").strip()
    if bpm:
        fragments.append(bpm)
    parent = str(data.get("parent_genre") or "").strip()
    return {
        "style": ", ".join(dict.fromkeys(fragments))[:900],
        "weight": 0.85,
        "constraint": 0.35,
        "parent_genre": canonical_genre(parent) or parent,
        "confidence": confidence,
        "canonical_name": str(data.get("canonical_name") or raw).strip()[:120],
        "era": str(data.get("era") or "").strip(),
        "learned": True,
    }


async def _store(session: AsyncSession, raw: str, key: str, preset: dict[str, Any]) -> None:
    row = LearnedGenre(
        phrase_key=key,
        display=raw.strip()[:120],
        style=preset["style"],
        weight=float(preset["weight"]),
        constraint_val=float(preset["constraint"]),
        confidence=float(preset.get("confidence") or 0),
        meta={
            "parent_genre": preset.get("parent_genre", ""),
            "canonical_name": preset.get("canonical_name", ""),
            "era": preset.get("era", ""),
        },
        usage_count=1,
    )
    session.add(row)
    await session.flush()
    logger.info(
        "genre_learned: STORED «{}» (conf={:.2f}) — style base grew to include it",
        raw, float(preset.get("confidence") or 0),
    )


async def resolve_learned_presets(
    session: AsyncSession,
    settings: Settings,
    phrases: list[str],
) -> dict[str, dict[str, Any]]:
    """Return ``{phrase_lower: preset}`` for every phrase that needs and has
    (or just got) a learned preset. Fail-safe: any error returns what we have.
    """
    out: dict[str, dict[str, Any]] = {}
    for raw in phrases:
        raw = (raw or "").strip()
        if not _needs_learning(raw):
            continue
        key = phrase_key(raw)
        if not key:
            continue

        cached, exp = _mem.get(key, (None, 0.0))
        if time.monotonic() < exp:
            if cached:
                out[raw.lower()] = cached
            continue

        try:
            preset = await _load_from_db(session, key)
            if preset is None:
                preset = await _research_genre(raw, settings)
                if preset:
                    await _store(session, raw, key, preset)
            _mem[key] = (preset, time.monotonic() + (_POS_TTL if preset else _NEG_TTL))
            if preset:
                out[raw.lower()] = preset
        except Exception as exc:
            logger.warning("genre_learned: resolve failed for «{}»: {}", raw, exc)
    return out


async def prewarm_genre(raw: str, settings: Settings) -> None:
    """Background pre-warm from /agent/classify — opens its own session."""
    try:
        if not _needs_learning(raw):
            return
        from app.db.base import get_sessionmaker

        async with get_sessionmaker()() as session:
            await resolve_learned_presets(session, settings, [raw])
            await session.commit()
    except Exception as exc:
        logger.warning("genre_learned: prewarm failed for «{}»: {}", raw, exc)


__all__ = ["resolve_learned_presets", "prewarm_genre", "phrase_key"]
