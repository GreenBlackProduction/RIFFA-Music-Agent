"""Evaluation corpus for the prompt pipeline — real briefs, hand-annotated.

Phase 0 of the prompt-pipeline rebuild (2026-08-13). Every entry except the
first is a REAL generation pulled from the `generations` table, with `params`
copied verbatim — so a dry-run replays exactly what the worker received.

`intent` is the ground truth: what the user literally asked for, annotated by
hand. The rule for annotating is strict — **nothing inferred**. If the brief
does not name an instrument, it goes in neither `require` nor `forbid`. A
vague brief therefore gets a thin annotation, which is correct: there is
little to be unfaithful to.

These annotations are an interpretation of someone's intent and should be
reviewed by a human before the numbers they produce are trusted.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services.prompt_faithfulness import BriefIntent


@dataclass(frozen=True)
class CorpusBrief:
    slug: str
    source: str                                   # generation id, or where it came from
    note: str                                     # what failure mode this brief probes
    params: dict[str, Any] = field(default_factory=dict)   # verbatim `generations.params`
    intent: BriefIntent = BriefIntent()
    gen_type: str = "instrumental"


def _params(
    description: str,
    genre: str = "",
    mood: str = "",
    tempo: str = "",
    agent_prompt: str = "",
) -> dict[str, Any]:
    return {
        "description": description,
        "genre": genre,
        "custom_genre": "",
        "mood": mood,
        "tempo": tempo,
        "vocal": "",
        "agent_prompt": agent_prompt,
        "agent_research_notes": "",
        "agent_music_params": {},
    }


CORPUS: tuple[CorpusBrief, ...] = (
    # ── The brief that started the rebuild ────────────────────────────────
    CorpusBrief(
        slug="techno-synths-no-drums",
        source="user report 2026-08-13 (verbatim request, form path)",
        note="the reported failure: genre + instrument + exclusion all missed",
        params=_params(
            "Мне нужен таинственный техно только с синтезаторами, "
            "без ударных, бита и бочки, средний темп, тревожное настроение",
            genre="Techno",
            mood="anxious",
            tempo="medium",
        ),
        intent=BriefIntent(
            genre_terms=("techno",),
            require=("synthesizers",),
            # «только с синтезаторами» is a closed statement: it excludes the
            # other families too, not just the drums named after it.
            # (Annotation corrected 2026-08-13 — the original listed only the
            # three explicit refusals and under-counted a correct parse.)
            forbid=("drums", "kick", "beat", "bass", "guitars", "piano", "strings", "brass"),
        ),
    ),

    # ── Exclusions in Russian ─────────────────────────────────────────────
    CorpusBrief(
        slug="ambient-no-drums-ru",
        source="4e661c9e-6db7-43ba-b7ff-5708d13730e0",
        note="RU exclusion «без ударных и бита» — reached negativeTags as 'vocals' only",
        params=_params(
            "Инструментальный трек в жанре загадочного эмбиента, без ударных и бита.",
            genre="Ambient",
            mood="mysterious",
            tempo="slow",
            agent_prompt="Инструментальный трек в жанре загадочного эмбиента, без ударных и бита.",
        ),
        intent=BriefIntent(genre_terms=("ambient",), forbid=("drums", "beat")),
    ),
    CorpusBrief(
        slug="analog-synth-no-drums-ru",
        source="bb1c73e6-3701-491f-814c-38e7d0bc2af0",
        note="RU: named instrument + exclusion in one sentence",
        params=_params(
            "Быстрая мелодия на аналоговом синтезаторе с эмбиент-шумами, "
            "тревожное настроение, без ударных",
            genre="Ambient",
            mood="anxious",
            tempo="very_fast",
            agent_prompt=(
                "Быстрая мелодия на аналоговом синтезаторе с эмбиент-шумами, "
                "тревожное настроение, без ударных"
            ),
        ),
        intent=BriefIntent(
            genre_terms=("ambient",), require=("synthesizers",), forbid=("drums",)
        ),
    ),
    CorpusBrief(
        slug="detective-minimal-no-beat",
        source="5a8099d4-0a4f-44a9-a5e6-81790bb1d0e3",
        note="RU «без бит» + genre tag (Techno) contradicting the text (minimal)",
        params=_params(
            "Музыка для видео минимасличные настораживающие звуки без бит. "
            "Детективное видео · Minimal",
            genre="Techno",
            mood="confident",
            tempo="very_slow",
        ),
        intent=BriefIntent(genre_terms=("minimal", "minimalist", "techno"), forbid=("beat",)),
    ),
    CorpusBrief(
        slug="investigation-no-beat",
        source="1afa85c1-0233-438f-a333-7c496f257726",
        note="mixed RU/EN, exclusion + usage; produced brass fanfares and orchestral swells",
        params=_params(
            "Background music for video content вдумчивая музыка без бита для видео расследования",
            genre="Cinematic",
            mood="dramatic",
            tempo="slow",
        ),
        intent=BriefIntent(genre_terms=("cinematic",), forbid=("beat",)),
    ),

    # ── Named instruments ─────────────────────────────────────────────────
    CorpusBrief(
        slug="piano-detective-steady-kick",
        source="012550f6-c326-4d36-ada7-1e184dcb1241",
        note="auto-classified as Pop; piano never appeared, R&B filler did",
        params=_params(
            "ровный бит бочки таинтсвенное пианони фоновая музыка для детективного видео · Piano",
            genre="Pop",
            mood="anxious",
            tempo="medium",
        ),
        intent=BriefIntent(require=("piano", "kick")),
    ),
    CorpusBrief(
        slug="anxious-piano",
        source="8ad215b2-d466-456e-9e8c-473eb6dc57a3",
        note="two-word RU brief naming exactly one instrument",
        params=_params(
            "тревожная музыка на пианино · Piano",
            genre="Ambient",
            mood="anxious",
            tempo="slow",
        ),
        intent=BriefIntent(require=("piano",)),
    ),
    CorpusBrief(
        slug="news-synth-only",
        source="389339bd-3c80-40e2-b100-7b45c3cf579f",
        note="EN, explicit sole-instrument restriction + explicit BPM range",
        params=_params(
            "Minimalist instrumental track for urgent news broadcast. Digital synthesizer "
            "as the sole instrument, slow tempo (100-120 BPM), anxious mood. Clean, precise "
            "melodic lines with subtle dynamic shifts. No additional instruments or layers, "
            "cinematic focus. · Ambient",
            genre="Minimalism",
            mood="anxious",
            tempo="slow",
            agent_prompt=(
                "Minimalist instrumental track for urgent news broadcast. Digital synthesizer "
                "as the sole instrument, slow tempo (100-120 BPM), anxious mood. Clean, precise "
                "melodic lines with subtle dynamic shifts. No additional instruments or layers, "
                "cinematic focus."
            ),
        ),
        intent=BriefIntent(
            genre_terms=("minimal", "minimalist", "minimalism"),
            require=("synthesizers",),
            # "sole instrument" + "no additional instruments" — bass belongs in
            # the list too (annotation corrected 2026-08-13).
            forbid=("drums", "guitars", "strings", "brass", "piano", "bass"),
            bpm_range=(100, 120),
        ),
    ),

    # ── Positive controls: drums are WANTED here ──────────────────────────
    CorpusBrief(
        slug="techno-with-kick",
        source="d316dabb-b3a8-4900-9a73-a9c75b47d321",
        note="control — a rich EN brief that explicitly wants a kick; must not lose it",
        params=_params(
            "Instrumental tech techno deep track, steady four-on-the-floor kick drum, "
            "minimal percussive elements, ominous and haunting piano motifs, dark atmospheric "
            "pads, subtle analog bassline, crisp modern production, medium tempo (~120 BPM), "
            "cinematic and investigative mood.",
            genre="Techno",
            mood="anxious",
            tempo="medium",
            agent_prompt=(
                "Instrumental tech techno deep track, steady four-on-the-floor kick drum, "
                "minimal percussive elements, ominous and haunting piano motifs, dark "
                "atmospheric pads, subtle analog bassline, crisp modern production, medium "
                "tempo (~120 BPM), cinematic and investigative mood."
            ),
        ),
        intent=BriefIntent(
            genre_terms=("techno",),
            require=("kick", "piano", "bass"),
            bpm_range=(110, 130),
        ),
    ),
    CorpusBrief(
        slug="trap-drums-only",
        source="063e82ea-90e4-43a8-ba87-7abde4ec9178",
        note="control — drums required, everything else excluded; no mood/tempo tags",
        params=_params("Мощный бит на ударных без дополнительных инструментов", genre="Trap"),
        intent=BriefIntent(
            genre_terms=("trap",),
            require=("drums",),
            # «без дополнительных инструментов» — everything except the drums
            # the brief asks for (annotation corrected 2026-08-13: bass and
            # synthesizers were missing).
            forbid=("piano", "guitars", "strings", "brass", "bass", "synthesizers"),
        ),
    ),
    CorpusBrief(
        slug="jazzhop-oldschool",
        source="1d5adc48-e8b7-4570-bcf5-37344a25c9cd",
        note="control — RU brief wanting drums + a specific scene",
        params=_params(
            "Крутой бит на ударных в в стиле Хип хоп старый школы, грязный звук крутой грув "
            "андеграунд джас хоп · Jazz Hop",
            genre="Hip-Hop",
            mood="confident",
            tempo="slow",
        ),
        intent=BriefIntent(
            genre_terms=("hip-hop", "hip hop", "jazz hop", "boom bap"), require=("drums",)
        ),
    ),

    # ── Rich EN briefs (the pipeline's best case) ─────────────────────────
    CorpusBrief(
        slug="dub-techno-forest",
        source="52415779-3ef7-4827-b5e2-0fa601106b45",
        note="rich EN brief with a named subgenre — best case for the current pipeline",
        params=_params(
            "Dub techno instrumental, inspired by Biodub, with forest ambiance. Echoing "
            "synthesizers, deep bassline, and natural sound textures create an organic, "
            "calming atmosphere. Medium tempo, warm and introspective mood, reminiscent of "
            "a serene forest setting with subtle rhythmic pulses.",
            genre="Dub Techno",
            mood="calm",
            tempo="medium",
            agent_prompt=(
                "Dub techno instrumental, inspired by Biodub, with forest ambiance. Echoing "
                "synthesizers, deep bassline, and natural sound textures create an organic, "
                "calming atmosphere. Medium tempo, warm and introspective mood."
            ),
        ),
        intent=BriefIntent(
            genre_terms=("dub techno", "dub", "techno"), require=("synthesizers", "bass")
        ),
    ),
    CorpusBrief(
        slug="minimal-electronic-club",
        source="947f192f-0a7f-4365-91af-8dcc22415f0a",
        note="rich EN brief, restrained club pulse — drums wanted but understated",
        params=_params(
            "Minimal electronic instrumental, featuring sparse, clean synth tones, programmed "
            "drums with a restrained club pulse, atmospheric pads and textures. The arrangement "
            "is spacious and polished, maintaining a sophisticated and emotionally glowing "
            "atmosphere with a medium tempo.",
            genre="Electronic",
            mood="restrained",
            tempo="medium",
            agent_prompt=(
                "Minimal electronic instrumental, sparse clean synth tones, programmed drums "
                "with a restrained club pulse, atmospheric pads and textures, medium tempo."
            ),
        ),
        intent=BriefIntent(
            genre_terms=("minimal", "electronic"), require=("synthesizers", "drums")
        ),
    ),

    # ── Edge cases ────────────────────────────────────────────────────────
    CorpusBrief(
        slug="bare-techno-tags-only",
        source="2cc9c2d9-a952-4329-913d-0fb0670842cb",
        note="the vague case the enricher exists for — no description at all",
        params=_params("", genre="Techno", mood="energetic", tempo="medium"),
        intent=BriefIntent(genre_terms=("techno",)),
    ),
    CorpusBrief(
        slug="rock-artist-reference",
        source="a4c37508-1f04-4103-a4ab-09c7580f01af",
        note="artist reference in RU — name must be stripped, genre must survive",
        params=_params(
            "Инструментал в стиле Jimmy Eat World, спокойное и быстрое настроение.",
            genre="Rock",
            mood="calm",
            tempo="medium",
            agent_prompt="Инструментал в стиле Jimmy Eat World, спокойное и быстрое настроение.",
        ),
        intent=BriefIntent(genre_terms=("rock", "emo"), require=("guitars",)),
    ),
    CorpusBrief(
        slug="detective-bg-vague-en",
        source="75793cf8-a256-4e66-a03d-708e5bd6805c",
        note="vague EN brief; produced brass fanfares, orchestral swells, styleWeight 0.99",
        params=_params(
            "Background music for video content detective film · Experimental",
            genre="Ambient",
            mood="dramatic",
            tempo="medium",
        ),
        intent=BriefIntent(genre_terms=("ambient", "cinematic", "experimental")),
    ),
)


__all__ = ["CORPUS", "CorpusBrief"]
