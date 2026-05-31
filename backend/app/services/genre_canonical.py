"""Map arbitrary genre strings to canonical RIFFA genre keys (``GENRE_STYLES``).

Quality safeguard. The deterministic prompt builder (``build_suno_style``) only
hits a rich genre preset when ``music_params.genre`` EXACTLY matches a key in
``genre_data.GENRE_STYLES``. A near-miss like "Lo-fi" vs the canonical "Lofi"
silently falls back to a generic prompt. This module normalizes user/agent
genre text (case, punctuation, RU/EN aliases) to the canonical key so both the
scripted wizard and the GPT path always land on a preset.

Returns "" when there's no confident match — the caller keeps the original
text and ``build_suno_style`` falls back to the bare word (still works, just
without the preset's instrument/production richness).
"""

from __future__ import annotations

import re

from app.services.genre_data import GENRE_STYLES


def _norm(s: str) -> str:
    """Lowercase + keep only latin/cyrillic letters and digits.

    "Lo-fi", "lo fi", "LoFi" → "lofi"; "Drum & Bass" → "drumbass";
    "Лоу-фай" → "лоуфай". Punctuation/spacing differences disappear.
    """
    return re.sub(r"[^a-z0-9а-яё]", "", s.lower())


# normalized canonical-key -> canonical key (built once from the library)
_NORM_TO_KEY: dict[str, str] = {_norm(k): k for k in GENRE_STYLES}

# Abbreviations / RU translations / spelling variants that do NOT normalize to
# a canonical key on their own. Raw strings here; normalized into _ALIAS below.
_ALIAS_RAW: dict[str, str] = {
    # Lo-fi
    "lo-fi": "Lofi", "lo fi": "Lofi", "лофи": "Lofi", "лоуфай": "Lofi", "лоу-фай": "Lofi",
    # Hip-Hop / rap
    "rap": "Hip-Hop", "hiphop": "Hip-Hop", "рэп": "Hip-Hop", "реп": "Hip-Hop",
    "хип-хоп": "Hip-Hop", "хипхоп": "Hip-Hop",
    # Drum & Bass
    "dnb": "Drum & Bass", "d&b": "Drum & Bass", "drum and bass": "Drum & Bass",
    "драмнбэйс": "Drum & Bass", "днб": "Drum & Bass",
    # R&B
    "rnb": "R&B", "r and b": "R&B", "рнб": "R&B",
    # Electronic family (RU)
    "электроника": "Electronic", "электро": "Electronic", "техно": "Techno",
    "хаус": "House", "транс": "Trance", "дабстеп": "Dubstep",
    "edm": "EDM", "танцевальная": "EDM",
    # Synthwave
    "retrowave": "Synthwave", "ретровейв": "Synthwave", "синтвейв": "Synthwave",
    "synth wave": "Synthwave",
    # Rock / metal / pop families (RU)
    "рок": "Rock", "метал": "Metal", "метл": "Metal", "поп": "Pop",
    "панк": "Punk", "гранж": "Grunge", "инди": "Indie",
    # Rock subgenres the agent/GPT emits as free text → nearest canonical preset
    "progressive rock": "Rock", "prog rock": "Rock", "prog-rock": "Rock",
    "post rock": "Rock", "post-rock": "Rock", "alternative rock": "Rock",
    "alt rock": "Rock", "hard rock": "Rock", "classic rock": "Rock",
    "indie rock": "Rock", "art rock": "Rock", "psychedelic rock": "Rock",
    "прогрессивный рок": "Rock", "прог-рок": "Rock", "прогрессив-рок": "Rock",
    "пост-рок": "Rock", "альтернативный рок": "Rock",
    # Jazz / blues / soul / funk (RU)
    "джаз": "Jazz", "блюз": "Blues", "соул": "Soul", "фанк": "Funk", "госпел": "Gospel",
    # Classical / ambient (RU)
    "классика": "Classical", "классическая": "Classical", "эмбиент": "Ambient",
    "эмбьент": "Ambient", "оркестр": "Orchestral",
    # Trap / phonk / drill (RU)
    "трэп": "Trap", "трап": "Trap", "фонк": "Phonk", "дрилл": "Drill",
    # Reggae / latin (RU)
    "регги": "Reggae", "рэгги": "Reggae", "реггетон": "Reggaeton",
    # Folk / country (RU)
    "фолк": "Folk", "народная": "Folk", "кантри": "Country",
    # Deezer top-level genre labels (reference lookup)
    "electro": "Electronic", "dance": "EDM", "rap/hip hop": "Hip-Hop",
    "soul & funk": "Funk", "latin music": "Latin", "films/games": "Cinematic",
}

_ALIAS: dict[str, str] = {_norm(a): k for a, k in _ALIAS_RAW.items()}


def canonical_genre(raw: str) -> str:
    """Return the canonical ``GENRE_STYLES`` key for ``raw``, or "" if no match."""
    if not raw:
        return ""
    n = _norm(raw)
    if not n:
        return ""
    if n in _NORM_TO_KEY:
        return _NORM_TO_KEY[n]
    if n in _ALIAS:
        return _ALIAS[n]
    return ""
