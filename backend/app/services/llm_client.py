"""One chat client for the whole app, with a provider fallback chain.

Before this, every caller built its own ``AsyncOpenAI`` against
``settings.openai_base_url`` with ``apiyi_key or openai_api_key``. That made
one reseller balance a single point of failure for lyrics, titles, prompt
enrichment, the agent and brief normalisation — and on 2026-08-13 it took all
of them down at once when the balance ran out (the spare ``OPENAI_API_KEY``
turned out to be invalid, so there was no spare at all).

The client here keeps the same call shape callers already use —
``client.chat.completions.create(...)`` — so nothing else has to change, and
walks a chain of providers when one refuses: quota, rate limit, auth, 5xx.

Model names are written in OpenAI form (``gpt-4o``) and translated per
provider (OpenRouter wants ``openai/gpt-4o``). A caller that passes a
vendor-qualified name (``anthropic/claude-haiku-4.5``) is left alone.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import httpx
from loguru import logger
from openai import AsyncOpenAI

_OPENROUTER_BASE = "https://openrouter.ai/api/v1"
_APIYI_BASE = "https://api.apiyi.com/v1"

# Status codes that mean "this provider cannot serve the request, try the
# next one": payment/quota, auth, rate limit, and anything server-side.
_FAILOVER_STATUS: frozenset[int] = frozenset({401, 402, 403, 429, 500, 502, 503, 504})


@dataclass(frozen=True)
class Provider:
    name: str
    api_key: str
    base_url: str
    qualify_models: bool = False   # OpenRouter needs "openai/gpt-4o"

    def model_for(self, model: str) -> str:
        if not self.qualify_models or "/" in model:
            return model
        return f"openai/{model}"


def _status_of(exc: Exception) -> int | None:
    status = getattr(exc, "status_code", None)
    if isinstance(status, int):
        return status
    response = getattr(exc, "response", None)
    code = getattr(response, "status_code", None)
    return code if isinstance(code, int) else None


def _should_failover(exc: Exception) -> bool:
    if isinstance(exc, httpx.TimeoutException | httpx.ConnectError):
        return True
    status = _status_of(exc)
    return status in _FAILOVER_STATUS if status is not None else False


def resolve_providers(settings: Any) -> list[Provider]:
    """Build the chain from settings. Order comes from ``llm_providers``."""
    catalogue: dict[str, Provider] = {}
    if getattr(settings, "openrouter_api_key", ""):
        catalogue["openrouter"] = Provider(
            name="openrouter",
            api_key=settings.openrouter_api_key,
            base_url=getattr(settings, "openrouter_base_url", "") or _OPENROUTER_BASE,
            qualify_models=True,
        )
    if getattr(settings, "apiyi_key", ""):
        catalogue["apiyi"] = Provider(
            name="apiyi",
            api_key=settings.apiyi_key,
            base_url=getattr(settings, "openai_base_url", "") or _APIYI_BASE,
        )
    if getattr(settings, "openai_api_key", ""):
        catalogue["openai"] = Provider(
            name="openai",
            api_key=settings.openai_api_key,
            base_url="https://api.openai.com/v1",
        )

    order = [
        n.strip().lower()
        for n in (getattr(settings, "llm_providers", "") or "openrouter,apiyi").split(",")
        if n.strip()
    ]
    chain = [catalogue[name] for name in order if name in catalogue]
    return chain or list(catalogue.values())


class _Completions:
    def __init__(self, providers: list[Provider], timeout: float) -> None:
        self._providers = providers
        self._clients = {
            p.name: AsyncOpenAI(api_key=p.api_key, base_url=p.base_url, timeout=timeout)
            for p in providers
        }

    async def create(self, **kwargs: Any) -> Any:
        model = kwargs.pop("model", "gpt-4o")
        last: Exception | None = None
        for index, provider in enumerate(self._providers):
            try:
                return await self._clients[provider.name].chat.completions.create(
                    model=provider.model_for(model), **kwargs
                )
            except Exception as exc:
                last = exc
                is_last = index == len(self._providers) - 1
                if is_last or not _should_failover(exc):
                    raise
                logger.warning(
                    "llm: provider {} refused ({}) — falling over to {}",
                    provider.name,
                    str(exc)[:120],
                    self._providers[index + 1].name,
                )
        if last:
            raise last
        raise RuntimeError("no LLM provider configured")


class _Chat:
    def __init__(self, completions: _Completions) -> None:
        self.completions = completions


class ChatClient:
    """Drop-in stand-in for ``AsyncOpenAI`` covering ``chat.completions.create``."""

    def __init__(self, providers: list[Provider], timeout: float = 60.0) -> None:
        if not providers:
            raise ValueError("ChatClient needs at least one provider")
        self.providers = providers
        self.chat = _Chat(_Completions(providers, timeout))

    @property
    def provider_names(self) -> list[str]:
        return [p.name for p in self.providers]


def make_chat_client(settings: Any, *, timeout: float = 60.0) -> ChatClient:
    return ChatClient(resolve_providers(settings), timeout=timeout)


def make_chat_client_from_env(*, timeout: float = 60.0) -> ChatClient:
    """For scripts: build the chain straight from environment variables."""

    class _EnvSettings:
        openrouter_api_key = os.environ.get("OPENROUTER_API_KEY", "")
        openrouter_base_url = os.environ.get("OPENROUTER_BASE_URL", "")
        apiyi_key = os.environ.get("APIYI_KEY", "")
        openai_api_key = os.environ.get("OPENAI_API_KEY", "")
        openai_base_url = os.environ.get("OPENAI_BASE_URL", "")
        llm_providers = os.environ.get("LLM_PROVIDERS", "openrouter,apiyi")

    return make_chat_client(_EnvSettings(), timeout=timeout)


__all__ = [
    "ChatClient",
    "Provider",
    "make_chat_client",
    "make_chat_client_from_env",
    "resolve_providers",
]
