"""The worker's single style entry point honours the pipeline flag."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.tasks import _build_style_payload


class _StubLyricsClient:
    """Stands in for the GPT enricher on the legacy path."""

    def __init__(self) -> None:
        self.calls = 0

    async def enrich_music_prompt(self, **kwargs: Any) -> str:
        self.calls += 1
        return "a" * 600   # long enough to survive the length gate


def _settings(pipeline: str) -> SimpleNamespace:
    # No provider keys: the new pipeline must degrade to its deterministic
    # render instead of failing the generation.
    return SimpleNamespace(
        prompt_pipeline=pipeline,
        openrouter_api_key="",
        apiyi_key="",
        openai_api_key="",
        openai_base_url="",
        llm_providers="openrouter,apiyi",
    )


_PARAMS = {
    "description": "таинственное техно только с синтезаторами, без ударных и бочки",
    "genre": "Techno",
    "mood": "anxious",
    "tempo": "medium",
    "agent_music_params": {},
    "agent_prompt": "",
    "agent_research_notes": "",
}


@pytest.mark.asyncio
async def test_flag_old_uses_the_legacy_enricher() -> None:
    lyrics = _StubLyricsClient()
    style, _tags, _w, _c, meta = await _build_style_payload(
        settings=_settings("old"),
        lyrics_client=lyrics,
        params=_PARAMS,
        description=_PARAMS["description"],
        instrumental=True,
        user_id=1,
        learned_presets={},
    )

    assert meta["pipeline"] == "old"
    assert lyrics.calls == 1
    assert style


@pytest.mark.asyncio
async def test_flag_new_bypasses_the_enricher_and_reports_itself() -> None:
    lyrics = _StubLyricsClient()
    style, tags, _w, _c, meta = await _build_style_payload(
        settings=_settings("new"),
        lyrics_client=lyrics,
        params=_PARAMS,
        description=_PARAMS["description"],
        instrumental=True,
        user_id=1,
        learned_presets={},
    )

    assert meta["pipeline"] == "new"
    assert meta["source"] == "deterministic"   # no provider configured
    assert lyrics.calls == 0
    assert "understood" in meta and "faithfulness" in meta

    assert "techno" in style.lower()
    assert "kick" not in style.lower()
    assert {"drums", "kick"} <= {t.strip().lower() for t in tags.split(",")}
