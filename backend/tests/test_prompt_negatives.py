"""Exclusions in a free-form brief must reach Suno's ``negativeTags``.

Measured 2026-08-13 before this path existed: exclusions written in the user's
own description reached ``negativeTags`` in 1 of 21 corpus runs, because
nothing read the description. «без ударных и бита» arrived as "vocals".
"""

from __future__ import annotations

import random

import pytest

from app.services.prompt_engineering import (
    SongParams,
    build_suno_style,
    extract_negative_tags,
)


@pytest.mark.parametrize(
    ("brief", "expected"),
    [
        # The reported failure — a three-item enumeration ending in a tempo.
        (
            "Мне нужен таинственный техно только с синтезаторами, без ударных, "
            "бита и бочки, средний темп, тревожное настроение",
            ["drums", "beat", "kick"],
        ),
        ("Инструментальный трек в жанре загадочного эмбиента, без ударных и бита.",
         ["drums", "beat"]),
        ("Быстрая мелодия на аналоговом синтезаторе, тревожное настроение, без ударных",
         ["drums"]),
        ("Мощный бит на ударных без дополнительных инструментов",
         ["additional instruments"]),
        ("no drums, bass and guitars, medium tempo", ["drums", "bass", "guitars"]),
    ],
)
def test_extract_negative_tags(brief: str, expected: list[str]) -> None:
    assert extract_negative_tags(brief) == expected


@pytest.mark.parametrize(
    "brief",
    [
        # Drums are WANTED here — nothing may be excluded.
        "ровный бит бочки таинственное пианино фоновая музыка для детективного видео",
        "Instrumental techno, steady four-on-the-floor kick drum, ~120 BPM",
        "Крутой бит на ударных в стиле хип-хоп старой школы",
    ],
)
def test_no_false_exclusions(brief: str) -> None:
    assert extract_negative_tags(brief) == []


def test_enumeration_stops_at_a_new_clause() -> None:
    """«средний темп» is not a thing you can exclude — the list ends before it."""
    tags = extract_negative_tags("без ударных, средний темп, тревожное настроение")
    assert tags == ["drums"]


def test_description_exclusions_reach_the_style_pipeline() -> None:
    """End-to-end: the brief's exclusions become negativeTags AND the preset
    fragments that contradict them are dropped from the style text."""
    params = SongParams(
        user_description=(
            "Таинственное техно только с синтезаторами, без ударных, бита и бочки"
        ),
        genre="Techno",
        mood="mysterious",
        tempo="medium",
        vocal="no_vocal",
    )
    # Fixed rng: the old assembler samples preset fragments at random, so an
    # unseeded run is not reproducible. (Genre survival is deliberately NOT
    # asserted here — in this pipeline the word "techno" can be sampled away,
    # which is one of the reasons the rebuild exists. The new pipeline
    # guarantees it; see tests/test_style_spec.py.)
    style, _weight, _constraint, negative_tags = build_suno_style(
        params, rng=random.Random(0)
    )

    tags = {t.strip().lower() for t in negative_tags.split(",")}
    assert {"drums", "beat", "kick"} <= tags

    # The Techno preset carries "relentless kick drum" — it must not survive a
    # brief that excludes drums.
    assert "kick drum" not in style.lower()
