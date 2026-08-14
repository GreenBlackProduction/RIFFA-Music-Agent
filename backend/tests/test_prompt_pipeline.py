"""Stage 3 — the composer may phrase the brief, never overrule it."""

from __future__ import annotations

import json
from typing import Any

import pytest

from app.services.prompt_pipeline import build_suno_prompt

_PARSE_REPLY = json.dumps({
    "genre": "Techno",
    "subgenre": "",
    "instruments_required": ["synthesizers"],
    "instruments_forbidden": ["drums", "kick"],
    "bpm_min": None,
    "bpm_max": None,
    "tempo_word": "medium",
    "mood": "anxious",
    "vocals": "none",
    "usage": "",
    "era": "",
    "notes": [],
    "references": [],
    "open": ["era", "production", "texture", "arrangement"],
})


class _Message:
    def __init__(self, content: str) -> None:
        self.content = content


class _Choice:
    def __init__(self, content: str) -> None:
        self.message = _Message(content)


class _Response:
    def __init__(self, content: str) -> None:
        self.choices = [_Choice(content)]


class _ScriptedCompletions:
    """Returns queued replies in order; records every call."""

    def __init__(self, replies: list[str]) -> None:
        self._replies = list(replies)
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> _Response:
        self.calls.append(kwargs)
        return _Response(self._replies.pop(0) if self._replies else "")


class _ScriptedClient:
    def __init__(self, replies: list[str]) -> None:
        self.completions = _ScriptedCompletions(replies)
        self.chat = self

    @property
    def calls(self) -> list[dict[str, Any]]:
        return self.completions.calls


_BRIEF = {
    "description": "таинственное техно только с синтезаторами, без ударных и бочки",
    "genre": "Techno",
    "mood": "anxious",
    "tempo": "medium",
    "instrumental": True,
}


@pytest.mark.asyncio
async def test_no_client_renders_deterministically() -> None:
    """With no provider reachable the pipeline still ships a faithful prompt."""
    result = await build_suno_prompt(**_BRIEF)

    assert result.source == "deterministic"
    assert "techno" in result.style.lower()
    assert "kick" not in result.style.lower()
    assert "drums" in result.negative_tags.lower()


@pytest.mark.asyncio
async def test_faithful_composition_is_accepted() -> None:
    client = _ScriptedClient([
        _PARSE_REPLY,
        "Techno, instrumental, medium tempo, analog synthesizers, anxious, "
        "hypnotic sequences, warehouse space",
    ])
    result = await build_suno_prompt(**_BRIEF, chat_client=client)

    assert result.source == "composer"
    assert result.faithfulness == 1.0
    assert "synthesizer" in result.style.lower()


@pytest.mark.asyncio
async def test_composition_contradicting_the_brief_is_repaired() -> None:
    """A prompt that smuggles back an excluded instrument gets one rewrite."""
    client = _ScriptedClient([
        _PARSE_REPLY,
        "Techno with a relentless kick drum, analog synthesizers, medium tempo",
        "Techno, instrumental, medium tempo, analog synthesizers, anxious, hypnotic pulse",
    ])
    result = await build_suno_prompt(**_BRIEF, chat_client=client)

    assert result.source == "composer-repaired"
    assert "kick" not in result.style.lower()
    # parse + compose + repair
    assert len(client.calls) == 3


@pytest.mark.asyncio
async def test_composer_that_keeps_failing_is_discarded() -> None:
    client = _ScriptedClient([
        _PARSE_REPLY,
        "Techno with a pounding kick drum and live drums",
        "Techno with drums again, sorry",
    ])
    result = await build_suno_prompt(**_BRIEF, chat_client=client)

    assert result.source == "deterministic"
    assert "kick" not in result.style.lower()
    assert "drum" not in result.style.lower()


@pytest.mark.asyncio
async def test_locked_material_reaches_the_composer() -> None:
    """The composer is told what is locked, what is open and what is banned."""
    client = _ScriptedClient([_PARSE_REPLY, "Techno, instrumental, synthesizers, medium tempo"])
    await build_suno_prompt(**_BRIEF, chat_client=client)

    compose_request = client.calls[1]["messages"][-1]["content"]
    assert "LOCKED:" in compose_request
    assert "EXCLUDED:" in compose_request
    assert "drums" in compose_request
    assert "synthesizers" in compose_request


@pytest.mark.asyncio
async def test_tag_selections_survive_a_parser_that_forgets_them() -> None:
    """mood/tempo/genre come from the form — the model may not echo them back.

    Live failure 2026-08-14: tags mood=anxious tempo=fast reached the worker,
    the parse came back with neither, and the tempo gap was then filled by a
    genre preset at 130-140 BPM.
    """
    forgetful = json.dumps({
        "genre": "", "subgenre": "", "instruments_required": [],
        "instruments_forbidden": ["drums"], "bpm_min": None, "bpm_max": None,
        "tempo_word": "", "mood": "", "vocals": "none", "usage": "", "era": "",
        "notes": [], "references": [], "open": ["genre", "mood", "bpm"],
    })
    client = _ScriptedClient([forgetful, "Minimal Techno, instrumental, anxious, 120-140 BPM"])

    result = await build_suno_prompt(
        description="инструментал для детективного видео, без ударных",
        genre="Minimal Techno", mood="anxious", tempo="fast", instrumental=True,
        chat_client=client,
    )

    assert result.parsed.genre == "Minimal Techno"
    assert result.parsed.mood == "anxious"
    assert result.parsed.tempo_word == "fast"
    assert "120-140 BPM" in "\n".join(result.spec.locked)
