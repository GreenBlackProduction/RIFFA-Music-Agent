"""Normalize Generation.mood from human-readable labels to stable keys.

Older Studio code stored the *label* of the chosen mood/tempo chip in
``generations.mood`` / ``generations.tempo`` (e.g. ``"😊 Радостное"``),
while the cover module — and now everything — sends the *key*
(``"happy"``). The Radio page filters and groups by key, so the mixed
storage manifests as a wrong per-mood counter on /radio (e.g. "9 tracks
total" but only 4 distributed across mood playlists).

This migration rewrites known legacy labels back to their canonical
keys so the existing public catalogue lines up with the new write path.
Unknown values are left untouched.

Revision ID: 006_normalize_mood_keys
Revises:     005_multi_track_radio_and_trash
"""

from __future__ import annotations

from alembic import op

revision = "006_normalize_mood_keys"
down_revision = "005_multi_track_radio_and_trash"
branch_labels = None
depends_on = None


# Pairs of (legacy label, canonical key) — must match frontend MOODS in
# src/pages/StudioPage.tsx and the mood grid in src/pages/RadioPage.tsx.
_MOOD_LABELS: tuple[tuple[str, str], ...] = (
    ("😊 Радостное", "happy"),
    ("😌 Спокойное", "calm"),
    ("🧘 Спокойное", "calm"),
    ("😢 Грустное", "sad"),
    ("😤 Энергичное", "energetic"),
    ("😎 Уверенное", "confident"),
    ("🌙 Мечтательное", "dreamy"),
    ("🔥 Агрессивное", "aggressive"),
    ("🌅 Вдохновляющее", "inspiring"),
    ("😰 Тревожное", "anxious"),
    ("🎭 Драматичное", "dramatic"),
)

_TEMPO_LABELS: tuple[tuple[str, str], ...] = (
    ("🐌 Очень медленный · 60–80 BPM", "very_slow"),
    ("🚶 Медленный · 80–100 BPM", "slow"),
    ("🚴 Средний · 100–120 BPM", "medium"),
    ("🏃 Быстрый · 120–140 BPM", "fast"),
    ("🚀 Очень быстрый · 140–180 BPM", "very_fast"),
)


def upgrade() -> None:
    bind = op.get_bind()
    for label, key in _MOOD_LABELS:
        bind.exec_driver_sql(
            "UPDATE generations SET mood = %s WHERE mood = %s",
            (key, label),
        )
    for label, key in _TEMPO_LABELS:
        bind.exec_driver_sql(
            "UPDATE generations SET tempo = %s WHERE tempo = %s",
            (key, label),
        )


def downgrade() -> None:
    # One-way data normalization — the original labels are not recoverable
    # without losing genuine "calm" (key) rows under a single label.
    pass
