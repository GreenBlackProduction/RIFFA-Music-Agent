"""Web-search grounding for artist/track references via Perplexity sonar
(OpenRouter). Returns a structured musical brief for the prompt-engineer.

Falls back to None on any error — never raises into the agent.
"""

from __future__ import annotations

import json
import re
import time
from typing import TYPE_CHECKING

from loguru import logger
from openai import AsyncOpenAI

from app.services.genre_canonical import canonical_genre
from app.services.track_reference import bpm_to_tempo

if TYPE_CHECKING:
    from app.core.config import Settings

_OPENROUTER_BASE = "https://openrouter.ai/api/v1"
_MODEL = "perplexity/sonar"
_MAX_TOKENS = 1000
_TIMEOUT = 15.0

_RESEARCH_PROMPT = (
    "You are a music researcher. Search the web for the artist/track reference below "
    "and return ONLY raw JSON (no markdown, no code fences), exactly these keys:\n"
    '{"matched":"<canonical artist name ONLY, e.g. \'Boards of Canada\' — no biography, no explanation>",'
    '"match_reason":"<one short sentence: who they are and why you are confident>",'
    '"confidence":<0.0-1.0>,'
    '"ambiguous":<true if the name could be several different artists>,'
    '"genre":"","subgenres":[],"era":"<e.g. 2010s>","bpm_range":"<e.g. 90-110 BPM>",'
    '"mood":[],'
    '"key_instruments":["<4-8 SPECIFIC instruments/sound sources with descriptors, '
    'e.g. detuned analog synth pads, chopped vocal samples, live breakbeat drums>"],'
    '"vocal_style":"<lead vocal character: timbre, delivery, processing — or \'instrumental\'>",'
    '"production_style":"<mixing/production fingerprint: e.g. tape-saturated lo-fi, '
    'cavernous reverb, sidechained sub-bass>",'
    '"signature":"<1-2 sentences: what makes this artist instantly recognizable — '
    'the concrete sonic trademarks, not biography>",'
    '"similar_artists":[],"note":"<if NOT sure which artist, say so plainly>"}\n'
    "Ground every field in the artist's ACTUAL discography found in the search — "
    "not in name-based guesses. If you cannot reliably identify the artist, set "
    "confidence below 0.6 and ambiguous:true. Reference: "
)

# Simple in-process TTL cache (key → (result, expires_at)).
_cache: dict[str, tuple[dict | None, float]] = {}
_CACHE_TTL = 3600.0  # 1 hour — artist data doesn't change quickly


def _cache_key(query: str) -> str:
    # Punctuation-insensitive: «Azar - Strato» and «Azar strato» must hit the
    # same entry — different keys gave the agent two conflicting fact sets
    # (BPM 95 vs 82) within one conversation.
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]+", " ", query.strip().lower())).strip()


def _bpm_range_midpoint(bpm_range: str) -> float:
    """'90-110 BPM' → 100.0, '' → 0.0"""
    nums = re.findall(r"\d+", bpm_range or "")
    if len(nums) >= 2:
        return (float(nums[0]) + float(nums[1])) / 2
    if len(nums) == 1:
        return float(nums[0])
    return 0.0


def _strip_md_fences(text: str) -> str:
    return re.sub(r"```[a-z]*\n?|```", "", text).strip()


async def research_reference(query: str, *, settings: Settings) -> dict | None:
    """Look up an artist/track reference via Perplexity web search.

    Returns a dict with keys: artist, confidence, ambiguous, genre, era, tempo,
    bpm, tags, similar, production, note, source  — or None on failure/no key.
    """
    if not settings.openrouter_api_key:
        return None

    ck = _cache_key(query)
    cached, exp = _cache.get(ck, (None, 0.0))
    if time.monotonic() < exp:
        logger.debug("artist_research: cache hit for «{}»", query)
        return cached

    try:
        client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=_OPENROUTER_BASE,
            timeout=_TIMEOUT,
        )
        resp = await client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "user", "content": _RESEARCH_PROMPT + query}],
            temperature=0.2,
            max_tokens=_MAX_TOKENS,
        )
        raw = (resp.choices[0].message.content or "").strip()
        raw = _strip_md_fences(raw)
        data = json.loads(raw)
    except Exception as exc:
        logger.warning("artist_research: Perplexity lookup failed for «{}»: {}", query, exc)
        _cache[ck] = (None, time.monotonic() + 60.0)  # short negative-cache
        return None

    confidence = float(data.get("confidence") or 0)
    ambiguous = bool(data.get("ambiguous", False))
    bpm = _bpm_range_midpoint(str(data.get("bpm_range") or ""))
    genre_raw = str(data.get("genre") or "").strip()
    subgenres = [str(s) for s in (data.get("subgenres") or []) if s]
    mood = [str(m) for m in (data.get("mood") or []) if m]
    tags = list(dict.fromkeys(subgenres + mood))[:10]  # deduplicated, capped
    # Never DROP the found genre: canonical_genre("") for unmapped labels like
    # "Hip-Hop/Rap" was blanking the strongest fact in the reference note, and
    # the agent then improvised a genre of its own (2026-07-06 Azar Strato chat).
    genre_val = canonical_genre(genre_raw) or genre_raw or (subgenres[0] if subgenres else "")

    # Perplexity sometimes dumps a whole biography into "matched" despite the
    # prompt — the chat then shows an English dossier instead of a name
    # (2026-07-06 Azar Strato). Keep the name, move the prose to match_reason.
    artist_name = str(data.get("matched") or query).strip()
    if len(artist_name) > 60:
        head = re.split(r"[,(]", artist_name)[0].strip()
        artist_name = head if 0 < len(head) <= 60 else artist_name[:60].rstrip()

    result = {
        "artist": artist_name,
        "reason": str(data.get("match_reason") or "").strip(),
        "title": "",
        "confidence": confidence,
        "ambiguous": ambiguous,
        "genre": genre_val,
        "era": str(data.get("era") or "").strip(),
        "tempo": bpm_to_tempo(bpm) if bpm else "",
        "bpm": bpm,
        "tags": tags,
        "similar": [str(s) for s in (data.get("similar_artists") or []) if s][:6],
        # These three were requested from Perplexity but previously DROPPED
        # here — the deepest part of the research never reached the agent.
        "instruments": [str(i) for i in (data.get("key_instruments") or []) if i][:8],
        "vocal_style": str(data.get("vocal_style") or "").strip(),
        "signature": str(data.get("signature") or "").strip(),
        "production": str(data.get("production_style") or "").strip(),
        "note": str(data.get("note") or "").strip(),
        "source": "perplexity",
    }

    logger.info(
        "artist_research: «{}» → confidence={:.2f} ambiguous={} genre={!r} era={!r} "
        "bpm={} tags={}",
        query, confidence, ambiguous, result["genre"], result["era"],
        int(bpm) if bpm else 0, tags[:4],
    )

    _cache[ck] = (result, time.monotonic() + _CACHE_TTL)
    return result
