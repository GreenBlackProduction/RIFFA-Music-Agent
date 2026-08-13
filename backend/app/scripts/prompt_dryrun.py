"""Dry-run either prompt pipeline over the eval corpus — no Suno call, no cost.

Scores each brief in ``prompt_corpus`` with ``prompt_faithfulness`` against
its HAND annotation, so a run can disagree with the pipeline's own reading of
the brief.

    --pipeline old   the shipped worker path: preset assembler + GPT enricher
    --pipeline new   the rebuild: parse → fill gaps → compose → validate

Usage (inside the worker image, repo bind-mounted):

    docker run --rm --user root -v /root/backend:/app -v /some/out:/out -w /app \\
        -e OPENROUTER_API_KEY=... -e APIYI_KEY=... \\
        ops-worker:latest python -m app.scripts.prompt_dryrun \\
            --pipeline new --runs 1 --json /out/r.json

(``--user root`` is only needed when writing --json to a bind-mounted dir.)

    --no-gpt         no LLM at all (free) — assembler only / regex parse only
    --no-compose     pipeline=new: stop after stage 2, render deterministically
    --seed N         fix the old assembler's RNG so runs are comparable
    --only X         one brief by slug
    --show X         print the full payload for one brief

``--pipeline old`` mirrors the ORDER of ``app/tasks/__init__.py`` and has to be
re-checked when the worker changes. ``--pipeline new`` calls the shipped entry
point (``prompt_pipeline.build_suno_prompt``) directly, so what is measured is
exactly what runs.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import statistics
from dataclasses import dataclass
from typing import Any

from app.scripts.prompt_corpus import CORPUS, CorpusBrief
from app.services.genre_data import DYNAMIC_ELEMENTS
from app.services.llm_client import make_chat_client_from_env
from app.services.lyrics import LyricsClient
from app.services.prompt_engineering import (
    SongParams,
    build_suno_style,
    cap_style_len,
    extract_negatives,
)
from app.services.prompt_faithfulness import FaithfulnessReport, check_faithfulness
from app.services.prompt_pipeline import build_suno_prompt
from app.services.suno import _strip_artist_names
from app.services.track_naming import strip_inline_artist_clause
from app.tasks import _ensure_rich_style, _merge_negative_tags, _style_head_text

# Random cross-genre filler the assembler injects — vocal techniques are the
# clearest tell (an instrumental brief has no business mentioning any of them).
_SALT_PHRASES: tuple[str, ...] = tuple(DYNAMIC_ELEMENTS["vocal_technique"])

# Any user id works — anti-repeat state is in-memory and per-process. Using a
# fixed one keeps the dry-run on the same code path as the worker.
_DRYRUN_USER_ID = 1


@dataclass
class RunResult:
    slug: str
    style: str
    negative_tags: str
    style_weight: float
    weirdness: float
    used_preset: bool
    report: FaithfulnessReport
    source: str = "old-pipeline"


async def _run_once(
    brief: CorpusBrief, client: LyricsClient | None, seed: int | None = None
) -> RunResult:
    """Reproduce the worker's instrumental branch for one brief."""
    params: dict[str, Any] = brief.params
    agent_mp: dict[str, Any] = params.get("agent_music_params") or {}
    agent_research = params.get("agent_research_notes", "")
    agent_prompt_text = params.get("agent_prompt", "")

    song_params = SongParams(
        user_description=params.get("description", ""),
        genre=agent_mp.get("genre") or params.get("genre", ""),
        custom_genre=agent_mp.get("custom_genre") or params.get("custom_genre", ""),
        subgenre=agent_mp.get("subgenre", ""),
        mood=agent_mp.get("mood") or params.get("mood", ""),
        tempo=agent_mp.get("tempo") or params.get("tempo", ""),
        vocal="no_vocal",
        era=agent_mp.get("era", ""),
        techniques=agent_mp.get("techniques", []),
        key_instruments=agent_mp.get("key_instruments", []),
        constraints=agent_mp.get("constraints", ""),
        suggested_bpm=agent_mp.get("suggested_bpm", ""),
        negative_tags=agent_mp.get("negative_tags") or [],
        style_prompt=_style_head_text(agent_research, agent_prompt_text),
    )

    preset_style, weight, constraint, negative_tags = build_suno_style(
        song_params,
        rng=random.Random(seed) if seed is not None else None,
        user_id=_DRYRUN_USER_ID,
        learned_presets={},
    )

    if client is not None:
        enriched = await client.enrich_music_prompt(
            user_description=params.get("description", ""),
            genre=song_params.genre,
            custom_genre=song_params.custom_genre,
            mood=song_params.mood,
            tempo=song_params.tempo,
            vocal="",
            instrumental=True,
            approved_lyrics="",
            agent_prompt=agent_prompt_text,
            preset_style_hint=preset_style,
            negative_tags=negative_tags,
        )
    else:
        enriched = ""

    # Which text actually won: the GPT prompt, or the deterministic preset the
    # length gate falls back to? Yesterday's production payloads show the
    # preset winning often, and that is the mode that scores worst.
    chosen = _ensure_rich_style(enriched, preset_style)
    used_preset = chosen == preset_style
    style = cap_style_len(chosen)
    style, leaked = extract_negatives(style, keep_vocal_text=True)
    negative_tags = _merge_negative_tags(negative_tags, leaked)
    style = strip_inline_artist_clause(style)

    # suno.py applies these last, on the way out.
    style = _strip_artist_names(style)[:1000]
    negative_tags = negative_tags[:200]

    report = check_faithfulness(
        style=style,
        negative_tags=negative_tags,
        intent=brief.intent,
        salt_phrases=_SALT_PHRASES,
    )
    return RunResult(
        slug=brief.slug,
        style=style,
        negative_tags=negative_tags,
        style_weight=weight,
        weirdness=constraint,
        used_preset=used_preset,
        report=report,
    )


async def _run_new_once(
    brief: CorpusBrief,
    chat_client: Any | None,
    parser_model: str,
    composer_model: str,
    compose: bool,
) -> RunResult:
    """The rebuilt pipeline: parse → fill gaps → render (stages 1-2).

    Stage 3 (the GPT composer) does not exist yet, so this renders the spec
    deterministically. No randomness anywhere — one run is the whole story.
    """
    params: dict[str, Any] = brief.params
    description = params.get("description", "")
    kwargs = {
        "genre": params.get("genre", ""),
        "mood": params.get("mood", ""),
        "tempo": params.get("tempo", ""),
        "instrumental": brief.gen_type == "instrumental",
    }
    result = await build_suno_prompt(
        description=description,
        chat_client=chat_client,
        parser_model=parser_model,
        composer_model=composer_model,
        compose=compose,
        **kwargs,
    )
    # Scored against the HAND annotation here, not against the parser's own
    # reading — the in-pipeline check uses the latter, and a corpus run has to
    # be able to disagree with it.
    report = check_faithfulness(
        style=result.style,
        negative_tags=result.negative_tags,
        intent=brief.intent,
        salt_phrases=_SALT_PHRASES,
    )
    return RunResult(
        slug=brief.slug,
        style=result.style,
        negative_tags=result.negative_tags,
        style_weight=result.style_weight,
        weirdness=result.weirdness,
        used_preset=result.source == "deterministic",
        report=report,
        source=result.source,
    )


def _print_brief_row(slug: str, runs: list[RunResult]) -> None:
    scores = [r.report.score for r in runs]
    mean = statistics.mean(scores)
    spread = f"{min(scores):.0%}-{max(scores):.0%}" if len(scores) > 1 else ""
    failed: dict[str, int] = {}
    for run in runs:
        for check in run.report.failures:
            failed[check.name] = failed.get(check.name, 0) + 1
    marks = ", ".join(
        f"{name} ({count}/{len(runs)})" if count < len(runs) else name
        for name, count in sorted(failed.items())
    )
    print(f"  {slug:<30} {mean:>5.0%}  {spread:<9} {marks or 'all checks passed'}")


def _print_details(runs: list[RunResult]) -> None:
    run = runs[0]
    print(f"\n─── {run.slug} ───")
    print(f"styleWeight={run.style_weight}  weirdness={run.weirdness}")
    print(f"negativeTags: {run.negative_tags or '(none)'}")
    print(f"style ({len(run.style)} chars):\n{run.style}\n")
    for check in run.report.checks:
        mark = "OK  " if check.passed else "FAIL"
        crit = " [critical]" if check.critical and not check.passed else ""
        print(f"  {mark} {check.name}{crit}: {check.detail}")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=int, default=3, help="runs per brief (default 3)")
    parser.add_argument("--no-gpt", action="store_true", help="skip the GPT enricher")
    parser.add_argument("--only", default="", help="run a single brief by slug")
    parser.add_argument(
        "--pipeline",
        choices=("old", "new"),
        default="old",
        help="'old' = the shipped worker path; 'new' = parse → fill gaps → render",
    )
    parser.add_argument("--show", default="", help="print the full payload for one slug")
    parser.add_argument("--json", default="", help="write the raw report to this path")
    parser.add_argument(
        "--composer-model", default="gpt-4o",
        help="model for stage 3 (pipeline=new)",
    )
    parser.add_argument(
        "--no-compose", action="store_true",
        help="pipeline=new: stop after stage 2 and render deterministically",
    )
    parser.add_argument(
        "--parser-model", default="gpt-4o-mini",
        help="model for stage 1 (pipeline=new); extraction needs no flagship",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="fix the assembler's RNG (run N uses seed+N) so before/after runs "
             "are comparable; without it the same brief swings by tens of points",
    )
    args = parser.parse_args()

    client: LyricsClient | None = None
    chat_client = None
    if not args.no_gpt:
        chat_client = make_chat_client_from_env()
        print(f"  provider chain: {chat_client.provider_names}")
        client = LyricsClient(client=chat_client)

    briefs = [b for b in CORPUS if not args.only or b.slug == args.only]
    if not briefs:
        raise SystemExit(f"no brief matching slug {args.only!r}")

    mode = f"pipeline={args.pipeline}, " + ("no GPT" if args.no_gpt else "with GPT")
    print(f"\nDry-run — {mode}, {args.runs} run(s) × {len(briefs)} brief(s)\n")
    print(f"  {'brief':<30} {'score':>5}  {'spread':<9} failed checks")
    print(f"  {'-' * 30} {'-' * 5}  {'-' * 9} {'-' * 40}")

    all_runs: dict[str, list[RunResult]] = {}
    for brief in briefs:
        if args.pipeline == "new":
            runs = [
                await _run_new_once(
                    brief, chat_client, args.parser_model,
                    args.composer_model, not args.no_compose,
                )
                for _ in range(args.runs)
            ]
        else:
            runs = [
                await _run_once(brief, client, None if args.seed is None else args.seed + i)
                for i in range(args.runs)
            ]
        all_runs[brief.slug] = runs
        _print_brief_row(brief.slug, runs)

    flat = [r for runs in all_runs.values() for r in runs]
    print(f"\n  MEAN FAITHFULNESS: {statistics.mean(r.report.score for r in flat):.0%}")
    critical = sum(1 for r in flat if r.report.critical_failed)
    print(f"  runs with a critical failure: {critical}/{len(flat)}")

    if args.pipeline == "new":
        by_source: dict[str, int] = {}
        for run in flat:
            by_source[run.source] = by_source.get(run.source, 0) + 1
        print("  stage-3 outcome: " + ", ".join(f"{k}={v}" for k, v in sorted(by_source.items())))

    fell_back = [r for r in flat if r.used_preset]
    if not args.no_gpt and args.pipeline == "old":
        kept = [r for r in flat if not r.used_preset]
        print(f"  GPT prompt discarded by the length gate: {len(fell_back)}/{len(flat)}")
        for label, group in (("gpt prompt", kept), ("preset fallback", fell_back)):
            if group:
                mean = statistics.mean(r.report.score for r in group)
                print(f"    {label:<18} {mean:.0%} mean over {len(group)} run(s)")

    per_check: dict[str, list[bool]] = {}
    for run in flat:
        for check in run.report.checks:
            per_check.setdefault(check.name, []).append(check.passed)
    print("\n  per-check pass rate")
    for name, results in sorted(per_check.items(), key=lambda kv: sum(kv[1]) / len(kv[1])):
        rate = sum(results) / len(results)
        print(f"    {name:<24} {rate:>5.0%}  ({sum(results)}/{len(results)})")

    if args.show:
        _print_details(all_runs[args.show])

    if args.json:
        payload = {
            slug: [
                {
                    "style": r.style,
                    "negative_tags": r.negative_tags,
                    "style_weight": r.style_weight,
                    "weirdness": r.weirdness,
                    "score": r.report.score,
                    "failures": [
                        {"name": c.name, "detail": c.detail, "critical": c.critical}
                        for c in r.report.failures
                    ],
                }
                for r in runs
            ]
            for slug, runs in all_runs.items()
        }
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
        print(f"\n  raw report → {args.json}")


if __name__ == "__main__":
    asyncio.run(main())
