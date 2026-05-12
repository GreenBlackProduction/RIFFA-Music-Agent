"""Unit tests for `LyricsClient.enrich_music_prompt` — the GPT-4o music prompt engineer."""

from __future__ import annotations

from typing import Any

import pytest

from app.services.lyrics import LyricsClient


class _FakeChoiceMessage:
    def __init__(self, content: str) -> None:
        self.content = content


class _FakeChoice:
    def __init__(self, content: str) -> None:
        self.message = _FakeChoiceMessage(content)


class _FakeResponse:
    def __init__(self, content: str) -> None:
        self.choices = [_FakeChoice(content)]


class _FakeChatCompletions:
    def __init__(self, response_text: str) -> None:
        self._response_text = response_text
        self.captured_messages: list[dict[str, Any]] | None = None

    async def create(self, **kwargs: Any) -> _FakeResponse:
        self.captured_messages = kwargs.get("messages")
        return _FakeResponse(self._response_text)


class _FakeChat:
    def __init__(self, response_text: str) -> None:
        self.completions = _FakeChatCompletions(response_text)


class _FakeAsyncOpenAI:
    def __init__(self, response_text: str) -> None:
        self.chat = _FakeChat(response_text)


def _make_client_with_response(text: str) -> tuple[LyricsClient, _FakeChatCompletions]:
    client = LyricsClient.__new__(LyricsClient)
    fake = _FakeAsyncOpenAI(text)
    client._client = fake  # type: ignore[attr-defined]
    return client, fake.chat.completions


@pytest.mark.asyncio
async def test_enrich_music_prompt_returns_gpt_output() -> None:
    text = "warm lo-fi hip-hop, dusty vinyl drums, mellow Rhodes piano, jazzy chord stabs at 78 BPM"
    client, _spy = _make_client_with_response(text)

    out = await client.enrich_music_prompt(
        user_description="вечерний lo-fi для учёбы",
        genre="Lofi",
        mood="calm",
        tempo="slow",
    )

    assert out == text


@pytest.mark.asyncio
async def test_enrich_music_prompt_strips_quotes() -> None:
    """GPT sometimes wraps output in quotes — strip them before returning."""
    client, _ = _make_client_with_response('"trap drums only, no melodic content, no vocals"')
    out = await client.enrich_music_prompt(user_description="trap drums")
    assert out.startswith("trap drums only")
    assert not out.startswith('"')


@pytest.mark.asyncio
async def test_enrich_music_prompt_caps_at_max_length() -> None:
    """A 6000-char GPT reply is trimmed at word boundary to <=5000."""
    huge = "synthwave " * 700  # ~7000 chars
    client, _ = _make_client_with_response(huge)
    out = await client.enrich_music_prompt(user_description="big synth", max_length=5000)
    assert len(out) <= 5000
    assert not out.endswith(" ")


@pytest.mark.asyncio
async def test_enrich_music_prompt_passes_context_to_gpt() -> None:
    """All structured inputs end up in the user message GPT receives."""
    client, spy = _make_client_with_response("ok")
    await client.enrich_music_prompt(
        user_description="нужен сочный грув на ударных",
        genre="Hip-Hop",
        mood="energetic",
        tempo="fast",
        vocal="no_vocal",
        instrumental=True,
        approved_lyrics="",
        agent_prompt="user wants drum solo",
        preset_style_hint="hip-hop production, boom bap",
    )

    assert spy.captured_messages is not None
    user_msg = next(m for m in spy.captured_messages if m["role"] == "user")
    body: str = user_msg["content"]
    assert "User request:" in body
    assert "Genre: Hip-Hop" in body
    assert "Mood: energetic" in body
    assert "Tempo: fast" in body
    assert "INSTRUMENTAL" in body
    assert "Curated genre keywords" in body
    assert "Assistant brief" in body


@pytest.mark.asyncio
async def test_enrich_music_prompt_empty_inputs_returns_empty() -> None:
    """No inputs at all → don't even call GPT."""
    client, spy = _make_client_with_response("should not be called")
    out = await client.enrich_music_prompt(user_description="")
    assert out == ""
    # GPT was never invoked
    assert spy.captured_messages is None


@pytest.mark.asyncio
async def test_enrich_music_prompt_falls_back_on_gpt_failure() -> None:
    """If GPT raises, we degrade gracefully to the preset style hint."""

    class _ExplodingCompletions:
        async def create(self, **_kwargs: Any) -> _FakeResponse:
            raise RuntimeError("openai 503")

    class _ExplodingChat:
        completions = _ExplodingCompletions()

    class _ExplodingClient:
        chat = _ExplodingChat()

    client = LyricsClient.__new__(LyricsClient)
    client._client = _ExplodingClient()  # type: ignore[attr-defined]

    out = await client.enrich_music_prompt(
        user_description="trap drums only",
        preset_style_hint="trap, heavy 808s",
        mood="energetic",
    )
    # Fallback joins preset_style + mood + tempo
    assert "trap" in out.lower()
