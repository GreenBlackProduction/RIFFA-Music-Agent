"""NanoBanana image-generation client — OpenAI-compatible API.

NanoBanana is accessible through the apiyi.com aggregator using the same
AsyncOpenAI SDK we already use for GPT calls.  The API is synchronous for
most models: one call → one response with either a ``url`` or ``b64_json``.
"""

from __future__ import annotations

from typing import Any

from loguru import logger
from openai import AsyncOpenAI


class NanoBananaError(Exception):
    pass


# Model IDs exposed in the StudioPage UI.
VALID_MODELS = frozenset({"nano-banana", "nano-banana-2", "nano-banana-pro"})


class NanoBananaClient:
    def __init__(self, api_key: str, base_url: str = "https://api.apiyi.com/v1") -> None:
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def generate_cover_art(
        self,
        prompt: str,
        *,
        model: str = "nano-banana",
        size: str = "1024x1024",
    ) -> str:
        """Generate album cover art.

        Returns an image URL or a ``data:image/png;base64,...`` string when the
        API returns raw bytes instead of a hosted URL.
        """
        if model not in VALID_MODELS:
            model = "nano-banana"

        if len(prompt) > 2000:
            prompt = prompt[:2000]

        logger.info("NanoBanana: model={} prompt_len={}", model, len(prompt))
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


def make_nanobanana_client(settings: Any) -> NanoBananaClient:
    api_key = getattr(settings, "nanobanana_api_key", "") or ""
    base_url = getattr(settings, "nanobanana_base_url", "") or "https://api.apiyi.com/v1"
    return NanoBananaClient(api_key=api_key, base_url=base_url)
