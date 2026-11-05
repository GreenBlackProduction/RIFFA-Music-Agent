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
    # Producers/beatmakers — GPT enrichment reaches for these to describe a
    # genre's "sonic signature" even though the ban never named them
    # explicitly (fixed in the prompt too). Live failure 2026-07-13: "Metro
    # Boomin style" survived the clause-stripping regexes entirely (no
    # trigger phrase, no hyphen) and Suno hard-rejected the generation.
    "metro boomin", "mike will made it", "zaytoven", "pierre bourne",
    "dj mustard", "southside", "wheezy", "murda beatz", "young chop",
    "timbaland", "dr. dre", "dr dre", "pharrell", "rick rubin", "max martin",
    "quincy jones", "brian eno", "nigel godrich", "jack antonoff",
    "finneas", "hit-boy", "boi-1da", "20 syl", "madlib", "j dilla",
    "flying lotus", "diplo", "skrillex", "zedd", "kygo",
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


class SunoPending(SunoError):
    """Suno hasn't finished within our poll budget — this is NOT a failure.
    The task may still complete; the reconcile sweeper recovers it by task_id
    instead of failing + refunding a generation that Suno actually delivers."""
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
    def __init__(
        self, api_key: str, base_url: str = _SUNO_BASE, callback_url: str = "",
        model: str = "V5_5",
    ) -> None:
        self._model = model
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        self._base = base_url.rstrip("/")
        # Suno requires a callBackUrl. We poll for results regardless, so this
        # is only a courtesy ping — but it should hit our own backend, not a
        # hardcoded third-party domain.
        self._callback_url = (callback_url or "").strip() or (
            "https://riffastudio.site/api/v1/webhooks/suno"
        )

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
                    data: dict[str, Any] = resp.json()
                    return data
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

        # Budget exhausted — Suno may still be working. Signal "pending" (not a
        # failure) so the worker leaves the generation in `processing` and the
        # reconcile sweeper finishes it by task_id later.
        raise SunoPending("polling budget exhausted — Suno still working")

    async def fetch_tracks(self, task_id: str) -> list[SunoTrack]:
        """One-shot status check (no waiting loop) for reconciliation.

        Returns tracks when ready, ``[]`` when still generating, and raises
        ``SunoError`` when Suno reports the task failed/cancelled."""
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=15.0)) as client:
            resp = await client.get(
                f"{self._base}/generate/record-info",
                params={"taskId": task_id},
                headers=self._headers,
            )
            if resp.status_code != 200:
                return []
            data = resp.json().get("data")
            if not data:
                return []
            status = str(data.get("status", "")).upper()
            if status in {"SUCCESS", "COMPLETE"}:
                return self._extract_tracks(data)
            if "FAILED" in status or "ERROR" in status:
                response_obj = data.get("response") or {}
                if not isinstance(response_obj, dict):
                    response_obj = {}
                err = (
                    response_obj.get("errorMessage")
                    or data.get("errorMessage")
                    or data.get("msg")
                    or "generation failed"
                )
                raise SunoError(err)
            if status in {"CANCELLED", "CANCELED", "TIMEOUT"}:
                raise SunoError("generation cancelled or timed out by Suno")
            return []  # PENDING / TEXT_SUCCESS / FIRST_SUCCESS — still generating

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
        negative_tags: str | None = None,
        duration: int | None = None,
        progress_cb: ProgressCb | None = None,
    ) -> SunoResult:
        clean_style = _strip_artist_names(style)[:1000]
        payload: dict[str, Any] = {
            "prompt": prompt[:5000],   # Suno lyrics limit
            "style": clean_style,      # Suno style limit — critical, API rejects >1000 or artist names
            "title": title[:80],       # Suno title limit
            "customMode": True,
            "instrumental": instrumental,
            "model": self._model,
            "callBackUrl": self._callback_url,
        }
        # V6 documents lyrics in a dedicated `lyrics` field (it wins over prompt).
        if self._model.startswith("V6") and not instrumental:
            payload["lyrics"] = prompt[:5000]
        if vocal_gender in {"m", "f"}:
            payload["vocalGender"] = vocal_gender
        if style_weight is not None:
            payload["styleWeight"] = max(0.0, min(1.0, style_weight))
        if weirdness_constraint is not None:
            payload["weirdnessConstraint"] = max(0.0, min(1.0, weirdness_constraint))
        if negative_tags:
            # "Music styles or traits to exclude" — the ONLY reliable exclusion
            # channel; negations inside `style` text attract what they negate.
            payload["negativeTags"] = negative_tags[:200]
        # Track length in seconds (10-360). Only V5_5 and the V6 family accept
        # it; without it V6 settles around 2:10 regardless of the brief.
        if duration and (self._model == "V5_5" or self._model.startswith("V6")):
            payload["duration"] = max(10, min(360, int(duration)))

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
            "callBackUrl": self._callback_url,
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
            "model": self._model,
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
        audio_weight: float | None = None,
        negative_tags: str | None = None,
        progress_cb: ProgressCb | None = None,
    ) -> SunoResult:
        # Suno /generate/upload-cover parameter rules
        #   customMode=true  + instrumental=true   → style, title, uploadUrl required
        #   customMode=true  + instrumental=false  → style, title, prompt (≤5000), uploadUrl required
        #   customMode=false                       → prompt (≤500) + uploadUrl only;
        #                                            style/title MUST be empty.
        # See https://docs.sunoapi.org/suno-api/upload-and-cover-audio
        clean_style = _strip_artist_names(style)
        if len(clean_style) > 1000:
            logger.warning("suno: style over 1000 chars ({}) — hard-truncated", len(clean_style))
            clean_style = clean_style[:1000]
        clean_title = title[:100]

        if instrumental:
            payload: dict[str, Any] = {
                "uploadUrl": upload_url,
                "customMode": True,
                "instrumental": True,
                "model": self._model,
                "style": clean_style,
                "title": clean_title,
                "callBackUrl": self._callback_url,
            }
        elif prompt:
            payload = {
                "uploadUrl": upload_url,
                "customMode": True,
                "instrumental": False,
                "model": self._model,
                "style": clean_style,
                "title": clean_title,
                "prompt": prompt[:5000],
                "callBackUrl": self._callback_url,
            }
            if self._model.startswith("V6"):
                payload["lyrics"] = prompt[:5000]
        else:
            # Custom Mode requires prompt when not instrumental; without lyrics
            # fall back to Non-Custom Mode where only prompt+uploadUrl are sent.
            # We seed prompt from the user's style brief so the cover still
            # reflects the desired direction.
            desc = (clean_style or "cover version").strip()[:500] or "cover version"
            payload = {
                "uploadUrl": upload_url,
                "customMode": False,
                "instrumental": False,
                "model": self._model,
                "prompt": desc,
                "callBackUrl": self._callback_url,
            }
        if vocal_gender in {"m", "f"} and not instrumental:
            payload["vocalGender"] = vocal_gender
        if style_weight is not None:
            payload["styleWeight"] = max(0.0, min(1.0, style_weight))
        if weirdness_constraint is not None:
            payload["weirdnessConstraint"] = max(0.0, min(1.0, weirdness_constraint))
        # audioWeight controls how strongly the result clings to the uploaded
        # source vs. the style brief. A high value keeps the richer style brief
        # (assembled by the caller) from dragging the cover away from the original.
        if audio_weight is not None:
            payload["audioWeight"] = max(0.0, min(1.0, audio_weight))
        if negative_tags:
            payload["negativeTags"] = negative_tags[:200]

        if progress_cb:
            progress_cb({"step": "submitting"})

        result = await self._post("/generate/upload-cover", payload)
        code = result.get("code")
        msg = result.get("msg", "")
        data = result.get("data")
        if code and code != 200:
            raise SunoError(f"Suno cover error (code {code}): {msg}")
        task_id = data.get("taskId") if isinstance(data, dict) else str(data or "")
        if not task_id:
            raise SunoError(f"no taskId for cover: {msg}")

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
                "model": self._model,
                "callBackUrl": self._callback_url,
            }
        else:
            payload = {
                "defaultParamFlag": True,
                "audioId": audio_id,
                "model": self._model,
                "callBackUrl": self._callback_url,
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
        payload = {"taskId": task_id, "audioId": audio_id, "callBackUrl": self._callback_url}

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
                    wav_url = str(data.get("response", {}).get("audioWavUrl") or "")
                    if wav_url:
                        return wav_url

                elif flag in {"CREATE_TASK_FAILED", "GENERATE_WAV_FAILED", "CALLBACK_EXCEPTION"}:
                    raise SunoError(f"WAV conversion failed: {data.get('errorMessage', flag)}")

                if progress_cb:
                    progress_cb({"step": "converting_wav", "poll": i + 1})

        raise SunoError("WAV conversion timed out")


def make_suno_client(settings: Any) -> SunoClient:
    return SunoClient(
        api_key=settings.suno_api_key,
        base_url=settings.suno_base_url,
        callback_url=getattr(settings, "suno_callback_url", "") or "",
        model=getattr(settings, "suno_model", "") or "V5_5",
    )
