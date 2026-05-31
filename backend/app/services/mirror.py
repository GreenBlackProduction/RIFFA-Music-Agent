"""Mirror Suno CDN assets (audio + cover) to MinIO after generation completes.

Suno CDN URLs are **temporary** (tempfile.aiquickdraw.com, musicfile.removeai.ai).
They work right after generation but expire within hours/days. Persisting them in
MinIO gives permanent URLs that work forever and are served from our own infra.

Called once from tasks/__init__.py right after status = completed.

MinIO layout:
  generated/{gen_id}/{track_idx}.mp3   ← audio (mp3 or wav)
  generated/{gen_id}/{track_idx}.jpg   ← cover image (if exists)
"""

from __future__ import annotations

import asyncio
import io
import logging
from functools import partial
from typing import Any

import boto3
import httpx
from botocore.client import Config

from app.core.config import Settings

logger = logging.getLogger(__name__)

_HTTP_TIMEOUT = 60.0  # seconds per file fetch
_COVER_RETRY_DELAY = 2.0  # seconds between cover fetch retries


def _embed_cover_into_mp3(mp3_bytes: bytes, cover_bytes: bytes, *, title: str = "") -> bytes:
    """Write APIC (cover) tag into MP3 buffer. Best-effort: returns original on failure.

    Cover is embedded as JPEG (front cover, type=3). The cover_bytes argument can be
    either JPEG or PNG — mutagen handles both. We also set TIT2 (title) so the player
    has something to display when streaming directly.
    """
    try:
        from mutagen.id3 import APIC, ID3, ID3NoHeaderError, TIT2  # type: ignore[attr-defined]
        from mutagen.mp3 import MP3
    except Exception as exc:
        logger.warning("[mirror] mutagen import failed: %s — uploading untagged audio", exc)
        return mp3_bytes

    buf = io.BytesIO(mp3_bytes)
    try:
        audio = MP3(buf, ID3=ID3)
    except Exception as exc:
        logger.warning("[mirror] MP3 parse failed: %s — uploading untagged audio", exc)
        return mp3_bytes

    try:
        if audio.tags is None:
            audio.add_tags()  # type: ignore[no-untyped-call]
    except ID3NoHeaderError:
        audio.add_tags()  # type: ignore[no-untyped-call]

    tags = audio.tags
    if tags is None:
        return mp3_bytes

    # Detect cover mime from magic bytes
    if cover_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        cover_mime = "image/png"
    else:
        cover_mime = "image/jpeg"

    tags.delall("APIC")
    tags.add(
        APIC(  # type: ignore[no-untyped-call]
            encoding=3, mime=cover_mime, type=3, desc="Cover", data=cover_bytes,
        )
    )
    if title:
        tags.delall("TIT2")
        tags.add(TIT2(encoding=3, text=title))  # type: ignore[no-untyped-call]

    out = io.BytesIO(mp3_bytes)
    try:
        audio.save(out, v2_version=3)
    except Exception as exc:
        logger.warning("[mirror] mutagen save failed: %s — uploading untagged audio", exc)
        return mp3_bytes
    return out.getvalue()


def _boto_client(settings: Settings):
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4"),
    )


def _upload_bytes(
    s3,
    bucket: str,
    key: str,
    data: bytes,
    content_type: str,
) -> None:
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
        ACL="public-read",
    )


async def _fetch(url: str, client: httpx.AsyncClient) -> bytes | None:
    """Download URL, return bytes or None on failure."""
    try:
        resp = await client.get(url, follow_redirects=True)
        if resp.status_code == 200:
            return resp.content
        logger.warning("[mirror] fetch %s returned %s", url, resp.status_code)
    except Exception as exc:
        logger.warning("[mirror] fetch failed for %s: %s", url, exc)
    return None


async def _fetch_with_retry(url: str, client: httpx.AsyncClient, retries: int = 1) -> bytes | None:
    """Download with optional retries for transient failures."""
    for attempt in range(retries + 1):
        data = await _fetch(url, client)
        if data is not None:
            return data
        if attempt < retries:
            await asyncio.sleep(_COVER_RETRY_DELAY)
            logger.debug("[mirror] retry %d/%d for %s", attempt + 1, retries, url)
    return None


def _guess_ext_and_type(url: str) -> tuple[str, str]:
    """Return (extension, content_type) based on URL filename."""
    url_lower = url.lower().rstrip("/")
    if url_lower.endswith(".wav"):
        return "wav", "audio/wav"
    if url_lower.endswith(".png"):
        return "png", "image/png"
    if url_lower.endswith(".svg"):
        return "svg", "image/svg+xml"
    if url_lower.endswith(".jpg") or url_lower.endswith(".jpeg"):
        return "jpg", "image/jpeg"
    # Default for audio (Suno CDN often has no extension)
    return "mp3", "audio/mpeg"


async def _ensure_bucket(s3, bucket: str, loop) -> bool:
    """Ensure MinIO bucket exists. Returns False if bucket is unreachable."""
    try:
        await loop.run_in_executor(None, partial(s3.head_bucket, Bucket=bucket))
    except Exception:
        try:
            await loop.run_in_executor(None, partial(s3.create_bucket, Bucket=bucket))
        except Exception as exc:
            logger.error("[mirror] cannot access bucket %s: %s", bucket, exc)
            return False
    return True


async def mirror_user_avatar(
    photo_url: str | None,
    user_id: int,
    settings: Settings,
) -> str | None:
    """Download a Telegram avatar URL and re-host it on MinIO.

    Telegram t.me/i/userpic/... URLs do a 302 redirect to telesco.pe and rely
    on browser cookies + occasionally rotate. To avoid broken avatars we mirror
    the image once at login and store the permanent MinIO URL on user.avatar_url.

    Returns the new MinIO URL on success, original ``photo_url`` if mirror
    failed (so we still have *something* to show), or None if no photo.
    """
    if not photo_url:
        return None
    # Already mirrored — don't re-fetch every login
    if photo_url.startswith(settings.s3_public_base_url):
        return photo_url

    loop = asyncio.get_running_loop()
    s3 = _boto_client(settings)
    bucket = settings.s3_bucket_media

    if not await _ensure_bucket(s3, bucket, loop):
        return photo_url  # fallback: keep original t.me URL

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=True) as http:
        img_bytes = await _fetch_with_retry(photo_url, http, retries=1)

    if not img_bytes:
        logger.warning("[mirror] avatar fetch failed for user %s", user_id)
        return photo_url

    # Guess content type by URL extension; default to jpeg.
    url_lower = photo_url.lower()
    if url_lower.endswith(".svg"):
        ext, mime = "svg", "image/svg+xml"
    elif url_lower.endswith(".png"):
        ext, mime = "png", "image/png"
    else:
        ext, mime = "jpg", "image/jpeg"

    # Cache-bust by hashing — same image stays at same URL, new photo gets new URL.
    import hashlib
    digest = hashlib.sha1(img_bytes).hexdigest()[:10]
    key = f"avatars/{user_id}-{digest}.{ext}"

    try:
        await loop.run_in_executor(
            None,
            partial(_upload_bytes, s3, bucket, key, img_bytes, mime),
        )
    except Exception as exc:
        logger.warning("[mirror] avatar upload failed for user %s: %s", user_id, exc)
        return photo_url

    new_url = f"{settings.s3_public_base_url}/{key}"
    logger.info("[mirror] user %s avatar → %s", user_id, new_url)
    return new_url


async def mirror_generation_result(
    result: dict[str, Any],
    gen_id: str,
    settings: Settings,
) -> dict[str, Any]:
    """Download Suno CDN assets and re-upload to MinIO.

    Handles both regular results (with ``tracks`` list) and WAV-conversion
    results (with ``wav_url`` string). Returns a **new** result dict with
    Suno CDN URLs replaced by permanent MinIO URLs.
    """
    loop = asyncio.get_running_loop()
    s3 = _boto_client(settings)
    bucket = settings.s3_bucket_media

    if not await _ensure_bucket(s3, bucket, loop):
        return result

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as http:

        # ── WAV result (single file, no tracks array) ─────────────────────
        wav_url = result.get("wav_url", "")
        if wav_url and not wav_url.startswith(settings.s3_public_base_url):
            audio_bytes = await _fetch(wav_url, http)
            if audio_bytes:
                ext, mime = _guess_ext_and_type(wav_url)
                key = f"generated/{gen_id}/wav.{ext}"
                try:
                    await loop.run_in_executor(
                        None,
                        partial(_upload_bytes, s3, bucket, key, audio_bytes, mime),
                    )
                    new_wav_url = f"{settings.s3_public_base_url}/{key}"
                    result = {**result, "wav_url": new_wav_url}
                    logger.info("[mirror] gen %s wav → MinIO", gen_id)
                except Exception as exc:
                    logger.warning("[mirror] upload wav failed for gen %s: %s", gen_id, exc)

        # ── Tracks array (song, instrumental, cover, extend, sfx) ─────────
        tracks: list[dict[str, Any]] = result.get("tracks") or []
        if not tracks:
            # Also mirror cover_art image_url if present (stored outside tracks)
            image_url = result.get("image_url", "")
            if image_url and not image_url.startswith(settings.s3_public_base_url):
                img_bytes: bytes | None = None
                mime = "image/jpeg"
                if image_url.startswith("data:"):
                    # nano-banana edit/generate возвращает base64 data: URI.
                    # Это нельзя fetch'ить — декодируем напрямую и кладём
                    # на MinIO, иначе в БД лежит огромная base64-строка,
                    # которую UI пытается отрисовать как <img src=data:..>
                    # и в шеринге OG она не работает.
                    try:
                        import base64
                        header, _, b64data = image_url.partition(",")
                        # header: "data:image/png;base64"
                        if ";base64" in header and "/" in header:
                            mime = header.split(":", 1)[1].split(";", 1)[0].strip() or "image/jpeg"
                            img_bytes = base64.b64decode(b64data)
                    except Exception as exc:
                        logger.warning("[mirror] decode data-URI failed for gen %s: %s", gen_id, exc)
                else:
                    img_bytes = await _fetch_with_retry(image_url, http, retries=1)
                    if img_bytes:
                        _, mime = _guess_ext_and_type(image_url)
                if img_bytes:
                    ext = "png" if mime == "image/png" else "webp" if mime == "image/webp" else "jpg"
                    key = f"generated/{gen_id}/cover.{ext}"
                    try:
                        await loop.run_in_executor(
                            None,
                            partial(_upload_bytes, s3, bucket, key, img_bytes, mime),
                        )
                        result = {**result, "image_url": f"{settings.s3_public_base_url}/{key}"}
                        logger.info("[mirror] gen %s cover_art image → MinIO", gen_id)
                    except Exception as exc:
                        logger.warning("[mirror] upload cover_art failed for gen %s: %s", gen_id, exc)
            return result

        # Sanity: if URLs already point at our own infra, skip mirror.
        first_url = tracks[0].get("audio_url", "")
        if settings.s3_public_base_url and first_url.startswith(settings.s3_public_base_url):
            logger.debug("[mirror] gen %s already mirrored, skipping", gen_id)
            return result

        new_tracks: list[dict[str, Any]] = []

        for idx, track in enumerate(tracks):
            track = dict(track)
            audio_url = track.get("audio_url", "")
            image_url = track.get("image_url", "")
            track_title = (track.get("title") or "").strip()

            # ── Cover image (fetched FIRST so we can embed into MP3) ─────
            cover_bytes: bytes | None = None
            if image_url and not image_url.startswith(settings.s3_public_base_url):
                cover_bytes = await _fetch_with_retry(image_url, http, retries=1)

            # ── Audio (with embedded cover for MP3) ──────────────────────
            if audio_url and not audio_url.startswith(settings.s3_public_base_url):
                audio_bytes = await _fetch(audio_url, http)
                if audio_bytes:
                    ext, mime = _guess_ext_and_type(audio_url)
                    # Embed cover into MP3 so streaming clients show it without
                    # downloading separately. Only MP3 supports APIC tags here.
                    if ext == "mp3" and cover_bytes:
                        audio_bytes = _embed_cover_into_mp3(
                            audio_bytes, cover_bytes, title=track_title,
                        )
                    key = f"generated/{gen_id}/{idx}.{ext}"
                    try:
                        await loop.run_in_executor(
                            None,
                            partial(_upload_bytes, s3, bucket, key, audio_bytes, mime),
                        )
                        track["audio_url"] = f"{settings.s3_public_base_url}/{key}"
                        logger.info("[mirror] gen %s track %d audio → MinIO%s",
                                    gen_id, idx, " (with cover)" if ext == "mp3" and cover_bytes else "")
                    except Exception as exc:
                        logger.warning("[mirror] upload audio failed for gen %s idx %d: %s", gen_id, idx, exc)

            # ── Cover image upload (separate, for UI preview) ────────────
            if cover_bytes and image_url and not image_url.startswith(settings.s3_public_base_url):
                _, cmime = _guess_ext_and_type(image_url)
                cext = "png" if cmime == "image/png" else "jpg"
                cover_key = f"generated/{gen_id}/{idx}.{cext}"
                try:
                    await loop.run_in_executor(
                        None,
                        partial(_upload_bytes, s3, bucket, cover_key, cover_bytes, cmime),
                    )
                    track["image_url"] = f"{settings.s3_public_base_url}/{cover_key}"
                    logger.info("[mirror] gen %s track %d cover → MinIO", gen_id, idx)
                except Exception as exc:
                    logger.warning("[mirror] upload cover failed for gen %s idx %d: %s", gen_id, idx, exc)

            new_tracks.append(track)

    return {**result, "tracks": new_tracks}
