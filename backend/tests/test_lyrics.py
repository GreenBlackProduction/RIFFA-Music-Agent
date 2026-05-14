"""Tests for the async lyrics drafting endpoints."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from fastapi import status as http_status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.v1 import lyrics as lyrics_module
from app.core.deps import current_user, db_session
from app.db.base import Base
from app.db.models import Generation, GenerationStatus, GenerationType, User
from app.main import app

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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
            telegram_user_id=2001,
            telegram_username="alice",
            display_name="Alice",
            balance_tokens=10,
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


@pytest.fixture
async def bob(session_factory: async_sessionmaker) -> User:
    async with session_factory() as s:
        u = User(
            telegram_user_id=2002,
            telegram_username="bob",
            display_name="Bob",
            balance_tokens=10,
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


@pytest.fixture(autouse=True)
def stub_enqueue(monkeypatch: pytest.MonkeyPatch) -> None:
    """Don't actually push to Redis during tests — worker dispatch is out of scope."""

    async def _noop(redis_url: str, gen_id: str) -> None:
        return None

    monkeypatch.setattr(lyrics_module, "_enqueue", _noop)


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

        app.dependency_overrides[db_session] = override_session
        app.dependency_overrides[current_user] = override_current_user
        return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    yield _make_client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_lyrics_returns_task_id_and_ws_url(
    session_factory: async_sessionmaker, alice: User, client_factory
) -> None:
    async with client_factory(alice) as client:
        resp = await client.post(
            "/api/v1/lyrics",
            json={"topic": "summer city anthem", "genre": "Pop", "mood": "happy"},
        )

    assert resp.status_code == 202
    body = resp.json()
    assert "task_id" in body
    assert body["ws_url"].endswith(f"/api/v1/ws/generation/{body['task_id']}")

    async with session_factory() as s:
        gen = (await s.get(Generation, uuid.UUID(body["task_id"])))
        assert gen is not None
        assert gen.user_id == alice.id
        assert gen.type == GenerationType.lyrics
        assert gen.status == GenerationStatus.queued
        assert gen.cost_tokens == 0
        assert gen.params["topic"] == "summer city anthem"
        assert gen.params["genre"] == "Pop"


@pytest.mark.asyncio
async def test_create_lyrics_requires_auth(
    session_factory: async_sessionmaker, client_factory
) -> None:
    async with client_factory(None) as client:
        resp = await client.post(
            "/api/v1/lyrics",
            json={"topic": "anonymous attempt"},
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_lyrics_returns_completed_result(
    session_factory: async_sessionmaker, alice: User, client_factory
) -> None:
    """After the worker writes back, GET should return the lyrics + title."""
    task_id = uuid.uuid4()
    async with session_factory() as s:
        s.add(
            Generation(
                id=task_id,
                user_id=alice.id,
                type=GenerationType.lyrics,
                status=GenerationStatus.completed,
                title="Summer City",
                params={"topic": "summer city"},
                result={"lyrics": "[Verse]\nThe city sleeps...", "title": "Summer City"},
                cost_tokens=0,
                completed_at=datetime.now(UTC),
            )
        )
        await s.commit()

    async with client_factory(alice) as client:
        resp = await client.get(f"/api/v1/lyrics/{task_id}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert body["title"] == "Summer City"
    assert body["lyrics"].startswith("[Verse]")


@pytest.mark.asyncio
async def test_get_lyrics_in_progress(
    session_factory: async_sessionmaker, alice: User, client_factory
) -> None:
    task_id = uuid.uuid4()
    async with session_factory() as s:
        s.add(
            Generation(
                id=task_id,
                user_id=alice.id,
                type=GenerationType.lyrics,
                status=GenerationStatus.processing,
                title="",
                params={"topic": "still cooking"},
                result={},
                cost_tokens=0,
            )
        )
        await s.commit()

    async with client_factory(alice) as client:
        resp = await client.get(f"/api/v1/lyrics/{task_id}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "processing"
    assert body["lyrics"] is None


@pytest.mark.asyncio
async def test_get_lyrics_other_user_isolation(
    session_factory: async_sessionmaker, alice: User, bob: User, client_factory
) -> None:
    """Alice's lyrics tasks are not visible to Bob."""
    task_id = uuid.uuid4()
    async with session_factory() as s:
        s.add(
            Generation(
                id=task_id,
                user_id=alice.id,
                type=GenerationType.lyrics,
                status=GenerationStatus.completed,
                title="secret",
                params={"topic": "alice secret"},
                result={"lyrics": "private", "title": "secret"},
                cost_tokens=0,
            )
        )
        await s.commit()

    async with client_factory(bob) as client:
        resp = await client.get(f"/api/v1/lyrics/{task_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_lyrics_invalid_uuid(
    session_factory: async_sessionmaker, alice: User, client_factory
) -> None:
    async with client_factory(alice) as client:
        resp = await client.get("/api/v1/lyrics/not-a-uuid")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_lyrics_drafts_excluded_from_history(
    session_factory: async_sessionmaker, alice: User, client_factory
) -> None:
    """Lyrics drafts must not pollute the user's main library."""
    async with session_factory() as s:
        s.add_all(
            [
                Generation(
                    id=uuid.uuid4(),
                    user_id=alice.id,
                    type=GenerationType.song,
                    status=GenerationStatus.completed,
                    title="Real song",
                    params={},
                    result={"tracks": [{"audio_url": "u"}]},
                    cost_tokens=2,
                ),
                Generation(
                    id=uuid.uuid4(),
                    user_id=alice.id,
                    type=GenerationType.lyrics,
                    status=GenerationStatus.completed,
                    title="Draft",
                    params={"topic": "summer hit"},
                    result={"lyrics": "x", "title": "Draft"},
                    cost_tokens=0,
                ),
            ]
        )
        await s.commit()

    async with client_factory(alice) as client:
        resp = await client.get("/api/v1/history")
    assert resp.status_code == 200
    body = resp.json()
    titles = {item["title"] for item in body["items"]}
    assert "Real song" in titles
    assert "Draft" not in titles
