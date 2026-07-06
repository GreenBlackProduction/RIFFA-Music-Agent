"""Deterministic preset blender for hybrid genre phrases.

«experimental electronic dub jazz» is not in GENRE_STYLES, but Electronic and
Jazz are. Instead of falling back to a bare word (or worse — flattening the
whole brief onto the parent Jazz preset), we split the phrase into KNOWN
component genres (longest-n-gram match via canonical_genre) plus leftover
modifier words, and blend the components' most-defining fragments into a
synthetic preset. The raw phrase itself opens the style — Suno reads hybrid
labels well; the fragments add the concrete instrument/production texture.

Pure function of GENRE_STYLES — no I/O, safe to call from build_suno_style.
"""

from __future__ import annotations

import re

from app.services.genre_canonical import canonical_genre
from app.services.genre_data import GENRE_STYLES

_MAX_NGRAM = 3
_WORD_RE = re.compile(r"[a-zA-Zа-яёА-ЯЁ0-9&+]+")


def blend_genre_preset(phrase: str) -> dict | None:
    """Blend a hybrid genre phrase into a preset dict, or ``None``.

    Returns ``None`` when the phrase has no known component genres, or when it
    is a plain single genre with no modifiers (exact matches are the caller's
    fast path — this function must never shadow them).
    """
    phrase = (phrase or "").strip()
    if not phrase:
        return None
    # A phrase that IS a canonical genre needs no blending.
    if canonical_genre(phrase):
        return None

    words = _WORD_RE.findall(phrase)
    if not 2 <= len(words) <= 6:
        return None

    components: list[str] = []
    modifiers: list[str] = []
    i = 0
    while i < len(words):
        matched_key = ""
        matched_size = 0
        for size in range(min(_MAX_NGRAM, len(words) - i), 0, -1):
            key = canonical_genre(" ".join(words[i : i + size]))
            if key:
                matched_key, matched_size = key, size
                break
        if matched_key:
            if matched_key not in components:
                components.append(matched_key)
            i += matched_size
        else:
            modifiers.append(words[i].lower())
            i += 1

    if not components:
        return None
    if len(components) == 1 and not modifiers:
        return None  # plain near-miss of one genre — let normal resolution run

    # The raw phrase leads; then the most-defining fragments of each component
    # (preset authors put the strongest descriptors first).
    per_component = 4 if len(components) <= 2 else 3
    fragments: list[str] = [phrase.lower()]
    weights: list[float] = []
    constraints: list[float] = []
    for key in components[:3]:
        preset = GENRE_STYLES.get(key, {})
        frags = [f.strip() for f in str(preset.get("style", "")).split(",") if f.strip()]
        fragments.extend(frags[:per_component])
        weights.append(float(preset.get("weight", 0.80)))
        constraints.append(float(preset.get("constraint", 0.40)))

    first = GENRE_STYLES.get(components[0], {})
    return {
        "style": ", ".join(dict.fromkeys(fragments)),  # dedupe, keep order
        "weight": round(sum(weights) / len(weights), 2),
        "constraint": round(sum(constraints) / len(constraints), 2),
        "parent_genre": first.get("parent_genre", components[0]),
        "blend_components": components,
        "blend_modifiers": modifiers,
    }


__all__ = ["blend_genre_preset"]
