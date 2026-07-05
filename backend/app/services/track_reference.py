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


def _name_matches_result(query: str, artist: str, title: str) -> bool:
    """Guard against Deezer returning a confidently-wrong top hit for a plain
    free-text name (it always returns *something*). Require at least half of the
    query's words to appear in the matched "artist title". Link / track-id
    lookups skip this — they are already exact."""
    def _norm(s: str) -> str:
        return re.sub(r"\W+", " ", s.lower()).strip()

    q = _norm(query)
    if not q:
        return False
    cand = _norm(f"{artist} {title}")
    tokens = [t for t in q.split() if len(t) >= 2]
    if not tokens:
        return False
    hits = sum(1 for t in tokens if t in cand)
    return hits / len(tokens) >= 0.5


_LASTFM_API = "https://ws.audioscrobbler.com/2.0/"

# Last.fm community top-tags carry plenty of non-musical noise — drop these.
_TAG_BLOCKLIST = {
    "seen live", "favorites", "favourites", "favorite", "favourite",
    "favorite songs", "favourite songs", "my favorite", "albums i own",
    "love", "beautiful", "masterpiece", "epic", "awesome", "amazing",
    "cool", "best", "good", "great", "favs", "fav", "music", "spotify",
}
_TAG_JUNK_RE = re.compile(r"^(?:\d{2,4}s?|under \d|favou?rite|seen live)", re.I)


def _clean_lastfm_tags(tags: list[dict], artist: str, limit: int) -> list[str]:
    """Keep the top musical descriptors by weight; drop the artist's own name
    and Last.fm's meta/junk tags. Tags arrive sorted by descending count."""
    artist_n = re.sub(r"[^a-z0-9]", "", artist.lower())
    scored: list[tuple[int, str]] = []
    for t in tags:
        name = str(t.get("name") or "").strip()
        if not name:
            continue
        try:
            count = int(t.get("count") or 0)
        except (TypeError, ValueError):
            count = 0
        low = name.lower()
        norm = re.sub(r"[^a-z0-9]", "", low)
        if not norm or norm == artist_n:
            continue
        if low in _TAG_BLOCKLIST or _TAG_JUNK_RE.match(low):
            continue
        scored.append((count, name))
    if not scored:
        return []
    max_count = max(c for c, _ in scored) or 1
    floor = max(3, int(max_count * 0.05))
    return [name for count, name in scored if count >= floor][:limit]


async def fetch_lastfm_tags(
    client: httpx.AsyncClient, artist: str, title: str, api_key: str, *, limit: int = 6
) -> list[str]:
    """Detailed style tags for a resolved track via the Last.fm public API.

    Tries track-level tags first, falls back to artist-level. Best-effort: any
    failure (no key, network, parse) returns ``[]`` — never raises into the agent."""
    if not api_key or not artist:
        return []

    async def _get(method: str, extra: dict) -> list[dict]:
        try:
            resp = await client.get(
                _LASTFM_API,
                params={"method": method, "api_key": api_key, "format": "json", **extra},
            )
            resp.raise_for_status()
            tags = ((resp.json() or {}).get("toptags") or {}).get("tag") or []
            return tags if isinstance(tags, list) else []
        except Exception as exc:
            logger.debug("lastfm {} failed: {}", method, exc)
            return []

    cleaned: list[str] = []
    if title:
        cleaned = _clean_lastfm_tags(
            await _get("track.getTopTags", {"artist": artist, "track": title}), artist, limit
        )
    if not cleaned:
        cleaned = _clean_lastfm_tags(
            await _get("artist.getTopTags", {"artist": artist}), artist, limit
        )
    return cleaned


# In-process TTL cache — the agent now re-grounds the reference on EVERY chat
# turn (so the facts survive until the finalize turn), which would otherwise
# re-hit Deezer/Last.fm each time.
_resolve_cache: dict[str, tuple[dict | None, float]] = {}
_RESOLVE_CACHE_TTL = 3600.0


async def resolve_reference(raw: str, *, lastfm_api_key: str = "") -> dict | None:
    """Resolve a link or "artist - song" string to ``{artist,title,bpm,year,era,
    genre,tempo,tags,source}`` via Deezer (+ Last.fm tags), or ``None``."""
    raw = (raw or "").strip()
    if not raw:
        return None

    import time as _time
    ck = re.sub(r"\s+", " ", raw.lower())
    cached, exp = _resolve_cache.get(ck, (None, 0.0))
    if _time.monotonic() < exp:
        return cached

    result = await _resolve_reference_uncached(raw, lastfm_api_key=lastfm_api_key)
    # Negative results get a short TTL — a flaky Deezer timeout must not blank
    # the reference for a whole hour.
    ttl = _RESOLVE_CACHE_TTL if result else 60.0
    _resolve_cache[ck] = (result, _time.monotonic() + ttl)
    return result


async def _resolve_reference_uncached(raw: str, *, lastfm_api_key: str = "") -> dict | None:

    async with httpx.AsyncClient(timeout=_TIMEOUT, headers={"User-Agent": "RIFFA/1.0"}) as client:
        track_id: int | None = None
        plain_query = ""  # set only for free-text name lookups (need a relevance check)

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
            plain_query = raw
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

        # Reject a confidently-wrong top hit for a plain-name search — Deezer
        # always returns *something* ("денис грязь" → "Марина Кацуба"). A link or
        # track-id lookup is already exact, so this only gates free-text names.
        if plain_query and not _name_matches_result(plain_query, artist, title):
            logger.info(
                "resolve_reference: irrelevant match for «{}» → {!r} — {!r}; rejecting",
                plain_query, artist, title,
            )
            return None

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

        tags = await fetch_lastfm_tags(client, artist, title, lastfm_api_key)

    return {
        "artist": artist,
        "title": title,
        "bpm": bpm,
        "year": year,
        "era": year_to_era(year) if year else "",
        "genre_raw": genre_raw,
        "genre": canonical_genre(genre_raw),
        "tempo": bpm_to_tempo(bpm),
        "tags": tags,
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
