"""Shared helpers for composing track titles with the user's artist nickname.

The artist resolution rule (priority: explicit override > telegram_username >
display_name > email-local > "RIFFA") is mirrored by `app/api/v1/tracks.py`
for download ID3 tags. Keep them in sync if the rule changes.
"""

from __future__ import annotations

import re

from app.db.models import User


# Reference phrases that leak third-party artist names into titles or prompts.
# Anything from the phrase to end-of-string gets stripped — Suno rejects prompts
# with real-world artist names and the title field is just as risky.
# Order matters: longer alternatives first so "like the band" matches before "like".
_ARTIST_REFERENCE_RE = re.compile(
    r"[\s,;:.\-—–]*(?:"
    r"inspired by|in the style of|in style of|in the vein of|"
    r"after the manner of|sounding like|similar to|reminiscent of|"
    r"like the band|à la|a la|feat\.?|featuring|"
    r"like (?=[A-ZА-Я])|"  # "like X" only when next word is capitalised (proper noun)
    r"вдохновлено|вдохновлен(?:а|о|ы)?|"
    r"в стиле|в духе|похож(?:е|а|и)? на|как у|при участии"
    r")\b.*$",
    flags=re.IGNORECASE,
)


_INLINE_ARTIST_CLAUSE_RE = re.compile(
    r"\b(?:inspired by|in the (?:style|vein) of|in style of|sounding like|"
    r"similar to|reminiscent of|à la|a la|like)\s+"
    r"[A-ZА-ЯЁ][\w'’.\-]*(?:\s+[A-ZА-ЯЁ][\w'’.\-]*){0,3}",
)


def strip_inline_artist_clause(text: str) -> str:
    """Remove a MID-TEXT "inspired by <Artist Name>" clause, keeping the rest.

    ``strip_artist_references`` cuts from the marker to the END of the string —
    right for trailing title clauses, destructive for prose like
    "hip-hop track inspired by Azar Strato, featuring aggressive kick drums"
    (seen live 2026-07-06 in the agent's English prompt). Here only the clause
    itself is dropped; the comma-separated tail survives.
    """
    if not text:
        return text
    cleaned = _INLINE_ARTIST_CLAUSE_RE.sub("", text)
    if cleaned == text:
        return text
    cleaned = re.sub(r"\s*,\s*(?=[,.;])", "", cleaned)
    cleaned = re.sub(r",\s*,+", ", ", cleaned)
    cleaned = re.sub(r"\s+,", ",", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned.strip(" ,;")


def strip_artist_references(text: str) -> str:
    """Drop trailing 'inspired by X / in the style of Y / feat. Z' clauses.

    These are the only patterns where GPT consistently leaks artist names into
    titles/prompts. The leading separators (comma, dash, period) are eaten
    too so the cleaned string doesn't end with dangling punctuation.
    """
    if not text:
        return text
    cleaned = _ARTIST_REFERENCE_RE.sub("", text).strip()
    return cleaned.rstrip(" .,;:-—–") or text


def resolve_artist(user: User, override: str = "") -> str:
    """Pick the artist label shown on the user's tracks.

    Priority MUST match ``tracks.py::_resolve_artist`` (display_name first):
    the user's chosen display_name is the nick shown everywhere («Zelēnkin»),
    not the raw telegram handle («Sergey_Zelenkin»). Mismatched order here made
    new tracks diverge from the whole history.
    """
    if override and override.strip():
        return override.strip()[:60]
    if user.display_name and user.display_name != "RIFFA user":
        return user.display_name[:60]
    if user.telegram_username:
        return user.telegram_username[:60]
    if user.email:
        return user.email.split("@", 1)[0][:60]
    return "RIFFA"


def compose_track_title(artist: str, short_title: str, max_len: int = 80) -> str:
    """Format `{artist} - {short_title}` honouring the Suno 80-char title cap.

    Trims the short title first so the artist remains intact. Falls back to the
    short title alone if artist is missing or the result still doesn't fit.
    """
    artist = (artist or "").strip()
    short_title = (short_title or "").strip()
    if not artist:
        return short_title[:max_len]
    if not short_title:
        return artist[:max_len]
    full = f"{artist} - {short_title}"
    if len(full) <= max_len:
        return full
    # Try shrinking the short_title (preserve artist).
    budget = max_len - len(artist) - 3  # 3 chars for " - "
    if budget >= 8:
        return f"{artist} - {short_title[:budget].rstrip(' .,;:-—')}"
    # Artist alone is already too long — last resort, truncate the artist.
    return full[:max_len]


__all__ = ["resolve_artist", "compose_track_title", "strip_artist_references"]
