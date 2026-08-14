"""Stage 2 of the rebuilt prompt pipeline — fill the gaps, never argue.

Takes a ``ParsedBrief`` (stage 1) and the genre library, and produces the
material for the final Suno style:

    locked  — the user's own statements, always first, never trimmed away
    filler  — texture for dimensions the brief left OPEN, and only those

The rule that makes this different from the old assembler: **a preset fragment
that contradicts a locked statement is dropped, not appended.** The Techno
preset offers "relentless kick drum"; a brief that excludes drums never sees
it. Mood and tempo profiles are consulted only when the brief said nothing
about mood or tempo. There is no random salt at all — variety is not worth
overriding a user.

Contradiction matching here is deliberately INDEPENDENT of the vocabulary in
``prompt_faithfulness``: if the pipeline and its validator shared a synonym
table, the validator could only ever confirm the pipeline's own blind spots.
They overlap, they are not the same list, and disagreements are informative.

Nothing in the request path calls this yet (phase 2 of PROMPT-REBUILD.md).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.services.brief_parser import ParsedBrief
from app.services.genre_blend import blend_genre_preset
from app.services.genre_canonical import canonical_genre
from app.services.genre_data import GENRE_STYLES, MOOD_PROFILES, TEMPO_PROFILES
from app.services.mood_canonical import canonical_mood

# Instrument families and the words that imply them. Used to decide whether a
# preset fragment contradicts an exclusion — "relentless kick drum" contradicts
# "no drums" even though the words differ.
_FAMILY_WORDS: dict[str, tuple[str, ...]] = {
    "drums": (
        "drum", "kick", "snare", "hi-hat", "hihat", "hats", "percussion",
        "percussive", "808", "909", "four-on-the-floor", "backbeat", "breakbeat",
        "rimshot", "clap", "cymbal", "tom",
    ),
    "beat": ("beat", "groove", "rhythmic pulse", "four-on-the-floor", "pulse"),
    "bass": ("bass", "sub-bass", "808", "low-end"),
    "guitars": ("guitar", "telecaster", "stratocaster", "riff", "fretboard"),
    "piano": ("piano", "rhodes", "keys", "keyboard"),
    "strings": ("string", "violin", "cello", "viola", "pizzicato"),
    "brass": ("brass", "trumpet", "trombone", "horn", "fanfare", "sax"),
    "synthesizers": ("synth", "oscillator", "arpeggio", "pad", "moog", "juno", "prophet"),
    "vocals": ("vocal", "voice", "sing", "sung", "choir", "chant", "falsetto"),
    "percussion": ("percussion", "percussive", "conga", "shaker", "tambourine"),
}

_BPM_RE = re.compile(r"(\d{2,3})\s*(?:-|–|to)?\s*(\d{2,3})?\s*bpm", re.IGNORECASE)

# The tempo picker in the UI is labelled with these ranges ("🏃 Fast · 120–140
# BPM"), but only the bucket name reaches the backend. Resolving it back to the
# advertised numbers is what makes the prompt say what the user was shown —
# and gives every other BPM statement something to lose to.
_TEMPO_BPM: dict[str, tuple[int, int]] = {
    "very_slow": (60, 80),
    "slow": (80, 100),
    "medium": (100, 120),
    "fast": (120, 140),
    "very_fast": (140, 180),
}

# Words that imply a beat. Excluding drums has to take these with it, or the
# prompt asks for no drums and a "steady groove" in the same breath.
_RHYTHM_IMPLYING: tuple[str, ...] = (
    "groove", "driving", "pulse", "pulsing", "four-on-the-floor", "backbeat",
    "danceable", "club-ready", "rhythmic", "beat-driven", "steady rhythm",
)
_RHYTHM_FAMILIES: frozenset[str] = frozenset({"drums", "beat", "percussion", "kick"})

_TEMPO_WORDS: tuple[str, ...] = (
    "slow", "fast", "medium", "mid-tempo", "midtempo", "uptempo", "downtempo",
    "adagio", "moderato", "allegro", "rapid", "brisk", "driving",
)


def _is_artist_reference(fragment: str) -> bool:
    """"Robert Hood / Ricardo Villalobos influenced" — Suno rejects artist names.

    81 preset fragments carry one. A genre reference ("rock-influenced energy",
    "hip-hop influenced drums") has no capitalised name and is kept.
    """
    low = fragment.lower()
    if "influenc" not in low and "inspired" not in low:
        return False
    return any(word[:1].isupper() for word in fragment.split() if len(word) > 2)


def _words_for(term: str) -> tuple[str, ...]:
    """Words that mean ``term`` — its family's words, or the term itself."""
    key = term.strip().lower()
    for family, words in _FAMILY_WORDS.items():
        if key == family or key in words:
            return (family, *words)
    return (key,)


def _fragment_conflicts(fragment: str, forbidden: list[str]) -> bool:
    low = fragment.lower()
    for term in forbidden:
        for word in _words_for(term):
            if re.search(r"\b" + re.escape(word), low):
                return True
    if any(t.strip().lower() in _RHYTHM_FAMILIES for t in forbidden):
        if any(word in low for word in _RHYTHM_IMPLYING):
            return True
    return False


def _fragment_states_other_bpm(fragment: str, bpm_min: int | None, bpm_max: int | None) -> bool:
    """True when the fragment names a BPM that fights the locked one."""
    if bpm_min is None:
        return False
    high = bpm_max or bpm_min
    for match in _BPM_RE.finditer(fragment):
        low_val = int(match.group(1))
        high_val = int(match.group(2) or match.group(1))
        if high_val < bpm_min or low_val > high:
            return True
    return False


@dataclass
class StyleSpec:
    """What stage 3 composes from — locked material plus optional texture."""

    locked: list[str] = field(default_factory=list)
    filler: list[str] = field(default_factory=list)
    negative_tags: list[str] = field(default_factory=list)
    style_weight: float = 0.85
    weirdness: float = 0.30
    dropped: list[str] = field(default_factory=list)   # fragments refused, for logs

    def render(self, limit: int = 1000) -> str:
        """Deterministic style text — locked first, filler while it fits.

        Stage 3 will replace this with a GPT composer. Until then this is a
        complete, measurable pipeline on its own, and it is what runs when the
        composer is unavailable.
        """
        seen: set[str] = set()
        out: list[str] = []
        for part in self.locked:
            cleaned = part.strip().strip(",")
            if cleaned and cleaned.lower() not in seen:
                seen.add(cleaned.lower())
                out.append(cleaned)
        text = ", ".join(out)
        for part in self.filler:
            cleaned = part.strip().strip(",")
            if not cleaned or cleaned.lower() in seen:
                continue
            if len(text) + 2 + len(cleaned) > limit:
                continue
            seen.add(cleaned.lower())
            text = f"{text}, {cleaned}" if text else cleaned
        return text[:limit]

    def negative_tags_text(self, limit: int = 200) -> str:
        seen: set[str] = set()
        tags = [t for t in self.negative_tags if not (t.lower() in seen or seen.add(t.lower()))]
        return ", ".join(tags)[:limit].rstrip(" ,")


def _resolve_preset(raw: str, learned: dict[str, dict] | None) -> dict:
    """Preset for a genre phrase: static → learned → blended hybrid → {}."""
    if not raw:
        return {}
    key = canonical_genre(raw)
    if key:
        return GENRE_STYLES.get(key, {})
    if learned:
        found = learned.get(raw.strip().lower())
        if found and found.get("style"):
            return found
    return blend_genre_preset(raw) or {}


def build_style_spec(
    parsed: ParsedBrief,
    *,
    learned_presets: dict[str, dict] | None = None,
    for_background: bool | None = None,
) -> StyleSpec:
    """Merge a parsed brief with genre knowledge — gaps only, no overrides."""
    spec = StyleSpec()
    open_fields = {f.lower() for f in parsed.open}
    forbidden = list(parsed.instruments_forbidden)

    # ── LOCKED: the user's own statements, in a stable order ────────────
    genre_phrase = " ".join(p for p in (parsed.subgenre, parsed.genre) if p).strip()
    if genre_phrase:
        spec.locked.append(genre_phrase)
    if parsed.vocals == "none":
        spec.locked.append("instrumental, no vocals")
    elif parsed.vocals in {"male", "female"}:
        spec.locked.append(f"{parsed.vocals} vocals")
    if parsed.instruments_required:
        spec.locked.append("featuring " + ", ".join(parsed.instruments_required[:8]))
    if parsed.mood:
        spec.locked.append(parsed.mood)

    # ONE tempo statement, resolved once and used everywhere below. Priority:
    # a BPM the user wrote > the range behind the tempo bucket they picked.
    bpm_min, bpm_max = parsed.bpm_min, parsed.bpm_max
    if not bpm_min:
        span = _TEMPO_BPM.get(parsed.tempo_word.strip().lower().replace(" ", "_"))
        if span:
            bpm_min, bpm_max = span
    if bpm_min:
        text = f"{bpm_min}-{bpm_max}" if bpm_max and bpm_max != bpm_min else str(bpm_min)
        spec.locked.append(f"around {text} BPM")
    elif parsed.tempo_word:
        spec.locked.append(f"{parsed.tempo_word.replace('_', ' ')} tempo")
    if parsed.era:
        spec.locked.append(f"{parsed.era} production")
    spec.locked.extend(parsed.notes[:4])
    if parsed.usage:
        usage = parsed.usage.strip()
        lead = "" if usage.lower().startswith(("for ", "as ", "background")) else "for "
        spec.locked.append(f"intended {lead}{usage}")

    spec.negative_tags = list(forbidden)

    # ── FILLER: texture for OPEN dimensions only ────────────────────────
    preset = _resolve_preset(parsed.subgenre, learned_presets) or _resolve_preset(
        parsed.genre, learned_presets
    )
    if preset.get("style"):
        spec.style_weight = float(preset.get("weight", 0.85))
        spec.weirdness = float(preset.get("constraint", 0.30))

    for fragment in (f.strip() for f in preset.get("style", "").split(",")):
        if not fragment:
            continue
        if _is_artist_reference(fragment):
            spec.dropped.append(fragment)
            continue
        if _fragment_conflicts(fragment, forbidden):
            spec.dropped.append(fragment)
            continue
        # Tempo is settled above; anything else claiming a tempo is a second,
        # conflicting statement. Live failure 2026-08-14: the Techno preset's
        # "driving 130-140 BPM" survived next to a "medium tempo" and Suno
        # obeyed the preset.
        if bpm_min and _BPM_RE.search(fragment):
            spec.dropped.append(fragment)
            continue
        if _fragment_states_other_bpm(fragment, bpm_min, bpm_max):
            spec.dropped.append(fragment)
            continue
        if (bpm_min or parsed.tempo_word) and any(
            w in fragment.lower() for w in _TEMPO_WORDS
        ):
            spec.dropped.append(fragment)
            continue
        spec.filler.append(fragment)

    # Mood texture only when the brief said nothing about mood.
    if "mood" in open_fields and not parsed.mood:
        profile = MOOD_PROFILES.get(canonical_mood(parsed.mood) or "")
        if profile:
            spec.filler.append(profile["description"])

    # Tempo texture only when the brief settled no tempo at all.
    if "bpm" in open_fields and not bpm_min and not parsed.tempo_word:
        profile = TEMPO_PROFILES.get("medium")
        if profile:
            spec.filler.append(profile["description"])

    # A full dramatic arc is wrong for background music, and the brief has to
    # actually leave the arrangement open before we impose one.
    background = (
        for_background
        if for_background is not None
        else any(w in parsed.usage.lower() for w in ("background", "backing", "under"))
    )
    if "arrangement" in open_fields and not background:
        spec.filler.append("multi-section arrangement, intro build development and outro")

    # Filler must never smuggle back what the brief excluded.
    spec.filler = [f for f in spec.filler if not _fragment_conflicts(f, forbidden)]
    return spec


__all__ = ["StyleSpec", "build_style_spec"]
