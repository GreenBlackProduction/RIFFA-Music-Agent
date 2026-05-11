"""Tests for the auto-title + ID3 download proxy."""

from __future__ import annotations

import io
import uuid
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi import status as http_status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.v1 import tracks as tracks_module
from app.api.v1.tracks import _resolve_artist, _shorten_idea, format_track_name
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
    async with session_factory() as session:
        user = User(
            telegram_user_id=1001,
            telegram_username="alice",
            display_name="Alice Doe",
            balance_tokens=100,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


@pytest.fixture
def client_factory(session_factory: async_sessionmaker):
    def _make_client(user: User | None) -> AsyncClient:
        async def override_session() -> AsyncIterator:
            async with session_factory() as s:
                yield s

        async def override_current_user() -> User:
            if user is None:
                raise HTTPException(http_status.HTTP_401_UNAUTHORIZED, "anon")
            return user

        app.dependency_overrides[db_session] = override_session
        app.dependency_overrides[current_user] = override_current_user
        return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    yield _make_client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Pure unit tests
# ---------------------------------------------------------------------------


def test_resolve_artist_prefers_telegram_username() -> None:
    user = User(
        telegram_username="alice",
        display_name="Alice Doe",
        email="alice@example.com",
    )
    assert _resolve_artist(user) == "alice"


def test_resolve_artist_falls_back_to_display_name() -> None:
    user = User(display_name="Bob Marley", email="bob@example.com")
    assert _resolve_artist(user) == "Bob Marley"


def test_resolve_artist_falls_back_to_email_local() -> None:
    user = User(display_name="RIFFA user", email="charlie@example.com")
    assert _resolve_artist(user) == "charlie"


def test_resolve_artist_override_wins() -> None:
    user = User(telegram_username="alice")
    assert _resolve_artist(user, "Custom Artist") == "Custom Artist"


def test_format_track_name_canonical_shape() -> None:
    out = format_track_name("alice", "Снежный какао")
    assert out == "alice - Снежный какао (RIFFAMusic)"


def test_format_track_name_clamps_to_80_chars() -> None:
    out = format_track_name(
        "alice", "очень длинное название трека что превышает все возможные пределы"
    )
    assert len(out) <= 80
    assert "(RIFFAMusic)" in out
    assert out.startswith("alice - ")


def test_shorten_idea_trims_at_word_boundary() -> None:
    out = _shorten_idea(
        "Уютная зимняя песня про снег и горячий какао на лыжной базе", 40
    )
    assert len(out) <= 40
    assert not out.endswith(" ")


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auto_title_uses_gpt_when_available(client_factory, alice: User) -> None:
    """When OPENAI_API_KEY is configured and GPT returns text, we use it."""

    class _StubLyrics:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        async def generate_title(self, prompt: str) -> str:
            return "Снежный какао"

    with (
        patch("app.services.lyrics.LyricsClient", _StubLyrics),
        patch.object(tracks_module, "get_settings") as gs_mock,
    ):
        gs_mock.return_value.openai_api_key = "fake-key"
        gs_mock.return_value.openai_base_url = "https://api.apiyi.com/v1"
        async with client_factory(alice) as client:
            resp = await client.post(
                "/api/v1/tracks/auto-title",
                json={"idea": "Уютная зимняя песня про снег и горячий какао"},
            )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["short_title"] == "Снежный какао"
    assert body["artist"] == "alice"
    assert body["track_name"] == "alice - Снежный какао (RIFFAMusic)"


@pytest.mark.asyncio
async def test_auto_title_falls_back_to_idea_slice_when_gpt_unavailable(
    client_factory, alice: User
) -> None:
    """No OPENAI key → we synthesize a title from the idea string."""
    with patch.object(tracks_module, "get_settings") as gs_mock:
        gs_mock.return_value.openai_api_key = ""
        gs_mock.return_value.openai_base_url = ""
        async with client_factory(alice) as client:
            resp = await client.post(
                "/api/v1/tracks/auto-title",
                json={"idea": "Тест без ключа GPT просто короткая идея"},
            )
    assert resp.status_code == 200
    body = resp.json()
    assert body["artist"] == "alice"
    assert "(RIFFAMusic)" in body["track_name"]
    assert body["short_title"]


@pytest.mark.asyncio
async def test_download_404_for_missing_generation(
    client_factory, alice: User
) -> None:
    async with client_factory(alice) as client:
        resp = await client.get(f"/api/v1/tracks/{uuid.uuid4()}/0/download")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_download_404_when_track_index_out_of_range(
    session_factory: async_sessionmaker, client_factory, alice: User
) -> None:
    gen_id = uuid.uuid4()
    async with session_factory() as s:
        s.add(
            Generation(
                id=gen_id,
                user_id=alice.id,
                type=GenerationType.song,
                status=GenerationStatus.completed,
                title="T",
                params={},
                result={"tracks": [{"audio_url": "https://x/y.mp3"}]},
                cost_tokens=2,
            )
        )
        await s.commit()

    async with client_factory(alice) as client:
        resp = await client.get(f"/api/v1/tracks/{gen_id}/5/download")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_download_streams_tagged_mp3(
    session_factory: async_sessionmaker, client_factory, alice: User
) -> None:
    """Happy path: real mp3 in, tagged mp3 out."""
    pytest.importorskip("mutagen")
    import pathlib

    from mutagen.id3 import ID3
    from mutagen.mp3 import MP3

    fixture = pathlib.Path(__file__).parent / "fixtures" / "silence.mp3"
    if not fixture.exists():
        pytest.skip(f"silence.mp3 fixture missing at {fixture}")
    silent_mp3 = fixture.read_bytes()

    gen_id = uuid.uuid4()
    async with session_factory() as s:
        s.add(
            Generation(
                id=gen_id,
                user_id=alice.id,
                type=GenerationType.song,
                status=GenerationStatus.completed,
                title="Snowy Cocoa",
                params={"description": "winter cocoa song"},
                result={
                    "tracks": [
                        {
                            "audio_url": "https://example.com/track.mp3",
                            "audio_id": "a1",
                            "duration": 200,
                            "title": "Snowy Cocoa",
                            "image_url": None,
                        }
                    ]
                },
                cost_tokens=2,
            )
        )
        await s.commit()

    class _StubResp:
        status_code = 200
        content = silent_mp3

        def raise_for_status(self) -> None:
            return None

    class _StubAsyncClient:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        async def __aenter__(self) -> _StubAsyncClient:
            return self

        async def __aexit__(self, *args: Any) -> None:
            return None

        async def get(self, url: str) -> _StubResp:
            return _StubResp()

    with patch("app.api.v1.tracks.httpx.AsyncClient", _StubAsyncClient):
        async with client_factory(alice) as client:
            resp = await client.get(f"/api/v1/tracks/{gen_id}/0/download")

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "audio/mpeg"
    assert "attachment" in resp.headers["content-disposition"]
    assert ".mp3" in resp.headers["content-disposition"]

    # Tagged mp3 must still be parseable as MP3 and carry our ID3 fields.
    audio = MP3(io.BytesIO(resp.content), ID3=ID3)
    assert audio.tags is not None
    assert "(RIFFAMusic)" in str(audio.tags["TIT2"])
    assert "alice" in str(audio.tags["TPE1"])
    assert "RIFFAMusic" in str(audio.tags["TALB"])
