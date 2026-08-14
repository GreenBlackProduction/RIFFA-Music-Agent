"""Stage 2 — genre knowledge fills gaps and never contradicts the brief."""

from __future__ import annotations

from app.services.brief_parser import ParsedBrief
from app.services.style_spec import _is_artist_reference, build_style_spec


def test_preset_fragment_contradicting_an_exclusion_is_dropped() -> None:
    """The Techno preset offers "relentless kick drum" — a no-drums brief
    must never see it. This is the exact failure the rebuild started from."""
    parsed = ParsedBrief(
        genre="Techno",
        instruments_required=["synthesizers"],
        instruments_forbidden=["drums", "kick", "beat", "vocals"],
        vocals="none",
        open=["era", "production", "texture"],
    )
    spec = build_style_spec(parsed)
    style = spec.render().lower()

    assert "techno" in style
    assert "kick" not in style
    assert "drum" not in style
    assert "synthesizers" in style
    assert {"drums", "kick", "beat"} <= {t.lower() for t in spec.negative_tags}
    assert any("kick drum" in d.lower() for d in spec.dropped)


def test_preset_bpm_is_dropped_when_the_brief_states_one() -> None:
    """Two BPM statements in one prompt is the pipeline arguing with itself."""
    parsed = ParsedBrief(genre="Techno", bpm_min=110, bpm_max=120, open=["texture"])
    style = build_style_spec(parsed).render().lower()

    assert "110-120 bpm" in style
    assert "130-140" not in style


def test_mood_profile_only_fills_an_open_mood() -> None:
    stated = build_style_spec(
        ParsedBrief(genre="Ambient", mood="anxious", open=["texture"])
    ).render().lower()
    assert "anxious" in stated
    # The MOOD_PROFILES description for "anxious" must not pile on top.
    assert "nervous energy" not in stated


def test_background_usage_suppresses_the_dramatic_arc() -> None:
    parsed = ParsedBrief(
        genre="Ambient",
        usage="background for a detective video",
        open=["arrangement", "texture"],
    )
    assert "intro build development" not in build_style_spec(parsed).render().lower()


def test_locked_material_survives_the_length_budget() -> None:
    """Filler is cut first; the user's own words are never trimmed away."""
    parsed = ParsedBrief(
        genre="Techno",
        instruments_required=["analog synthesizers", "sub bass"],
        mood="anxious",
        notes=["sparse arrangement", "long evolving pads"],
        open=["era", "production", "texture", "arrangement"],
    )
    style = build_style_spec(parsed).render(limit=90)

    assert style.startswith("Techno")
    assert "analog synthesizers" in style
    assert len(style) <= 90


def test_tempo_bucket_resolves_to_the_range_the_user_was_shown() -> None:
    """The picker says "Fast · 120–140 BPM" but only sends "fast".

    Live failure 2026-08-14: the bucket did not become a number, so the Techno
    preset's own "driving 130-140 BPM" filled the gap instead.
    """
    style = build_style_spec(
        ParsedBrief(genre="Techno", tempo_word="fast", open=["texture"])
    ).render().lower()

    assert "120-140 bpm" in style
    assert "130-140" not in style
    assert style.count("bpm") == 1


def test_excluding_drums_also_drops_rhythm_filler() -> None:
    """"no drums" and "steady groove" in one prompt is the pipeline arguing."""
    spec = build_style_spec(
        ParsedBrief(
            genre="Techno",
            instruments_forbidden=["drums", "vocals"],
            vocals="none",
            tempo_word="medium",
            open=["texture", "production"],
        )
    )
    style = spec.render().lower()

    for word in ("groove", "driving", "four-on-the-floor", "percussion", "kick"):
        assert word not in style


def test_artist_references_never_leave_the_preset() -> None:
    """Suno hard-rejects artist names; 81 preset fragments carry one."""
    spec = build_style_spec(ParsedBrief(genre="Minimal Techno", open=["texture"]))

    assert "villalobos" not in spec.render().lower()
    assert any("influenced" in d.lower() for d in spec.dropped)
    # A genre reference is not an artist reference.
    assert not _is_artist_reference("rock-influenced energy")
    assert _is_artist_reference("Steve Reich influenced")


def test_nothing_random() -> None:
    """Same brief in, same style out — every time."""
    parsed = ParsedBrief(genre="Techno", mood="dark", open=["era", "texture"])
    renders = {build_style_spec(parsed).render() for _ in range(5)}
    assert len(renders) == 1
