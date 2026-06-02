"""Track utilities — auto-title generation + download proxy with ID3 tagging.

Why a download proxy instead of linking Suno's mp3 directly?
  Suno's CDN file has no ID3/metadata. We want the downloaded file to carry
  ``Artist - Track Name (RIFFAMusic)`` in its tag block so it shows correctly
  in any media player or library. We stream the file from Suno, embed the tags
  in-memory via mutagen, and serve the result.
"""

from __future__ import annotations

import io
import re
import unicodedata
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.deps import current_user, db_session
from app.db.models import Generation, User

router = APIRouter(prefix="/tracks", tags=["tracks"])

_RIFFA_SUFFIX = "(RIFFAMusic)"


# ---------------------------------------------------------------------------
# Auto title
# ---------------------------------------------------------------------------


class AutoTitleRequest(BaseModel):
    idea: str = Field(min_length=1, max_length=1000)
    artist: str = Field(default="", max_length=80)


class AutoTitleResponse(BaseModel):
    track_name: str
    artist: str
    short_title: str


def _resolve_artist(user: User, override: str = "") -> str:
    """Pick the artist label in priority order: explicit override > telegram_username > display_name > email-local."""
    if override.strip():
        return override.strip()[:60]
    if user.telegram_username:
        return user.telegram_username[:60]
    if user.display_name and user.display_name != "RIFFA user":
        return user.display_name[:60]
    if user.email:
        return user.email.split("@", 1)[0][:60]
    return "RIFFA"


def _shorten_idea(idea: str, max_chars: int = 50) -> str:
    """Cheap fallback when GPT titling fails: first 3-7 words of the request.

    Word-based (not a blind char cut) so the fallback reads like a real title —
    e.g. "Закат над ночным городом" rather than "Закат над ночным горо".
    Capped at ``max_chars`` so it still fits the canonical name format.
    """
    cleaned = re.sub(r"\s+", " ", idea).strip(" .,;:-—\"'")
    if not cleaned:
        return ""
    words = cleaned.split(" ")
    head = " ".join(words[:7])
    while len(head) > max_chars and " " in head:
        head = head.rsplit(" ", 1)[0]
    return head.strip(" .,;:-—\"'")


def format_track_name(artist: str, short_title: str) -> str:
    """Compose the canonical name: ``Artist - Title (RIFFAMusic)``."""
    artist = artist.strip()
    short_title = short_title.strip()
    base = f"{artist} - {short_title}".strip(" -")
    full = f"{base} {_RIFFA_SUFFIX}".strip()
    # Suno V5.5 `title` cap is 80 chars. Trim the title slice (preserve artist).
    if len(full) <= 80:
        return full
    overflow = len(full) - 80
    if overflow < len(short_title) - 5:
        short_title = short_title[: len(short_title) - overflow - 1].rstrip(" .,;:-—") + "…"
        return f"{artist} - {short_title} {_RIFFA_SUFFIX}"
    # Last resort: drop the suffix.
    return f"{artist} - {_shorten_idea(short_title, 40)}"[:80]


@router.post("/auto-title", response_model=AutoTitleResponse)
async def auto_title(
    body: AutoTitleRequest,
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> AutoTitleResponse:
    """Compose ``Artist - Short_Title (RIFFAMusic)`` from the user's idea.

    Uses GPT (same APIYI proxy as lyrics) for ``Short_Title``. Falls back to a
    truncated idea if the OpenAI call fails or no key is configured.
    """
    artist = _resolve_artist(user, body.artist)

    short_title = ""
    if settings.openai_api_key:
        try:
            from app.services.lyrics import LyricsClient

            client = LyricsClient(
                api_key=settings.openai_api_key,
                base_url=settings.openai_base_url or "https://api.apiyi.com/v1",
            )
            short_title = (await client.generate_title(body.idea)).strip()
        except Exception as exc:  # GPT is best-effort, never fatal here.
            logger.warning("auto_title GPT call failed: {}", exc)

    if not short_title:
        short_title = _shorten_idea(body.idea, 40)

    return AutoTitleResponse(
        track_name=format_track_name(artist, short_title),
        artist=artist,
        short_title=short_title,
    )


# ---------------------------------------------------------------------------
# Download proxy with ID3 tagging
# ---------------------------------------------------------------------------


def _safe_filename(name: str, ext: str) -> str:
    """Sanitize the filename so the browser ``Content-Disposition`` works on every OS."""
    cleaned = unicodedata.normalize("NFKD", name)
    cleaned = re.sub(r"[\\/:*?\"<>|\r\n\t]", "_", cleaned).strip()
    cleaned = cleaned[:120] or "track"
    return f"{cleaned}.{ext}"


def _embed_id3(mp3_bytes: bytes, *, title: str, artist: str, album: str, comment: str, cover_bytes: bytes | None) -> bytes:
    """Write ID3v2.3 tags into the mp3 buffer. Best-effort: returns original on failure."""
    try:
        # mutagen ships partial type info but doesn't re-export the ID3 frame
        # classes via `__all__`, so mypy flags every frame constructor as both
        # `attr-defined` and `no-untyped-call`. The runtime behaviour is fine
        # and the call surface is tiny; silencing both error codes here keeps
        # the rest of strict-mode useful.
        from mutagen.id3 import (  # type: ignore[attr-defined]
            APIC,
            COMM,
            ID3,
            TALB,
            TIT2,
            TPE1,
            ID3NoHeaderError,
        )
        from mutagen.mp3 import MP3
    except Exception as exc:
        logger.warning("mutagen import failed: {} — returning untagged file", exc)
        return mp3_bytes

    buf = io.BytesIO(mp3_bytes)
    try:
        audio = MP3(buf, ID3=ID3)
    except Exception as exc:
        logger.warning("MP3 parse failed: {} — returning untagged file", exc)
        return mp3_bytes

    try:
        if audio.tags is None:
            audio.add_tags()  # type: ignore[no-untyped-call]
    except ID3NoHeaderError:
        audio.add_tags()  # type: ignore[no-untyped-call]

    tags = audio.tags
    if tags is None:
        return mp3_bytes

    tags.delall("TIT2")
    tags.delall("TPE1")
    tags.delall("TALB")
    tags.delall("COMM")
    tags.add(TIT2(encoding=3, text=title))  # type: ignore[no-untyped-call]
    tags.add(TPE1(encoding=3, text=artist))  # type: ignore[no-untyped-call]
    tags.add(TALB(encoding=3, text=album))  # type: ignore[no-untyped-call]
    tags.add(COMM(encoding=3, lang="eng", desc="", text=comment))  # type: ignore[no-untyped-call]

    if cover_bytes:
        tags.delall("APIC")
        tags.add(
            APIC(  # type: ignore[no-untyped-call]
                encoding=3,
                mime="image/jpeg",
                type=3,
                desc="Cover",
                data=cover_bytes,
            )
        )

    out = io.BytesIO(mp3_bytes)
    audio.save(out, v2_version=3)
    return out.getvalue()


@router.get("/{generation_id}/{track_index}/download")
async def download_track(
    generation_id: str,
    track_index: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> Response:
    """Stream the Suno mp3 with ``Artist - Title (RIFFAMusic)`` ID3 tags embedded.

    Frontend should hit this instead of the bare Suno CDN URL when the user
    clicks "Скачать" in the library.
    """
    try:
        gen_uuid = uuid.UUID(generation_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found") from exc

    gen = (
        await session.execute(
            select(Generation).where(
                Generation.id == gen_uuid,
                Generation.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if gen is None or not gen.result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")

    raw_tracks: list[dict[str, Any]] = (gen.result or {}).get("tracks") or []
    if not 0 <= track_index < len(raw_tracks):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "track index out of range")

    track = raw_tracks[track_index]
    audio_url = track.get("audio_url")
    if not audio_url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "audio missing")

    artist = _resolve_artist(user)
    short_title = (gen.title or track.get("title") or _shorten_idea((gen.params or {}).get("description") or "")).strip()
    if not short_title:
        short_title = "RIFFA Track"
    if _RIFFA_SUFFIX in short_title:
        track_name = short_title
    else:
        track_name = format_track_name(artist, short_title)

    cover_url = track.get("image_url")

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
        try:
            resp = await client.get(audio_url)
            resp.raise_for_status()
            mp3_bytes = resp.content
        except Exception as exc:
            logger.error("track download failed for {}: {}", audio_url, exc)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Suno fetch failed") from exc

        cover_bytes: bytes | None = None
        if cover_url:
            try:
                cresp = await client.get(cover_url)
                if cresp.status_code == 200:
                    cover_bytes = cresp.content
            except Exception as exc:
                logger.warning("cover fetch failed for {}: {}", cover_url, exc)

    tagged = _embed_id3(
        mp3_bytes,
        title=track_name,
        artist=artist,
        album="RIFFAMusic",
        comment=f"Generated with RIFFAMusic / Suno V5.5 (gen {gen.id})",
        cover_bytes=cover_bytes,
    )

    filename = _safe_filename(track_name, "mp3")
    return Response(
        content=tagged,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, no-cache",
        },
    )


async def _proxy_audio(audio_url: str, request: Request, cache_control: str) -> Response:
    """Proxy audio from upstream with Range request pass-through for seekable playback.

    Without range support the browser can't seek — it restarts the download from
    byte 0 every time currentTime is set past the buffered region.
    """
    upstream_headers: dict[str, str] = {}
    range_header = request.headers.get("range")
    if range_header:
        upstream_headers["Range"] = range_header

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
        try:
            resp = await client.get(audio_url, headers=upstream_headers)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 416:
                # Range not satisfiable — pass through to browser
                return Response(status_code=416, headers={"Accept-Ranges": "bytes"})
            logger.error("stream fetch failed for {}: {}", audio_url, exc)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "upstream fetch failed") from exc
        except Exception as exc:
            logger.error("stream fetch failed for {}: {}", audio_url, exc)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "upstream fetch failed") from exc

    response_headers: dict[str, str] = {
        "Accept-Ranges": "bytes",
        "Cache-Control": cache_control,
    }
    # Forward Content-Range when the upstream returned 206
    if "content-range" in resp.headers:
        response_headers["Content-Range"] = resp.headers["content-range"]
    if "content-length" in resp.headers:
        response_headers["Content-Length"] = resp.headers["content-length"]

    status_code = 206 if resp.status_code == 206 else 200
    return Response(
        content=resp.content,
        status_code=status_code,
        media_type="audio/mpeg",
        headers=response_headers,
    )


@router.get("/{generation_id}/{track_index}/stream")
async def stream_track(
    generation_id: str,
    track_index: int,
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> Response:
    """Proxy audio through the backend so the player can use crossOrigin="anonymous".

    Passes Range headers through to Suno CDN so the browser can seek without
    restarting from the beginning.
    """
    try:
        gen_uuid = uuid.UUID(generation_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found") from exc

    gen = (
        await session.execute(
            select(Generation).where(
                Generation.id == gen_uuid,
                Generation.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if gen is None or not gen.result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")

    raw_tracks: list[dict[str, Any]] = (gen.result or {}).get("tracks") or []
    if not 0 <= track_index < len(raw_tracks):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "track index out of range")

    audio_url = raw_tracks[track_index].get("audio_url")
    if not audio_url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "audio missing")

    return await _proxy_audio(audio_url, request, "private, max-age=3600")


@router.get("/{generation_id}/{track_index}/public-stream")
async def stream_public_track(
    generation_id: str,
    track_index: int,
    request: Request,
    session: AsyncSession = Depends(db_session),
) -> Response:
    """Public audio proxy for Radio and shared tracks (no auth required).

    Only serves tracks that are published to Radio (is_public=True).
    Passes Range headers through so the browser can seek without restart.
    """
    try:
        gen_uuid = uuid.UUID(generation_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found") from exc

    gen = (
        await session.execute(
            select(Generation).where(
                Generation.id == gen_uuid,
                Generation.is_public == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if gen is None or not gen.result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")

    raw_tracks: list[dict[str, Any]] = (gen.result or {}).get("tracks") or []
    if not 0 <= track_index < len(raw_tracks):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "track index out of range")

    audio_url = raw_tracks[track_index].get("audio_url")
    if not audio_url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "audio missing")

    return await _proxy_audio(audio_url, request, "public, max-age=3600")
