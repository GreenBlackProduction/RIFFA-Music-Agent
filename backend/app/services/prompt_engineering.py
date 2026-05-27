"""Suno V5.5 prompt builder — unified pipeline for agent + form paths.

Now imports genre presets, moods, tempos, dynamic elements, era modifiers,
and context combinations from ``genre_data.py``. Anti-repetition tracking
delegates to ``anti_repeat.py``.

Key features:
  * 100+ genre presets with subgenre, era affinity, and parent genre
  * 8 era modifiers (1950s-2020s) with production, instruments, vibe slices
  * 150+ dynamic elements across 8 categories with genre-biased selection
  * Per-user anti-repetition fingerprint tracking
  * Agent-supplied techniques and constraints flow through as Step 7.5/7.6
  * ``style_prompt`` (Step 8) is the highest-authority signal
  * Backward-compatible: all new fields have defaults
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any

from app.services.genre_data import (
    CONTEXT_COMBINATIONS,
    DYNAMIC_ELEMENTS,
    ERA_MODIFIERS,
    GENRE_STYLES,
    GENRE_TECHNIQUE_BIAS,
    MOOD_PROFILES,
    TEMPO_PROFILES,
)


# ══════════════════════════════════════════════════════════════════════════════
# Data imported from ``genre_data.py`` — see that file for the full library.
# ══════════════════════════════════════════════════════════════════════════════


@dataclass
class SongParams:
    user_description: str
    genre: str = ""
    custom_genre: str = ""
    subgenre: str = ""          # e.g. "Dark Synthwave", "Liquid DnB"
    mood: str = ""
    tempo: str = ""
    vocal: str = ""             # "male", "female", "no_vocal", ""
    era: str = ""               # "1960s", "1980s", "2020s", etc.
    style_prompt: str = ""      # agent research + style description (highest authority)
    techniques: list[str] = field(default_factory=list)   # specific techniques from agent
    key_instruments: list[str] = field(default_factory=list)  # explicit instruments from agent research
    constraints: str = ""       # hard constraints from agent ("no synths", etc.)
    suggested_bpm: str = ""     # BPM hint from agent


def _normalize(value: str) -> str:
    return value.strip().lower()


def build_suno_style(
    params: SongParams,
    *,
    rng: random.Random | None = None,
    user_id: int | None = None,
) -> tuple[str, float, float]:
    """Build Suno V5.5 (style, weight, constraint).

    Unified pipeline for both agent and form paths. Steps:

    1. Genre preset lookup → sample 70-90% fragments, shuffle.
    2. Small ±0.05 jitter on weight/constraint.
    3. Deep mood influence (description + vocals + instruments + production).
    4. Tempo description from BPM-anchored profiles.
    4.5. ERA OVERLAY (NEW) — production, instruments, vibe from the decade.
    5. Vocal gender phrase.
    6. Iconic context combinations (genre, mood, tempo) triple-nudges.
    7. Dynamic salt — genre-biased selection with anti-repeat via user_id.
    7.5. AGENT TECHNIQUES (NEW) — explicit techniques from the agent.
    7.6. AGENT CONSTRAINTS (NEW) — hard constraints from the agent.
    8. ``style_prompt`` as highest authority (agent research + description).
    9. Assemble + trim to 1000 chars.

    Pass an explicit ``rng`` for tests. Pass ``user_id`` for anti-repetition.
    """
    rng = rng or random.Random()

    genre_key = params.custom_genre or params.genre
    preset = GENRE_STYLES.get(genre_key, {})

    if preset.get("style"):
        base_style = preset["style"]
        weight = float(preset.get("weight", 0.80))
        constraint = float(preset.get("constraint", 0.35))
    else:
        # Unknown genre: fall back to the genre word itself, modest defaults.
        base_style = (genre_key or "music").lower()
        weight = 0.80
        constraint = 0.40

    # Step 1: shuffle 70-90% of comma-separated fragments
    fragments = [f.strip() for f in base_style.split(",") if f.strip()]
    if len(fragments) > 4:
        sample_size = max(int(len(fragments) * rng.uniform(0.7, 0.9)), 5)
        sample_size = min(sample_size, len(fragments))
        fragments = rng.sample(fragments, sample_size)
        rng.shuffle(fragments)
    style_parts: list[str] = list(fragments)

    # Step 2: small jitter
    weight = max(0.70, min(1.0, weight + rng.uniform(-0.05, 0.05)))
    constraint = max(0.10, min(0.60, constraint + rng.uniform(-0.05, 0.05)))

    # Step 3: deep mood influence
    mood_key = _normalize(params.mood)
    mood_data = MOOD_PROFILES.get(mood_key)
    if mood_data:
        style_parts.append(mood_data["description"])
        if params.vocal and params.vocal != "no_vocal":
            style_parts.append(mood_data["vocals"])
        style_parts.append(mood_data["instruments"])
        style_parts.append(mood_data["production"])
        weight = min(1.0, weight + float(mood_data.get("weight_modifier", 0.0)))
        constraint = max(
            0.0,
            min(1.0, constraint + float(mood_data.get("constraint_modifier", 0.0))),
        )

    # Step 4: tempo description
    tempo_key = _normalize(params.tempo)
    tempo_data = TEMPO_PROFILES.get(tempo_key)
    if tempo_data:
        style_parts.append(tempo_data["description"])
    # BPM hint from agent overrides / supplements
    if params.suggested_bpm:
        style_parts.append(f"around {params.suggested_bpm}")

    # Step 4.5: era overlay (NEW — production, instruments, vibe from decade)
    if params.era:
        era_data = ERA_MODIFIERS.get(params.era)
        if era_data:
            style_parts.append(era_data["production"])
            style_parts.append(era_data["vibe"])
            # Include era instruments 70% of the time to avoid overwhelming the genre
            if rng.random() > 0.3:
                style_parts.append(era_data["instruments"])
            weight = min(1.0, weight + 0.02)

    # Step 5: vocal gender phrase
    if params.vocal in {"male", "female"}:
        style_parts.append(f"{params.vocal} vocals, {params.vocal} voice, {params.vocal} vocal delivery")
    elif params.vocal == "no_vocal":
        style_parts.append("instrumental only, no vocals")

    # Step 6: iconic context bumps
    ctx_key = (genre_key, mood_key, tempo_key)
    ctx_data = CONTEXT_COMBINATIONS.get(ctx_key)
    if ctx_data:
        style_parts.append(ctx_data["additional"])
        weight = min(1.0, weight + float(ctx_data.get("weight_boost", 0.0)))

    # Step 7: dynamic salt — genre-biased anti-repeat selection
    if user_id is not None:
        try:
            from app.services.anti_repeat import record_generation, select_dynamic_elements as _select
            picks = _select(user_id, genre_key, DYNAMIC_ELEMENTS, GENRE_TECHNIQUE_BIAS, rng)
            style_parts.extend(picks)
            # Record this generation so future calls avoid these elements
            record_generation(user_id, genre_key, mood_key, tempo_key, picks)
        except ImportError:
            # Fallback: simple random selection
            pool = list(DYNAMIC_ELEMENTS.keys())
            num_dynamic = rng.randint(2, 3)
            for category in rng.sample(pool, min(num_dynamic, len(pool))):
                style_parts.append(rng.choice(DYNAMIC_ELEMENTS[category]))
    else:
        # No user tracking — simple random (backward compatible)
        pool = list(DYNAMIC_ELEMENTS.keys())
        num_dynamic = rng.randint(2, 3)
        for category in rng.sample(pool, min(num_dynamic, len(pool))):
            style_parts.append(rng.choice(DYNAMIC_ELEMENTS[category]))

    # Step 7.4: agent subgenre (NEW — most specific genre signal)
    if params.subgenre:
        style_parts.append(params.subgenre.strip())

    # Step 7.45: agent key_instruments (NEW — explicit instrument lineup from research)
    if params.key_instruments:
        instruments_phrase = ", ".join(i.strip() for i in params.key_instruments[:8] if i)
        if instruments_phrase:
            style_parts.append(f"featuring {instruments_phrase}")

    # Step 7.5: agent-specified techniques (NEW — explicit, not random)
    if params.techniques:
        for tech in params.techniques[:4]:  # max 4 to avoid bloat
            style_parts.append(tech.strip())

    # Step 7.6: hard constraints from agent (NEW)
    if params.constraints:
        style_parts.append(params.constraints.strip())

    # Step 8: user override / agent prompt has the highest authority
    if params.style_prompt:
        style_parts.append(params.style_prompt.strip())

    # Step 9: assemble + trim to Suno V5.5 limit
    raw = ", ".join(p for p in style_parts if p)
    if len(raw) > 1000:
        raw = raw[:997].rstrip(", ") + "..."

    return raw, round(weight, 2), round(constraint, 2)


def vocal_gender(vocal: str) -> str | None:
    """Map vocal preference to Suno ``vocalGender`` code (``m`` / ``f``).

    ``no_vocal`` and unknown values return ``None`` (Suno will pick).
    """
    return {"male": "m", "female": "f"}.get(vocal)


__all__ = [
    "CONTEXT_COMBINATIONS",
    "DYNAMIC_ELEMENTS",
    "ERA_MODIFIERS",
    "GENRE_STYLES",
    "GENRE_TECHNIQUE_BIAS",
    "MOOD_PROFILES",
    "TEMPO_PROFILES",
    "SongParams",
    "build_suno_style",
    "vocal_gender",
]
