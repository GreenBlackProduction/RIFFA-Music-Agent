"""Unit tests for ``SunoClient.generate_lyrics`` — Suno's /lyrics endpoint integration."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from app.services.suno import SunoClient, SunoError


@pytest.mark.asyncio
async def test_generate_lyrics_success(monkeypatch: pytest.MonkeyPatch) -> None:
    """Happy path: POST /lyrics returns taskId, GET /lyrics/record-info returns SUCCESS."""

    class FakeAsyncClient:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            self._calls: list[str] = []

        async def __aenter__(self) -> FakeAsyncClient:
            return self

        async def __aexit__(self, *args: Any) -> None:
            return None

        async def post(self, url: str, **kwargs: Any) -> httpx.Response:
            assert url.endswith("/lyrics")
            return httpx.Response(
                200,
                json={"code": 200, "data": {"taskId": "T-1"}},
                request=httpx.Request("POST", url),
            )

        async def get(self, url: str, **kwargs: Any) -> httpx.Response:
            assert url.endswith("/lyrics/record-info")
            return httpx.Response(
                200,
                json={
                    "code": 200,
                    "data": {
                        "taskId": "T-1",
                        "status": "SUCCESS",
                        "response": {
                            "data": [
                                {
                                    "text": "[Verse]\nNeon city lights\n[Chorus]\nFly with me",
                                    "title": "Neon Skyline",
                                    "status": "complete",
                                    "errorMessage": "",
                                },
                                {
                                    "text": "[Verse]\nAlternate take",
                                    "title": "Neon Skyline",
                                    "status": "complete",
                                },
                            ]
                        },
                    },
                },
                request=httpx.Request("GET", url),
            )

    async def fake_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("app.services.suno.httpx.AsyncClient", FakeAsyncClient)
    monkeypatch.setattr("app.services.suno.asyncio.sleep", fake_sleep)

    client = SunoClient(api_key="test", base_url="https://api.test.local/api/v1")
    progress: list[dict[str, Any]] = []
    result = await client.generate_lyrics(
        prompt="summer city, neon energy",
        progress_cb=progress.append,
    )

    assert result.task_id == "T-1"
    assert len(result.variants) == 2
    assert result.variants[0].text.startswith("[Verse]")
    assert result.variants[0].title == "Neon Skyline"
    assert any(p.get("step") == "submitting" for p in progress)
    assert any(p.get("step") == "lyrics" for p in progress)


@pytest.mark.asyncio
async def test_generate_lyrics_failure_status(monkeypatch: pytest.MonkeyPatch) -> None:
    """A terminal error status from Suno propagates as SunoError."""

    class FakeAsyncClient:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        async def __aenter__(self) -> FakeAsyncClient:
            return self

        async def __aexit__(self, *args: Any) -> None:
            return None

        async def post(self, url: str, **kwargs: Any) -> httpx.Response:
            return httpx.Response(
                200,
                json={"code": 200, "data": {"taskId": "T-2"}},
                request=httpx.Request("POST", url),
            )

        async def get(self, url: str, **kwargs: Any) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "code": 200,
                    "data": {
                        "taskId": "T-2",
                        "status": "SENSITIVE_WORD_ERROR",
                        "errorMessage": "prohibited content",
                    },
                },
                request=httpx.Request("GET", url),
            )

    async def fake_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("app.services.suno.httpx.AsyncClient", FakeAsyncClient)
    monkeypatch.setattr("app.services.suno.asyncio.sleep", fake_sleep)

    client = SunoClient(api_key="test", base_url="https://api.test.local/api/v1")
    with pytest.raises(SunoError, match="prohibited content"):
        await client.generate_lyrics(prompt="x")


@pytest.mark.asyncio
async def test_generate_lyrics_no_task_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """Suno returning empty data raises SunoError immediately, before any polling."""

    class FakeAsyncClient:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        async def __aenter__(self) -> FakeAsyncClient:
            return self

        async def __aexit__(self, *args: Any) -> None:
            return None

        async def post(self, url: str, **kwargs: Any) -> httpx.Response:
            return httpx.Response(
                200,
                json={"code": 500, "msg": "no quota", "data": None},
                request=httpx.Request("POST", url),
            )

    async def fake_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("app.services.suno.httpx.AsyncClient", FakeAsyncClient)
    monkeypatch.setattr("app.services.suno.asyncio.sleep", fake_sleep)

    client = SunoClient(api_key="test", base_url="https://api.test.local/api/v1")
    with pytest.raises(SunoError, match="no taskId"):
        await client.generate_lyrics(prompt="x")
