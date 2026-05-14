"""Lyrics and title generation via OpenAI API (proxied through apiyi.com)."""

from typing import Any

from loguru import logger
from openai import AsyncOpenAI

_SYS_LYRICS = """\
You are a professional songwriter. Generate lyrics based on the user's description.
Return only the lyrics — use [Verse], [Chorus], [Bridge] section labels.
Stay under 5000 characters. Write in the same language as the prompt unless instructed otherwise.\
"""

_SYS_TITLE = """\
Create a short, catchy song title (2-5 words) based on the user's description.
Return ONLY the title text — no quotes, no explanation.\
"""

_SYS_COMPRESS = """\
You are a prompt optimizer for Suno AI. Compress the song description to max {max_length} characters
while preserving all key themes, emotions, style, and atmosphere.
Return ONLY the compressed text.\
"""

_SYS_ENRICH_MUSIC = """\
You are a senior prompt engineer for Suno's Music Generation API (V5.5).
Your job: take the user's request + the music parameters they selected (genre, mood, tempo, vocal,
optional approved lyrics, optional assistant brief) and produce ONE Suno-ready music style prompt.

Hard rules:
- Suno's `prompt`/`style` field accepts up to 5000 characters. Use as much or as little as needed.
- ADAPTIVE LENGTH — match the prompt's depth to the user's intent:
  * Tight, focused request (e.g. "juicy drum groove only, no other instruments, no vocals"):
    150-400 chars. Be surgical: name the instrument(s), forbid everything not requested,
    state the rhythmic feel, mix character. NO filler genre boilerplate.
  * Standard song request: 400-1200 chars covering instrumentation, rhythm section,
    mood arc, vocal character (if vocals), texture, mix.
  * Rich brief or complex multi-reference request: 1500-4500 chars with clearly grouped
    sections (Instrumentation / Rhythm / Texture / Vocals / Dynamics / Mix references / Mood arc).
- Respect explicit exclusions: if the user says "no vocals", "drums only", "no synths",
  state these as hard constraints in the prompt ("instrumental", "no synths", "no vocals", etc.).
- If `Mode: INSTRUMENTAL` is set, the prompt must not describe lead vocals;
  it may describe vocal samples, choral pads, or chants only if the user asked for them.
- Do not invent lyrics. Do not output a song title.
- Use English for the music description (Suno understands English best),
  even if the user's idea is in Russian.
- Output plain prose / comma-separated descriptors. No JSON, no markdown headers, no labels.
- Return ONLY the prompt itself — nothing before or after.

Style guidance for content:
- Lead with the genre/sub-genre and 1-2 anchor descriptors.
- Then instrumentation (specific instruments, not just "guitar" — e.g. "fingerpicked nylon-string
  acoustic guitar", "808 sub bass with sliding glides", "vintage Rhodes electric piano").
- Then rhythm (groove, tempo feel, swing, syncopation, BPM range if relevant).
- Then texture / production (analog warmth, lo-fi tape hiss, wide stereo, dry close-mic'd, etc.).
- Then vocal direction (if vocals): timbre, delivery, layering, processing.
- Then mood arc / dynamics (intro builds, drops, breakdown, outro).
- Mention BPM only if user signalled tempo intent.

⚠️  CRITICAL — NEVER USE ARTIST OR BAND NAMES IN THE OUTPUT:
Suno's API REJECTS prompts containing specific artist, band, or musician names.
If the user or assistant brief mentions an artist as a reference, translate their
musical identity into DESCRIPTIVE CHARACTERISTICS only. Never output names.

Translation examples (use these patterns):
  "Dua Lipa" →
    polished commercial dance-pop, breathy soprano female vocals with melismatic runs
    and smooth falsetto, four-on-the-floor kick, deep synth bass, bright punchy drums,
    glossy radio-ready production
  "Billie Eilish" →
    dark minimalist pop, intimate whispered female vocals close-mic'd with light breath,
    sparse subby 808 bass, subtle trap hi-hats, eerie atmospheric pads, melancholic mood
  "The Weeknd" →
    dark cinematic R&B, falsetto male vocals with vibrato and soul runs, 80s synthwave
    influences, lush pads, reverb-heavy production, moody and atmospheric
  "Metallica" →
    thrash heavy metal, distorted down-tuned electric guitars with palm muting,
    thundering double-kick drums, aggressive male chest vocals, tight rhythmic riffing
  "Kendrick Lamar" →
    conscious West Coast hip-hop, intricate rapid-fire male rap flow with melodic hooks,
    jazzy samples, crisp snares, layered bass, cinematic orchestration
  "Taylor Swift (pop era)" →
    polished country-pop crossover, clear bright female vocals with emotional delivery,
    acoustic guitar mixed with synths, anthemic chorus, driving drum production

When no artist is mentioned — just describe style directly.
Return ONLY the prompt text — no names, no quotes, no labels.\
"""

_SYS_ENRICH_SFX = """\
You are a sound design expert and Suno AI prompt engineer specializing in sound effects.
Convert the user's sound effect description into a Suno-compatible prompt.

ABSOLUTE RULES:
- NO voice, speech, singing, vocals, narration, humming, chanting or any human sounds whatsoever
- Write in English only (Suno processes English best)
- Be precise about acoustic character: texture, attack, sustain/decay, timbre, space
- Keep under 280 characters — concise and specific beats verbose
- Focus on physical qualities: material, resonance, movement, environment, distance
- FORBIDDEN words: intimate, sensual, erotic, sexy, adult, romantic, lover — use technical audio terms instead
  (instead of "intimate" → use "close-mic'd", "nearfield", "contained", "focused acoustics")

Structure: [core sound descriptor] + [texture/timbre] + [envelope: attack/decay] + [acoustic space]

Examples:
  "приятный звук уведомления один звук с плавным окончанием"
  → soft chime, single clear bell-like tone, warm metallic ring, smooth gentle fade-out, clean and pleasant, nearfield recording

  "звук молнии"
  → sharp electrical crack, explosive thunderclap, crackling energy discharge, deep atmospheric rumble, wide stereo

  "звук уведомления мессенджера"
  → crisp digital notification ping, bright synthetic tone, short clean attack, instant smooth decay, modern UI sound

  "звук тибетской поющей чаши"
  → Tibetan singing bowl, pure resonant metallic hum, soft mallet strike, long sustain with harmonic overtones, meditative tone, small dry room

  "атмосферный звук леса"
  → rustling leaves in gentle breeze, distant birdsong, soft wind through trees, natural ambient texture, open outdoor space

Return ONLY the English sound description — no quotes, no explanations.\
"""

_SYS_ENRICH_LYRICS = """\
You are a prompt engineer for Suno's Lyrics Generation API.
Suno hard-caps the prompt at 200 characters, so you MUST stay under 200 — every word must earn its space.

Goal: take the user's raw idea + selected music parameters, understand their intent,
and pack maximum context into a single dense, natural-language prompt for Suno.

Adaptive length:
- Trivial topic (e.g. "summer at the sea"): 40-100 chars is enough.
- Rich brief (multiple references / emotions / scene details / agent_brief): use the full 200 chars.
- Never pad with filler words — density beats length.

Composition rules:
- Output language must match the user's requested language (default Russian).
- Lead with the topic/scene, then mood, then 1-2 vivid imagery cues from the user's idea.
- Fold genre/tempo/vocal hints in only when they shape the lyrical voice
  (rap → punchy bars; ballad → tender narrative; folk → storytelling).
- Do NOT list raw "genre: ..." or "mood: ..." key-value pairs — the prompt must read like prose.
- No JSON, no markdown, no quotes, no labels, no section headers.
- Return ONLY the prompt text, nothing else.\
"""


class LyricsClient:
    def __init__(self, api_key: str, base_url: str = "https://api.apiyi.com/v1") -> None:
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def generate_lyrics(self, prompt: str, style_hint: str = "") -> str:
        user_msg = f"{prompt}\nStyle: {style_hint}" if style_hint else prompt
        try:
            resp = await self._client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": _SYS_LYRICS},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.85,
                max_tokens=1500,
            )
            return (resp.choices[0].message.content or "").strip()
        except Exception as exc:
            logger.error("lyrics generation failed: {}", exc)
            raise

    async def generate_title(self, prompt: str) -> str:
        try:
            resp = await self._client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": _SYS_TITLE},
                    {"role": "user", "content": prompt[:300]},
                ],
                temperature=0.7,
                max_tokens=20,
            )
            raw = (resp.choices[0].message.content or "").strip()
            return raw.strip('"').strip("'")
        except Exception as exc:
            logger.warning("title generation failed: {} — falling back to prompt slice", exc)
            return " ".join(prompt.split()[:5])

    async def enrich_music_prompt(
        self,
        *,
        user_description: str,
        genre: str = "",
        custom_genre: str = "",
        mood: str = "",
        tempo: str = "",
        vocal: str = "",
        instrumental: bool = False,
        approved_lyrics: str = "",
        agent_prompt: str = "",
        preset_style_hint: str = "",
        max_length: int = 5000,
    ) -> str:
        """Adaptive Suno music-style prompt builder.

        Short user request → tight focused prompt (e.g. drums-only, no vocals).
        Rich brief → detailed multi-section prompt up to 5000 chars covering
        instrumentation, texture, dynamics, mix, references.

        GPT here is purely a prompt engineer — it never invents lyrics or song titles."""
        bits: list[str] = []
        if user_description:
            bits.append(f"User request: {user_description}")
        chosen_genre = custom_genre or genre
        if chosen_genre:
            bits.append(f"Genre: {chosen_genre}")
        if mood:
            bits.append(f"Mood: {mood}")
        if tempo:
            bits.append(f"Tempo: {tempo}")
        if vocal:
            bits.append(f"Vocal preference: {vocal}")
        if instrumental:
            bits.append("Mode: INSTRUMENTAL — explicitly forbid vocals.")
        if preset_style_hint:
            bits.append(f"Curated genre keywords: {preset_style_hint}")
        if approved_lyrics:
            # Lyrics shouldn't be repeated wholesale into the style prompt — just signal voice.
            head = approved_lyrics.strip().splitlines()[:4]
            preview = " / ".join(line.strip() for line in head if line.strip())
            if preview:
                bits.append(f"Lyrics opening lines (for vocal phrasing reference): {preview}")
        if agent_prompt:
            bits.append(f"Assistant brief: {agent_prompt}")

        if not bits:
            return ""

        user_msg = "\n".join(bits)

        try:
            resp = await self._client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": _SYS_ENRICH_MUSIC},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.55,
                max_tokens=1500,
            )
            enriched = (resp.choices[0].message.content or "").strip()
            enriched = enriched.strip('"').strip("'").strip("`")
        except Exception as exc:
            logger.warning("enrich_music_prompt failed: {} - falling back to raw inputs", exc)
            enriched = ", ".join(p for p in (preset_style_hint, mood, tempo) if p)

        if len(enriched) > max_length:
            enriched = enriched[:max_length].rsplit(" ", 1)[0]
        return enriched

    async def enrich_lyrics_prompt(
        self,
        *,
        topic: str,
        genre: str = "",
        mood: str = "",
        tempo: str = "",
        vocal: str = "",
        language: str = "ru",
        agent_prompt: str = "",
    ) -> str:
        """Turn the user's raw idea + selected parameters into a single compact prompt
        that we feed to Suno's `/lyrics` endpoint. GPT here acts purely as a prompt engineer,
        not a lyricist — Suno generates the actual text."""
        # Build a structured user message GPT can consume.
        lines: list[str] = [f"Topic: {topic}"]
        if language:
            lines.append(f"Language: {language}")
        if genre:
            lines.append(f"Genre: {genre}")
        if mood:
            lines.append(f"Mood: {mood}")
        if tempo:
            lines.append(f"Tempo: {tempo}")
        if vocal:
            lines.append(f"Vocal: {vocal}")
        if agent_prompt:
            lines.append(f"Agent brief: {agent_prompt}")
        user_msg = "\n".join(lines)

        try:
            resp = await self._client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": _SYS_ENRICH_LYRICS},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.5,
                max_tokens=120,
            )
            enriched = (resp.choices[0].message.content or "").strip().strip('"').strip("'")
        except Exception as exc:
            logger.warning("enrich_lyrics_prompt failed: {} — falling back to raw topic", exc)
            enriched = topic

        # Suno's /lyrics prompt is capped — keep it tight and word-aware.
        if len(enriched) > 200:
            enriched = enriched[:200].rsplit(" ", 1)[0]
        return enriched or topic[:200]

    async def enrich_sfx_prompt(self, description: str) -> str:
        """Translate and sharpen a sound-effect description for Suno.

        Ensures English output, removes any vocal/speech elements, and describes
        acoustic properties precisely. Falls back to the raw description on error."""
        try:
            resp = await self._client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": _SYS_ENRICH_SFX},
                    {"role": "user", "content": description},
                ],
                temperature=0.35,
                max_tokens=100,
            )
            enriched = (resp.choices[0].message.content or "").strip().strip('"').strip("'")
        except Exception as exc:
            logger.warning("enrich_sfx_prompt failed: {} — using raw description", exc)
            return description

        if len(enriched) > 280:
            enriched = enriched[:280].rsplit(" ", 1)[0]
        return enriched or description

    async def compress_prompt(self, prompt: str, max_length: int = 180) -> str:
        if len(prompt) <= max_length:
            return prompt
        try:
            resp = await self._client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": _SYS_COMPRESS.format(max_length=max_length),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=150,
            )
            compressed = (resp.choices[0].message.content or "").strip()
            if len(compressed) > max_length:
                compressed = compressed[:max_length].rsplit(" ", 1)[0]
            return compressed
        except Exception as exc:
            logger.warning("compress_prompt failed: {} — truncating", exc)
            return prompt[:max_length].rsplit(" ", 1)[0]


def make_lyrics_client(settings: Any) -> LyricsClient:
    key = settings.apiyi_key or settings.openai_api_key
    return LyricsClient(api_key=key, base_url=settings.openai_base_url)
