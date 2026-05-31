"""Resolve a reference track ("сделай как X", a Deezer/Spotify/YouTube link)
into concrete style hints — real BPM, genre and era — for the prompt builder.

Source of truth is the **Deezer public API** (no OAuth, no app registration)
which exposes a track's ``bpm`` plus album genre and release date. Spotify and
YouTube links are resolved to a "title" via their public oEmbed endpoints and
then searched on Deezer, so any of the three link kinds (or a plain
"artist - song" string) works.

Everything is best-effort: any network/parse failure returns ``None`` and the
caller just proceeds without the enrichment. We never raise into the agent.
"""

from __future__ import annotations

import re
from urllib.parse import quote_plus

import httpx
from loguru import logger

from app.services.genre_canonical import canonical_genre

_DEEZER_API = "https://api.deezer.com"
_TIMEOUT = httpx.Timeout(6.0)

_RE_DEEZER = re.compile(r"deezer\.com/(?:[a-z]{2}/)?track/(\d+)", re.I)
_RE_SPOTIFY = re.compile(r"open\.spotify\.com/(?:intl-[a-z]+/)?track/[A-Za-z0-9]+", re.I)
_RE_YOUTUBE = re.compile(r"(?:youtube\.com/watch\?\S*v=|youtu\.be/)[\w-]+", re.I)
_RE_URL = re.compile(r"https?://\S+", re.I)


def bpm_to_tempo(bpm: float) -> str:
    """Map a BPM value to a canonical tempo bucket (TEMPO_PROFILES ranges)."""
    if bpm <= 0:
        return ""
    if bpm < 70:
        return "very_slow"
    if bpm < 90:
        return "slow"
    if bpm < 120:
        return "medium"
    if bpm < 150:
        return "fast"
    return "very_fast"


def year_to_era(year: int) -> str:
    """1987 -> '1980s'. Clamp to the eras the prompt builder knows (1950s-2020s)."""
    if year < 1955:
        return ""
    decade = (year // 10) * 10
    if decade < 1950:
        decade = 1950
    if decade > 2020:
        decade = 2020
    return f"{decade}s"


async def _deezer_get(client: httpx.AsyncClient, path: str) -> dict | None:
    try:
        resp = await client.get(f"{_DEEZER_API}{path}")
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and data.get("error"):
            return None
        return data if isinstance(data, dict) else None
    except Exception as exc:  # network, json, http — all non-fatal
        logger.debug("deezer GET {} failed: {}", path, exc)
        return None


async def _oembed_title(client: httpx.AsyncClient, url: str, endpoint: str) -> str:
    """Fetch a human title for a Spotify/YouTube link via its oEmbed endpoint."""
    try:
        resp = await client.get(endpoint, params={"url": url, "format": "json"})
        resp.raise_for_status()
        title = str(resp.json().get("title", "")).strip()
        # YouTube titles carry noise — strip common decorations.
        title = re.sub(r"\((?:official|lyrics?|audio|video|hd|4k)[^)]*\)", "", title, flags=re.I)
        title = re.sub(r"\[[^\]]*\]", "", title)
        return title.strip()
    except Exception as exc:
        logger.debug("oembed {} failed: {}", url, exc)
        return ""


async def _search_track_id(client: httpx.AsyncClient, query: str) -> int | None:
    data = await _deezer_get(client, f"/search?q={quote_plus(query)}&limit=1")
    if not data:
        return None
    items = data.get("data") or []
    if not items:
        return None
    tid = items[0].get("id")
    return int(tid) if tid else None


async def resolve_reference(raw: str) -> dict | None:
    """Resolve a link or "artist - song" string to ``{artist,title,bpm,year,era,
    genre,tempo,source}`` via Deezer, or ``None`` when nothing usable is found."""
    raw = (raw or "").strip()
    if not raw:
        return None

    async with httpx.AsyncClient(timeout=_TIMEOUT, headers={"User-Agent": "RIFFA/1.0"}) as client:
        track_id: int | None = None

        m = _RE_DEEZER.search(raw)
        if m:
            track_id = int(m.group(1))
        elif _RE_SPOTIFY.search(raw):
            url = _RE_URL.search(raw).group(0)  # type: ignore[union-attr]
            title = await _oembed_title(client, url, "https://open.spotify.com/oembed")
            if title:
                track_id = await _search_track_id(client, title)
        elif _RE_YOUTUBE.search(raw):
            url = _RE_URL.search(raw).group(0)  # type: ignore[union-attr]
            title = await _oembed_title(client, url, "https://www.youtube.com/oembed")
            if title:
                track_id = await _search_track_id(client, title)
        else:
            # Plain text — "Daft Punk - Around the World", "Burial", etc.
            track_id = await _search_track_id(client, raw)

        if not track_id:
            return None

        track = await _deezer_get(client, f"/track/{track_id}")
        if not track:
            return None

        bpm = float(track.get("bpm") or 0)
        title = str(track.get("title") or "").strip()
        artist = str((track.get("artist") or {}).get("name") or "").strip()
        release = str(track.get("release_date") or "").strip()

        genre_raw = ""
        album = track.get("album") or {}
        album_id = album.get("id")
        if album_id:
            album_data = await _deezer_get(client, f"/album/{album_id}")
            if album_data:
                if not release:
                    release = str(album_data.get("release_date") or "").strip()
                genres = ((album_data.get("genres") or {}).get("data")) or []
                if genres:
                    genre_raw = str(genres[0].get("name") or "").strip()

        year = 0
        if len(release) >= 4 and release[:4].isdigit():
            year = int(release[:4])

    return {
        "artist": artist,
        "title": title,
        "bpm": bpm,
        "year": year,
        "era": year_to_era(year) if year else "",
        "genre_raw": genre_raw,
        "genre": canonical_genre(genre_raw),
        "tempo": bpm_to_tempo(bpm),
        "source": "deezer",
    }


def detect_reference_url(text: str) -> str:
    """Return the first Deezer/Spotify/YouTube URL in ``text``, else ""."""
    for rx in (_RE_DEEZER, _RE_SPOTIFY, _RE_YOUTUBE):
        if rx.search(text):
            m = _RE_URL.search(text)
            if m:
                return m.group(0)
    return ""
