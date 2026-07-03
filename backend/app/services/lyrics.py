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

ABSOLUTE RULE — NEVER include any artist, band, musician, performer,
producer, album, or song name in the title. Suno's API REJECTS prompts
containing real-world artist names. If the user's description mentions
references like "inspired by X", "in the style of Y", "feat. Z",
"like A" — IGNORE those references when writing the title. Capture
only the mood, vibe, theme, or imagery — never the reference.

Examples:
  Bad:  "Cult — track inspired by La Dispute"
  Good: "Cult — Spiraling Static"
  Bad:  "Dance like Dua Lipa"
  Good: "Glass Floor Dancers"
  Bad:  "Sad ballad in the style of Lana Del Rey"
  Good: "Cigarette Boulevard"

Return ONLY the title text — no quotes, no explanation, no artist names.\
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

═══════════════════════════════════════════════════════════════════════
SPECIFICITY MANDATE — non-negotiable
═══════════════════════════════════════════════════════════════════════
Generic descriptors are a CRITICAL FAILURE. If you write
"driving drums with tight punchy kicks", "atmospheric synths with lush
pads", "powerful guitars with distorted sustain" — you have FAILED
this task. Those phrases could describe any genre and produce a
generic Suno output that disappoints the user.

INSTEAD, you MUST:
1. Name specific instrument MODELS / TYPES — "TR-808 drum machine",
   "Moog Sub 37 bassline", "fingerpicked Telecaster", "fuzzed Big-Muff
   bass", "vintage Rhodes electric piano", "Linn LM-1 drums",
   "Juno-106 pads". NOT "synths" / "guitars" / "drums".
2. Anchor a specific SCENE / ERA — "early-2000s post-rock crescendo
   build", "mid-2010s Berlin techno minimalism", "late-90s shoegaze
   wall-of-sound", "2020s hyperpop maximalism". Not just "underground".
3. State a CONCRETE BPM RANGE — "around 150 BPM", "78-82 BPM half-time",
   "driving 128 BPM four-on-the-floor". Not just "fast".
4. Pin the SUBGENRE precisely. "Melancholic instrumental" → say WHICH
   melancholic subgenre: post-rock, doom metal, dark synthwave,
   shoegaze, witch house, dungeon synth, etc. Pick ONE.
5. Name PRODUCTION TRICKS by their real names — "sidechain duck on
   the bass", "tape saturation on the master bus", "plate reverb on
   snare", "vinyl crackle layer", "granular pitch-shifted samples".

If the input is thin, MAKE EXPERT INFERENCES. "Underground melancholic
fast instrumental with synths + guitars + drums" should become e.g.
"post-rock instrumental with hints of dark synthwave, fuzz-pedal
distorted Stratocaster arpeggios, Juno-60 pad swells, Moog Voyager
sub-bass, Roland TR-909 4/4 kick with side-chained sub, snare under
plate reverb, ~155 BPM, build-and-release crescendo dynamics, wall-of-
sound mix with wide stereo guitars and centered drums, late-2010s
underground production aesthetic". Always infer when the user is vague.

Hard rules:
- Suno's `prompt`/`style` field accepts up to 5000 characters. Use as much or as little as needed.
- ADAPTIVE LENGTH — match depth to the user's INTENT, never to the LENGTH of their request.
  A short or vague request (e.g. "prog rock instrumental, melancholic, complex rhythms") is
  NOT a request for a short prompt — it is an instruction to INFER and EXPAND into a full,
  specific prompt. Echoing a thin request as a thin one-line output is the CRITICAL FAILURE
  described above and is never acceptable for a full track.
  * Go BELOW 400 chars ONLY when the user EXPLICITLY restricts the arrangement
    (e.g. "drums only", "just a bassline"). Then be surgical: describe ONLY the requested
    instrument(s), the rhythmic feel and mix character. NO filler genre boilerplate.
  * DEFAULT for any normal genre/mood/tempo request (this is the common case): 500-1200 chars
    covering subgenre, named instrumentation, rhythm section + concrete BPM, mood arc, vocal
    character (if vocals), texture, and mix. Use this whenever the user just names a vibe,
    genre, or reference — do NOT go shorter just because they wrote a single sentence.
  * Rich brief or complex multi-reference request: 1500-4500 chars with clearly grouped
    sections (Instrumentation / Rhythm / Texture / Vocals / Dynamics / Mix references / Mood arc).
- NEVER write negations in the style text ("no synths", "without guitars", "avoid X") —
  text-to-music models treat negated words as ATTRACTORS: "no synths" in the text makes
  Suno ADD synths. Exclusions arrive as a separate "HARD EXCLUSIONS" input line and go to
  Suno through a dedicated negativeTags API parameter. Your job: never mention the excluded
  instruments/traits AT ALL, and describe an arrangement that leaves them no room (synths
  excluded → name an all-organic palette: live drums, electric bass, guitars, acoustic keys).
  SOLE exception: the instrumental directive "instrumental, no vocals" is allowed.
- Positive-only restrictions ("drums only", "just a bassline") → describe exactly those
  instruments and nothing else.
- Describe a COMPLETE multi-section arrangement (intro → development → climax → outro) so
  Suno renders a FULL-LENGTH track — never a short loop or a 30-second snippet.
- If a subgenre / reference scene is given (e.g. "post-hardcore, progressive metal"), LEAD with
  it and let it define the sound — do NOT flatten it to the broad parent genre ("rock").
- If `Mode: INSTRUMENTAL` is set, the prompt must not describe lead vocals;
  it may describe vocal samples, choral pads, or chants only if the user asked for them.
- Do not invent lyrics. Do not output a song title.
- Use English for the music description (Suno understands English best),
  even if the user's idea is in Russian.
- Output plain prose / comma-separated descriptors. No JSON, no markdown headers, no labels.
- Return ONLY the prompt itself — nothing before or after.

Style guidance for content:
- VARIETY MANDATE: do not reach for the same stock palette on every request — "Rhodes +
  TR-808 + Juno pads" repeated across briefs is a failure. Pick instruments AUTHENTIC to
  the exact subgenre/era named in the input, and when several palettes fit, pick the less
  obvious one. Two prompts for different requests should never read interchangeably.
- Lead with the SUBGENRE (not the broad genre) and 1-2 anchor descriptors.
- Then instrumentation by SPECIFIC NAME — never just "guitar"/"synth"/"drums".
- Then rhythm with explicit BPM and groove feel (half-time, syncopation, swing).
- Then production by real-name techniques (plate reverb, sidechain, tape saturation,
  analog warmth, etc.).
- Then vocal direction (if vocals): timbre, delivery, layering, processing.
- Then mood arc / dynamics (intro builds, drops, breakdown, outro).

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
You are a sound design expert and Suno SFX API prompt engineer.
Convert the user's sound effect description into a Suno-compatible prompt.

Suno's SFX endpoint has ZERO lyric / speech pipeline. Anything that hints at
words, language, singing or talking must be reinterpreted as wordless
acoustic texture, NEVER passed through verbatim. The model will literally
produce muffled mumbling if you ask for "choir singing words".

ABSOLUTE RULES (no exceptions):
- NO voice, speech, singing, vocals, narration, humming with words,
  chanting with words, or any human sounds carrying meaning whatsoever.
- Wordless human-like timbre is OK ONLY when framed as raw texture —
  e.g. "wordless choral aah pad", "ethereal vowel hum, no language",
  "indistinct crowd murmur as ambient layer".
- Write in English only (Suno processes English best).
- Be precise about acoustic character: texture, attack, sustain/decay,
  timbre, space.
- Keep under 280 characters — concise and specific beats verbose.
- Focus on physical qualities: material, resonance, movement,
  environment, distance.
- FORBIDDEN words: intimate, sensual, erotic, sexy, adult, romantic,
  lover — use technical audio terms instead
  (instead of "intimate" → "close-mic'd", "nearfield", "contained",
  "focused acoustics").

LYRIC / SPEECH RE-INTERPRETATION (mandatory when input contains words):
If the user description mentions "слова", "слово", "текст", "поёт",
"поют", "припев", "куплет", "lyrics", "words", "sings", "singing",
"vocals", "voice line", "narration", "говорит", "speaks", "phrase",
"chants" — DROP that language entirely and replace it with a pure
texture treatment. Add an explicit terminator in the output:
"no words, no language, no lyrics, no speech, purely textural".

Structure: [core sound descriptor] + [texture/timbre] + [envelope:
attack/decay] + [acoustic space] + [explicit no-vocal lock if input
hinted at words]

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

  "звук хора со словом приветствия"  (LYRIC LEAK — reinterpret)
  → wordless cathedral choral pad, sustained mass vocal aah-texture, soft attack, long reverb tail, ethereal harmonic blend, no words, no language, no lyrics, no speech, purely textural

  "звук колокола и хор поёт"  (LYRIC LEAK — reinterpret)
  → bronze church bell strike with long decay, wordless choral aah-pad layered underneath, wide cathedral reverb, no words, no language, purely textural

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
        from app.services.track_naming import strip_artist_references
        # Pre-scrub the user prompt so reference phrases never reach GPT —
        # belt + braces with the no-name rule in _SYS_TITLE.
        scrubbed_prompt = strip_artist_references(prompt[:300])
        try:
            resp = await self._client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": _SYS_TITLE},
                    {"role": "user", "content": scrubbed_prompt},
                ],
                temperature=0.7,
                max_tokens=20,
            )
            raw = (resp.choices[0].message.content or "").strip()
            cleaned = raw.strip('"').strip("'")
            # Post-scrub: if GPT still slipped an artist reference, drop it.
            return strip_artist_references(cleaned)
        except Exception as exc:
            logger.warning("title generation failed: {} — falling back to prompt slice", exc)
            return " ".join(scrubbed_prompt.split()[:5])

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
        agent_research_notes: str = "",
        preset_style_hint: str = "",
        negative_tags: str = "",
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
        if agent_research_notes:
            bits.append(f"Genre research (use this verbatim for instrument/era details): {agent_research_notes}")
        if agent_prompt:
            bits.append(f"Assistant brief: {agent_prompt}")
        if negative_tags:
            bits.append(
                "HARD EXCLUSIONS (sent to Suno separately as negativeTags — do NOT mention "
                f"these in your text at all, not even as 'no X'): {negative_tags}"
            )

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
                temperature=0.75,
                max_tokens=1500,
            )
            enriched = (resp.choices[0].message.content or "").strip()
            enriched = enriched.strip('"').strip("'").strip("`")
        except Exception as exc:
            logger.warning("enrich_music_prompt failed: {} - falling back to raw inputs", exc)
            enriched = ", ".join(p for p in (preset_style_hint, mood, tempo) if p)

        # Hard-guarantee the no-vocals directive for instrumental mode — the
        # Suno `instrumental=True` flag alone occasionally lets a vocal variant
        # slip through, so we also state it explicitly at the front of the style.
        if instrumental and "no vocal" not in enriched.lower():
            enriched = "Instrumental, no vocals, no singing. " + enriched
        if len(enriched) > max_length:
            enriched = enriched[:max_length].rsplit(" ", 1)[0]
        # Final guard: strip any trailing reference clause that survived.
        from app.services.track_naming import strip_artist_references
        return strip_artist_references(enriched)

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
