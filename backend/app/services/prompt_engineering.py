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
    GENRE_ERA_INSTRUMENTS,
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
    negative_tags: list[str] = field(default_factory=list)  # exclusions → Suno negativeTags param


def _normalize(value: str) -> str:
    return value.strip().lower()


_VOCAL_LEAK_RE = None  # compiled lazily below


def _cap_text(text: str, limit: int) -> str:
    """Trim to ``limit`` chars at the last phrase/word boundary — never mid-word."""
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    for sep in (". ", "; ", ", ", " "):
        pos = cut.rfind(sep)
        if pos > limit * 0.6:
            return cut[:pos].rstrip(" .,;:-—")
    return cut.rstrip(" .,;:-—")


def cap_style_len(style: str, limit: int = 990) -> str:
    """Cap a (GPT-enriched) style string to Suno's limit at a phrase boundary.

    The GPT enricher occasionally returns 2000+ chars; suno.py then silently
    hard-cuts at 1000 losing the tail mid-sentence. Trim here, loudly.
    """
    if len(style) <= limit:
        return style
    from loguru import logger
    trimmed = _cap_text(style, limit)
    logger.warning(
        "style over Suno limit: {} chars -> trimmed to {}", len(style), len(trimmed)
    )
    return trimmed


def _drop_vocal_phrases(parts: list[str]) -> list[str]:
    """Remove vocal-descriptor filler on instrumental tracks.

    Genre presets and mood profiles carry phrases like "layered vocals" that
    directly contradict an instrumental brief (seen live: an instrumental
    reference track opened with "layered vocals" while "no vocals" sat at the
    truncated tail). Keeps everything that doesn't mention singing.
    """
    global _VOCAL_LEAK_RE
    if _VOCAL_LEAK_RE is None:
        import re
        _VOCAL_LEAK_RE = re.compile(
            r"vocal|voice|voix|sing|sung|choir|chant|falsetto|acapella|a cappella|"
            r"вокал|голос|поёт|пени[ея]|хор",
            re.IGNORECASE,
        )
    return [p for p in parts if not _VOCAL_LEAK_RE.search(p)]


def _drop_negated_phrases(parts: list[str], negatives: list[str]) -> list[str]:
    """Drop filler phrases that mention anything the user excluded.

    Genre presets carry fragments like "synthesized sounds" that directly
    fight a "synthesizers" negativeTag — the text re-attracts what the tag
    removes. Stems are matched loosely (synthesizers → "synth" also catches
    "synthesized", "synth pads")."""
    stems: list[str] = []
    for tag in negatives:
        for word in tag.lower().split():
            if "synth" in word:
                stems.append("synth")
                continue
            if word.endswith("s") and not word.endswith("ss"):
                word = word[:-1]
            if len(word) >= 4:
                stems.append(word)
    if not stems:
        return parts
    return [p for p in parts if not any(st in p.lower() for st in stems)]


_NEGATION_RE = None  # compiled lazily

# Common Russian exclusion objects → English negativeTags (Suno wants English).
_RU_NEG_MAP = (
    ("синтезатор", "synthesizers"),
    ("синтов", "synthesizers"),
    ("синты", "synthesizers"),
    ("вокал", "vocals"),
    ("голос", "vocals"),
    ("барабан", "drums"),
    ("ударн", "drums"),
    ("гитар", "guitars"),
    ("электрон", "electronic elements"),
    ("автотюн", "autotune"),
    ("пиан", "piano"),
    ("скрип", "strings"),
    ("струнн", "strings"),
    ("духов", "brass"),
)


def _translate_negative(obj: str) -> str:
    low = obj.lower()
    for stem, en in _RU_NEG_MAP:
        if stem in low:
            return en
    return obj


def extract_negatives(text: str, *, keep_vocal_text: bool = False) -> tuple[str, list[str]]:
    """Pull negation phrases ("no synths", "без синтезаторов") OUT of style text.

    Text-to-music models treat negated words as positive attractors — "no
    synths" in the style string literally injects the token "synths" and makes
    synths MORE likely. Suno has a dedicated ``negativeTags`` param for
    exclusions, so we strip negations from the text and return them as tags.

    Returns ``(cleaned_text, tags)``. With ``keep_vocal_text=True`` vocal
    negations ("no vocals") stay in the text (Suno honours that specific
    phrase and it backs up the ``instrumental`` flag) but are still tagged.
    """
    global _NEGATION_RE, _VOCAL_LEAK_RE
    if not text:
        return text, []
    import re
    if _NEGATION_RE is None:
        _NEGATION_RE = re.compile(
            r"(?:\b(?:no|without|avoid|never use|not?\s+includ\w*)\s+"
            r"|\b(?:без|никаких|никакого|никакой|не\s+(?:использовать|добавля\w+|нужн\w+))\s+)"
            r"([a-zа-яё0-9][a-zа-яё0-9'’\- ]{1,50}?)(?=\s*(?:[,.;:!)\n]|$))",
            re.IGNORECASE,
        )
    if _VOCAL_LEAK_RE is None:
        _drop_vocal_phrases([])  # compile the vocal regex
    tags: list[str] = []
    spans: list[tuple[int, int]] = []
    for m in _NEGATION_RE.finditer(text):
        obj = m.group(1).strip(" .,;:-—")
        if not obj:
            continue
        if keep_vocal_text and _VOCAL_LEAK_RE.search(obj):
            tags.append(_translate_negative(obj))
            continue  # phrase stays in the text
        tags.append(_translate_negative(obj))
        spans.append(m.span())
    if spans:
        chunks: list[str] = []
        last = 0
        for start, end in spans:
            chunks.append(text[last:start])
            last = end
        chunks.append(text[last:])
        text = "".join(chunks)
        text = re.sub(r"\s*,\s*(?=[,.;])", "", text)
        text = re.sub(r",\s*,+", ", ", text)
        text = re.sub(r"\s+,", ",", text)
        text = re.sub(r"\s{2,}", " ", text)
        text = re.sub(r"(^|[.;]\s*),\s*", r"\1", text).strip(" ,;")
    # dedupe, keep order
    seen: set[str] = set()
    uniq = [t for t in tags if not (t.lower() in seen or seen.add(t.lower()))]
    return text, uniq


def build_suno_style(
    params: SongParams,
    *,
    rng: random.Random | None = None,
    user_id: int | None = None,
    for_cover: bool = False,
) -> tuple[str, float, float, str]:
    """Build Suno V5.5 (style, weight, constraint, negative_tags).

    Unified pipeline for both agent and form paths. BUDGET-AWARE assembly:
    the reference brief (subgenre, style_prompt, instruments, techniques,
    constraints, vocal, BPM) forms a PRIORITY block that opens the style and
    always survives the 1000-char cap; preset/mood/era/salt texture is FILLER
    appended only while budget remains. Previously the reference was appended
    last and was the first thing the trim cut off — generic preset salad won.

    Extra rules:
      * rich brief (style_prompt/techniques/key_instruments present) → random
        "dynamic salt" is skipped and preset fragments are capped, so the
        reference doesn't compete with filler;
      * instrumental (vocal == no_vocal) → vocal-descriptor filler is dropped
        ("layered vocals" must never contradict "no vocals");
      * reference brief (style_prompt) → styleWeight >= 0.95 and
        weirdnessConstraint <= 0.15, so Suno follows the text instead of
        improvising;
      * for_cover skips the full-length structure nudge;
      * negations are NEVER left in the style text — extract_negatives pulls
        them out of constraints/style_prompt and they come back as the 4th
        return value (comma-joined string for Suno's ``negativeTags``).

    Pass an explicit ``rng`` for tests. Pass ``user_id`` for anti-repetition.
    """
    rng = rng or random.Random()

    rich_brief = bool(params.style_prompt or params.techniques or params.key_instruments)

    # Canonicalise the genre so near-misses / agent free-text ("Progressive Rock",
    # "lo-fi", RU spellings) still land on a rich preset instead of the bare-word
    # fallback. No confident match → "" → keep the raw word.
    from app.services.genre_canonical import canonical_genre as _canonical_genre
    raw_genre_key = params.custom_genre or params.genre
    genre_key = _canonical_genre(raw_genre_key) or raw_genre_key
    preset = GENRE_STYLES.get(genre_key, {})

    if preset.get("style"):
        base_style = preset["style"]
        weight = float(preset.get("weight", 0.80))
        constraint = float(preset.get("constraint", 0.35))
    else:
        base_style = (genre_key or "music").lower()
        weight = 0.80
        constraint = 0.40

    # ── Negations never stay in style text — collect them for negativeTags ─
    negatives: list[str] = [t.strip() for t in params.negative_tags if t and t.strip()]
    style_prompt, neg = extract_negatives(params.style_prompt, keep_vocal_text=True)
    negatives.extend(neg)
    constraints, neg = extract_negatives(params.constraints)
    negatives.extend(neg)
    if params.vocal == "no_vocal":
        negatives.append("vocals")

    # ── PRIORITY block — opens the style, guaranteed budget ──────────────
    priority: list[str] = []
    if params.subgenre:
        priority.append(params.subgenre.strip())
    if style_prompt:
        # Reference brief gets up to 550 chars so filler still adds texture.
        priority.append(_cap_text(style_prompt, 550))
    if params.key_instruments:
        instruments_phrase = ", ".join(i.strip() for i in params.key_instruments[:8] if i)
        if instruments_phrase:
            priority.append(f"featuring {instruments_phrase}")
    for tech in params.techniques[:4]:
        priority.append(tech.strip())
    if constraints:
        priority.append(constraints.strip())
    # Hard facts: vocal mode and BPM are never filler.
    if params.vocal in {"male", "female"}:
        priority.append(f"{params.vocal} vocals, {params.vocal} vocal delivery")
    elif params.vocal == "no_vocal":
        priority.append("instrumental only, no vocals")
    if params.suggested_bpm:
        priority.append(f"around {params.suggested_bpm}")

    # ── FILLER — texture that fills remaining budget, cut first ─────────
    filler: list[str] = []

    # Preset fragments (fewer when the brief is rich — reference leads).
    fragments = [f.strip() for f in base_style.split(",") if f.strip()]
    if len(fragments) > 4:
        if rich_brief:
            fragments = rng.sample(fragments, min(4, len(fragments)))
        else:
            sample_size = max(int(len(fragments) * rng.uniform(0.7, 0.9)), 5)
            sample_size = min(sample_size, len(fragments))
            fragments = rng.sample(fragments, sample_size)
        rng.shuffle(fragments)
    filler.extend(fragments)

    # Small jitter on the numeric knobs.
    weight = max(0.70, min(1.0, weight + rng.uniform(-0.05, 0.05)))
    constraint = max(0.10, min(0.60, constraint + rng.uniform(-0.05, 0.05)))

    # Mood influence (canonicalise freeform agent moods).
    from app.services.mood_canonical import canonical_mood as _canonical_mood
    raw_mood = _normalize(params.mood)
    mood_key = _canonical_mood(raw_mood) or raw_mood
    mood_data = MOOD_PROFILES.get(mood_key)
    if mood_data:
        filler.append(mood_data["description"])
        if params.vocal and params.vocal != "no_vocal":
            filler.append(mood_data["vocals"])
        # Fixed per-mood instrument sets made generations sound same-y; skip
        # them whenever the agent already named the instruments.
        if not params.key_instruments:
            filler.append(mood_data["instruments"])
        filler.append(mood_data["production"])
        weight = min(1.0, weight + float(mood_data.get("weight_modifier", 0.0)))
        constraint = max(
            0.0,
            min(1.0, constraint + float(mood_data.get("constraint_modifier", 0.0))),
        )

    # Tempo texture (the hard BPM number already sits in priority).
    tempo_key = _normalize(params.tempo)
    tempo_data = TEMPO_PROFILES.get(tempo_key)
    if tempo_data:
        filler.append(tempo_data["description"])

    # Era overlay.
    if params.era:
        era_data = ERA_MODIFIERS.get(params.era)
        if era_data:
            filler.append(era_data["production"])
            filler.append(era_data["vibe"])
            ge_instr = GENRE_ERA_INSTRUMENTS.get(genre_key, {}).get(params.era)
            if ge_instr:
                filler.append(ge_instr)
            elif rng.random() > 0.3:
                filler.append(era_data["instruments"])
            weight = min(1.0, weight + 0.02)

    # Iconic context bumps.
    ctx_key = (genre_key, mood_key, tempo_key)
    ctx_data = CONTEXT_COMBINATIONS.get(ctx_key)
    if ctx_data:
        filler.append(ctx_data["additional"])
        weight = min(1.0, weight + float(ctx_data.get("weight_boost", 0.0)))

    # Dynamic salt — rich briefs get ONE budget-protected pick (variety
    # between takes without competing with the reference); plain briefs 2-3.
    salt_count = 1 if rich_brief else rng.randint(2, 3)
    if user_id is not None:
        try:
            from app.services.anti_repeat import record_generation, select_dynamic_elements as _select
            picks = _select(user_id, genre_key, DYNAMIC_ELEMENTS, GENRE_TECHNIQUE_BIAS, rng)[:salt_count]
            filler.extend(picks)
            record_generation(user_id, genre_key, mood_key, tempo_key, picks)
        except ImportError:
            pool = list(DYNAMIC_ELEMENTS.keys())
            for category in rng.sample(pool, min(salt_count, len(pool))):
                filler.append(rng.choice(DYNAMIC_ELEMENTS[category]))
    else:
        pool = list(DYNAMIC_ELEMENTS.keys())
        for category in rng.sample(pool, min(salt_count, len(pool))):
            filler.append(rng.choice(DYNAMIC_ELEMENTS[category]))

    # Structure nudge (kept for non-covers; cheap and useful, lowest priority).
    if not for_cover:
        filler.append("full-length multi-section arrangement, intro build development and outro")

    # Instrumental guard: no vocal descriptors may leak in from filler.
    if params.vocal == "no_vocal":
        filler = _drop_vocal_phrases(filler)

    # Excluded-instrument guard: filler must not mention negativeTags terms.
    if negatives:
        filler = _drop_negated_phrases(filler, negatives)

    # ── Budget assembly: priority first, filler while it fits ───────────
    LIMIT = 1000
    seen: set[str] = set()
    parts: list[str] = []
    for p in priority:
        p = p.strip().strip(",")
        if p and p.lower() not in seen:
            seen.add(p.lower())
            parts.append(p)
    raw = ", ".join(parts)
    if len(raw) > LIMIT:  # a huge reference alone — trim at phrase boundary
        raw = _cap_text(raw, LIMIT)
    else:
        for f in filler:
            f = f.strip().strip(",")
            if not f or f.lower() in seen:
                continue
            if len(raw) + 2 + len(f) > LIMIT:
                continue  # skip pieces that don't fit; try shorter ones
            seen.add(f.lower())
            raw = f"{raw}, {f}" if raw else f
    # Reference brief → obey the text: high style weight, low weirdness.
    if params.style_prompt:
        weight = max(weight, 0.95)
        constraint = min(constraint, 0.15)

    # Exclusions → comma-joined string for Suno's negativeTags param.
    seen_neg: set[str] = set()
    neg_tags = ", ".join(
        t for t in negatives if not (t.lower() in seen_neg or seen_neg.add(t.lower()))
    )[:200].rstrip(" ,")

    return raw, round(weight, 2), round(constraint, 2), neg_tags


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
    "extract_negatives",
    "vocal_gender",
]
