"""The rebuilt prompt pipeline — one entry point for every caller.

    understand (stage 1)  →  fill the gaps (stage 2)  →  compose (stage 3)
                                                              ↓
                                                          validate
                                                       ↙            ↘
                                              accept / repair    fall back

Stage 3 is a writer, but a constrained one: it may only phrase what stage 2
assembled. Everything it produces is checked against the brief BEFORE the
prompt reaches Suno — the feedback loop the old pipeline never had. A prompt
that still contradicts the user after one repair attempt is discarded in
favour of the deterministic render, which cannot contradict anything because
it only concatenates approved material.

This module is the single entry point on purpose. The old order of operations
lived inline in ``app/tasks/__init__.py`` and was duplicated in the dry-run
script, so the thing we measured was a copy of the thing that shipped.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from loguru import logger

from app.services.brief_parser import BriefParser, ParsedBrief, fallback_parse
from app.services.genre_data import DYNAMIC_ELEMENTS
from app.services.prompt_faithfulness import BriefIntent, check_faithfulness
from app.services.style_spec import StyleSpec, build_style_spec
from app.services.track_naming import strip_inline_artist_clause

_PARSER_MODEL = "gpt-4o-mini"
_COMPOSER_MODEL = "gpt-4o"
_STYLE_LIMIT = 900   # Suno hard-caps at 1000; leave room rather than be trimmed

# Cross-genre filler from the old assembler. The new pipeline never adds it,
# so finding any means something regressed.
_SALT_PHRASES: tuple[str, ...] = tuple(DYNAMIC_ELEMENTS["vocal_technique"])

_SYS_COMPOSE = """\
You write the STYLE field for Suno's music API. You are given a brief split
into two parts:

  LOCKED — what the user actually asked for. Every item must survive into your
           text, in your own phrasing but without weakening it. Adding to it,
           replacing it or "improving" it is failure.
  OPEN   — dimensions the user left unspecified. Here, and ONLY here, you may
           add production, texture, arrangement and instrumentation detail
           that suits the genre.

  EXCLUDED — must not appear in your text in any form, not even as a negation.
           Do not write "no drums"; write an arrangement that has none. These
           go to Suno through a separate parameter.

When something rhythmic is excluded, say POSITIVELY what carries the movement
instead — "pulse carried by arpeggiated synth figures and bass motion",
"momentum from filter sweeps and swelling pads". A genre whose default is a
strong beat will bring one back unless the text gives the motion somewhere
else to live; the exclusion parameter alone does not win that argument.

RULES
- English only. Comma-separated descriptors and short clauses, no prose
  paragraphs, no markdown, no headings, no quotes around the whole answer.
- Length follows the brief, not a target. A precise, closed brief gets a short
  prompt — 150-350 characters is a correct answer, not a lazy one. A brief that
  leaves most dimensions open may go to 900 characters.
- State tempo ONCE. If a BPM is locked, repeat that number and no other.
- Never name a real artist, band or producer.
- Return the style text only."""


@dataclass
class PromptResult:
    style: str
    negative_tags: str
    style_weight: float
    weirdness: float
    faithfulness: float
    source: str                      # composer | composer-repaired | deterministic
    parsed: ParsedBrief
    spec: StyleSpec
    failures: list[str] = field(default_factory=list)


def _intent_from_parsed(parsed: ParsedBrief) -> BriefIntent:
    """The brief itself becomes the acceptance criteria.

    In production there is no hand annotation — the parser's ``locked`` fields
    ARE the contract, so the validator checks the composer against the user.
    """
    bpm = (parsed.bpm_min, parsed.bpm_max or parsed.bpm_min) if parsed.bpm_min else None
    return BriefIntent(
        genre_terms=tuple(t for t in (parsed.genre, parsed.subgenre) if t),
        require=tuple(parsed.instruments_required[:6]),
        forbid=tuple(parsed.instruments_forbidden[:8]),
        bpm_range=bpm,
        instrumental=parsed.vocals == "none",
    )


def _compose_request(spec: StyleSpec, parsed: ParsedBrief) -> str:
    lines = ["LOCKED:"]
    lines += [f"- {item}" for item in spec.locked]
    lines.append("")
    lines.append(f"OPEN: {', '.join(parsed.open) or '(nothing)'}")
    if spec.filler:
        lines.append(f"Genre reference material (optional): {', '.join(spec.filler[:12])}")
    if spec.negative_tags:
        lines.append(f"EXCLUDED: {', '.join(spec.negative_tags)}")
    return "\n".join(lines)


async def build_suno_prompt(
    *,
    description: str,
    genre: str = "",
    mood: str = "",
    tempo: str = "",
    instrumental: bool = False,
    vocal: str = "",
    chat_client: Any | None = None,
    parser_model: str = _PARSER_MODEL,
    composer_model: str = _COMPOSER_MODEL,
    learned_presets: dict[str, dict] | None = None,
    compose: bool = True,
) -> PromptResult:
    """Turn a user brief into a Suno style payload, verified before it ships.

    With ``chat_client=None`` (or ``compose=False``) the whole thing runs
    deterministically: regex parse, gap fill, concatenate. That path costs
    nothing, cannot contradict the brief, and is what runs when the LLM
    provider chain is down.
    """
    # ── stage 1: understand ─────────────────────────────────────────────
    kwargs = {"genre": genre, "mood": mood, "tempo": tempo, "instrumental": instrumental}
    if chat_client is None:
        parsed = fallback_parse(description, **kwargs)
    else:
        parsed = await BriefParser(chat_client, model=parser_model).parse(description, **kwargs)

    # An explicit vocal choice from the form outranks whatever the text implied.
    if vocal in {"male", "female"}:
        parsed.vocals = vocal
        parsed.instruments_forbidden = [
            f for f in parsed.instruments_forbidden if "vocal" not in f.lower()
        ]

    # ── stage 2: fill the gaps ──────────────────────────────────────────
    spec = build_style_spec(parsed, learned_presets=learned_presets)
    deterministic = strip_inline_artist_clause(spec.render(limit=_STYLE_LIMIT))
    negative_tags = spec.negative_tags_text()
    intent = _intent_from_parsed(parsed)

    def _score(style: str) -> tuple[float, list[str], bool]:
        report = check_faithfulness(
            style=style,
            negative_tags=negative_tags,
            intent=intent,
            salt_phrases=_SALT_PHRASES,
            style_limit=_STYLE_LIMIT,
        )
        return (
            report.score,
            [f"{c.name}: {c.detail}" for c in report.failures],
            report.critical_failed,
        )

    base_score, base_failures, _ = _score(deterministic)
    if chat_client is None or not compose:
        return PromptResult(
            style=deterministic,
            negative_tags=negative_tags,
            style_weight=spec.style_weight,
            weirdness=spec.weirdness,
            faithfulness=base_score,
            source="deterministic",
            parsed=parsed,
            spec=spec,
            failures=base_failures,
        )

    # ── stage 3: compose, then check ────────────────────────────────────
    request = _compose_request(spec, parsed)
    messages = [
        {"role": "system", "content": _SYS_COMPOSE},
        {"role": "user", "content": request},
    ]
    source = "composer"

    for attempt in (1, 2):
        try:
            resp = await chat_client.chat.completions.create(
                model=composer_model,
                messages=messages,
                temperature=0.3,
                max_tokens=400,
            )
            style = (resp.choices[0].message.content or "").strip().strip('"').strip("`")
        except Exception as exc:
            logger.warning("compose failed ({}) — using the deterministic render", exc)
            break

        style = strip_inline_artist_clause(style)[:_STYLE_LIMIT]
        score, failures, critical = _score(style)

        if not critical:
            return PromptResult(
                style=style,
                negative_tags=negative_tags,
                style_weight=spec.style_weight,
                weirdness=spec.weirdness,
                faithfulness=score,
                source=source,
                parsed=parsed,
                spec=spec,
                failures=failures,
            )

        if attempt == 1:
            logger.info("compose: rejected, repairing — {}", "; ".join(failures))
            messages += [
                {"role": "assistant", "content": style},
                {
                    "role": "user",
                    "content": (
                        "This text fails the brief:\n"
                        + "\n".join(f"- {f}" for f in failures)
                        + "\nRewrite it. Keep every LOCKED item, drop everything "
                        "EXCLUDED, state the tempo once. Style text only."
                    ),
                },
            ]
            source = "composer-repaired"

    # Composer could not satisfy the brief — ship material that cannot fail.
    logger.warning("compose: falling back to the deterministic render")
    return PromptResult(
        style=deterministic,
        negative_tags=negative_tags,
        style_weight=spec.style_weight,
        weirdness=spec.weirdness,
        faithfulness=base_score,
        source="deterministic",
        parsed=parsed,
        spec=spec,
        failures=base_failures,
    )


__all__ = ["PromptResult", "build_suno_prompt"]
