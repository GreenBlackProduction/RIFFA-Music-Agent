"""NanoBanana image-generation client — OpenAI-compatible API.

NanoBanana is accessible through the apiyi.com aggregator using the same
AsyncOpenAI SDK we already use for GPT calls.  The API is synchronous for
most models: one call → one response with either a ``url`` or ``b64_json``.
"""

from __future__ import annotations

import io
from typing import Any

from loguru import logger
from openai import AsyncOpenAI


class NanoBananaError(Exception):
    pass


# Model IDs exposed in the StudioPage UI.
VALID_MODELS = frozenset({"nano-banana", "nano-banana-2", "nano-banana-pro"})

# Output resolution is fixed at 1024×1024. Probed 2026-06-07: APIYI accepts a
# larger ``size`` (e.g. 2048×2048) without error but IGNORES it and still
# returns a 1024×1024 image, so we don't expose a bigger-size option.
_SIZE = "1024x1024"


class NanoBananaClient:
    def __init__(self, api_key: str, base_url: str = "https://api.apiyi.com/v1") -> None:
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    @staticmethod
    def _extract_image(resp: Any) -> str:
        """Pull a usable image out of an images.* response.

        Returns a hosted URL, or a ``data:image/png;base64,…`` string when the
        API returns raw bytes instead.
        """
        try:
            img: Any = resp.data[0]
        except (IndexError, AttributeError) as exc:
            raise NanoBananaError("API returned no image data") from exc

        if getattr(img, "url", None):
            logger.info("NanoBanana: received URL")
            return str(img.url)

        b64 = getattr(img, "b64_json", None)
        if b64:
            logger.info("NanoBanana: received base64, len={}", len(b64))
            return f"data:image/png;base64,{b64}"

        raise NanoBananaError("API returned neither url nor b64_json")

    async def generate_cover_art(
        self,
        prompt: str,
        *,
        model: str = "nano-banana",
        size: str = _SIZE,
    ) -> str:
        """Generate album cover art (text → image).

        Returns an image URL or a ``data:image/png;base64,...`` string when the
        API returns raw bytes instead of a hosted URL.
        """
        if model not in VALID_MODELS:
            model = "nano-banana"

        if len(prompt) > 2000:
            prompt = prompt[:2000]

        logger.info("NanoBanana generate: model={} prompt_len={}", model, len(prompt))
        try:
            resp = await self._client.images.generate(
                model=model,
                prompt=prompt,
                size=size,  # type: ignore[arg-type]
                n=1,
            )
        except Exception as exc:
            logger.error("NanoBanana API call failed: {}", exc)
            raise NanoBananaError(str(exc)) from exc

        return self._extract_image(resp)

    async def edit_cover_art(
        self,
        prompt: str,
        image_bytes: bytes,
        *,
        model: str = "nano-banana",
        filename: str = "source.png",
        mime: str = "image/png",
    ) -> str:
        """Image → image: transform the given source image per the prompt.

        Used by "enhance" so the result KEEPS the original composition instead
        of generating a brand-new picture (the old text-only call produced an
        unrelated image). Same return contract as ``generate_cover_art``.
        """
        if model not in VALID_MODELS:
            model = "nano-banana"

        if len(prompt) > 2000:
            prompt = prompt[:2000]

        logger.info(
            "NanoBanana edit: model={} prompt_len={} img_bytes={}",
            model, len(prompt), len(image_bytes),
        )
        try:
            resp = await self._client.images.edit(
                model=model,
                image=(filename, io.BytesIO(image_bytes), mime),
                prompt=prompt,
                n=1,
            )
        except Exception as exc:
            logger.error("NanoBanana edit call failed: {}", exc)
            raise NanoBananaError(str(exc)) from exc

        return self._extract_image(resp)


def make_nanobanana_client(settings: Any) -> NanoBananaClient:
    api_key = getattr(settings, "nanobanana_api_key", "") or ""
    base_url = getattr(settings, "nanobanana_base_url", "") or "https://api.apiyi.com/v1"
    return NanoBananaClient(api_key=api_key, base_url=base_url)
