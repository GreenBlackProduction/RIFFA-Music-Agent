"""Suno API v5.5 client — generate music, instrumental, sfx, cover, extend, wav."""

import asyncio
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import httpx
from loguru import logger

# ---------------------------------------------------------------------------
# Artist-name sanitiser — Suno rejects prompts containing specific artist names.
# This is a last-resort filter; the primary removal happens in enrich_music_prompt.
# ---------------------------------------------------------------------------

_ARTIST_NAMES: frozenset[str] = frozenset({
    "dua lipa", "billie eilish", "taylor swift", "ariana grande", "beyoncé", "beyonce",
    "rihanna", "lady gaga", "adele", "sia", "lorde", "lana del rey", "olivia rodrigo",
    "the weeknd", "drake", "kendrick lamar", "j. cole", "eminem", "post malone",
    "ed sheeran", "harry styles", "bruno mars", "the chainsmokers", "calvin harris",
    "david guetta", "tiësto", "tiesto", "martin garrix", "avicii", "deadmau5",
    "metallica", "nirvana", "linkin park", "green day", "ac/dc", "guns n roses",
    "led zeppelin", "pink floyd", "queen", "radiohead", "coldplay", "u2",
    "michael jackson", "prince", "madonna", "david bowie", "frank sinatra",
    "amy winehouse", "fleetwood mac", "eagles", "beatles", "rolling stones",
    "bob dylan", "bob marley", "johnny cash", "elvis presley",
    "kanye west", "jay-z", "jay z", "nicki minaj", "cardi b", "travis scott",
    "bad bunny", "j balvin", "daddy yankee", "shakira",
    "elton john", "freddie mercury", "john lennon", "paul mccartney",
    "rick astley", "britney spears", "christina aguilera",
})


def _strip_artist_names(text: str) -> str:
    """Remove known artist names from a Suno prompt (case-insensitive, whole-word match)."""
    result = text
    for name in _ARTIST_NAMES:
        pattern = re.compile(r"\b" + re.escape(name) + r"\b", re.IGNORECASE)
        result = pattern.sub("", result)
    # Clean up double commas / double spaces left after removal
    result = re.sub(r",\s*,", ",", result)
    result = re.sub(r"\s{2,}", " ", result)
    result = result.strip(" ,")
    if result != text:
        logger.warning("suno: stripped artist name(s) from style prompt")
    return result

_SUNO_BASE = "https://api.sunoapi.org/api/v1"

ProgressCb = Callable[[dict[str, Any]], None]


class SunoError(Exception):
    pass


@dataclass
class SunoTrack:
    audio_url: str
    audio_id: str
    image_url: str | None = None
    duration: int = 0
    title: str = ""


@dataclass
class SunoResult:
    tracks: list[SunoTrack] = field(default_factory=list)
    task_id: str = ""


@dataclass
class SunoLyricsVariant:
    text: str
    title: str
    status: str = "complete"


@dataclass
class SunoLyricsResult:
    variants: list[SunoLyricsVariant] = field(default_factory=list)
    task_id: str = ""


class SunoClient:
    def __init__(self, api_key: str, base_url: str = _SUNO_BASE) -> None:
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        self._base = base_url.rstrip("/")

    # ------------------------------------------------------------------ internal

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=30.0)) as client:
            for attempt in range(3):
                try:
                    resp = await client.post(
                        f"{self._base}{path}",
                        json=payload,
                        headers=self._headers,
                        timeout=120.0,
                    )
                    resp.raise_for_status()
                    return resp.json()  # type: ignore[return-value]
                except httpx.HTTPStatusError as exc:
                    code = exc.response.status_code
                    body = exc.response.text[:300]
                    if code >= 500 and attempt < 2:
                        # Suno occasionally returns 500 under load — retry with backoff.
                        logger.warning("Suno HTTP {} on attempt {}, retrying: {}", code, attempt + 1, body)
                        await asyncio.sleep(6 * (attempt + 1))
                        continue
                    raise SunoError(f"Suno HTTP {code}: {body}") from exc
                except (httpx.ConnectTimeout, httpx.ConnectError) as exc:
                    if attempt == 2:
                        raise SunoError(f"Connection failed after 3 attempts: {exc}") from exc
                    logger.debug("Suno connect error (attempt {}): {}", attempt + 1, exc)
                    await asyncio.sleep(3)
        return {}

    async def _poll(
        self,
        task_id: str,
        *,
        max_polls: int = 60,
        min_tracks: int = 2,
        progress_cb: ProgressCb | None = None,
    ) -> list[SunoTrack]:
        start = time.monotonic()
        async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=30.0)) as client:
            for i in range(max_polls):
                delay = min(5 + i * 2, 20)
                await asyncio.sleep(delay)
                elapsed = time.monotonic() - start

                resp = await client.get(
                    f"{self._base}/generate/record-info",
                    params={"taskId": task_id},
                    headers=self._headers,
                )
                if resp.status_code != 200:
                    continue

                data = resp.json().get("data")
                if not data:
                    continue

                status = str(data.get("status", "")).upper()
                logger.debug(
                    "Suno poll {}/{}: status={} elapsed={:.0f}s",
                    i + 1, max_polls, status, elapsed,
                )

                if progress_cb:
                    progress_cb({"step": "generating", "poll": i + 1, "elapsed": int(elapsed)})

                if status in {"SUCCESS", "COMPLETE"}:
                    tracks = self._extract_tracks(data)
                    if len(tracks) >= min_tracks or (elapsed >= 300 and len(tracks) >= 1):
                        return tracks
                    # still waiting for more variants

                elif "FAILED" in status or "ERROR" in status:
                    response_obj = data.get("response") or {}
                    if not isinstance(response_obj, dict):
                        response_obj = {}
                    err = (
                        response_obj.get("errorMessage")
                        or data.get("errorMessage")
                        or data.get("msg")
                        or "generation failed"
                    )
                    logger.warning("Suno poll status={} error={}", status, err)
                    raise SunoError(err)

                elif status in {"CANCELLED", "CANCELED", "TIMEOUT"}:
                    raise SunoError("generation cancelled or timed out by Suno")

        raise SunoError("polling timed out — Suno did not finish in the allotted time")

    @staticmethod
    def _extract_tracks(data: dict[str, Any]) -> list[SunoTrack]:
        tracks: list[SunoTrack] = []
        for t in data.get("response", {}).get("sunoData", []):
            url = t.get("audioUrl") or t.get("sourceAudioUrl")
            if url:
                tracks.append(
                    SunoTrack(
                        audio_url=url,
                        audio_id=str(t.get("id", "")),
                        image_url=t.get("imageUrl") or t.get("image_url"),
                        duration=int(t.get("duration", 0)),
                        title=str(t.get("title", "")),
                    )
                )
        return tracks

    # ------------------------------------------------------------------ public API

    async def generate_music(
        self,
        *,
        prompt: str,
        style: str,
        title: str = "AI Song",
        instrumental: bool = False,
        vocal_gender: str | None = None,
        style_weight: float | None = None,
        weirdness_constraint: float | None = None,
        progress_cb: ProgressCb | None = None,
    ) -> SunoResult:
        clean_style = _strip_artist_names(style)[:1000]
        payload: dict[str, Any] = {
            "prompt": prompt[:5000],   # Suno lyrics limit
            "style": clean_style,      # Suno style limit — critical, API rejects >1000 or artist names
            "title": title[:80],       # Suno title limit
            "customMode": True,
            "instrumental": instrumental,
            "model": "V5_5",
            "callBackUrl": "https://google.com",
        }
        if vocal_gender in {"m", "f"}:
            payload["vocalGender"] = vocal_gender
        if style_weight is not None:
            payload["styleWeight"] = max(0.0, min(1.0, style_weight))
        if weirdness_constraint is not None:
            payload["weirdnessConstraint"] = max(0.0, min(1.0, weirdness_constraint))

        if progress_cb:
            progress_cb({"step": "submitting"})

        result = await self._post("/generate", payload)
        data = result.get("data")
        task_id = data.get("taskId") if isinstance(data, dict) else str(data or "")
        if not task_id:
            raise SunoError(f"no taskId returned: {result.get('msg')}")

        if progress_cb:
            progress_cb({"step": "queued", "task_id": task_id})

        tracks = await self._poll(task_id, progress_cb=progress_cb)
        return SunoResult(tracks=tracks, task_id=task_id)

    async def generate_lyrics(
        self,
        *,
        prompt: str,
        progress_cb: ProgressCb | None = None,
    ) -> SunoLyricsResult:
        """Suno Lyrics Generation API: POST /lyrics, then poll /lyrics/record-info.

        Returns up to 2 lyric variants. The first usable one is what the
        SongModule UI shows; tests can introspect `variants` directly.
        """
        payload: dict[str, Any] = {
            "prompt": prompt[:200],
            "callBackUrl": "https://google.com",
        }

        if progress_cb:
            progress_cb({"step": "submitting"})

        result = await self._post("/lyrics", payload)
        data = result.get("data") or {}
        task_id = data.get("taskId") if isinstance(data, dict) else str(data or "")
        if not task_id:
            raise SunoError(f"no taskId for lyrics: {result.get('msg')}")

        if progress_cb:
            progress_cb({"step": "queued", "task_id": task_id})

        # Poll record-info until SUCCESS / failure / timeout.
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=30.0)) as client:
            for i in range(30):
                # Lyrics finish in ~5-15s; poll every 3-6s with mild back-off.
                await asyncio.sleep(min(3 + i * 0.5, 6))
                resp = await client.get(
                    f"{self._base}/lyrics/record-info",
                    params={"taskId": task_id},
                    headers=self._headers,
                )
                if resp.status_code != 200:
                    continue

                payload_json = resp.json() or {}
                d = payload_json.get("data") or {}
                status = str(d.get("status", "")).upper()

                if progress_cb:
                    progress_cb({"step": "lyrics", "poll": i + 1})

                if status == "SUCCESS":
                    raw = d.get("response", {}).get("data", []) or []
                    variants: list[SunoLyricsVariant] = []
                    for v in raw:
                        if not isinstance(v, dict):
                            continue
                        text = str(v.get("text", "")).strip()
                        if not text:
                            continue
                        variants.append(
                            SunoLyricsVariant(
                                text=text,
                                title=str(v.get("title", "")).strip(),
                                status=str(v.get("status", "complete")).lower(),
                            )
                        )
                    if not variants:
                        raise SunoError("Suno returned SUCCESS but no lyrics variants")
                    return SunoLyricsResult(variants=variants, task_id=task_id)

                if status in {
                    "CREATE_TASK_FAILED",
                    "GENERATE_LYRICS_FAILED",
                    "CALLBACK_EXCEPTION",
                    "SENSITIVE_WORD_ERROR",
                }:
                    err = d.get("errorMessage") or status.lower().replace("_", " ")
                    raise SunoError(f"Suno lyrics: {err}")

        raise SunoError("Suno lyrics polling timed out")

    async def generate_sound_effect(
        self,
        *,
        prompt: str,
        progress_cb: ProgressCb | None = None,
    ) -> SunoResult:
        payload: dict[str, Any] = {
            "prompt": prompt[:500],
            "model": "V5",
            "soundLoop": False,
            "soundKey": "Any",
        }

        if progress_cb:
            progress_cb({"step": "submitting"})

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self._base}/generate/sounds",
                json=payload,
                headers=self._headers,
            )

        result = resp.json()
        if result.get("code") != 200:
            raise SunoError(result.get("msg", "sound effect API error"))

        task_id = result.get("data", {}).get("taskId", "")
        if not task_id:
            raise SunoError("no taskId for sound effect")

        if progress_cb:
            progress_cb({"step": "queued", "task_id": task_id})

        tracks = await self._poll(task_id, max_polls=40, min_tracks=1, progress_cb=progress_cb)
        return SunoResult(tracks=tracks, task_id=task_id)

    async def generate_cover(
        self,
        *,
        upload_url: str,
        style: str,
        prompt: str = "",
        title: str = "Cover",
        instrumental: bool = False,
        vocal_gender: str | None = None,
        style_weight: float | None = None,
        weirdness_constraint: float | None = None,
        progress_cb: ProgressCb | None = None,
    ) -> SunoResult:
        payload: dict[str, Any] = {
            "uploadUrl": upload_url,
            "customMode": True,
            "instrumental": instrumental,
            "model": "V5_5",
            "style": _strip_artist_names(style)[:1000],
            "title": title[:80],
            "callBackUrl": "https://google.com",
        }
        if not instrumental and prompt:
            payload["prompt"] = prompt[:5000]
        if vocal_gender in {"m", "f"}:
            payload["vocalGender"] = vocal_gender
        if style_weight is not None:
            payload["styleWeight"] = max(0.0, min(1.0, style_weight))
        if weirdness_constraint is not None:
            payload["weirdnessConstraint"] = max(0.0, min(1.0, weirdness_constraint))

        if progress_cb:
            progress_cb({"step": "submitting"})

        result = await self._post("/generate/upload-cover", payload)
        data = result.get("data")
        task_id = data.get("taskId") if isinstance(data, dict) else str(data or "")
        if not task_id:
            raise SunoError(f"no taskId for cover: {result.get('msg')}")

        if progress_cb:
            progress_cb({"step": "queued", "task_id": task_id})

        tracks = await self._poll(task_id, progress_cb=progress_cb)
        return SunoResult(tracks=tracks, task_id=task_id)

    async def extend_music(
        self,
        *,
        audio_id: str,
        prompt: str = "",
        style: str = "",
        title: str = "",
        continue_at: int = 0,
        progress_cb: ProgressCb | None = None,
    ) -> SunoResult:
        if continue_at == 0:
            payload: dict[str, Any] = {
                "defaultParamFlag": False,
                "audioId": audio_id,
                "model": "V5_5",
                "callBackUrl": "https://google.com",
            }
        else:
            payload = {
                "defaultParamFlag": True,
                "audioId": audio_id,
                "model": "V5_5",
                "callBackUrl": "https://google.com",
                "prompt": prompt[:5000],
                "style": style[:1000],
                "title": title[:100],
                "continueAt": continue_at,
            }

        if progress_cb:
            progress_cb({"step": "submitting"})

        result = await self._post("/generate/extend", payload)
        data = result.get("data", {})
        task_id = data.get("taskId") if isinstance(data, dict) else str(data or "")
        if not task_id:
            raise SunoError(f"no taskId for extend: {result.get('msg')}")

        if progress_cb:
            progress_cb({"step": "queued", "task_id": task_id})

        tracks = await self._poll(task_id, max_polls=120, min_tracks=1, progress_cb=progress_cb)
        return SunoResult(tracks=tracks, task_id=task_id)

    async def convert_to_wav(
        self,
        *,
        task_id: str,
        audio_id: str,
        progress_cb: ProgressCb | None = None,
    ) -> str:
        """Returns WAV URL."""
        payload = {"taskId": task_id, "audioId": audio_id, "callBackUrl": "https://google.com"}

        if progress_cb:
            progress_cb({"step": "submitting_wav"})

        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=30.0)) as client:
            resp = await client.post(
                f"{self._base}/wav/generate",
                json=payload,
                headers=self._headers,
                timeout=120.0,
            )

            wav_task_id: str
            if resp.status_code == 409:
                wav_task_id = task_id
            else:
                result = resp.json()
                if result.get("code") != 200:
                    raise SunoError(f"WAV request error: {result.get('msg')}")
                wav_data = result.get("data", {})
                wav_task_id = wav_data.get("taskId", "")
                if not wav_task_id:
                    raise SunoError("no taskId for WAV conversion")

            for i in range(20):
                delay = min(5 + i * 2, 20)
                await asyncio.sleep(delay)

                status_resp = await client.get(
                    f"{self._base}/wav/record-info",
                    params={"taskId": wav_task_id},
                    headers=self._headers,
                )
                if status_resp.status_code != 200:
                    continue

                result = status_resp.json()
                if result.get("code") != 200:
                    raise SunoError(result.get("msg", "WAV status error"))

                data = result.get("data", {})
                flag = str(data.get("successFlag", ""))

                if flag == "SUCCESS":
                    wav_url = data.get("response", {}).get("audioWavUrl", "")
                    if wav_url:
                        return wav_url

                elif flag in {"CREATE_TASK_FAILED", "GENERATE_WAV_FAILED", "CALLBACK_EXCEPTION"}:
                    raise SunoError(f"WAV conversion failed: {data.get('errorMessage', flag)}")

                if progress_cb:
                    progress_cb({"step": "converting_wav", "poll": i + 1})

        raise SunoError("WAV conversion timed out")


def make_suno_client(settings: Any) -> SunoClient:
    return SunoClient(api_key=settings.suno_api_key, base_url=settings.suno_base_url)
