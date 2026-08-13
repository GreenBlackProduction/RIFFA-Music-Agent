"""Deterministic faithfulness check — does the final Suno style match the brief?

Phase 0 of the prompt-pipeline rebuild (2026-08-13). NOTHING in the request
path calls this yet: it exists so the current pipeline can be MEASURED before
it is changed, and so every later change is compared against the same corpus.

Every check here is deterministic — no GPT, no randomness. The same payload
always scores the same, which is the whole point: today the pipeline has no
feedback loop at all, so drift between "what the user asked" and "what Suno
was told" accumulated invisibly.

Checks are intentionally dumb and readable. Adding clever heuristics here
would repeat the mistake this rebuild is meant to undo.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Term vocabulary
# ---------------------------------------------------------------------------

# A brief says "no drums"; the style says "minimal percussion" — same thing to
# a listener, so the check must catch it. Only widely-equivalent terms belong
# here; this map is a dictionary, not a genre model.
_SYNONYMS: dict[str, tuple[str, ...]] = {
    "drums": (
        "drum", "drums", "drumkit", "drum kit", "drum machine", "percussion",
        "percussive", "kick", "kicks", "snare", "hi-hat", "hihat", "hats",
        "808", "909", "tr-808", "tr-909", "four-on-the-floor", "backbeat",
    ),
    "kick": ("kick", "kicks", "kick drum", "four-on-the-floor", "808", "909"),
    "beat": ("beat", "beats", "groove", "rhythm section", "four-on-the-floor"),
    "vocals": (
        "vocal", "vocals", "voice", "vocalist", "singing", "sung", "sings",
        "choir", "chant", "falsetto", "acapella", "a cappella", "topline",
    ),
    "synthesizers": (
        "synth", "synths", "synthesizer", "synthesizers", "synthesized",
        "pad", "pads", "arpeggio", "arpeggios", "arp", "oscillator",
        "moog", "juno", "prophet", "buchla", "korg", "roland sh", "arp 2600",
    ),
    "piano": ("piano", "pianos", "rhodes", "keys", "keyboard", "upright"),
    "guitars": ("guitar", "guitars", "telecaster", "stratocaster", "riff"),
    "strings": ("strings", "violin", "cello", "viola", "pizzicato"),
    "brass": ("brass", "trumpet", "trombone", "horns", "fanfare", "fanfares"),
    "bass": ("bass", "bassline", "sub-bass", "sub bass", "808 bass"),
    "orchestra": (
        "orchestra", "orchestral", "symphonic", "string section", "cinematic swells",
    ),
}

# Cues that turn a mention into an exclusion: "no drums", "without a kick".
_NEGATION_CUE = re.compile(
    r"\b(no|without|avoid|avoiding|absent|free of|devoid of|lacking|minus|zero|not)\b"
    r"[\w\s,'-]{0,20}$",
    re.IGNORECASE,
)

_BPM_RANGE_RE = re.compile(r"(\d{2,3})\s*(?:-|–|—|to)\s*(\d{2,3})\s*bpm", re.IGNORECASE)
_BPM_SINGLE_RE = re.compile(r"(\d{2,3})\s*bpm", re.IGNORECASE)


def _terms_for(term: str) -> tuple[str, ...]:
    """Synonym set for a brief term — the term itself is always included."""
    key = term.strip().lower()
    variants = _SYNONYMS.get(key, ())
    return variants if key in variants else (key, *variants)


def _find_mentions(text: str, term: str) -> list[tuple[str, int]]:
    """Every whole-word occurrence of ``term`` (or a synonym) as (word, offset)."""
    hits: list[tuple[str, int]] = []
    for variant in _terms_for(term):
        pattern = re.compile(r"\b" + re.escape(variant) + r"\b", re.IGNORECASE)
        hits.extend((variant, m.start()) for m in pattern.finditer(text))
    return hits


def mentions(text: str, term: str) -> bool:
    """True when ``text`` names ``term`` or a synonym of it."""
    return bool(_find_mentions(text, term))


def _is_negated(text: str, offset: int) -> bool:
    """True when the mention at ``offset`` is an exclusion ("no drums")."""
    return bool(_NEGATION_CUE.search(text[max(0, offset - 40): offset]))


def _bpm_spans(text: str) -> list[tuple[int, int]]:
    """All BPM statements as (low, high) — a bare "120 BPM" becomes (120, 120)."""
    spans: list[tuple[int, int]] = []
    remainder = text
    for match in _BPM_RANGE_RE.finditer(text):
        low, high = int(match.group(1)), int(match.group(2))
        spans.append((min(low, high), max(low, high)))
        remainder = remainder.replace(match.group(0), " ")
    for match in _BPM_SINGLE_RE.finditer(remainder):
        value = int(match.group(1))
        spans.append((value, value))
    return spans


def _overlaps(a: tuple[int, int], b: tuple[int, int]) -> bool:
    return a[0] <= b[1] and b[0] <= a[1]


# ---------------------------------------------------------------------------
# Intent + report
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BriefIntent:
    """Ground truth for one brief — what the user literally asked for.

    Annotated by hand from the user's own words. Nothing inferred: if the brief
    does not name an instrument, it belongs in neither ``require`` nor
    ``forbid``. Fields left empty simply skip their check.
    """

    genre_terms: tuple[str, ...] = ()   # any ONE must appear in the style
    require: tuple[str, ...] = ()       # each must appear
    forbid: tuple[str, ...] = ()        # none may appear; each must be tagged
    bpm_range: tuple[int, int] | None = None
    instrumental: bool = True


@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str
    critical: bool = False


@dataclass
class FaithfulnessReport:
    checks: list[CheckResult] = field(default_factory=list)

    @property
    def score(self) -> float:
        """Share of checks passed, 0.0-1.0. Skipped checks are not counted."""
        if not self.checks:
            return 1.0
        return sum(1 for c in self.checks if c.passed) / len(self.checks)

    @property
    def failures(self) -> list[CheckResult]:
        return [c for c in self.checks if not c.passed]

    @property
    def critical_failed(self) -> bool:
        return any(not c.passed and c.critical for c in self.checks)


# ---------------------------------------------------------------------------
# The check
# ---------------------------------------------------------------------------


def check_faithfulness(
    *,
    style: str,
    negative_tags: str,
    intent: BriefIntent,
    salt_phrases: tuple[str, ...] = (),
    style_limit: int = 1000,
) -> FaithfulnessReport:
    """Score one final Suno payload against the brief it came from.

    ``salt_phrases`` are phrases that must never appear (cross-genre filler the
    assembler injects at random — pass ``DYNAMIC_ELEMENTS["vocal_technique"]``).
    """
    report = FaithfulnessReport()
    text = style or ""
    tags = (negative_tags or "").lower()

    # 1. Genre anchor — the single most important token, and the one the
    #    random preset sampling drops today.
    if intent.genre_terms:
        found = [t for t in intent.genre_terms if _find_mentions(text, t)]
        report.checks.append(CheckResult(
            name="genre_anchor",
            passed=bool(found),
            detail=f"found {found}" if found else f"none of {list(intent.genre_terms)} in style",
            critical=True,
        ))

    # 2. Everything the user asked FOR is actually described.
    if intent.require:
        missing = [t for t in intent.require if not _find_mentions(text, t)]
        report.checks.append(CheckResult(
            name="required_present",
            passed=not missing,
            detail="all present" if not missing else f"missing {missing}",
            critical=True,
        ))

    # 3. Nothing the user excluded is described. A negated mention ("no
    #    drums") is fine — it is an exclusion, not an instruction.
    if intent.forbid:
        offenders: list[str] = []
        for term in intent.forbid:
            for word, offset in _find_mentions(text, term):
                if not _is_negated(text, offset):
                    offenders.append(f"{term}→'{word}'")
                    break
        report.checks.append(CheckResult(
            name="forbidden_absent",
            passed=not offenders,
            detail="clean" if not offenders else f"style describes {offenders}",
            critical=True,
        ))

        # 4. …and the exclusion reached Suno's only reliable channel.
        untagged = [t for t in intent.forbid if not any(
            v in tags for v in _terms_for(t)
        )]
        report.checks.append(CheckResult(
            name="forbidden_tagged",
            passed=not untagged,
            detail="all tagged" if not untagged else f"not in negativeTags: {untagged}",
        ))

    # 5. One coherent tempo statement — not the preset's BPM plus the tempo
    #    profile's BPM in the same prompt.
    spans = _bpm_spans(text)
    if spans:
        coherent = all(_overlaps(a, b) for a in spans for b in spans)
        report.checks.append(CheckResult(
            name="bpm_single",
            passed=coherent,
            detail=f"{spans}" if not coherent else f"one statement {spans[0]}",
        ))

    # 6. …and it matches what the user asked for.
    if intent.bpm_range:
        if spans:
            off = [s for s in spans if not _overlaps(s, intent.bpm_range)]
            report.checks.append(CheckResult(
                name="bpm_in_range",
                passed=not off,
                detail=f"asked {intent.bpm_range}, got {spans}",
            ))
        else:
            report.checks.append(CheckResult(
                name="bpm_in_range",
                passed=False,
                detail=f"asked {intent.bpm_range}, style states no BPM",
            ))

    # 7. No cross-genre filler. These phrases are picked at random by the
    #    assembler and are why a techno brief comes back with R&B runs.
    if salt_phrases:
        found_salt = [p for p in salt_phrases if p.lower() in text.lower()]
        report.checks.append(CheckResult(
            name="no_cross_genre_salt",
            passed=not found_salt,
            detail="clean" if not found_salt else f"random filler: {found_salt}",
        ))

    # 8. Instrumental means instrumental — vocal descriptors may only appear
    #    as the explicit "no vocals" directive.
    if intent.instrumental:
        leaks = [
            word for word, offset in _find_mentions(text, "vocals")
            if not _is_negated(text, offset)
        ]
        report.checks.append(CheckResult(
            name="no_vocal_leak",
            passed=not leaks,
            detail="clean" if not leaks else f"vocal descriptors: {sorted(set(leaks))}",
        ))

    # 9. Within Suno's limit — a style that gets hard-cut loses its tail.
    report.checks.append(CheckResult(
        name="length_ok",
        passed=len(text) <= style_limit,
        detail=f"{len(text)} chars (limit {style_limit})",
    ))

    return report


__all__ = [
    "BriefIntent",
    "CheckResult",
    "FaithfulnessReport",
    "check_faithfulness",
    "mentions",
]
