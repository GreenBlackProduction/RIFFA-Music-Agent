"""One-off probe: does Perplexity (Sonar) return a usable musical brief for an
artist/track reference? STANDALONE — does NOT touch the live agent.

Run inside the backend container (it already has the `openai` package):
    docker cp /tmp/perplexity_probe.py ops-backend-1:/tmp/probe.py
    docker exec -e PERPLEXITY_API_KEY=<key> ops-backend-1 \
        python /tmp/probe.py "Failed Artist" "Daft Punk" "Burial"

Env:
    PERPLEXITY_API_KEY   required
    PPLX_MODEL           optional, default "sonar-pro" (try "sonar" for cheaper)
"""
import asyncio
import os
import sys
import time

from openai import AsyncOpenAI

BASE_URL = os.getenv("PPLX_BASE_URL", "https://api.perplexity.ai")
MODEL = os.getenv("PPLX_MODEL", "sonar-pro")
ARTISTS = sys.argv[1:] or ["Daft Punk", "Burial", "Boards of Canada"]

# Ask for exactly what our prompt-engineer needs to brief Suno — plus an explicit
# confidence / disambiguation signal (the cure for the "random match" bug).
RESEARCH = (
    "You are a music researcher. Search the web for the artist/track reference below and "
    "return ONLY raw JSON, no markdown, with these keys:\n"
    '{"matched": "<who you think it is and why>", "confidence": <0.0-1.0>, '
    '"ambiguous": <true if the name could be several different artists>, '
    '"genre": "", "subgenres": [], "era": "<e.g. 2010s>", "bpm_range": "", '
    '"mood": [], "key_instruments": [], "production_style": "", '
    '"similar_artists": [], "note": "<if you are NOT sure which artist, say so plainly>"}\n'
    "If you cannot reliably identify the artist, set confidence low and ambiguous true. "
    "Reference: "
)


async def probe(client: AsyncOpenAI, artist: str) -> None:
    t0 = time.perf_counter()
    resp = await client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": RESEARCH + artist}],
        temperature=0.2,
        max_tokens=800,
    )
    dt = time.perf_counter() - t0
    content = (resp.choices[0].message.content or "").strip()
    dump = resp.model_dump()
    citations = dump.get("citations") or dump.get("search_results") or []
    usage = dump.get("usage") or {}

    print(f"\n===== {artist}  [{MODEL}]  {dt:.1f}s  tokens={usage.get('total_tokens', '?')} =====")
    print(content)
    if citations:
        print("--- sources ---")
        for c in citations[:6]:
            print("  ", c if isinstance(c, str) else c.get("url") or c)


async def main() -> None:
    key = os.getenv("PERPLEXITY_API_KEY") or os.getenv("OPENROUTER_API_KEY")
    if not key:
        sys.exit("ERROR: set PERPLEXITY_API_KEY or OPENROUTER_API_KEY")
    client = AsyncOpenAI(api_key=key, base_url=BASE_URL)
    print(f"[probe] base_url={BASE_URL} model={MODEL}")
    for artist in ARTISTS:
        try:
            await probe(client, artist)
        except Exception as exc:  # noqa: BLE001 — probe, surface anything
            print(f"\n===== {artist}: ERROR {exc!r}")


if __name__ == "__main__":
    asyncio.run(main())
