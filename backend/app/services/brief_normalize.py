"""Normalize free-typed genre input into a clean brief via a cheap GPT call.

The agent's scripted wizard builds music params on the client with NO GPT, so a
free-typed "genre" is stored verbatim — e.g. a user typing «Мне нужен mahtrock»
(plus a description «душевный японский матрок») ended up with
``custom_genre = "Мне нужен mahtrock"``. That junk then flows into the Suno
style and into the library/stats genre column. This module turns such freeform
text into a clean ``{genre, subgenre, mood, tempo}`` brief with gpt-4o-mini.

Fail-safe: any error returns ``None`` and the caller keeps the raw input.
"""

from __future__ import annotations

import json

from loguru import logger
from openai import AsyncOpenAI

from app.core.config import Settings

_SYS = (
    "You are a music-tagging assistant. The user described the music they want — "
    "possibly in Russian, with typos, or as a full sentence. Extract a clean brief. "
    "Return ONLY raw JSON with these keys:\n"
    '{"genre": "<single canonical English genre, e.g. \\"Math Rock\\", \\"Lo-Fi Hip-Hop\\">", '
    '"subgenre": "<more specific style or empty>", '
    '"mood": "<one English word: calm/sad/aggressive/dreamy/energetic/… or empty>", '
    '"tempo": "<slow|medium|fast or empty>"}\n'
    "Rules: map slang/typos to the real genre (e.g. «матрок»/«mahtrock» → Math Rock). "
    "If you genuinely cannot tell the genre, set \"genre\" to an empty string. "
    "Never invent an unrelated genre."
)


async def normalize_freeform_genre(
    custom_genre: str,
    description: str,
    *,
    settings: Settings,
) -> dict[str, str] | None:
    """Return a clean ``{genre, subgenre, mood, tempo}`` brief, or ``None``.

    ``None`` means "couldn't improve it" — the caller must keep the raw input.
    """
    text = f"{custom_genre} {description}".strip()
    if not text:
        return None
    api_key = settings.apiyi_key or settings.openai_api_key
    if not api_key:
        return None

    client = AsyncOpenAI(api_key=api_key, base_url=settings.openai_base_url, timeout=12.0)
    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _SYS},
                {"role": "user", "content": text},
            ],
            temperature=0,
            max_tokens=120,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
    except Exception as exc:
        logger.warning("[brief] normalize failed for {!r}: {}", text[:60], exc)
        return None

    genre = str(data.get("genre") or "").strip()
    if not genre:
        return None
    result = {
        "genre": genre[:64],
        "subgenre": str(data.get("subgenre") or "").strip()[:64],
        "mood": str(data.get("mood") or "").strip()[:32],
        "tempo": str(data.get("tempo") or "").strip()[:32],
    }
    logger.info("[brief] normalized {!r} → {}", text[:60], result)
    return result
