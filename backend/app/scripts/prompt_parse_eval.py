"""Score the brief parser against the corpus annotations (phase 1).

Checks one thing only: does ``BriefParser`` recover what the user actually
said? Nothing here builds a Suno prompt — that is phases 2-3. Keeping the
stages measurable one at a time is the point of this whole rebuild.

    docker run --rm -v /root/backend:/app -w /app \\
        -e OPENROUTER_API_KEY=... -e APIYI_KEY=... \\
        ops-worker:latest python -m app.scripts.prompt_parse_eval

    --fallback   evaluate the regex fallback instead of GPT (free)
    --model M    parser model (default gpt-4o-mini)
    --only X     one brief by slug
    --show       print each parse in full
"""

from __future__ import annotations

import argparse
import asyncio

from app.scripts.prompt_corpus import CORPUS, CorpusBrief
from app.services.brief_parser import BriefParser, ParsedBrief, fallback_parse
from app.services.llm_client import make_chat_client_from_env
from app.services.prompt_faithfulness import mentions


def _invented_exclusions(brief: CorpusBrief, parsed: ParsedBrief) -> list[str]:
    """Exclusions the parser produced that the human annotation does not have.

    Compared against the hand-written ground truth on purpose: the pipeline
    now filters exclusions with ``extract_negative_tags`` itself, so checking
    against that same function would only ever confirm its own output.
    """
    licensed = [*brief.intent.forbid, "vocals"]
    return [f for f in parsed.instruments_forbidden if not _covers(licensed, f)]


def _covers(items: list[str], term: str) -> bool:
    """Does any of ``items`` account for ``term``?

    Matching runs both ways so a family covers its members: a parser that
    excluded "drums" has excluded the kick, and one that named "keys" has
    named the piano. Requiring the exact word would fail the parser for being
    more correct than the annotation.
    """
    return any(mentions(item, term) or mentions(term, item) for item in items)


def _score(brief: CorpusBrief, parsed: ParsedBrief) -> list[tuple[str, bool, str]]:
    """(check, passed, detail) for one parse, against the hand annotation."""
    checks: list[tuple[str, bool, str]] = []
    intent = brief.intent

    if intent.genre_terms:
        haystack = f"{parsed.genre} {parsed.subgenre}"
        hit = [t for t in intent.genre_terms if mentions(haystack, t)]
        checks.append((
            "genre", bool(hit),
            f"got {haystack.strip()!r}" + ("" if hit else f", wanted one of {list(intent.genre_terms)}"),
        ))

    if intent.require:
        missing = [t for t in intent.require if not _covers(parsed.instruments_required, t)]
        checks.append((
            "required", not missing,
            f"got {parsed.instruments_required}" + ("" if not missing else f", missing {missing}"),
        ))

    if intent.forbid:
        missing = [t for t in intent.forbid if not _covers(parsed.instruments_forbidden, t)]
        checks.append((
            "forbidden", not missing,
            f"got {parsed.instruments_forbidden}" + ("" if not missing else f", missing {missing}"),
        ))

    if intent.bpm_range:
        low, high = intent.bpm_range
        got = (parsed.bpm_min, parsed.bpm_max)
        ok = parsed.bpm_min is not None and low <= parsed.bpm_min <= high
        checks.append(("bpm", ok, f"asked {intent.bpm_range}, got {got}"))

    # A parser must not invent. An exclusion is legitimate when the brief
    # states it (in any language — compare against the translated tags, not
    # the raw text) or when the brief makes a closed statement, which licenses
    # excluding every family it did not name.
    invented = _invented_exclusions(brief, parsed)
    checks.append((
        "no_invention", not invented,
        "clean" if not invented else f"excluded without being asked: {invented}",
    ))
    return checks


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fallback", action="store_true", help="evaluate the regex fallback")
    parser.add_argument("--only", default="")
    parser.add_argument("--show", action="store_true")
    parser.add_argument(
        "--model", default="gpt-4o-mini",
        help="parser model; extraction at temperature 0 does not need a flagship",
    )
    args = parser.parse_args()

    brief_parser: BriefParser | None = None
    if not args.fallback:
        client = make_chat_client_from_env()
        print(f"  provider chain: {client.provider_names}")
        brief_parser = BriefParser(client, model=args.model)

    briefs = [b for b in CORPUS if not args.only or b.slug == args.only]
    mode = "regex fallback" if args.fallback else f"parser model {args.model}"
    print(f"\nBrief parser — {mode}, {len(briefs)} brief(s)\n")

    totals: dict[str, list[bool]] = {}
    for brief in briefs:
        params = brief.params
        kwargs = {
            "genre": params.get("genre", ""),
            "mood": params.get("mood", ""),
            "tempo": params.get("tempo", ""),
            "instrumental": brief.gen_type == "instrumental",
        }
        description = params.get("description", "")
        parsed = (
            fallback_parse(description, **kwargs)
            if brief_parser is None
            else await brief_parser.parse(description, **kwargs)
        )

        checks = _score(brief, parsed)
        for name, passed, _ in checks:
            totals.setdefault(name, []).append(passed)
        failed = [f"{n}: {d}" for n, passed, d in checks if not passed]
        mark = "OK  " if not failed else "FAIL"
        print(f"  {mark} {brief.slug:<30} {parsed.locked_summary()[:90]}")
        for line in failed:
            print(f"       ↳ {line}")
        if args.show:
            print(f"       open: {parsed.open}")
            if parsed.notes:
                print(f"       notes: {parsed.notes}")
            if parsed.references:
                print(f"       refs: {parsed.references}")

    print("\n  per-check pass rate")
    for name, results in sorted(totals.items(), key=lambda kv: sum(kv[1]) / len(kv[1])):
        print(f"    {name:<14} {sum(results) / len(results):>5.0%}  ({sum(results)}/{len(results)})")
    flat = [r for results in totals.values() for r in results]
    print(f"\n  OVERALL: {sum(flat) / len(flat):.0%}\n")


if __name__ == "__main__":
    asyncio.run(main())
