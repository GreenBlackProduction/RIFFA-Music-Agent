"""Stage 1 of the rebuilt prompt pipeline — understand the brief, don't rewrite it.

The old pipeline had no such stage: the user's sentence went straight into a
GPT enricher whose system prompt *orders* it to expand thin requests, and into
an assembler that never read it at all. Nothing in the system knew the
difference between "the user asked for this" and "we made this up".

This parser produces exactly that distinction:

    locked — what the brief literally states. Later stages may not contradict it.
    open   — dimensions the brief left unspecified. Later stages may fill those.

It is a PARSER, not a writer: temperature 0, no genre knowledge, no
inference. The one licensed inference is a closed statement ("only
synthesizers", "no additional instruments"), which does exclude everything
else — that is reading the brief, not embellishing it.

Nothing in the request path calls this yet (phase 1 of PROMPT-REBUILD.md).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any

from loguru import logger

# Instrument families the parser is allowed to name when a brief makes a closed
# statement ("only X"). Bounded on purpose: an open-ended exclusion list is how
# a parser turns back into a writer.
INSTRUMENT_FAMILIES: tuple[str, ...] = (
    "drums", "percussion", "bass", "guitars", "piano",
    "strings", "brass", "synthesizers", "vocals",
)

_OPEN_FIELDS: frozenset[str] = frozenset({
    "genre", "instruments", "bpm", "mood", "vocals",
    "era", "production", "arrangement", "texture", "usage",
})

_SYS_PARSE = """\
You are a PARSER, not a writer. You read a music brief (any language) and
return ONLY what it literally states, as JSON.

ABSOLUTE RULES
- Never invent, infer, expand or improve. If the brief does not state
  something, leave that field empty and name it in "open".
- Never add genre knowledge. "techno" stays "techno" — do NOT add "909 kick",
  "Berlin warehouse", "hypnotic loops". A later stage does that, and only for
  fields listed in "open".
- Translate values into English. Keep them short noun phrases, no prose.
- A tempo word ("medium", "slow") is NOT a BPM number. Only fill bpm_min/
  bpm_max when the brief states digits.
- THE ONLY LICENSED INFERENCE: a closed statement — "only X", "X as the sole
  instrument", "nothing but X", "no additional instruments or layers" — does
  exclude everything else. In that case fill instruments_forbidden with the
  families from this list that the brief did NOT name:
  drums, percussion, bass, guitars, piano, strings, brass, synthesizers, vocals.
- That rule needs an EXPLICIT exclusivity word ("only", "sole", "nothing but",
  "no additional", «только», «единственный»). Naming an instrument is NOT a
  closed statement: "anxious piano music" asks FOR piano and excludes nothing.
  Without such a word, instruments_forbidden may contain only what the brief
  literally refuses ("no drums" → drums). When in doubt, exclude nothing.

FIELDS (JSON object, all keys always present)
  genre                 string, "" when unstated
  subgenre              string, "" when unstated
  instruments_required  array of strings the brief names as wanted
  instruments_forbidden array of strings the brief excludes
  bpm_min               integer or null
  bpm_max               integer or null
  tempo_word            the brief's tempo word in English, else ""
  mood                  short phrase, else ""
  vocals                one of: "none", "male", "female", "any", ""
  usage                 what the track is for, else ""
  era                   e.g. "1980s", else ""
  notes                 array of other stated requirements that fit no field
  references            array of artist / band / track names mentioned
  open                  array naming the unspecified dimensions, chosen from:
                        genre, instruments, bpm, mood, vocals, era,
                        production, arrangement, texture, usage

The user may also send tag selections (genre / mood / tempo). Treat those as
stated by the user — but if the brief text contradicts a tag, THE TEXT WINS.

Return the JSON object and nothing else."""


@dataclass
class ParsedBrief:
    """A brief split into what was said (everything but ``open``) and what wasn't."""

    genre: str = ""
    subgenre: str = ""
    instruments_required: list[str] = field(default_factory=list)
    instruments_forbidden: list[str] = field(default_factory=list)
    bpm_min: int | None = None
    bpm_max: int | None = None
    tempo_word: str = ""
    mood: str = ""
    vocals: str = ""
    usage: str = ""
    era: str = ""
    notes: list[str] = field(default_factory=list)
    references: list[str] = field(default_factory=list)
    open: list[str] = field(default_factory=list)
    parser_failed: bool = False   # True → built by the regex fallback, not GPT

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)

    def locked_summary(self) -> str:
        """One-line human-readable view of what the user actually asked for."""
        bits: list[str] = []
        if self.genre or self.subgenre:
            bits.append(" / ".join(b for b in (self.subgenre, self.genre) if b))
        if self.instruments_required:
            bits.append("+" + ", ".join(self.instruments_required))
        if self.instruments_forbidden:
            bits.append("−" + ", ".join(self.instruments_forbidden))
        if self.bpm_min:
            span = f"{self.bpm_min}-{self.bpm_max}" if self.bpm_max else str(self.bpm_min)
            bits.append(f"{span} BPM")
        elif self.tempo_word:
            bits.append(self.tempo_word)
        if self.mood:
            bits.append(self.mood)
        if self.vocals:
            bits.append(f"vocals={self.vocals}")
        if self.usage:
            bits.append(f"for {self.usage}")
        return "; ".join(bits) or "(nothing stated)"


def _as_str_list(value: Any, *, limit: int = 12) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        text = str(item).strip()
        if text and text.lower() not in {o.lower() for o in out}:
            out.append(text[:60])
    return out[:limit]


def _as_int(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if 20 <= number <= 300 else None


# An exclusivity word is what licenses "everything else is excluded".
_EXCLUSIVITY_CUES: tuple[str, ...] = (
    "only", "sole", "solely", "nothing but", "no additional", "no other",
    "только", "единственн", "без дополнительн", "никаких других",
)


def _extract_json(content: str) -> dict[str, Any]:
    """Parse a JSON object out of a model reply, fenced or not.

    Not every model honours ``response_format``; several wrap the object in
    ```json fences or add a sentence around it.
    """
    text = (content or "").strip()
    if text.startswith("```"):
        text = text.split("```")[1] if "```" in text[3:] else text[3:]
        text = text.removeprefix("json").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in reply")
    return json.loads(text[start : end + 1])


def _reconcile_exclusions(description: str, parsed: ParsedBrief) -> ParsedBrief:
    """Drop exclusions the brief never licensed.

    A cheap model applies the closed-statement rule too eagerly — gpt-4o-mini
    read «тревожная музыка на пианино» as "piano only" and excluded seven
    families nobody mentioned. Inventing constraints is the exact failure this
    rebuild exists to remove, so it is enforced in code rather than trusted to
    the prompt.
    """
    from app.services.prompt_engineering import extract_negative_tags

    stated = extract_negative_tags(description)

    if any(cue in description.lower() for cue in _EXCLUSIVITY_CUES):
        kept = list(parsed.instruments_forbidden)  # closed statement — broad is right
    else:
        licensed = {t.lower() for t in stated} | {"vocals"}
        kept = [
            item for item in parsed.instruments_forbidden
            if any(item.lower() in lic or lic in item.lower() for lic in licensed)
        ]
        if len(kept) != len(parsed.instruments_forbidden):
            logger.info(
                "brief parse: dropped unlicensed exclusions {}",
                [f for f in parsed.instruments_forbidden if f not in kept],
            )

    # Explicit refusals found by regex are precise where the model generalises
    # («без ударных и бита» → the model says "drums", the text also says beat).
    for tag in stated:
        if not any(tag.lower() in k.lower() or k.lower() in tag.lower() for k in kept):
            kept.append(tag)

    # An instrument cannot be both wanted and refused. Seen live: a brief
    # asking for drums came back excluding "percussion", which would have made
    # stage 2 delete the very thing the user asked for. Required wins.
    required = [r.lower() for r in parsed.instruments_required]
    contradictory = [
        k for k in kept
        if any(k.lower() in r or r in k.lower() for r in required)
    ]
    if contradictory:
        logger.info("brief parse: dropped exclusions contradicting the request {}", contradictory)
        kept = [k for k in kept if k not in contradictory]

    parsed.instruments_forbidden = kept
    return parsed


def _coerce(raw: dict[str, Any]) -> ParsedBrief:
    """Trust nothing the model returned — clamp every field into shape."""
    vocals = str(raw.get("vocals", "") or "").strip().lower()
    parsed = ParsedBrief(
        genre=str(raw.get("genre", "") or "").strip()[:60],
        subgenre=str(raw.get("subgenre", "") or "").strip()[:60],
        instruments_required=_as_str_list(raw.get("instruments_required")),
        instruments_forbidden=_as_str_list(raw.get("instruments_forbidden")),
        bpm_min=_as_int(raw.get("bpm_min")),
        bpm_max=_as_int(raw.get("bpm_max")),
        tempo_word=str(raw.get("tempo_word", "") or "").strip()[:30],
        mood=str(raw.get("mood", "") or "").strip()[:80],
        vocals=vocals if vocals in {"none", "male", "female", "any"} else "",
        usage=str(raw.get("usage", "") or "").strip()[:120],
        era=str(raw.get("era", "") or "").strip()[:20],
        notes=_as_str_list(raw.get("notes"), limit=8),
        references=_as_str_list(raw.get("references"), limit=6),
        open=[f for f in _as_str_list(raw.get("open")) if f.lower() in _OPEN_FIELDS],
    )
    if parsed.bpm_min and parsed.bpm_max and parsed.bpm_min > parsed.bpm_max:
        parsed.bpm_min, parsed.bpm_max = parsed.bpm_max, parsed.bpm_min
    return parsed


def fallback_parse(
    description: str,
    *,
    genre: str = "",
    mood: str = "",
    tempo: str = "",
    instrumental: bool = False,
) -> ParsedBrief:
    """Regex-only parse — used when GPT is unreachable or returns junk.

    Deliberately thin: it recovers the exclusions (the part that silently
    vanished for months) and the tag selections, and marks everything else as
    open. A degraded parse must never invent what a full parse would infer.
    """
    from app.services.prompt_engineering import extract_negative_tags

    forbidden = extract_negative_tags(description)
    if instrumental and not any("vocal" in f.lower() for f in forbidden):
        forbidden.append("vocals")
    stated = {"genre"} if genre else set()
    if mood:
        stated.add("mood")
    if forbidden:
        stated.add("instruments")
    return ParsedBrief(
        genre=genre,
        instruments_forbidden=forbidden,
        tempo_word=tempo,
        mood=mood,
        vocals="none" if instrumental else "",
        open=sorted(_OPEN_FIELDS - stated - {"vocals" if instrumental else ""}),
        parser_failed=True,
    )


class BriefParser:
    """Wraps one GPT call. Takes an OpenAI-compatible async client."""

    def __init__(self, client: Any, model: str = "gpt-4o") -> None:
        self._client = client
        self._model = model

    async def parse(
        self,
        description: str,
        *,
        genre: str = "",
        mood: str = "",
        tempo: str = "",
        instrumental: bool = False,
    ) -> ParsedBrief:
        lines = [f"Brief: {description.strip() or '(empty)'}"]
        if genre:
            lines.append(f"Tag — genre: {genre}")
        if mood:
            lines.append(f"Tag — mood: {mood}")
        if tempo:
            lines.append(f"Tag — tempo: {tempo}")
        if instrumental:
            lines.append("Mode: instrumental (the user asked for no vocals)")

        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": _SYS_PARSE},
                {"role": "user", "content": "\n".join(lines)},
            ],
            "temperature": 0,
            "max_tokens": 700,
        }
        # json_object mode is an OpenAI feature; other vendors either ignore it
        # or return an empty body (seen live with Claude via OpenRouter).
        if self._model.startswith("gpt-") or self._model.startswith("openai/"):
            kwargs["response_format"] = {"type": "json_object"}

        try:
            resp = await self._client.chat.completions.create(**kwargs)
            raw = _extract_json(resp.choices[0].message.content or "")
        except Exception as exc:
            logger.warning("brief parse failed ({}) — falling back to regex", exc)
            return fallback_parse(
                description, genre=genre, mood=mood, tempo=tempo, instrumental=instrumental
            )

        parsed = _reconcile_exclusions(description, _coerce(raw if isinstance(raw, dict) else {}))
        if instrumental:
            parsed.vocals = "none"
            if not any("vocal" in f.lower() for f in parsed.instruments_forbidden):
                parsed.instruments_forbidden.append("vocals")
        return parsed


__all__ = ["INSTRUMENT_FAMILIES", "BriefParser", "ParsedBrief", "fallback_parse"]
