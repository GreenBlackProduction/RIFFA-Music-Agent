"""End-to-end tests for the public Radio (publish, list, vote, play, stats)."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from fastapi import status as http_status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.deps import current_user, current_user_optional, db_session
from app.db.base import Base
from app.db.models import Generation, GenerationStatus, GenerationType, User
from app.main import app

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def session_factory() -> AsyncIterator[async_sessionmaker]:
    """Per-test in-memory SQLite engine + session factory."""
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
            display_name="Alice",
            balance_tokens=100,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


@pytest.fixture
async def bob(session_factory: async_sessionmaker) -> User:
    async with session_factory() as session:
        user = User(
            telegram_user_id=1002,
            telegram_username="bob",
            display_name="Bob",
            balance_tokens=100,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


def _make_generation(
    user_id: int,
    *,
    title: str = "Track",
    gen_type: GenerationType = GenerationType.song,
    mood: str = "happy",
    genre: str = "Pop",
    is_public: bool = True,
    published_offset: timedelta = timedelta(0),
    play_count: int = 0,
    like_count: int = 0,
    dislike_count: int = 0,
) -> Generation:
    now = datetime.now(UTC)
    return Generation(
        id=uuid.uuid4(),
        user_id=user_id,
        type=gen_type,
        status=GenerationStatus.completed,
        title=title,
        params={},
        result={
            "tracks": [
                {
                    "audio_url": f"https://example.com/{title}.mp3",
                    "audio_id": "a1",
                    "duration": 180,
                    "title": title,
                }
            ]
        },
        cost_tokens=2,
        genre=genre,
        mood=mood,
        is_public=is_public,
        published_at=(now - published_offset) if is_public else None,
        play_count=play_count,
        like_count=like_count,
        dislike_count=dislike_count,
        completed_at=now,
    )


@pytest.fixture
def client_factory(session_factory: async_sessionmaker):
    """Return a callable that creates an httpx client authenticated as the given user (or anon)."""

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

        async def override_current_user_optional() -> User | None:
            return user

        app.dependency_overrides[db_session] = override_session
        app.dependency_overrides[current_user] = override_current_user
        app.dependency_overrides[current_user_optional] = override_current_user_optional

        return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    yield _make_client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_radio_list_returns_only_public_completed(
    session_factory: async_sessionmaker, alice: User, client_factory
) -> None:
    """Private and non-completed generations must not show up on the radio."""
    async with session_factory() as s:
        s.add_all(
            [
                _make_generation(alice.id, title="Public song", is_public=True),
                _make_generation(alice.id, title="Private song", is_public=False),
            ]
        )
        priv = _make_generation(alice.id, title="Still cooking", is_public=True)
        priv.status = GenerationStatus.processing
        s.add(priv)
        await s.commit()

    async with client_factory(None) as client:
        resp = await client.get("/api/v1/radio")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Public song"
    assert body["items"][0]["author"] == "@alice"
    assert body["items"][0]["my_vote"] is None


@pytest.mark.asyncio
async def test_radio_filters_by_mood_and_vocal(
    session_factory: async_sessionmaker, alice: User, client_factory
) -> None:
    async with session_factory() as s:
        s.add_all(
            [
                _make_generation(alice.id, title="Happy song", mood="happy"),
                _make_generation(alice.id, title="Sad song", mood="sad"),
                _make_generation(
                    alice.id,
                    title="Instrumental",
                    gen_type=GenerationType.instrumental,
                    mood="calm",
                ),
            ]
        )
        await s.commit()

    async with client_factory(None) as client:
        happy = (await client.get("/api/v1/radio", params={"mood": "happy"})).json()
        instr = (await client.get("/api/v1/radio", params={"vocal": "instrumental"})).json()
        vocal = (await client.get("/api/v1/radio", params={"vocal": "vocal"})).json()

    assert {i["title"] for i in happy["items"]} == {"Happy song"}
    assert {i["title"] for i in instr["items"]} == {"Instrumental"}
    assert {i["title"] for i in vocal["items"]} == {"Happy song", "Sad song"}


@pytest.mark.asyncio
async def test_radio_period_and_sort(
    session_factory: async_sessionmaker, alice: User, client_factory
) -> None:
    async with session_factory() as s:
        s.add_all(
            [
                _make_generation(
                    alice.id, title="Old hit", published_offset=timedelta(days=10),
                    like_count=100, dislike_count=0, play_count=500,
                ),
                _make_generation(
                    alice.id, title="Today", published_offset=timedelta(hours=2),
                    like_count=5, dislike_count=1, play_count=20,
                ),
            ]
        )
        await s.commit()

    async with client_factory(None) as client:
        today = (await client.get("/api/v1/radio", params={"period": "today"})).json()
        score = (await client.get("/api/v1/radio", params={"sort": "score"})).json()
        plays = (await client.get("/api/v1/radio", params={"sort": "plays"})).json()

    assert {i["title"] for i in today["items"]} == {"Today"}
    assert score["items"][0]["title"] == "Old hit"
    assert plays["items"][0]["title"] == "Old hit"


@pytest.mark.asyncio
async def test_radio_vote_updates_counts_and_my_vote(
    session_factory: async_sessionmaker, alice: User, bob: User, client_factory
) -> None:
    async with session_factory() as s:
        gen = _make_generation(alice.id, title="Vote me")
        s.add(gen)
        await s.commit()
        gen_id = str(gen.id)

    # Bob likes
    async with client_factory(bob) as client:
        like = await client.post(f"/api/v1/radio/{gen_id}/vote", json={"rating": "like"})
    assert like.status_code == 200
    assert like.json() == {"my_vote": "like", "like_count": 1, "dislike_count": 0}

    # Bob switches to dislike
    async with client_factory(bob) as client:
        dis = await client.post(f"/api/v1/radio/{gen_id}/vote", json={"rating": "dislike"})
    assert dis.json() == {"my_vote": "dislike", "like_count": 0, "dislike_count": 1}

    # Bob removes the vote
    async with client_factory(bob) as client:
        rm = await client.post(f"/api/v1/radio/{gen_id}/vote", json={"rating": "remove"})
    assert rm.json() == {"my_vote": None, "like_count": 0, "dislike_count": 0}

    # Bob likes again, then list should expose my_vote=like for him
    async with client_factory(bob) as client:
        await client.post(f"/api/v1/radio/{gen_id}/vote", json={"rating": "like"})
        listing = (await client.get("/api/v1/radio")).json()
    assert listing["items"][0]["my_vote"] == "like"
    assert listing["items"][0]["like_count"] == 1


@pytest.mark.asyncio
async def test_radio_play_increments_count(
    session_factory: async_sessionmaker, alice: User, client_factory
) -> None:
    async with session_factory() as s:
        gen = _make_generation(alice.id, title="Hot track")
        s.add(gen)
        await s.commit()
        gen_id = str(gen.id)

    async with client_factory(None) as client:
        for _ in range(3):
            r = await client.post(f"/api/v1/radio/{gen_id}/play")
            assert r.status_code == 204
        listing = (await client.get("/api/v1/radio")).json()
    assert listing["items"][0]["play_count"] == 3


@pytest.mark.asyncio
async def test_radio_collection_only_liked(
    session_factory: async_sessionmaker, alice: User, bob: User, client_factory
) -> None:
    async with session_factory() as s:
        liked = _make_generation(alice.id, title="Liked")
        not_liked = _make_generation(alice.id, title="Skipped")
        s.add_all([liked, not_liked])
        await s.commit()
        liked_id = str(liked.id)

    async with client_factory(bob) as client:
        await client.post(f"/api/v1/radio/{liked_id}/vote", json={"rating": "like"})
        coll = (await client.get("/api/v1/radio/me/collection")).json()
    assert {i["title"] for i in coll["items"]} == {"Liked"}


@pytest.mark.asyncio
async def test_radio_collection_requires_auth(client_factory) -> None:
    async with client_factory(None) as client:
        r = await client.get("/api/v1/radio/me/collection")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_radio_stats(
    session_factory: async_sessionmaker, alice: User, client_factory
) -> None:
    async with session_factory() as s:
        s.add_all(
            [
                _make_generation(
                    alice.id, title="Today", published_offset=timedelta(hours=1),
                    like_count=3, play_count=10,
                ),
                _make_generation(
                    alice.id, title="Older", published_offset=timedelta(days=5),
                    like_count=2, play_count=40,
                ),
            ]
        )
        await s.commit()

    async with client_factory(None) as client:
        stats = (await client.get("/api/v1/radio/stats")).json()

    assert stats["total_tracks"] == 2
    assert stats["total_plays"] == 50
    assert stats["total_likes"] == 5
    assert stats["today_tracks"] == 1
    assert stats["today_plays"] == 10


@pytest.mark.asyncio
async def test_radio_mood_counts(
    session_factory: async_sessionmaker, alice: User, client_factory
) -> None:
    async with session_factory() as s:
        s.add_all(
            [
                _make_generation(alice.id, title="A", mood="happy"),
                _make_generation(alice.id, title="B", mood="happy"),
                _make_generation(alice.id, title="C", mood="sad"),
                _make_generation(
                    alice.id,
                    title="Instr",
                    gen_type=GenerationType.instrumental,
                    mood="calm",
                ),
            ]
        )
        await s.commit()

    async with client_factory(None) as client:
        body = (await client.get("/api/v1/radio/mood-counts")).json()
    assert body["counts"] == {"happy": 2, "sad": 1, "calm": 1}
    assert body["total"] == 4
    assert body["instrumental"] == 1
    assert body["vocal"] == 3


@pytest.mark.asyncio
async def test_history_radio_toggle_publish_and_unpublish(
    session_factory: async_sessionmaker, alice: User, client_factory
) -> None:
    async with session_factory() as s:
        gen = _make_generation(alice.id, title="My song", is_public=False)
        s.add(gen)
        await s.commit()
        gen_id = str(gen.id)

    async with client_factory(alice) as client:
        # Publish
        r = await client.patch(
            f"/api/v1/history/{gen_id}/radio", json={"is_public": True}
        )
        assert r.status_code == 200
        body = r.json()
        assert body["is_public"] is True
        assert body["published_at"] is not None

        # Should now appear in radio listing
        listing = (await client.get("/api/v1/radio")).json()
        assert listing["total"] == 1
        assert listing["items"][0]["is_own"] is True

        # Unpublish
        r2 = await client.patch(
            f"/api/v1/history/{gen_id}/radio", json={"is_public": False}
        )
        assert r2.json()["is_public"] is False
        listing2 = (await client.get("/api/v1/radio")).json()
        assert listing2["total"] == 0


@pytest.mark.asyncio
async def test_history_radio_toggle_rejects_non_owner(
    session_factory: async_sessionmaker, alice: User, bob: User, client_factory
) -> None:
    async with session_factory() as s:
        gen = _make_generation(alice.id, title="Alice's song", is_public=False)
        s.add(gen)
        await s.commit()
        gen_id = str(gen.id)

    async with client_factory(bob) as client:
        r = await client.patch(
            f"/api/v1/history/{gen_id}/radio", json={"is_public": True}
        )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_history_radio_toggle_rejects_ineligible_type(
    session_factory: async_sessionmaker, alice: User, client_factory
) -> None:
    async with session_factory() as s:
        gen = _make_generation(
            alice.id, title="An SFX", gen_type=GenerationType.sound_effect, is_public=False
        )
        s.add(gen)
        await s.commit()
        gen_id = str(gen.id)

    async with client_factory(alice) as client:
        r = await client.patch(
            f"/api/v1/history/{gen_id}/radio", json={"is_public": True}
        )
    assert r.status_code == 409
