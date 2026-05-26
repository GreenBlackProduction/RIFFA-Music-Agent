"""Per-user anti-repetition tracking for ``build_suno_style()``.

Keeps a lightweight in-memory LRU fingerprint cache of recent generations
so the prompt engineer can avoid repeating the same dynamic element
combinations within a configurable time window.

In production with multiple Arq workers this provides best-effort dedup
(shared-nothing). For stronger guarantees, swap the storage backend to Redis.
"""

from __future__ import annotations

import hashlib
import random
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

# Per-user cooldown tracker: {user_id: [(fingerprint, timestamp), ...]}
_cooldown: dict[int, list[tuple[str, datetime]]] = defaultdict(list)

# Configuration
_COOLDOWN_WINDOW = timedelta(hours=2)
_MAX_HISTORY_PER_USER = 30


# ── Public API ──────────────────────────────────────────────────────────────


def record_generation(
    user_id: int,
    genre: str,
    mood: str,
    tempo: str,
    dynamic_keys_used: list[str],
) -> None:
    """Record a generation fingerprint to avoid repeats."""
    fingerprint = _make_fingerprint(genre, mood, tempo, dynamic_keys_used)
    now = datetime.utcnow()
    _prune(user_id, now)
    _cooldown[user_id].append((fingerprint, now))
    # Cap at max history
    _cooldown[user_id] = _cooldown[user_id][-_MAX_HISTORY_PER_USER:]


def get_recent_fingerprints(user_id: int) -> set[str]:
    """Return fingerprints of recent generations for this user."""
    now = datetime.utcnow()
    _prune(user_id, now)
    return {fp for fp, _ts in _cooldown.get(user_id, [])}


def select_dynamic_elements(
    user_id: int,
    genre_key: str,
    dynamic_elements: dict[str, list[str]],
    genre_technique_bias: dict[str, dict[str, float]],
    rng: random.Random,
) -> list[str]:
    """Pick 2-3 dynamic elements, avoiding recently-used combinations.

    Uses genre-specific technique bias weights to pick categories relevant
    to the genre, then retries up to 3 times to avoid fingerprint collisions
    with recent generations.
    """
    # Determine genre parent for technique bias
    genre_data = _genre_lookup.get(genre_key)
    parent = genre_data.get("parent_genre", "Pop") if genre_data else "Pop"
    bias = genre_technique_bias.get(parent, genre_technique_bias.get("Pop", {}))
    categories = list(dynamic_elements.keys())

    recent = get_recent_fingerprints(user_id)

    for _attempt in range(4):
        # Pick 2-3 categories weighted by genre bias
        num_picks = rng.randint(2, 3)
        weights = [bias.get(cat, 0.1) for cat in categories]
        total = sum(weights)
        norm_weights = [w / total for w in weights]
        picked_cats = set()
        for _ in range(min(num_picks, len(categories))):
            # Avoid picking same category twice
            available = [(c, w) for c, w in zip(categories, norm_weights) if c not in picked_cats]
            if not available:
                break
            cats, wts = zip(*available)
            wts_sum = sum(wts)
            wts_norm = [w / wts_sum for w in wts]
            pick = rng.choices(list(cats), weights=wts_norm, k=1)[0]
            picked_cats.add(pick)

        # Pick one random element from each chosen category
        elements: list[str] = []
        for cat in picked_cats:
            pool = dynamic_elements.get(cat, [])
            if pool:
                elements.append(rng.choice(pool))

        if not elements:
            continue

        # Check fingerprint collision
        fp = _make_fingerprint(genre_key, "", "", elements)
        if fp not in recent:
            return elements

    # All attempts collided — return last try anyway
    return elements


# ── Internal helpers ────────────────────────────────────────────────────────


def _make_fingerprint(genre: str, mood: str, tempo: str, elements: list[str]) -> str:
    """Hash the generation signature into a short fingerprint."""
    raw = f"{genre}|{mood}|{tempo}|{','.join(sorted(elements))}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def _prune(user_id: int, now: datetime) -> None:
    """Remove expired entries for a user."""
    if user_id not in _cooldown:
        return
    cutoff = now - _COOLDOWN_WINDOW
    _cooldown[user_id] = [
        (fp, ts) for fp, ts in _cooldown[user_id] if ts > cutoff
    ]


def _load_genre_lookup() -> dict[str, dict[str, Any]]:
    """Lazy-load genre data to avoid circular imports."""
    try:
        from app.services.genre_data import GENRE_STYLES as gs
    except ImportError:
        gs = {}
    return gs  # type: ignore[return-value]


_genre_lookup: dict[str, dict[str, Any]] = {}  # populated on first use


def _ensure_lookup() -> None:
    global _genre_lookup
    if not _genre_lookup:
        _genre_lookup = _load_genre_lookup()
