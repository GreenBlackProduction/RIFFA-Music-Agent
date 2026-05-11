"""Tests for the conversational prompt-engineer assistant (`/api/v1/agent/chat`)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi import HTTPException
from fastapi import status as http_status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.v1 import agent as agent_module
from app.core.config import Settings, get_settings
from app.core.deps import current_user, db_session
from app.db.base import Base
from app.db.models import User
from app.main import app

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def session_factory() -> AsyncIterator[async_sessionmaker]:
    engine = create_async_engine(TEST_DB_URL, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest.fixture
async def alice(session_factory: async_sessionmaker) -> User:
    async with session_factory() as s:
        u = User(
            telegram_user_id=3001,
            telegram_username="alice",
            display_name="Alice",
            balance_tokens=10,
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


@pytest.fixture
def client_factory(session_factory: async_sessionmaker):
    def _make_client(user: User | None) -> AsyncClient:
        async def override_session() -> AsyncIterator:
            async with session_factory() as s:
                yield s

        async def override_current_user() -> User:
            if user is None:
                raise HTTPException(
                    status_code=http_status.HTTP_401_UNAUTHORIZED, detail="anon"
                )
            return user

        def override_settings() -> Settings:
            s = Settings()
            s.apiyi_key = "test-key"
            return s

        app.dependency_overrides[db_session] = override_session
        app.dependency_overrides[current_user] = override_current_user
        app.dependency_overrides[get_settings] = override_settings
        return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    yield _make_client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers — fake AsyncOpenAI client
# ---------------------------------------------------------------------------


def _patch_openai(monkeypatch: pytest.MonkeyPatch, *, payload: dict[str, Any]) -> None:
    """Replace AsyncOpenAI used inside agent_module with a stub returning JSON payload."""

    class FakeChoiceMessage:
        def __init__(self, content: str) -> None:
            self.content = content

    class FakeChoice:
        def __init__(self, content: str) -> None:
            self.message = FakeChoiceMessage(content)

    class FakeResponse:
        def __init__(self, content: str) -> None:
            self.choices = [FakeChoice(content)]

    class FakeChatCompletions:
        async def create(self, **_kwargs: Any) -> FakeResponse:
            return FakeResponse(json.dumps(payload, ensure_ascii=False))

    class FakeChat:
        def __init__(self) -> None:
            self.completions = FakeChatCompletions()

    class FakeAsyncOpenAI:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            self.chat = FakeChat()

    monkeypatch.setattr(agent_module, "AsyncOpenAI", FakeAsyncOpenAI)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_first_turn_returns_canned_opening_without_calling_gpt(
    alice: User, client_factory
) -> None:
    """No messages yet → backend returns the canned opener; no API call needed."""
    async with client_factory(alice) as client:
        resp = await client.post(
            "/api/v1/agent/chat",
            json={"module": "song", "messages": []},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["done"] is False
    assert body["summary"] == ""
    assert body["prompt"] == ""
    assert "промпт" in body["reply"].lower() or "помогу" in body["reply"].lower()


@pytest.mark.asyncio
async def test_clarifying_question(
    alice: User, client_factory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Mid-conversation, GPT decides to ask another question (done=false)."""
    _patch_openai(
        monkeypatch,
        payload={
            "reply": "Какое настроение — энергичное или мечтательное?",
            "done": False,
            "summary": "",
            "prompt": "",
        },
    )

    async with client_factory(alice) as client:
        resp = await client.post(
            "/api/v1/agent/chat",
            json={
                "module": "song",
                "messages": [
                    {"role": "agent", "content": "Привет! О чём пишем?"},
                    {"role": "user", "content": "Хочу песню про море"},
                ],
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["done"] is False
    assert "настроение" in body["reply"].lower()
    assert body["summary"] == ""
    assert body["prompt"] == ""


@pytest.mark.asyncio
async def test_done_returns_summary_and_prompt(
    alice: User, client_factory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Once GPT decides it has enough, frontend gets summary + Suno-ready prompt."""
    final_prompt = (
        "uplifting indie pop, jangly clean electric guitar, warm Rhodes piano, "
        "soft brushed drums at 100 BPM, breezy female vocal lead, summery beach mood"
    )
    _patch_openai(
        monkeypatch,
        payload={
            "reply": "Готов бриф! Можно запускать.",
            "done": True,
            "summary": "Тема: лето, море. Настроение: лёгкое. Жанр: indie pop.",
            "prompt": final_prompt,
        },
    )

    async with client_factory(alice) as client:
        resp = await client.post(
            "/api/v1/agent/chat",
            json={
                "module": "song",
                "messages": [
                    {"role": "agent", "content": "О чём пишем?"},
                    {"role": "user", "content": "Лёгкая инди-поп песня про лето на море"},
                ],
                "selected_genre": "Pop",
                "selected_mood": "happy",
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["done"] is True
    assert "indie pop" in body["prompt"]
    assert "Тема" in body["summary"]
    assert "бриф" in body["reply"].lower()


@pytest.mark.asyncio
async def test_non_json_gpt_response_falls_back_to_plain_reply(
    alice: User, client_factory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If GPT misbehaves and returns non-JSON, we surface the raw text as reply, done=false."""

    class FakeChoiceMessage:
        content = "Извини, я сломался."

    class FakeChoice:
        message = FakeChoiceMessage()

    class FakeResponse:
        choices = [FakeChoice()]  # noqa: RUF012

    class FakeChatCompletions:
        async def create(self, **_kwargs: Any) -> FakeResponse:
            return FakeResponse()

    class FakeChat:
        completions = FakeChatCompletions()

    class FakeAsyncOpenAI:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            self.chat = FakeChat()

    monkeypatch.setattr(agent_module, "AsyncOpenAI", FakeAsyncOpenAI)

    async with client_factory(alice) as client:
        resp = await client.post(
            "/api/v1/agent/chat",
            json={
                "module": "song",
                "messages": [
                    {"role": "agent", "content": "О чём?"},
                    {"role": "user", "content": "что-то"},
                ],
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["done"] is False
    assert body["reply"]


@pytest.mark.asyncio
async def test_requires_auth(client_factory) -> None:
    async with client_factory(None) as client:
        resp = await client.post(
            "/api/v1/agent/chat",
            json={"module": "song", "messages": []},
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_caps_prompt_at_5000_chars(
    alice: User, client_factory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If GPT returns a 6000-char prompt, we trim down to <=5000 (Suno music limit)."""
    huge = "synthwave " * 700  # ~7000 chars
    _patch_openai(
        monkeypatch,
        payload={
            "reply": "Готово.",
            "done": True,
            "summary": "Бриф",
            "prompt": huge,
        },
    )

    async with client_factory(alice) as client:
        resp = await client.post(
            "/api/v1/agent/chat",
            json={
                "module": "song",
                "messages": [
                    {"role": "agent", "content": "О чём?"},
                    {"role": "user", "content": "many synths"},
                ],
            },
        )

    assert resp.status_code == 200
    assert len(resp.json()["prompt"]) <= 5000


@pytest.mark.asyncio
async def test_done_returns_intent_for_instrumental_request(
    alice: User, client_factory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When done=true the agent must also return an `intent` block describing
    the module + parameters the frontend should launch."""
    _patch_openai(
        monkeypatch,
        payload={
            "reply": "Бриф готов — запускаю инструменталку.",
            "done": True,
            "summary": "Сольная партия ударных, без вокала, без других инструментов.",
            "prompt": "drum solo, drums only, no vocals, no other instruments, "
            "tight punchy kick, snappy snare, expressive ride, mid-tempo groove",
            "intent": {
                "module": "instrumental",
                "confidence": "high",
                "params": {
                    "description": "Сольный грув на ударных без вокала",
                    "genre": "Drumming",
                    "mood": "energetic",
                    "tempo": "medium",
                },
                "note": "Запущу инструменталку — соло ударных, без вокала.",
            },
        },
    )

    async with client_factory(alice) as client:
        resp = await client.post(
            "/api/v1/agent/chat",
            json={
                "module": "song",
                "messages": [
                    {"role": "agent", "content": "О чём пишем?"},
                    {
                        "role": "user",
                        "content": "сочный грув на ударных без вокала и без других инструментов",
                    },
                ],
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["done"] is True
    intent = body["intent"]
    assert intent is not None
    assert intent["module"] == "instrumental"
    assert intent["confidence"] == "high"
    assert intent["params"]["tempo"] == "medium"
    assert intent["params"]["genre"] == "Drumming"
    assert intent["note"]


@pytest.mark.asyncio
async def test_intent_is_null_when_not_done(
    alice: User, client_factory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A still-clarifying turn must not surface an intent (frontend would launch prematurely)."""
    _patch_openai(
        monkeypatch,
        payload={
            "reply": "Какое настроение хочется — энергичное или мечтательное?",
            "done": False,
            "summary": "",
            "prompt": "",
        },
    )

    async with client_factory(alice) as client:
        resp = await client.post(
            "/api/v1/agent/chat",
            json={
                "module": "song",
                "messages": [
                    {"role": "agent", "content": "Привет!"},
                    {"role": "user", "content": "хочу песню"},
                ],
            },
        )

    assert resp.status_code == 200
    assert resp.json()["intent"] is None


@pytest.mark.asyncio
async def test_intent_falls_back_to_module_hint_when_gpt_omits_module(
    alice: User, client_factory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If GPT forgets the module field, we fall back to the request's module hint
    so the frontend always has a target endpoint to call."""
    _patch_openai(
        monkeypatch,
        payload={
            "reply": "Готово.",
            "done": True,
            "summary": "Тема...",
            "prompt": "indie pop, summer mood",
            # Note: missing "module" — must default to request module hint.
            "intent": {
                "confidence": "medium",
                "params": {"description": "summer song"},
                "note": "",
            },
        },
    )

    async with client_factory(alice) as client:
        resp = await client.post(
            "/api/v1/agent/chat",
            json={
                "module": "song",
                "messages": [
                    {"role": "agent", "content": "?"},
                    {"role": "user", "content": "summer pop"},
                ],
            },
        )

    assert resp.status_code == 200
    intent = resp.json()["intent"]
    assert intent["module"] == "song"
