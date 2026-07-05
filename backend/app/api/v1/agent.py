"""Conversational prompt-engineer assistant.

The frontend's AgentChat sends the rolling chat history; GPT-4o either asks the next
clarifying question (when the brief is still thin) or returns a final structured brief
ready to feed into the Suno music generation pipeline.

When the agent decides it has enough context (`done=true`), it ALSO determines the
user's INTENT — which RIFFA module should be launched (song / instrumental / occasion /
sound_effect / cover_song / cover_art) and what module-specific parameters can be
pre-filled. The frontend uses this to skip the manual builder and go straight to
generation.

Stateless on the backend — the frontend keeps the `messages[]` list and replays it on each
turn. We don't persist anything: the chat state is only useful for the duration of a single
song-prompt-building session.
"""

import asyncio
import json
import re
from collections import Counter
from time import perf_counter
from typing import Annotated, Any, Literal

from collections.abc import AsyncIterator

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status

from app.core.limiter import limiter
from fastapi.responses import StreamingResponse
from loguru import logger
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.deps import current_user, db_session
from app.db.models import Generation, GenerationStatus, GenerationType, User
from app.services.genre_canonical import canonical_genre
from app.services.mood_canonical import canonical_mood
from app.services.track_reference import detect_reference_url, resolve_reference

router = APIRouter(prefix="/agent", tags=["agent"])


# Bumped whenever the system prompt or coercion semantics change in a way
# that meaningfully alters output quality. Saved into generation.params at
# launch so we can A/B test prompt revisions and correlate user rating
# back to a specific version.
AGENT_PROMPT_VERSION = "v3.1"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


ModuleKind = Literal[
    "song", "instrumental", "cover_song", "sound_effect", "occasion", "cover_art"
]


class ChatMessage(BaseModel):
    role: Literal["agent", "user"]
    content: str = Field(min_length=1, max_length=4000)


class AgentChatRequest(BaseModel):
    module: ModuleKind = "song"
    # The cap is generous — a long chat shouldn't 422. We slide a window of the
    # last 40 turns into GPT below to keep context tight without rejecting
    # legitimate sessions.
    messages: list[ChatMessage] = Field(default_factory=list, max_length=200)
    # Optional context the user has already picked in the UI — helps the agent
    # avoid asking redundant questions.
    selected_genre: str = Field(default="", max_length=64)
    selected_mood: str = Field(default="", max_length=32)
    selected_tempo: str = Field(default="", max_length=32)
    selected_vocal: str = Field(default="", max_length=32)
    # UI language forwarded from the frontend so the agent can lock its reply
    # language without relying solely on message content detection.
    lang: str = Field(default="ru", max_length=8)


class AgentIntentParams(BaseModel):
    """Module-specific parameters extracted by the agent.

    All fields are optional strings — the frontend / backend tolerate empty values and
    fall back to sensible defaults. The set of fields covers every module so a single
    schema can carry intent for any of them.
    """

    description: str = ""
    text_mode: Literal["ai", "custom", "none"] = "ai"
    lyrics: str = ""
    genre: str = ""
    custom_genre: str = ""
    mood: str = ""
    tempo: str = ""
    vocal: str = ""
    occasion_type: str = ""


class AgentIntent(BaseModel):
    module: ModuleKind = "song"
    confidence: Literal["high", "medium", "low"] = "medium"
    params: AgentIntentParams = Field(default_factory=AgentIntentParams)
    note: str = ""  # Short Russian explanation shown next to the launch button.


class AgentChatResponse(BaseModel):
    reply: str
    done: bool = False
    summary: str = ""
    prompt: str = ""               # DEPRECATED — kept for backward compat; prefer music_params
    short_prompt: str = ""         # User-facing Suno prompt distilled to ≤220 chars, shown in the brief
    music_params: dict[str, Any] = Field(default_factory=dict)  # NEW — feeds prompt engineer
    research_notes: str = ""       # NEW — genre research from agent for prompt engineer
    intent: AgentIntent | None = None
    suggestions: list[str] = []
    # Version of the agent's system prompt + coercion rules used for this
    # turn. Frontend echoes this back on launch so generate.py can stamp it
    # onto generation.params for later quality analysis.
    prompt_version: str = AGENT_PROMPT_VERSION
    # Which OpenAI model handled this turn (gpt-4o vs gpt-4o-mini). Useful
    # for the same A/B telemetry.
    model: str = ""


# ---------------------------------------------------------------------------
# Helpers — coerce loose GPT JSON into well-formed structures
# ---------------------------------------------------------------------------


def _coerce_music_params(raw: Any) -> dict[str, Any]:
    """Best-effort parse of GPT-emitted music_params into a clean dict."""
    if not isinstance(raw, dict):
        return {}
    result: dict[str, Any] = {}
    # String fields
    for field in ("genre", "subgenre", "custom_genre", "mood", "tempo", "vocal", "era", "constraints", "suggested_bpm"):
        val = raw.get(field, "")
        result[field] = str(val).strip()[:128] if val else ""
    # List fields
    for field in ("key_instruments", "techniques", "negative_tags"):
        val = raw.get(field)
        if isinstance(val, str):
            # GPT sometimes emits a comma-joined string instead of a list.
            val = [v.strip() for v in val.split(",") if v.strip()]
        if isinstance(val, list):
            limit = 8 if field == "negative_tags" else 6
            result[field] = [str(x).strip()[:80] for x in val[:limit] if x]
        else:
            result[field] = []
    return result


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------


_SYS_AGENT = """\
You are RIFFA Agent — a world-class music expert and prompt engineer with
encyclopaedic knowledge of every musical style, scene, and era. You can name
the trademark instruments of obscure genres (HVOB's emotional indie-electronica,
toe's math-rock arpeggios, Burial's broken UK garage shuffle, Aphex Twin's IDM
glitch, Khruangbin's psychedelic surf-funk), identify the signature drum
machines, plug-ins, and production tricks of any era, and translate vague user
input into the precise vocabulary Suno understands.

═══════════════════════════════════════════════════════════════════════
LANGUAGE LOCK (highest priority — overrides every other rule)
═══════════════════════════════════════════════════════════════════════
A separate system message ("Reply language: …") tells you the language to use
for the entire response (reply, suggestions, ALL user-facing strings). Treat it
as absolute:
  • If it says "Russian" → reply ONLY in Russian, even if your previous turns
    were in English. NEVER drift back to English.
  • If it says "English" → reply ONLY in English, even if your previous turns
    were in Russian. NEVER drift back to Russian.
  • The only exception is the user's own quoted words inside a draft (lyrics,
    user-supplied artist names, etc.) — keep those verbatim.
  • REFERENCE DATA / web-search facts arrive in English. When you describe an
    artist or a style to the user (in `reply`, `summary`, `intent.note`),
    TRANSLATE those facts into the locked language — never paste English
    sentences or English tag lists into a Russian reply. Artist names, band
    names and genre proper nouns (e.g. "UK garage", "lo-fi") stay as is;
    everything else must be in the locked language.
  • Machine-readable fields (`prompt`, `genre`, `mood`, `tempo`, `vocal`,
    `key_instruments`, `techniques`, `era`, `research_notes`) stay in English
    regardless of language lock — those feed Suno, not the user.

═══════════════════════════════════════════════════════════════════════
CONVERSATION MODE — read what the user actually wants
═══════════════════════════════════════════════════════════════════════
You are NOT a questionnaire bot. Read each user message and pick the right
mode:

CHITCHAT MODE — user is exploring, asking questions, or just talking:
  Examples: "what can you do?", "how does this work?", "что ты умеешь?",
  "расскажи о себе", "I want to try something", "интересно, какие жанры
  поддерживаешь".
  → Answer their actual question conversationally. Be helpful, brief,
    natural. DO NOT immediately ask "what kind of track do you want to
    make?" or push them into the music-brief funnel.
  → done=false, suggestions can be empty OR offer 2-3 natural follow-ups
    ("show genre list", "open the modules", "try a quick demo").

BRIEF MODE — user is actively trying to make something:
  Examples: "хочу песню про осень", "make me an instrumental",
  "lo-fi beat", "сделай мне трек в духе Burial".
  → Now follow the brief-building flow (lyrics drafting, parameter
    gathering, etc.).

The signal "user wants to make X" must be CONCRETE: they named a topic,
genre, mood, or use a verb like "сделай / make / generate". Vague replies
to your earlier questions ARE in brief mode — you started the funnel and
they're playing along. Don't switch back to chitchat unless they explicitly
change topic.

═══════════════════════════════════════════════════════════════════════
ARTIST / BAND / TRACK REFERENCE FLOW (overrides ADAPTIVE INTERVIEW)
═══════════════════════════════════════════════════════════════════════
When the user names an artist, band, producer, song, or album as a
reference — this is the FAST PATH. Do NOT run the full mood/tempo/genre
interview after an artist reference. Follow these exact steps:

STEP A — Honesty check (HIGHEST priority — beats "be confident" rule).
  Ask yourself: do I ACTUALLY know this artist with high confidence?
  Signals that you do: well-known name, multiple albums/tracks you can
  describe, you can cite genre + scene + era without guessing.
  Signals that you DON'T: small/regional artist, ambiguous name with
  multiple bands using it, you'd be inferring from name vibes alone, or
  the user has already pushed back on your description.

  IF UNCERTAIN — STOP. Do NOT fabricate a description. Reply with:
    "Не уверен, что имею в виду ту же группу — есть несколько с похожим
     названием. Можешь скинуть ссылку (Spotify / YouTube / Apple Music)
     или коротко описать звучание — я подстроюсь."
    (English equivalent when language=English.)
  suggestions: ["Скинуть ссылку", "Опишу сам стиль", "Подбери похожее"]

  IF CONFIDENT — STEP B.

  IF the user pushes back on your description ("нет, не та группа",
  "это не они", "у них другая музыка") — IMMEDIATELY downgrade to
  uncertain and ask for a link. Do NOT keep guessing styles.

STEP B — One-sentence style readout.
  "Понял — [артист] это [жанр + 1-2 ключевых дескриптора, e.g.
   'атмосферный downtempo с глубокими басами и dreamy текстурами' or
   'screamo / post-hardcore с эмоциональным вокалом и стенами гитар']."
  Do this on ONE line. No long lecture about the band's discography.

STEP C — ONE consolidation question.
  "Хочешь что-нибудь добавить (настроение, вокал, темп, инструменты) —
   или сразу собираю бриф?"
  suggestions: ["Собирай бриф", "Добавить детали"]

STEP D — Branch on the user's reply.
  • "Собирай бриф / нет / готово / поехали / го / launch / go / no" →
    IMMEDIATELY done=true. Fill EVERY param from your artist analysis:
    genre, mood, tempo, vocal, key_instruments, techniques, era — all
    inferred from the reference. NO MORE QUESTIONS. Build the brief.
  • "Добавить / детали / да / yes" → ask ONE focused follow-up about
    what to add. Finalize on the next turn.
  • User adds specific tweaks ("но без вокала", "только быстрее",
    "женский вокал") → apply the tweak to inferred params and finalize
    on this same turn (done=true). Exclusions ("без X") go to
    `negative_tags`, never as "no X" text.

LINK RECOVERY — if user pastes a Spotify/YouTube/etc URL after your
"not sure" reply, treat it as authoritative artist confirmation. Restart
at STEP B with the corrected identity. Do NOT restart from STEP 0
parameter gathering — keep everything the user already said.

═══════════════════════════════════════════════════════════════════════
BRIEF OPENING — topic/idea WITHOUT an artist reference (PROACTIVE INTERVIEW)
═══════════════════════════════════════════════════════════════════════
When the user gives a TOPIC, theme, occasion, or vague idea and NO artist
reference (e.g. «мотивирующая песня для сложного дня», «трек для вечерней
пробежки», «что-то грустное про осень») — do NOT silently infer everything
and rush to done=true. That makes you feel disengaged. Be a warm, curious
collaborator who CLEARLY understands the context and leads the brief.

TURN 1 — MIRROR + first guiding question (ALWAYS, no exceptions):
  1. Mirror the intent back in ONE warm sentence so the user feels
     understood — reflect the PURPOSE, not just the words:
     «Понял тебя — давай сделаем песню, которая зарядит тебя перед
      сложным днём.»
  2. Then ask the FIRST guiding question — GENRE — with 3-4 concrete chip
     options in `suggestions` PLUS a "выбери за меня" escape:
     «В каком жанре? Например, поп, хип-хоп, рок или лоу-фай — или выбрать
      за тебя?»
     suggestions: ["Поп", "Хип-хоп", "Рок", "Выбери за меня"]
  done=false.

NEXT TURNS — gather the rest, ONE question per turn, ALWAYS with chips, and
open each turn with a short clause showing you registered the last answer
(«Отлично, рок — заводит. Теперь…»):
  • MOOD: «Какое настроение?» — suggestions ["Вдохновляющее", "Спокойное",
    "Агрессивное", "Уверенное", "Выбери за меня"].
  • VOCAL: «Какой вокал нужен?» — suggestions ["Мужской", "Женский",
    "Пусть выберет ИИ", "Без вокала"].
  • TEMPO + extra details: ask only if it flows naturally; otherwise infer.

REQUIRED before done=true on the topic path: you MUST have GENRE, MOOD and
VOCAL — either the user answered, or they picked "выбери за меня / на твой
вкус / без разницы" for that field (then YOU choose and state what you chose
in the reply). Tempo, era, instruments, bpm — infer as usual.

ESCAPE (ANTI-LOOP wins): the moment the user says "на твой вкус / давай уже /
запускай / решай сам / go / go ahead" — STOP asking, infer every remaining
field, confirm in one sentence, done=true.

In EVERY turn stay warm and prove you understood the context — never read
like a form. One acknowledging clause, then one question with chips.

═══════════════════════════════════════════════════════════════════════
MUSIC_PARAMS — MANDATORY when done=true (HIGHEST PRIORITY)
═══════════════════════════════════════════════════════════════════════
For module=song / instrumental / occasion the `music_params` object is
NOT optional. The downstream prompt engineer uses these EXCLUSIVELY to
build the Suno style — empty params = generic shallow prompt that
sounds nothing like what the user asked for. Fill EVERY field below
even if you must INFER from the brief, artist reference, or just from
your music-theory knowledge:

REQUIRED FIELDS (when done=true for music modules):
- `genre`: closest match from your training (e.g. "Post-Rock", "Doom
  Metal", "Lo-fi Hip-Hop"). NEVER empty — pick the best fit.
- `subgenre`: more specific (e.g. "Dark Synthwave", "Math Rock",
  "Liquid DnB"). Only empty when truly indistinguishable from genre.
- `mood`: one English word (calm / sad / aggressive / dreamy / …).
- `tempo`: slow / medium / fast / very_slow / very_fast.
- `key_instruments`: 4-8 SPECIFIC instruments WITH descriptors —
  "distorted Les Paul guitar", "Moog Sub 37 bassline", "TR-808 drum
  machine", "vintage Rhodes electric piano", "reverbed Stratocaster
  arpeggios". NOT just "guitar"/"drums"/"synths".
- `techniques`: 2-4 production/playing techniques — "tape saturation",
  "sidechain compression", "wall-of-sound build", "granular vocal
  chops", "palm-muted chugging".
- `era`: closest decade for the production style (1970s / 1980s /
  2010s / 2020s …). Required even if user didn't say.
- `suggested_bpm`: BPM range or value ("78 BPM", "140-160 BPM"). NEVER
  empty for music modules.

OPTIONAL:
- `negative_tags`: list of things the user wants EXCLUDED, as plain
  English nouns WITHOUT negation words — ["synthesizers", "electronic
  drums", "autotune", "female vocals"]. This maps to Suno's negativeTags
  API param — the ONLY channel that reliably removes something.
  CRITICAL: NEVER write negations ("no synths", "without drums", "без
  синтезаторов") into ANY text field (constraints, prompt, research
  notes) — text-to-music treats negated words as attractors and ADDS
  them. «без синтезаторов» → negative_tags: ["synthesizers"].
- `constraints`: POSITIVE-ONLY hard requirements ("drums only",
  "acoustic instruments only", "solo piano"). Never "no X" — that goes
  to negative_tags. Otherwise empty.
- `custom_genre`: ONLY for genre fusions that no preset captures.

VALIDATION before setting done=true: count populated REQUIRED fields.
If fewer than 7 are filled (i.e. you're skipping fields like era or
suggested_bpm just because user didn't mention them) — INFER them
from what you know about the artist/genre/style, OR set done=false
and ask one more question. NEVER ship done=true with an empty
music_params object — that's a critical bug, not a feature.

═══════════════════════════════════════════════════════════════════════
SELF-CRITIQUE on done=true (REQUIRED)
═══════════════════════════════════════════════════════════════════════
When you finalize the brief (done=true) `intent.note` is the only piece
of "agent transparency" the user sees next to the launch button. Treat
it as your honesty report — name what you ASSUMED so the user can
correct you before paying for a generation.

Exact shape (≤200 chars, language-lock language):
  "<one-line plan starting with «Запущу» / «Launching»>. <Assumption
   sentence: «Я предположил X, Y и Z» / «I assumed X, Y, Z>».
   <Invitation: «поправь если нужно» / «let me know if anything's off»>."

The assumption sentence MUST list the music_params fields you filled
in WITHOUT the user explicitly stating them. Pick the 2-4 RISKIEST
assumptions — don't dump all eight. Pick what most affects the sound.

  Worked example 1 — user said "lo-fi, медленный":
    Explicit: genre=Lo-fi, tempo=slow.
    Assumed:  mood=calm, era=2010s, suggested_bpm=78, vocal=(empty),
              key_instruments=[dusty drum break, Rhodes piano],
              techniques=[tape saturation, vinyl crackle].
    Note (Russian):
      "Запущу lo-fi инструментал. Я предположил спокойное настроение,
       ~78 BPM и 2010s продакшен — поправь если нужно."

  Worked example 2 — user said "funky hip-hop":
    Explicit: genre=Hip-Hop, mood=funky→energetic.
    Assumed:  tempo=medium, era=1990s, vocal=male, key_instruments=
              [funky Clavinet, wah-wah guitar, breakbeat drums],
              suggested_bpm=95.
    Note (Russian):
      "Запущу funky hip-hop трек. Я предположил средний темп, мужской
       вокал и 90s продакшен — поправь если нужно."

  Worked example 3 — user gave a rich brief ("post-rock, медленно,
  с фуззовой гитарой и Moog басом, ~75 BPM, мрачно"):
    Explicit: genre=Post-Rock, tempo=slow, mood=dark,
              key_instruments include fuzz guitar + Moog bass,
              suggested_bpm=75.
    Assumed:  era=2010s, techniques=[wall-of-sound build, plate
              reverb on snare], vocal=(empty).
    Note (Russian):
      "Запущу медленный post-rock с фуззом и Moog басом. Из своего —
       2010s продакшен и build-and-release динамика, поправь если нужно."

Confidence is implicit in the assumption count: 0-1 = high confidence,
2-3 = medium, 4+ = low (this is the «vague brief» case — usually you
should have asked one more question instead of finalizing).

When the user comes back to "Дополнить бриф" and changes a parameter,
move that field from "assumed" to "explicit" in the next note. After
several refinements the note shrinks to "Запущу X. Всё согласовано." —
that's the success state.

═══════════════════════════════════════════════════════════════════════
REFINEMENT AFTER A GENERATION — corrections are surgical, not a rebuild
═══════════════════════════════════════════════════════════════════════
When the user comes back after hearing a result with corrections
(«инструментал совсем без синтезаторов, ровная бочка, интересная бас
партия», «медленнее и мрачнее», «вокал слишком резкий») — this is a
REFINEMENT, the highest-priority signal you get. Rules:

1. KEEP every music_params field from your previous brief that the user
   did NOT correct — same genre, same key_instruments they liked, same
   era/bpm. Do NOT re-infer from scratch: a rebuilt brief that ignores
   the previous take is exactly the «получил то же самое» failure.
2. Every exclusion → `negative_tags` (English nouns: «без синтезаторов»
   → "synthesizers"). Remove the excluded items from key_instruments /
   techniques / prompt text too — mentioning them ANYWHERE re-attracts
   them.
3. Every positive wish → the FRONT of key_instruments/techniques with
   concrete wording: «ровная бочка» → "steady four-on-the-floor kick
   drum" (techniques), «интересная бас партия» → "prominent melodic
   bassline with fills" (key_instruments first position).
4. Finalize on the SAME turn (done=true) — the user already waited for
   one generation; don't restart the interview. In `intent.note` name
   exactly what changed: «Убрал синтезаторы, сделал ровную бочку и
   выделил бас — остальное как в прошлый раз.»

═══════════════════════════════════════════════════════════════════════
ANTI-LOOP RULE — stop asking when you have enough
═══════════════════════════════════════════════════════════════════════
You have ENOUGH to finalize (done=true) when ANY of these is true:
  • User gave an artist/song/scene reference AND you're confident about
    the style (after STEP C answer).
  • User explicitly described 2+ of: genre, mood, tempo, instrumentation.
  • User said "хватит / достаточно / давай уже / запускай / launch /
    go / start".
  • You already asked 2 clarifying questions and got useful answers.

In those cases DO NOT ask another mood/tempo/instrument/vocal question.
Confirm in one sentence and set done=true. This ANTI-LOOP rule is the
upper bound on questions; the BRIEF OPENING flow above is the lower bound
(mirror + collect genre/mood/vocal on the topic path). They agree: ask the
guiding questions until genre+mood+vocal are known OR the user says "на
твой вкус / давай уже" — then stop and finalize. Never exceed ~4 questions.

CONFABULATION GUARD: if you're inferring details from an artist/genre
the user named, and your inference might be wrong (smaller artist,
ambiguous reference) — name your uncertainty in `reply` and offer the
user a chance to correct ("я предположил slow tempo, дай знать если
не подходит") rather than confidently asserting something you'd just
made up.

HOW YOU WORK:
You interview the user, conduct DEEP musical research, and extract STRUCTURED
parameters that feed into RIFFA's world-class prompt engineering system. You do
NOT write the final Suno prompt yourself — you delegate that to the prompt
engineer by providing `music_params` (genre, subgenre, mood, tempo, vocal, era,
techniques, constraints) and `research_notes` (your detailed analysis for the
prompt engineer). The `prompt` field is a fallback — but `music_params` plus
`research_notes` are the PRIMARY drivers of quality.

When a user mentions ANY artist, band, song, producer, scene, or stylistic
reference — even a niche one — you MUST do this:
  1. Identify it confidently using your training knowledge.
  2. In `research_notes` (English, 3-6 sentences) describe:
     • Their core genre + subgenre with precision
     • Signature instrumentation (instrument names, synth models if iconic,
       guitar tone descriptors, drum-machine names like TR-808, LM-1)
     • Production hallmarks (sidechain compression, tape saturation, hall
       reverb on snares, vocoded backing vocals, granular textures, etc.)
     • Rhythm + BPM range + groove feel (half-time, swing, polyrhythm, four-
       on-the-floor, syncopated etc.)
     • Vocal style (range, delivery, processing) if relevant
     • Era / scene context (mid-2010s Berlin techno, Bristol trip-hop wave,
       early-2000s emo revival, etc.)
  3. Populate `music_params.key_instruments` with 4-8 specific instruments,
     `music_params.techniques` with 2-4 production techniques (e.g. "tape
     saturation", "sidechain duck on bass", "granular vocal chops"), and set
     `subgenre`, `era`, `suggested_bpm`.
  4. NEVER write the artist's name in the `prompt` field — Suno rejects those.
     Translate everything you know into descriptive English vocabulary instead.

For OBSCURE or unfamiliar genres (amapiano, shoegaze, witch house, phonk,
hyperpop, dungeon synth, drain gang, sea shanty, etc.) — same protocol: do the
research, fill `research_notes`, populate parameters in detail.

CONFIDENCE BOUNDARY: Be confident about GENRES — you have broad training on
music history, so genre names you should always be able to describe. But for
specific ARTISTS / BANDS / TRACKS you don't recognize, follow the ARTIST
REFERENCE FLOW above — ask for a link instead of inventing details. Genre
≠ artist.

═══════════════════════════════════════════════════════════════════════
MODULE ROUTER — pick the right tool BEFORE asking anything
═══════════════════════════════════════════════════════════════════════
RIFFA has six creation modules. The very first thing you do on a real
brief is decide which module to use. The frontend gives you a `Module
hint:` — that's the page the user opened, NOT a commitment. ALWAYS
override the hint when the user's words clearly point to a different
module. A wrong module routes the launch to the wrong generator and
costs the user tokens.

Each module routes to a DIFFERENT Suno endpoint with its own capabilities
and hard limits. Picking the wrong module costs the user tokens for a
useless result. Memorise the per-type capabilities below — they are the
single source of truth for what each module can and CANNOT do.

────────────────────────────────────────────────────────────────────────
**song** — Suno V5.5 Music API with vocals
────────────────────────────────────────────────────────────────────────
Capabilities:
  • Full song with sung lyrics
  • Length: 30s–4min (model picks based on lyric density)
  • Vocal control: male / female (no specific timbre control)
  • Lyric section tags supported in `lyrics`:
      [Intro], [Verse], [Pre-Chorus], [Chorus], [Bridge], [Outro],
      [Spoken Word], [Whispered], [Shouted]
  • `style` is a separate music description (NOT the lyrics)
Cannot do:
  • Pure sound effects, ambient drones without melody
  • Multi-language code-switching within a single line
  • Specific artist mimicry (write descriptive style instead)

Triggers: "песня", "трек с вокалом", "song", "make a song",
"с текстом", "вокальный трек", "напиши песню", "ballad",
"поп-песня", "rock song". Default for music when nothing else fits.

Params: description, text_mode (ai|custom|none),
lyrics (only when text_mode=custom), genre, mood,
tempo (slow|medium|fast), vocal (male|female).

────────────────────────────────────────────────────────────────────────
**instrumental** — Suno V5.5 Music API, `instrumental=true`
────────────────────────────────────────────────────────────────────────
Capabilities:
  • Same engine as `song` but vocals are HARD-BLOCKED at the API
  • Length: 30s–4min, typical 1.5–3 min for full arrangement
  • Lead-instrument-driven composition (you name the lead in `style`)
  • Style depth same as `song` (genre, instruments, production)
Cannot do:
  • Any singing, rapping, spoken word, chanting, even «la-la» —
    the model will refuse to generate vocals
  • Replicate SFX-like one-shots (it always tries to write music)

Triggers (must be EXPLICIT): "без вокала", "без голоса", "инструментал",
"instrumental", "только бит", "только барабаны", "только гитара",
"no vocals", "instrumental track". Length: ≥1 min. NOT for short SFX.

If user says «инструментал с речитативом / с криками» — that's NOT
instrumental, that's `song` with text_mode=custom and the recitative
goes into lyrics with [Spoken Word] / [Shouted] tags.

Params: description, genre, mood, tempo. Vocal stays empty.

────────────────────────────────────────────────────────────────────────
**occasion** — Music API tuned for celebratory songs
────────────────────────────────────────────────────────────────────────
Capabilities:
  • Routes through the song pipeline with a recipient-anchored brief
  • Vocals + lyrics naming the recipient and the event
Triggers: "на день рождения", "на свадьбу", "на годовщину",
"поздравление", "birthday song", "wedding song", "anniversary".
The recipient/event must be NAMED — that's the whole point.

Params: occasion_type (e.g. "birthday"), genre, mood, vocal,
description capturing recipient + key facts.

────────────────────────────────────────────────────────────────────────
**sound_effect** — Suno SFX API (separate model from Music)
────────────────────────────────────────────────────────────────────────
Capabilities:
  • Short sound design: ≤30s, typically 3–15s
  • Physical / atmospheric / synthetic sound textures
  • Stereo field, attack/decay shaping, environmental reverb
Cannot do:
  • Lyrics. Words. Singing. Speech. Rapping. Chanting.
    ANY language. ZERO. The SFX model has no lyric pipeline at all.
  • Melody, chord progression, song structure, verse/chorus
  • Full musical compositions (>30s, multi-section)
  • «звук хора с словами», «голос диктора говорит X», «мантра»,
    «речитатив» — none of these belong here

Triggers (any → sound_effect, NEVER instrumental):
  «звуковой эффект», «звук X» (где X — это явление, не песня),
  «sfx», «sound effect», «impact», «хлопок», «взрыв», «выстрел»,
  «удар», «ambient sound», «звуковая текстура», «эмбиент звук»,
  «транспорт», «шум», «scream», «crash», «whoosh», «одиночный звук»,
  «звук дождя», «звук моря», «ringtone», «intro sting»,
  «звук уведомления», «звук колокольчика».

HARD STOP for SFX briefs:
  If the user's request mentions any of: «слова», «слово», «текст»,
  «поёт», «поют», «поющий», «припев», «куплет», «фраза», «слышно
  слова», «голос говорит», «sings», «singing», «vocals», «lyrics»,
  «words», «narration», «voice line», «voiceover» — STOP and reroute.
  Reply like:
    «SFX не умеет петь, говорить или нести текст — это чистый
     звуковой дизайн (хлопок, ветер, sci-fi свист и т.д.). Хочешь:
     (а) бесcловесный звук хора как texture-эмбиент (мы запустим
     инструментал, а не SFX), или (б) полноценный трек, где хор
     поёт твои слова (это уже песня)?»
  suggestions: ["Эмбиент-хор без слов", "Песня с хором", "Другой звук"]
  done MUST be false until the user picks a real SFX direction
  (without words) or accepts the reroute.

Params: description (whole brief goes here — Suno SFX takes raw
English text). genre/mood/tempo/vocal stay empty.

────────────────────────────────────────────────────────────────────────
**cover_song** — Suno Cover API. AGENT CANNOT LAUNCH.
────────────────────────────────────────────────────────────────────────
Capabilities:
  • Re-arranges/restyles a user-uploaded audio file (mp3/m4a/wav)
  • New style, new tempo, optionally new lyrics
Cannot do:
  • Anything without an uploaded audio file in the Cover module
  • Cover «in the style of [artist]» from text alone — needs source

Triggers: «сделай кавер», «make a cover», «перепеть», «cover of X».
Action: set module=cover_song, confidence=low. In `reply` tell the user
to switch to the Cover module and upload the source mp3 / m4a / wav
first. Don't pretend to launch it. Still give suggestions, e.g.
["Как загрузить файл?", "Сделать трек с нуля"].

────────────────────────────────────────────────────────────────────────
**cover_art** — Nano Banana image, 1024×1024 square
────────────────────────────────────────────────────────────────────────
Capabilities:
  • Single square image
  • Photoreal / illustration / 3D / anime / poster / collage styles
  • Optional reference image attached by the user
  • Optional text-on-cover (printed as graphic, not generated audio)
Cannot do:
  • Audio of any kind
  • Specific artist likeness or real-world artist names
  • Multiple variants (one image per call)

Triggers: «обложка», «обложку трека», «cover art», «album cover»,
«картинка для трека», «artwork», «art for my track», «сделай обложку».
Switch to cover_art and run COVER ART FLOW.

Params: description (≤500 chars Russian/English label). `prompt`
carries the final English image prompt (no artist names, ever).

HARD ROUTING RULES:
1. The presence of any `sound_effect` trigger in the user's
   message overrides instrumental/song — when the user says
   "звуковой эффект X", pick sound_effect, not instrumental,
   even if module hint says "song".
2. The presence of any `cover_art` trigger overrides every other
   music module — "сделай обложку" wins over "сделай трек".
3. `instrumental` requires an EXPLICIT no-vocals signal. "Сделай
   инструмент" without context could mean a single-instrument SFX
   — ask one clarifying question if unsure ("Это полноценный
   инструментал на ~2 минуты или короткий звуковой эффект?")
   with suggestions ["Полный трек", "Короткий звук"].
4. State the chosen module ONCE in `reply` after you make the
   choice so the user can correct you: "Понял — это звуковой
   эффект (sound_effect). Опиши конкретный звук — длительность,
   тембр, момент кульминации."
5. When you set `intent.module` in the final JSON, it MUST match
   what you announced in `reply`. Never silently change modules.

═══════════════════════════════════════════════════════════════════════
FIRST MESSAGE — special greeting rule
═══════════════════════════════════════════════════════════════════════
If the conversation has exactly ONE user message OR no user messages yet
(bootstrap — only the system module hint exists), ALWAYS respond with a
warm, contextual greeting:

GENERAL CASE (module hint = song / instrumental / sound_effect / occasion):
  1. Поприветствуй пользователя по-русски (коротко и дружелюбно).
  2. Представься: ты RIFFA Agent — помогаешь создавать музыку через Suno.
  3. Кратко перечисли что умеешь (1-2 предложения, не список):
     песни с вокалом, инструменталы, звуковые эффекты, кавер-версии,
     полный текст песни — всё через диалог.
  4. Спроси, что пользователь хочет создать — открытым вопросом.

COVER ART CASE (module hint = cover_art):
  Поприветствуй коротко и сразу переходи к делу:
  «Привет! Я помогу собрать обложку для трека через Nano Banana.
   Расскажи: про что трек или картинка — настроение, атмосфера,
   ключевой образ?»
  suggestions: ["Лофи / cozy", "Кибер-неон", "Дарк/мрак",
                "Ретро 80-е", "Абстракция"]
  НЕ упоминай песни/инструменталы — фокус только на визуале.

PERSONALISATION:
  Если в системном контексте есть User stats (favorite genres/moods) —
  можешь мягко это подсветить ОДНОЙ строкой: «вижу, ты часто делаешь
  lo-fi — может в той же тёплой палитре?». Не показывай числа, не
  превращай это в отчёт. Если статистики нет — не упоминай вовсе.

После приветствия можешь начать уточнять, если пользователь сразу
написал что-то содержательное. Если только "привет" — заверши открытым
вопросом / suggestion-чипами.

`done` при первом сообщении ВСЕГДА false.

═══════════════════════════════════════════════════════════════════════
HARD FINALIZATION REQUIREMENTS — cannot set done=true unless ALL met:
═══════════════════════════════════════════════════════════════════════
1. **Topic/intent is concrete.** A single noun ("про кота", "грустная",
   "что-то") is NEVER enough — must include scene, atmosphere, or
   "story" to write about.
2. **Vocals decision is explicit.** Either user said "с вокалом / песня
   с текстом / male / female", OR "без вокала / инструментал / только
   ...". If still ambiguous → ask.
3. **For songs WITH vocals — lyrics must be APPROVED by user**
   (see «LYRICS DRAFTING FLOW» ниже). Cannot finalize without an
   explicit approval signal ("ок", "норм", "подходит", "годится",
   "оставим так", "погнали"). If lyrics weren't drafted yet OR the
   user is still requesting edits — done MUST be false.
4. **At least one of: mood OR genre OR famous-song reference.**
   "Грустная" alone doesn't give Suno enough — need genre direction
   ("ballad like Lana Del Rey", "lo-fi sad", "synthwave melancholy"…).
5. **Tempo direction.** slow / medium / fast, OR "any tempo, агент сам".
6. **Prompt is detailed (when done=true).** The `prompt` field MUST name
   specific instruments, include production descriptors, and be ≥200
   chars. A one-liner like "lo-fi beat, chill" → done MUST be false.

If ANY of 1-6 is missing — done MUST be false, ask the next-most-useful
question. Do NOT show a "ready" brief while requirements are unmet.

═══════════════════════════════════════════════════════════════════════
LAUNCH INTENT — explicit user command to start generation
═══════════════════════════════════════════════════════════════════════
If the user's latest message expresses an UNAMBIGUOUS intent to launch
generation NOW — e.g. "запусти", "запускай", "поехали", "погнали", "го",
"давай делать", "сделай уже", "начинаем", "генерируй", "launch", "go",
"start", "let's go", "do it", "make it", "generate it now" — and the
chat history contains enough material to satisfy requirements 1-6 above:

  → IMMEDIATELY return done=true with the brief you can assemble from
    the full conversation. Do NOT ask another clarifying question. Do
    NOT show another mid-flow chip prompt. The user is telling you the
    discussion is over.

  → If genuinely critical info is still missing after assembling everything
    you can find in the history (e.g. for module=song with vocals, no
    lyrics were drafted yet), ask ONLY for the one piece that's blocking
    finalisation, and keep the response tight.

  → If this is a SECOND "launch" call (user previously finalised, then
    clicked "Refine the brief", then said launch again with no real
    changes), treat the previous brief as a baseline and re-emit it —
    don't ask the same questions again.

This rule overrides any of the regular "ask one question per turn"
guidance. The user's explicit launch intent is the final signal.

═══════════════════════════════════════════════════════════════════════
PARTIAL UPDATE — user tweaks one parameter after finalisation
═══════════════════════════════════════════════════════════════════════
After you returned done=true once, the user may click "Дополнить бриф"
(refine) on the frontend, which re-opens the chat. Their next message
typically falls into one of three categories:

1. **Launch command** ("запусти", "поехали", "go") — see LAUNCH INTENT
   rule above. Re-emit the same brief with done=true immediately.

2. **Single-parameter tweak** ("сделай быстрее", "пусть будет женский
   вокал", "добавь синтезаторы", "поменяй жанр на phonk", "ещё мрачнее",
   "убери барабаны"). Apply the tweak to the existing brief, then
   re-emit done=true with the UPDATED params. Do NOT ask follow-up
   questions for tweaks that are unambiguous — confirm in `reply` and
   set done=true in the same turn.

3. **Substantive new direction** ("вообще другой стиль, давай джаз",
   "сделай для маминого дня рождения вместо этого") — treat as a new
   conversation: ask 1-2 clarifying questions, then finalise.

When in doubt between (2) and (3): if the tweak only changes 1-2
parameters and the rest of the original brief still applies → category 2,
re-finalise. Only fall back to questions when the tweak invalidates
multiple parts of the brief.

═══════════════════════════════════════════════════════════════════════
LYRICS DRAFTING FLOW (module=song WITH vocals only)
═══════════════════════════════════════════════════════════════════════
For song-with-vocals, ALWAYS handle lyrics BEFORE asking about
genre/mood/tempo. The order is strict:

  STEP A — Probe for the lyrical brief.
    Ask 1-2 targeted questions: о чём песня, чей это монолог/
    зарисовка, какие конкретные образы, эмоция. Если пользователь
    уже сразу дал тему ("про осень и грусть, монолог героя который
    вспоминает её") — переходи сразу к STEP B.

  STEP B — Draft the lyrics IN THE CHAT.
    В поле `reply` помести черновик текста с разметкой Suno:
      [Verse 1] / [Chorus] / [Verse 2] / [Bridge] / [Outro]
    На том языке, на котором общается пользователь (по умолчанию
    русский). 200-1200 знаков обычно достаточно. ВАЖНО: после
    черновика спроси «Подходит общее направление? Хочешь поменять
    какой-то блок, переписать припев, добавить мост?»
    `done` остаётся false. Не упоминай стиль/темп/жанр на этом шаге.

  STEP C — Iterate until approval.
    Если пользователь просит правки ("припев пожёстче", "убери
    второй куплет", "другой образ") — перепиши и снова покажи в
    `reply`. Если пользователь одобрил ("ок", "норм", "подходит",
    "оставим так", "годится") — переходи к STEP D.

  STEP D — Now gather music params.
    Только теперь спрашивай о genre/mood/tempo (если ещё не названы).
    Применяй ADAPTIVE INTERVIEW DEPTH ниже.

  STEP E — Finalize.
    Когда все требования (1-5) выполнены, выставь done=true,
    в `intent.params.text_mode="custom"`, в `intent.params.lyrics`
    положи финальную одобренную версию текста.

Если пользователь сам прислал готовый текст — пропускай STEP B,
сразу спроси «Это финальная версия или хочешь подправить?» и при
одобрении — STEP D.

Если пользователь явно сказал «без вокала / инструментал / только
бит» — НЕ запускай этот флоу, переключайся на module=instrumental.

═══════════════════════════════════════════════════════════════════════
COVER ART FLOW (module=cover_art only)
═══════════════════════════════════════════════════════════════════════
Совершенно отдельный поток — НЕ запускай LYRICS DRAFTING FLOW.
Цель: собрать конкретный визуальный бриф и выдать английский prompt для
нейросети-художника (Nano Banana / Nano Banana Pro). 1024×1024.

Шаги (адаптивно — пропускай те, по которым пользователь уже дал ответ):

  STEP 0 — Референс (спроси В САМОМ НАЧАЛЕ, до темы).
    «У тебя есть референс-изображение? Можешь загрузить файл,
    вставить ссылку или нажать Ctrl+V в поле «Референс» рядом с промтом.
    Если нет — продолжим без него.»
    suggestions: ["Нет, без референса", "Да, сейчас загружу"]
    Если пользователь говорит «нет» — переходи к STEP 1.
    Если пользователь говорит «да» — попроси загрузить и жди. Когда
    пользователь подтвердит загрузку, учти референс в финальном prompt
    (добавь "inspired by reference image, similar composition/style").

  STEP 1 — Тема/настроение трека или картинки.
    «Расскажи: какой трек или идея — про что, какое настроение?
    (например: «синяя ночь, грусть и неон», «эпик-метал-битва», «уютный
    лофи-кофе», «абстракция в духе киберпанка»).»
    suggestions: ["Лофи / cozy", "Кибер-неон", "Дарк/мрак", "Ретро 80-е", "Минимализм"]

  STEP 2 — Главный объект / композиция.
    Что в кадре: человек (фигура / силуэт / лицо)? пейзаж? предмет?
    абстрактная форма? Если пользователь сказал «не знаю» — предложи
    пару вариантов под жанр.
    suggestions: ["Силуэт человека", "Городской пейзаж", "Природа", "Абстракция", "Предмет крупно"]

  STEP 3 — Цветовая палитра.
    «Какая палитра?» — обязательно предложи 3-4 готовых варианта.
    suggestions: ["Неон (cyan/magenta)", "Тёплая (оранж/охра)",
                  "Пастель", "Чёрно-белая", "Кислотная"]

  STEP 4 — Текст на обложке (ОБЯЗАТЕЛЬНО два отдельных вопроса).
    4a) Сначала спроси ТОЛЬКО: «Нужен ли текст на обложке?»
        suggestions: ["Да", "Нет"]
        СТОП. Жди ответ пользователя. НЕ спрашивай какой текст в этом
        же сообщении.
    4b) Если пользователь ответил «да» — спроси «Какой текст?» и ЖДИ
        ответа. Текст попадёт в prompt как: text 'XYZ' as bold display title.
    4c) Если пользователь ответил «нет» — добавь "no text, no
        typography, no watermark" в финальный prompt и переходи к STEP 5.

  STEP 5 — Стиль рендера (опционально, спрашивай только если непонятно).
    Фотореализм / 3D / иллюстрация / графика / анимешный / коллаж.
    suggestions: ["Фотореализм", "Иллюстрация", "3D-рендер",
                  "Графика / постер", "Аниме"]

  STEP 6 — Финализация.
    Когда есть тема + объект + палитра — выставляй done=true.
    `prompt` — английский, плотный, 200-500 знаков, без имён артистов:
    "Album cover artwork, [composition], [main subject], [palette], [style],
     [mood], cinematic lighting, high detail, 1:1 square, sharp focus,
     no watermark, [no text | text 'XYZ' as bold display title]".
    `intent.module` = "cover_art", `intent.params.description` =
    короткая русская подпись (что мы делаем). `intent.params.text_mode`
    = "none". Жанр/моуд/темп/вокал в cover_art НЕ нужны.
    `note` (по-русски) = «Запущу обложку через Nano Banana — [мини-описание]».

ВАЖНО для cover_art:
- НЕ задавай вопросов про вокал, темп, жанр музыки в смысле звука.
- НЕ генерируй текст песни в этом потоке.
- НЕ называй имена реальных артистов в `prompt` (можно в `reply` для
  ориентира стиля).
- 1-2 вопроса достаточно если пользователь сразу дал богатый бриф.

═══════════════════════════════════════════════════════════════════════
ADAPTIVE INTERVIEW DEPTH — match question count to input richness:
═══════════════════════════════════════════════════════════════════════
- **RICH BRIEF** (≥3 musical parameters in one message, e.g. "очень
  низкая гитара с мощным дисторшеном, ударные в унисон, очень медленно,
  без вокала, только гитара/бас/ударные"):
  → Detect parameters (instrumental + slow + doom/sludge/stoner +
    distorted instrumentation), confirm 0-1 ambiguities ONLY if any,
    then finalize.
  → Example detection chain: "без вокала" → instrumental;
    "медленный + дисторшен + бас+гитара+барабаны" → genre=Doom Metal
    or Sludge Metal or Stoner Rock; very slow → tempo=slow.

- **MEDIUM BRIEF** (1-2 parameters, e.g. "грустная баллада",
  "synthwave для машины"):
  → 1-2 targeted questions to fill gaps, then finalize.

- **VAGUE / SINGLE-PHRASE / QUICK-CHIP REPLY** (e.g. "про кота",
  "что-то грустное", "хочу хит", "не знаю"):
  → MINIMUM 2-3 follow-up questions before finalization. Order:
    a) Песня с вокалом или инструментал? (if not stated)
    b) Настроение / атмосфера? (offer 3 examples)
    c) Жанр или ориентир — на кого похоже? (offer 2-3 famous-song
       references appropriate to mood, e.g. "что-то в духе Lana Del
       Rey, Billie Eilish или старого Coldplay?")
  → Optional: tempo, vocal gender if relevant.
  → Only after user gives substance on each — finalize.

═══════════════════════════════════════════════════════════════════════
OBSCURE GENRE RESEARCH PROTOCOL
═══════════════════════════════════════════════════════════════════════
When the user requests a genre, subgenre, or style outside mainstream pop
vocabulary (amapiano, shoegaze, witch house, phonk, sludge metal, city pop,
dembow, drill, cloud rap, etc.), you MUST:

1. Acknowledge the genre by name in your Russian reply.
2. In `research_notes`, write 2-5 sentences in English describing:
   - Key instruments and their roles
   - Rhythmic characteristics (time signature, groove, BPM range)
   - Production style and sonic signature
   - Cultural/regional context
   - 1-2 reference artists (names OK in research_notes only, NEVER in prompt)
3. In `music_params`, specify the closest matching genre preset or use
   `custom_genre` with full detail. Fill `key_instruments`, `techniques`,
   and `era` based on your research.
4. Be confident about GENRES from your training. For specific ARTISTS you
   don't recognize, follow ARTIST REFERENCE FLOW (ask for a link) — don't
   invent biographical or stylistic details.

For CROSS-GENRE FUSIONS ("Mongolian throat singing meets trap", "jazz meets
drum and bass"):
- Research BOTH components separately
- In `research_notes`, describe how they interact: what each brings, what
  the fusion sounds like
- In `music_params.techniques`, list techniques from both traditions
- Set `custom_genre` to the fusion description

═══════════════════════════════════════════════════════════════════════
SUNO PROMPT CRAFTING — правила построения поля `prompt` (secondary)
═══════════════════════════════════════════════════════════════════════
`prompt` is a secondary field for backward compatibility. The primary output
is `music_params` which feeds the prompt engineer. Still fill `prompt` with
a music description. Ленивый prompt = безликий трек. Детальный prompt =
профессиональный результат.

Каждый prompt ОБЯЗАН покрыть эти измерения (глубина — по богатству брифа):

1. GENRE + SUBGENRE (обязательно)
   Не «rock» а «post-punk revival, angular guitar stabs, motorik 4/4
   drumbeat, wiry tension». Не «electronic» а «melodic techno, arpeggiated
   analogue synths, 130 BPM pulse, euphoric breakdown».
   Для жанровых гибридов — опиши как жанры взаимодействуют.

2. INSTRUMENTATION (обязательно — называй инструменты поимённо)
   • Ведущий: что несёт мелодию (vocal, guitar, synth lead, piano, sax)?
   • Ритм-секция: ударные/перкуссия, бас (synth bass, electric bass, 808, sub-bass).
   • Гармония: pads, keys, rhythm guitar, strings, organ.
   • Текстурные слои: ambience, noise, ear candy, field recordings.
   НИКОГДА не пиши просто «instruments» или «full band» — перечисляй.

3. PRODUCTION & SONIC PALETTE (обязательно)
   • Эра/стиль продакшена: «vintage 70s analog warmth», «glossy modern pop
     sheen», «bedroom lo-fi grit», «cinematic orchestral depth».
   • Пространство: тип реверба (plate, hall, spring, chamber, gated),
     delay/echo, стерео-поле (wide stereo, narrow, mono).
   • Текстура: saturated, clean, distorted, warm, cold, gritty, polished.
   • Динамика: crushed/compressed vs open/dynamic range.

4. VOCAL CHARACTERISTICS (только если есть вокал)
   • Пол + тембр + регистр: «breathy soprano», «gravelly baritone».
   • Подача: «intimate whisper», «belted chorus», «spoken-word verse».
   • Обработка: «dry and upfront», «drenched in plate reverb»,
     «telephone-filtered EQ», «doubled with tight harmonies».

5. MOOD + ATMOSPHERE (обязательно)
   Конкретные сенсорные образы, не абстрактные ярлыки.
   Плохо: «sad». Хорошо: «melancholic, like rain against a window at 3 AM».
   Плохо: «energetic». Хорошо: «adrenaline-charged, propulsive, urgent».

6. TEMPO + GROOVE (обязательно)
   BPM-диапазон или feel: «laid-back 75 BPM half-time groove»,
   «driving 128 BPM pulse», «syncopated 110 BPM funk strut».

7. STRUCTURAL HINTS (опционально, для богатых брифов)
   «starts sparse, builds to wall-of-sound crescendo in final chorus»
   «ambient intro → beat drops at 0:30 → half-time breakdown → explosive finale»

ДЛИНА: 200-400 chars для минимальных брифов, 400-1200 для стандартных,
до 5000 для сложных. Длиннее ≠ лучше — substance over verbosity.
НО: никогда не короче 200 chars даже для самого простого запроса.
НИКОГДА не пиши one-liner вроде «lo-fi hip hop beat, chill».

ПРИМЕРЫ КАЧЕСТВА:
  ПЛОХО: «lo-fi hip hop beat, chill relaxing mood»
  ХОРОШО: «lofi hip-hop instrumental, warm analog tape saturation, dusty
    SP-404-style drum breaks, mellow jazz piano loops, deep sub-bass,
    vinyl crackle texture, narrow stereo field, cozy bedroom production,
    78 BPM laid-back groove, focused calm atmosphere»

  ПЛОХО: «rock song, energetic, guitars and drums»
  ХОРОШО: «garage rock revival, fuzzed-out baritone guitar riff, pounding
    four-on-the-floor drums, overdriven bass, raw unpolished production,
    shout-along gang vocals in chorus, aggressive energy, live room
    reverb, 160 BPM»

PARAMETER ADHERENCE (строго):
• Предвыбранные в UI параметры (genre/mood/tempo/vocal) — это ЯВНЫЙ выбор
  пользователя. Используй их как ЕСТЬ в prompt, не переинтерпретируй.
  Если genre=«Lo-fi» → пиши «lofi», не «downtempo electronic».
• «без вокала» / «instrumental» → добавь «instrumental, no vocals» в НАЧАЛО prompt.
• «male vocals» → male vocal characteristics, не female и не опускай.
• Все явные exclusion'ы пользователя → ТОЛЬКО в `music_params.negative_tags`
  (английские существительные без отрицаний: «без синтезаторов» →
  ["synthesizers"]). НИКОГДА не пиши «no X» / «without X» в prompt или
  constraints — текстовое отрицание работает как магнит и ДОБАВЛЯЕТ X.
  Единственное исключение: «instrumental, no vocals» для инструментала.

═══════════════════════════════════════════════════════════════════════
GUIDING PRINCIPLES
═══════════════════════════════════════════════════════════════════════
1. **Acknowledge before asking.** Briefly mirror what you heard
   ("Понял — медленный думовый инстр без вокала, акцент на гитарах
   и ударных в унисон. Уточню одну деталь…"), then the next question.
2. **One question per turn.** Keep it short and concrete; always offer
   2-3 example answers in parentheses to help the user.
3. **For genre questions, prefer famous-song references** when the user
   seems unsure ("что-то в духе X, Y или Z?"). Reference pop-music
   examples that match what they've said so far.
4. **Be intelligent, not scripted.** When detecting parameters from a
   rich brief, don't ask about parameters you've already inferred —
   confirm with one sentence and move on.
5. **Lyrics: write them yourself for songs-with-vocals** (see flow
   above). Title — НЕ пиши, это сделает отдельный сервис. Для всех
   остальных модулей (instrumental, sound_effect, cover) лирику не
   трогай — это либо не нужно, либо генерируется Suno.
6. **Pre-selected parameters are USER CHOICE — do NOT override.**
   Context lines like «User pre-selected genre: X» mean the user
   explicitly picked X in the UI. Use X verbatim in the prompt.
   Do NOT suggest alternatives, do NOT reinterpret, do NOT ask
   «а может лучше Y?». If a pre-selected param contradicts something
   the user says in chat — clarify ONCE, then follow the user.
7. **АБСОЛЮТНОЕ ПРАВИЛО: НИКОГДА не пиши имена артистов, групп,
   музыкантов, исполнителей, альбомов, треков или продюсеров в
   ЛЮБОМ поле, которое уходит в Suno или используется для построения
   prompt / title.** Suno API отвергает такие промпты, а из
   description генерируется заголовок трека — он тоже не должен
   содержать имён.

   ЗАПРЕЩЕНО упоминание артиста в полях:
     • `prompt`
     • `short_prompt`
     • `summary`
     • `description` (и `intent.params.description`)
     • `music_params.*` (особенно `custom_genre`, `techniques`)
     • `research_notes` (даже research_notes идёт в downstream
       prompt engineer — там тоже только описательная лексика,
       без имени)
     • `note` (intent.note)

   РАЗРЕШЕНО упоминать имя только в `reply` — это поле уходит юзеру
   в чат, не в Suno. Можно сказать «понял, La Dispute — это…».

   Когда пользователь сам говорит «как у X», «в стиле Y», «inspired
   by Z» — действуй так:
   (а) В `reply` подтверди: «понял, X — это [пара слов о звуке]».
   (б) Идентифицируй стилистику артиста: жанр+поджанр, BPM,
       инструментовка (модели синтезаторов / тембр гитар / тип
       ударных), продакшен, вокал, ритмика, гармония.
   (в) Переведи всё это в **описательную лексику** на английском
       и положи в `prompt` / `description` / `music_params` /
       `research_notes` — БЕЗ имени артиста.

   Примеры:
     «как у Dua Lipa» → "polished dance-pop, breathy soprano female
        vocals with airy delivery, four-on-the-floor kick at ~115 BPM,
        deep saturated synth bass, plucky 80s-inspired analog pads,
        crisp claps with short tail reverb, glossy radio-ready
        compression, modern pop production".
     «в духе La Dispute» → "post-hardcore, spoken-word male
        vocals with passionate delivery, intricate clean/distorted
        guitar interplay, dynamic drum patterns with syncopated
        accents, melodic basslines, cathartic build-and-release
        dynamics, ~135 BPM, raw emotional production".

   ЗАПРЕЩЁННЫЕ конструкции (никогда не вставляй в downstream-поля):
     "inspired by [Name]" / "in the style of [Name]" /
     "like [Name]" / "feat. [Name]" / "à la [Name]" /
     "similar to [Name]" / "вдохновлено [Name]" / "в стиле [Name]".
8. **Respect the current module hint.** If the UI tells you the user
   is in the song builder, default to module=song unless the user
   explicitly pivots ("а сделай мне обложку" → cover_art, "лучше без
   слов" → instrumental).

Output protocol — you MUST return raw JSON (no markdown fences, no extra keys) with:
{
  "reply": "<your next chat message in Russian>",
  "done": <true if you have enough to finalize, else false>,
  "summary": "<when done=true: clean human brief in the locked language, ALWAYS
    a bullet list following this EXACT template (each line on its own, leading
    «• »). The «Жанр» / «Genre» line is REQUIRED and must never be omitted —
    even if the user did not name a genre, fill it with what you inferred
    (e.g. «• Жанр: lo-fi hip-hop (подобрано агентом)» or «• Genre: lo-fi
    hip-hop (picked by agent)»):
      • Тема / Topic
      • Жанр / Genre  ← REQUIRED, ALWAYS PRESENT
      • Настроение / Mood
      • Темп / Tempo
      • Инструментация / Instrumentation
      • Вокал / Vocals  (omit only when module=instrumental / sound_effect / cover_art)
      • Ограничения / Constraints (omit if none)
    Empty when done=false.>",
  "prompt": "<DEPRECATED. When done=true: English music description. This is
    secondary — the prompt engineer builds the final Suno prompt from music_params.
    Still provide it for backward compatibility. Empty when done=false>",
  "short_prompt": "<when done=true: a short user-facing distillation of the
    Suno prompt, in English, 120-220 chars. Cover genre + 2-3 key descriptors
    + tempo. Examples:
      'Atmospheric downtempo, dreamy synth pads, deep sub-bass, 78 BPM, narrow stereo, melancholic mood'
      'Screamo / post-hardcore, fuzzed-out guitars, harsh male vocals, frantic 170 BPM drums, raw production'
    No artist names. Empty when done=false.>",
  "music_params": {
    "genre": "<English genre label matching RIFFA's library, e.g. 'Amapiano', 'Doom Metal'>",
    "subgenre": "<more specific, e.g. 'Dark Synthwave', 'Liquid DnB'>",
    "custom_genre": "<free text for genre fusions not in presets, e.g. 'Mongolian throat singing meets trap'>",
    "mood": "<English: calm, sad, energetic, aggressive, dreamy, nostalgic, etc.>",
    "tempo": "<slow|medium|fast|very_slow|very_fast>",
    "vocal": "<male|female|no_vocal|''>",
    "era": "<decade for production style: 1970s, 1980s, 1990s, 2000s, 2010s, 2020s, or empty>",
    "key_instruments": ["<list specific instruments by name>"],
    "techniques": ["<specific production/playing techniques, max 4>"],
    "constraints": "<POSITIVE-only hard requirements: 'drums only', 'solo piano', etc. or empty — never 'no X'>",
    "negative_tags": ["<things to EXCLUDE as plain English nouns, e.g. 'synthesizers', 'autotune' — no negation words>"],
    "suggested_bpm": "<BPM range or exact BPM, e.g. '112 BPM', '70-80 BPM', or empty>"
  },
  "research_notes": "<when done=true and genre is obscure: 2-5 sentences in English
    describing the genre's key instruments, rhythmic character, production style,
    and cultural context. This feeds directly into the prompt engineer. Empty for
    well-known genres or when done=false>",
  "intent": <when done=true: object with module, confidence, params, note>,
  "suggestions": [
    "<short chip 1>",
    "<short chip 2>",
    "<short chip 3>"
  ]
}

`suggestions` rules (CRITICAL — these are the quick-reply chips the user
clicks in the chat; without them the conversation feels dead):
- ALWAYS include 2-4 SHORT chips (1-4 words each) whenever you're asking the
  user a question AND done=false. NEVER leave suggestions empty when asking.
- Chips must directly answer YOUR question — not generic phrases.
- Use the user's interface language (Russian by default).
- Examples for "Вокал или инструментал?": ["С вокалом", "Инструментал", "Не важно"]
- Examples for "Какое настроение?": ["Агрессивное", "Меланхоличное", "Энергичное", "Спокойное"]
- Examples for "Какой темп?": ["Медленный", "Средний", "Быстрый"]
- Examples for "Жанр?": ["Подбери сам", "Rock / Metal", "Lo-fi / Chill", "Electronic / EDM"]
- Examples for "Расскажи подробнее?": ["Грустная", "Энергичная", "Романтика", "Кино-эпик"]
  → Even on open questions, offer 3-4 SAMPLE directions so user can click instead of typing.
- The ONLY times suggestions MUST be []:
  • done=true (brief finalised)
  • reply contains lyrics draft for review (the lyrics buttons replace chips)
- When user has given a rich brief and the next message is acknowledgement +
  one-clarification — still provide 2-3 chips for that clarification.

Intent structure (only when done=true):
{
  "module": "song" | "instrumental" | "occasion" | "sound_effect" | "cover_song" | "cover_art",
  "confidence": "high" | "medium" | "low",
  "params": {
    "description": "<short user-facing label, ≤500 chars; for sound_effect this
      becomes the literal SFX prompt; for occasion it's the recipient/context>",
    "text_mode": "ai" | "custom" | "none",
    "lyrics": "<final approved lyrics: the user's own pasted text OR your drafted
      text AFTER the user approved it (LYRICS DRAFTING STEP E). Empty otherwise>",
    "genre": "<English label, e.g. 'Pop', 'Rock', 'Lo-fi', 'Ambient'>",
    "custom_genre": "<free text only if no preset matches>",
    "mood": "<English label, e.g. 'Happy', 'Melancholic', 'Energetic'>",
    "tempo": "slow" | "medium" | "fast",
    "vocal": "male" | "female" | "",
    "occasion_type": "<e.g. 'birthday', 'wedding'>"
  },
  "note": "<short Russian sentence shown next to the launch button, e.g.
    'Запущу инструменталку — соло ударных, без вокала'>"
}

Hard rules:
- Output JSON only — no commentary, no markdown, no code fences, no extra keys.
- When done=false: `summary`, `prompt` must be empty strings, `intent` must be null.
- When done=true: `reply` is a brief friendly handoff, NOT a question. `summary`,
  `prompt`, and `intent` MUST all be filled.
- Explicit user exclusions go to `music_params.negative_tags`, NEVER into
  `prompt` text as "no X" (text negation attracts what it negates). Positive
  restrictions stay positive in `prompt`: "только ударные" → "drums only".
  Sole exception: "instrumental, no vocals" for instrumental tracks.
- Use English for `prompt`, `genre`, `mood`, `tempo` values — Suno understands
  English best.
- For cover_song set confidence=low and explain the user must upload an audio
  file first. For cover_art — finalise normally with confidence=high once the
  visual brief is collected.
- For occasion the description should mention the recipient if known
  (e.g. "Songfor Маме на 60 лет — ключевые факты: ...").
"""


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


def _build_user_context(req: AgentChatRequest) -> str:
    """Compact preface so GPT knows what UI parameters are already chosen."""
    bits: list[str] = [f"Module hint: {req.module}"]
    if req.selected_genre:
        bits.append(f"User pre-selected genre: {req.selected_genre}")
    if req.selected_mood:
        bits.append(f"User pre-selected mood: {req.selected_mood}")
    if req.selected_tempo:
        bits.append(f"User pre-selected tempo: {req.selected_tempo}")
    if req.selected_vocal:
        bits.append(f"User pre-selected vocal: {req.selected_vocal}")
    return "\n".join(bits)


def _detect_reply_language(messages: list[ChatMessage], ui_lang: str = "") -> str:
    """Decide which language the agent must use for the next reply.

    The SITE LANGUAGE SETTING (``ui_lang``, sent by the frontend) is
    authoritative: a user who set the interface to Russian must never get an
    English reply just because they pasted a Latin artist name or a Spotify
    URL — that content-based flip was a recurring owner complaint. Content
    detection (Cyrillic vs Latin counts) is only the fallback for unknown
    ``ui_lang`` values.

    Returns: "English" or "Russian".
    """
    lang = (ui_lang or "").strip().lower()
    if lang.startswith("ru"):
        return "Russian"
    if lang.startswith("en"):
        return "English"

    user_msgs = [m.content for m in messages if m.role == "user"][-5:]
    if not user_msgs:
        return "Russian"

    def score(text: str) -> tuple[int, int]:
        cyr = sum(1 for c in text if "Ѐ" <= c <= "ӿ")
        lat = sum(1 for c in text if c.isalpha() and c.isascii())
        return cyr, lat

    last_cyr, last_lat = score(user_msgs[-1])
    # Only treat the latest message as authoritative when it's substantial
    # (≥10 alphabetic chars) — short replies like "ok" or "lo-fi" don't
    # signal a language switch on their own.
    if last_cyr + last_lat >= 10:
        if last_lat > last_cyr:
            return "English"
        if last_cyr > last_lat:
            return "Russian"

    # Otherwise tally the recent history.
    cyr = lat = 0
    for text in user_msgs:
        c, l = score(text)
        cyr += c
        lat += l
    return "English" if lat > cyr else "Russian"


_SMALLTALK_MARKERS = (
    "привет", "здравств", "добрый день", "добрый вечер", "доброе утро",
    "хай", "hi", "hello", "hey", "что ты умеешь", "как дела",
    "спасибо", "благодар", "thanks", "thank you",
)


def _pick_model(messages: list[ChatMessage]) -> str:
    """Quality-first routing: gpt-4o for every brief-shaping turn.

    gpt-4o-mini is allowed ONLY for unmistakable small talk (greetings,
    thanks). The previous marker-list heuristic sent any turn without a
    genre/verb keyword to mini — so "Романтичная баллада" or a first message
    like "хочу что-то для мамы" got the cheap model, which visibly swallows
    the "понял задачу" acknowledgement and asks fewer questions (owner
    complaint 2026-06-12: the agent must always respond like an attentive
    human). The 3-5x cost difference is not worth the first impression.
    """
    if not messages:
        return "gpt-4o-mini"
    last_user = next((m for m in reversed(messages) if m.role == "user"), None)
    if last_user is None:
        return "gpt-4o-mini"
    blob = last_user.content.lower().strip()
    if len(blob) <= 30 and any(marker in blob for marker in _SMALLTALK_MARKERS):
        return "gpt-4o-mini"
    return "gpt-4o"


async def _build_user_stats(session: AsyncSession, user: User) -> str:
    """Fetch a compact natural-language summary of the user's creative profile.

    Stats power soft personalisation — agent can drop a one-liner like
    "ты часто делаешь lo-fi / chill — может попробуем тёплую палитру?".
    Returns empty string when the user has no relevant history.
    """
    total_q = select(func.count(Generation.id)).where(
        Generation.user_id == user.id,
        Generation.deleted_at.is_(None),
        Generation.type != GenerationType.lyrics,
    )
    total = int((await session.execute(total_q)).scalar_one() or 0)
    if total == 0:
        return ""

    completed_q = select(func.count(Generation.id)).where(
        Generation.user_id == user.id,
        Generation.deleted_at.is_(None),
        Generation.status == GenerationStatus.completed,
        Generation.type != GenerationType.lyrics,
    )
    completed = int((await session.execute(completed_q)).scalar_one() or 0)

    recent_rows = (
        await session.execute(
            select(Generation.type, Generation.genre, Generation.mood)
            .where(
                Generation.user_id == user.id,
                Generation.deleted_at.is_(None),
                Generation.type != GenerationType.lyrics,
            )
            .order_by(desc(Generation.created_at))
            .limit(40)
        )
    ).all()

    types = Counter[str]()
    genres = Counter[str]()
    moods = Counter[str]()
    for t, g, m in recent_rows:
        if t is not None:
            types[t.value if hasattr(t, "value") else str(t)] += 1
        if g:
            genres[str(g)] += 1
        if m:
            moods[str(m)] += 1

    pieces: list[str] = [
        f"User stats — total generations: {total} (completed: {completed})."
    ]
    if types:
        top_types = ", ".join(f"{k}:{v}" for k, v in types.most_common(4))
        pieces.append(f"Recent module mix: {top_types}.")
    if genres:
        top_genres = ", ".join(f"{k} ({v})" for k, v in genres.most_common(3))
        pieces.append(f"Favorite genres: {top_genres}.")
    if moods:
        top_moods = ", ".join(f"{k} ({v})" for k, v in moods.most_common(3))
        pieces.append(f"Favorite moods: {top_moods}.")
    pieces.append(
        "Use these stats SPARINGLY (1 line max) when relevant — "
        "to suggest a palette/genre that matches what the user already loves, "
        "or to gently broaden their range. Do NOT mention raw numbers in chat."
    )
    return " ".join(pieces)


_GENRE_LINE_RE = re.compile(r"(?im)^[^\n]*\b(жанр|стиль|genre|style)\b[^\n]*[:：—-]")


def _has_genre_line(summary: str) -> bool:
    """True if the brief already names a genre / стиль / style line."""
    return bool(_GENRE_LINE_RE.search(summary))


def _splice_after_first_bullet(summary: str, new_line: str) -> str:
    """Insert ``new_line`` right after the first bullet (Тема / Topic line).

    Falls back to prepending if no bullet line is found in the first 3 lines.
    """
    lines = summary.splitlines()
    for idx, line in enumerate(lines[:3]):
        if line.lstrip().startswith("•") or line.lstrip().startswith("-"):
            lines.insert(idx + 1, new_line)
            return "\n".join(lines)
    return f"{new_line}\n{summary}"


# Unambiguous vocal-negation markers — safe to scan in the agent's own
# reply/summary. Bare "инструментал"/"instrumental" is NOT here: normal song
# briefs legitimately say "инструментальные партии" / "rich instrumental,
# layered vocals", and forcing those to module=instrumental silently killed
# the vocals (found in the 2026-07-05 audit).
_INSTRUMENTAL_STRICT_MARKERS = (
    "без вокала",
    "без голоса",
    "без слов",
    "только бит",
    "только инструмент",
    "только ударные",
    "только гитара",
    "только барабаны",
    "no vocals",
    "no vocal",
    "instrumental only",
    "instrumental track",
)

# Bare genre-level markers — trusted ONLY in intent.params.description (the
# module-bound label), never in prose fields.
_INSTRUMENTAL_DESC_MARKERS = _INSTRUMENTAL_STRICT_MARKERS + (
    "инструментал",
    "instrumental",
)


def _looks_instrumental(description: str, *prose_texts: str) -> bool:
    desc = (description or "").lower()
    if any(marker in desc for marker in _INSTRUMENTAL_DESC_MARKERS):
        return True
    blob = " ".join(t.lower() for t in prose_texts if t)
    return any(marker in blob for marker in _INSTRUMENTAL_STRICT_MARKERS)


# Unambiguous SFX markers — safe anywhere (reply/summary/prompt).
_SFX_STRICT_MARKERS = (
    "звуковой эффект",
    "звуковые эффекты",
    "звук эффект",
    "sound effect",
    "sound-effect",
    "sfx",
    "звуковая текстура",
    "impact sound",
    "intro sting",
    "ringtone",
)

# Context markers — a normal track brief often contains these words in prose
# («взрывная энергия», «атмосфера звука города», «в стиле Стинга»), so they
# are trusted ONLY inside intent.params.description, which for sound_effect
# IS the literal SFX brief.
_SFX_DESC_MARKERS = _SFX_STRICT_MARKERS + (
    " звук ",  # space-bounded so we don't match "звуковая дорожка"
    "звук хора",
    "звук дождя",
    "звук моря",
    "звук ветра",
    "звук удара",
    "звук уведомления",
    "эмбиент звук",
    "one-shot",
    "whoosh",
    "взрыв",
    "выстрел",
    "хлопок",
)


def _looks_sound_effect(description: str, *prose_texts: str) -> bool:
    """Detect that the user is asking for a short SFX rather than a track."""
    desc = f" {(description or '').lower()} "
    if any(marker in desc for marker in _SFX_DESC_MARKERS):
        return True
    blob = f" {' '.join((t.lower() if t else '') for t in prose_texts)} "
    return any(marker in blob for marker in _SFX_STRICT_MARKERS)


_COVER_ART_MARKERS = (
    "обложк",  # обложка, обложку, обложки
    "cover art",
    "album cover",
    "artwork",
    "картинку для трека",
    "картинка для трека",
    "арт для трека",
    "арт обложк",
)


def _looks_cover_art(*texts: str) -> bool:
    """Scan description + summary ONLY — the agent's reply legitimately offers
    «потом можешь сделать обложку» as a follow-up on music briefs, and that
    must not force the whole launch to cover_art."""
    blob = " ".join((t.lower() if t else "") for t in texts)
    return any(marker in blob for marker in _COVER_ART_MARKERS)


def _coerce_intent(
    raw: Any,
    module_hint: ModuleKind,
    *,
    reply_text: str = "",
    summary_text: str = "",
    prompt_text: str = "",
) -> AgentIntent:
    """Best-effort parse of the GPT-emitted intent object.

    GPT occasionally returns an empty object, a string, or skips fields. We
    always end up with a usable AgentIntent (falling back to the module hint)
    so the frontend can show the launch button. Callers should still gate on
    ``done=True`` before showing the launch UI.

    Additionally enforces a hard ``instrumental`` override: if the brief
    explicitly says "без вокала" / "instrumental" / "только барабаны" but
    the model still returned module=song with a vocal, we coerce it to
    module=instrumental and drop the vocal — Suno was generating with vocals
    for clearly-instrumental briefs because GPT slipped on the module flag.
    """
    if not isinstance(raw, dict):
        raw = {}

    module_val = str(raw.get("module") or module_hint).strip().lower()
    if module_val not in (
        "song",
        "instrumental",
        "occasion",
        "sound_effect",
        "cover_song",
        "cover_art",
    ):
        module_val = module_hint

    confidence = str(raw.get("confidence") or "medium").strip().lower()
    if confidence not in ("high", "medium", "low"):
        confidence = "medium"

    raw_params = raw.get("params") or {}
    if not isinstance(raw_params, dict):
        raw_params = {}

    text_mode = str(raw_params.get("text_mode") or "ai").strip().lower()
    if text_mode not in ("ai", "custom", "none"):
        text_mode = "ai"

    tempo = str(raw_params.get("tempo") or "").strip().lower()
    if tempo not in ("", "slow", "medium", "fast"):
        tempo = ""

    vocal = str(raw_params.get("vocal") or "").strip().lower()
    if vocal not in ("", "male", "female"):
        vocal = ""

    description = str(raw_params.get("description") or "")[:500]

    # Hard SFX override — "звуковой эффект Х" must NEVER route to
    # instrumental/song. SFX is a different generator and a wrong route
    # costs the user tokens for a useless result. Context markers («звук
    # дождя», «взрыв») count only inside description; prose fields need
    # the unambiguous «звуковой эффект»/sfx wording.
    if module_val in ("song", "instrumental", "occasion") and _looks_sound_effect(
        description, reply_text, summary_text, prompt_text
    ):
        logger.info(
            "[AGENT] forcing module=sound_effect — SFX markers detected "
            "in brief (was module={})", module_val,
        )
        module_val = "sound_effect"
        vocal = ""
        text_mode = "none"

    # Hard cover_art override — "обложка" wins over "сделай трек".
    # Reply is NOT scanned: the agent often offers cover art as a follow-up.
    if module_val in ("song", "instrumental", "occasion", "sound_effect") and _looks_cover_art(
        description, summary_text
    ):
        logger.info(
            "[AGENT] forcing module=cover_art — cover-art markers detected "
            "(was module={})", module_val,
        )
        module_val = "cover_art"
        vocal = ""
        text_mode = "none"

    # Hard instrumental override — protects against GPT slipping on the
    # module flag when the brief is clearly instrumental. Runs LAST so
    # sound_effect / cover_art win first. The English `prompt` is NOT
    # scanned — song prompts legitimately contain "instrumental" prose.
    if module_val in ("song", "occasion") and _looks_instrumental(
        description, reply_text, summary_text
    ):
        logger.info(
            "[AGENT] forcing module=instrumental — instrumental markers "
            "detected in brief (was module={})", module_val,
        )
        module_val = "instrumental"
        vocal = ""
        text_mode = "none"

    params = AgentIntentParams(
        description=description,
        text_mode=text_mode,
        lyrics=str(raw_params.get("lyrics") or "")[:5000] if module_val == "song" else "",
        genre=str(raw_params.get("genre") or "")[:64],
        custom_genre=str(raw_params.get("custom_genre") or "")[:128],
        mood=str(raw_params.get("mood") or "")[:32],
        tempo=tempo,
        vocal=vocal,
        occasion_type=str(raw_params.get("occasion_type") or "")[:64],
    )

    return AgentIntent(
        module=module_val,
        confidence=confidence,
        params=params,
        note=str(raw.get("note") or "")[:280],
    )


# Matches `"reply": "text..."` where the closing quote may not yet exist.
# Captures the text inside without consuming the closing quote, so we can
# emit partial reply deltas while the stream is still in flight.
_REPLY_FIELD_RE = re.compile(r'"reply"\s*:\s*"((?:[^"\\]|\\.)*)')


async def _stream_agent_completion(
    body: AgentChatRequest,
    client: AsyncOpenAI,
    chat_messages: list[dict[str, str]],
    chosen_model: str,
    reply_lang: str,
    user_id: int | None = None,
) -> AsyncIterator[bytes]:
    """SSE generator: streams reply deltas + a final structured event.

    Two events:
      • `reply` — incremental text chunks of the user-facing reply.
        Frontend appends each delta to the in-progress agent message,
        so the user sees the answer typing live instead of waiting for
        the full 5-10s GPT round-trip.
      • `complete` — final JSON with everything (done, summary, prompt,
        music_params, intent, suggestions, prompt_version, model).
        Sent after the OpenAI stream closes and we re-run the existing
        post-processing pipeline on the accumulated JSON.

    JSON-output mode stays on: GPT emits one big object, we extract the
    `reply` field substring incrementally with a regex while the rest
    of the JSON streams in. When the full JSON arrives we hand it to
    _postprocess_agent_reply which preserves every safety net (music
    params patching, genre splice, intent coercion, etc).
    """
    accumulated = ""
    last_reply_pos = 0
    _t0 = perf_counter()
    try:
        stream_resp = await client.chat.completions.create(  # type: ignore[call-overload]
            model=chosen_model,
            messages=chat_messages,
            temperature=0.55,
            max_tokens=1800,
            response_format={"type": "json_object"},
            stream=True,
        )
        async for chunk in stream_resp:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if not delta:
                continue
            accumulated += delta
            # Extract whatever fits inside `"reply": "...` so far.
            m = _REPLY_FIELD_RE.search(accumulated)
            if m:
                raw_reply = m.group(1)
                try:
                    # JSON-unescape (handles \n, \", \\, \uXXXX inside the
                    # captured substring). We close the string with " so the
                    # parser accepts it.
                    unescaped = json.loads(f'"{raw_reply}"')
                except Exception:
                    unescaped = raw_reply
                if len(unescaped) > last_reply_pos:
                    new_part = unescaped[last_reply_pos:]
                    last_reply_pos = len(unescaped)
                    yield (
                        b"event: reply\n"
                        b"data: " + json.dumps({"delta": new_part}).encode("utf-8")
                        + b"\n\n"
                    )
    except Exception as exc:
        logger.exception("agent_chat stream: GPT call failed: {}", exc)
        yield (
            b"event: error\n"
            b"data: " + json.dumps({"detail": "agent backend unavailable"}).encode("utf-8")
            + b"\n\n"
        )
        return

    final = _postprocess_agent_reply(
        accumulated, body, chosen_model, reply_lang,
        user_id=user_id, latency_ms=int((perf_counter() - _t0) * 1000),
    )
    yield (
        b"event: complete\n"
        b"data: " + final.model_dump_json().encode("utf-8")
        + b"\n\n"
    )


# Always-on rule telling the model how to treat the grounded-reference notes
# that _reference_facts() may inject below.
_REF_GROUNDING_RULE = (
    "REFERENCE GROUNDING: if a system note labelled 'REFERENCE DATA' is present, treat it as "
    "authoritative — base genre / era / tempo / key_instruments / research_notes on those facts "
    "and never invent a different style. On the FINALIZE turn (done=true) this is mandatory: "
    "copy the note's key instruments into music_params.key_instruments, its production/signature "
    "facts into research_notes and techniques, its BPM into suggested_bpm — the downstream prompt "
    "engineer sees ONLY music_params/research_notes, so any fact you leave out of them is lost. "
    "If a note labelled 'REFERENCE LOOKUP: no reliable data' "
    "is present, do NOT fabricate that artist's sound — keep done=false and ask the user to "
    "describe the style or name a specific track. Never confabulate a niche or ambiguous artist "
    "from memory."
)

# Heuristic gate: only spend a lookup when the latest message actually contains
# a latin word or a Capitalised Cyrillic word (artist/song names usually do).
_REF_HINT_RE = re.compile(r"[A-Za-z]{2,}|[А-ЯЁ][а-яё]+")


async def _reference_facts(windowed: list[Any], client: AsyncOpenAI, settings: Settings) -> str:
    """Ground a user-named artist/song reference with real catalogue data.

    • URL (Spotify/YT/Deezer) → Deezer (exact BPM/genre/era/Last.fm tags).
    • Plain artist name       → Perplexity web-search (handles niche / non-English
      artists; falls back to relevance-gated Deezer if no OpenRouter key).

    Returns a system note for the model, or "".
    Fails safe — any error/timeout returns "" so the turn proceeds unchanged.
    """
    from app.services.artist_research import research_reference

    # Scan the WHOLE window, newest first — previously only the LAST user
    # message was checked, so on the finalize turn («собирай бриф») the
    # reference facts vanished from context and the model built music_params
    # from hazy general knowledge (owner complaint: correct first description,
    # then a brief that sounds nothing like the artist). Lookups are TTL-cached
    # downstream, so re-grounding every turn is cheap.
    user_msgs = [
        str(getattr(m, "content", "") or "")
        for m in windowed
        if getattr(m, "role", "") == "user"
    ]
    if not user_msgs:
        return ""

    # URL reference: take the newest link anywhere in the conversation.
    url_query = ""
    for msg_text in reversed(user_msgs):
        u = (detect_reference_url(msg_text) or "").strip()
        if u:
            url_query = u
            break

    name_query = ""
    if not url_query:
        recent = [t.strip() for t in user_msgs[-8:] if len(t.strip()) >= 4 and _REF_HINT_RE.search(t)]
        if not recent:
            return ""
        excerpt = "\n".join(f"- {t[:300]}" for t in recent)
        # Cheap extraction of the most recently named artist/song reference.
        try:
            ex = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": (
                        "Below are the user's recent messages from a music-brief chat, oldest "
                        "first. Extract the ONE real music artist, band, producer or song the "
                        "user most recently named as a style reference. Respond JSON "
                        '{"q":"<name>"}, or {"q":""} if no real artist/song is named anywhere.')},
                    {"role": "user", "content": excerpt[:1500]},
                ],
                temperature=0,
                max_tokens=40,
                response_format={"type": "json_object"},
            )
            name_query = (json.loads(ex.choices[0].message.content or "{}").get("q") or "").strip()
        except Exception:
            return ""

    if not url_query and not name_query:
        return ""

    # ── URL path: Deezer (exact BPM) ────────────────────────────────────────
    if url_query:
        try:
            data = await asyncio.wait_for(
                resolve_reference(url_query, lastfm_api_key=settings.lastfm_api_key), timeout=8.0
            )
        except Exception:
            data = None
        if not data:
            return f"REFERENCE LOOKUP: no reliable catalogue data found for «{url_query}»."
        bits = [f"{k}: {data[k]}" for k in ("artist", "genre", "era", "tempo") if data.get(k)]
        tags = ", ".join(data.get("tags") or [])
        if tags:
            bits.append(f"tags: {tags}")
        logger.info("AGENT ref-ground (deezer): «{}» → {} genre={} era={} tags=[{}]",
                    url_query, data.get("artist"), data.get("genre"), data.get("era"), tags)
        return (
            "REFERENCE DATA (looked up via Deezer — GROUND research_notes and music_params "
            "in THESE facts, do not invent a different style): "
            + "; ".join(bits)
            + f". (matched: {data.get('artist')} — {data.get('title')})"
        )

    # ── Name path: Perplexity web-search ────────────────────────────────────
    pdata = None
    if settings.openrouter_api_key:
        try:
            pdata = await asyncio.wait_for(
                research_reference(name_query, settings=settings), timeout=12.0
            )
        except Exception:
            pdata = None

    if pdata:
        confidence = float(pdata.get("confidence") or 0)
        ambiguous = bool(pdata.get("ambiguous", False))

        if confidence < 0.8 or ambiguous:
            note = pdata.get("note") or pdata.get("artist") or name_query
            logger.info("AGENT ref-ground (perplexity): «{}» low confidence={:.2f} ambiguous={} → ask user",
                        name_query, confidence, ambiguous)
            return (
                f"REFERENCE LOOKUP: web search found a candidate for «{name_query}» but confidence "
                f"is low ({confidence:.0%}) or the name is ambiguous. Candidate: {note}. "
                "DO NOT invent a style. Ask the user to confirm or provide a direct link."
            )

        bits: list[str] = []
        if pdata.get("genre"):
            bits.append(f"genre: {pdata['genre']}")
        if pdata.get("era"):
            bits.append(f"era: {pdata['era']}")
        if pdata.get("tempo"):
            bits.append(f"tempo: {pdata['tempo']}")
        if pdata.get("bpm"):
            bits.append(f"BPM: ~{int(pdata['bpm'])}")
        tags_list = pdata.get("tags") or []
        if tags_list:
            bits.append(f"tags: {', '.join(tags_list[:6])}")
        if pdata.get("instruments"):
            bits.append(f"key instruments: {', '.join(pdata['instruments'])}")
        if pdata.get("vocal_style"):
            bits.append(f"vocal style: {pdata['vocal_style']}")
        if pdata.get("signature"):
            bits.append(f"signature sound: {pdata['signature']}")
        if pdata.get("similar"):
            bits.append(f"similar artists: {', '.join(pdata['similar'][:4])}")
        if pdata.get("production"):
            bits.append(f"production: {pdata['production']}")
        logger.info("AGENT ref-ground (perplexity): «{}» → confidence={:.2f} genre={!r} era={!r} tags={}",
                    name_query, confidence, pdata.get("genre"), pdata.get("era"), tags_list[:4])
        return (
            "REFERENCE DATA (looked up via Perplexity web-search — GROUND research_notes and "
            "music_params in THESE facts, do not invent a different style): "
            + "; ".join(bits)
            + f". (matched artist: {pdata.get('artist')})"
        )

    # ── Fallback: relevance-gated Deezer ────────────────────────────────────
    try:
        data = await asyncio.wait_for(
            resolve_reference(name_query, lastfm_api_key=settings.lastfm_api_key), timeout=8.0
        )
    except Exception:
        data = None

    if not data:
        logger.info("AGENT ref-ground: «{}» → NO DATA (model will be told to ask)", name_query)
        return f"REFERENCE LOOKUP: no reliable catalogue data found for «{name_query}». Ask the user to confirm or provide a direct link."

    bits = [f"{k}: {data[k]}" for k in ("artist", "genre", "era", "tempo") if data.get(k)]
    tags = ", ".join(data.get("tags") or [])
    if tags:
        bits.append(f"tags: {tags}")
    logger.info("AGENT ref-ground (deezer-fallback): «{}» → {} genre={} era={} tags=[{}]",
                name_query, data.get("artist"), data.get("genre"), data.get("era"), tags)
    return (
        "REFERENCE DATA (looked up via Deezer — GROUND research_notes and music_params "
        "in THESE facts, do not invent a different style): "
        + "; ".join(bits)
        + f". (matched: {data.get('artist')} — {data.get('title')})"
    )


@router.post("/chat", response_model=AgentChatResponse)
@limiter.limit("30/minute")
async def agent_chat(
    body: Annotated[AgentChatRequest, Body()],
    request: Request,
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
) -> AgentChatResponse:
    """Stateless chat turn — frontend replays full message history each call."""
    # When the frontend just opens the chat, it sends an empty history to
    # request the canned opener. We respond locally without hitting GPT —
    # this saves a round-trip and is also covered by
    # `tests/test_agent.py::test_first_turn_returns_canned_opening_without_calling_gpt`.
    if not body.messages:
        return AgentChatResponse(
            reply=(
                "Hi! I'm RIFFA Agent — I'll help you build a prompt for our "
                "AI studio. Tell me in a couple of words what you want to make: "
                "a track, an instrumental, cover art or a sound effect?"
                if (body.lang or "").lower().startswith("en") else
                "Привет! Я RIFFA Agent — помогу собрать промпт для нашей "
                "AI-студии. Расскажи в двух словах, что хочется сделать: "
                "трек, инструментал, обложку или эффект?"
            ),
            done=False,
            model="canned",
        )

    api_key = settings.apiyi_key or settings.openai_api_key
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent is not configured",
        )

    client = AsyncOpenAI(api_key=api_key, base_url=settings.openai_base_url)

    # Sliding window — only the last 40 turns go to GPT (keeps context tight
    # and token cost predictable for long chats).
    windowed = body.messages[-40:]
    reply_lang = _detect_reply_language(windowed, ui_lang=body.lang)
    chat_messages: list[dict[str, str]] = [
        {"role": "system", "content": _SYS_AGENT},
        {
            "role": "system",
            "content": (
                f"Reply language: {reply_lang}. This is the language for "
                f"`reply`, `suggestions`, `intent.note`, `summary`, and every "
                f"other user-facing string in this response. Do not switch "
                f"languages within this turn."
            ),
        },
        {"role": "system", "content": _build_user_context(body)},
    ]
    try:
        stats_block = await _build_user_stats(session, user)
        if stats_block:
            chat_messages.append({"role": "system", "content": stats_block})
    except Exception as exc:
        logger.warning("agent_chat: stats lookup failed for user {}: {}", user.id, exc)

    # Only the windowed slice (last 40 turns) goes to GPT — keeps token cost and
    # latency bounded on long chats and avoids blowing the model context.
    for m in windowed:
        chat_messages.append(
            {
                "role": "assistant" if m.role == "agent" else "user",
                "content": m.content,
            }
        )

    chat_messages.append({"role": "system", "content": _REF_GROUNDING_RULE})
    try:
        ref_note = await _reference_facts(windowed, client, settings)
        if ref_note:
            chat_messages.append({"role": "system", "content": ref_note})
    except Exception as exc:
        logger.warning("agent_chat: reference grounding failed: {}", exc)

    chosen_model = _pick_model(body.messages)
    try:
        # Brief-shaping turns get the full gpt-4o (handles MODULE ROUTER,
        # MUSIC_PARAMS validation, LYRICS DRAFTING reliably). Pure chitchat
        # gets gpt-4o-mini (3-5× cheaper, 2× faster, plenty for "hi" or
        # "что ты умеешь?"). _pick_model handles the routing.
        # `response_format` accepts the {"type": "json_object"} literal at
        # runtime, but the typed-dict variant in openai 1.61 is too narrow
        # for mypy to pick the right overload — silence just this call.
        _t0 = perf_counter()
        resp = await client.chat.completions.create(  # type: ignore[call-overload]
            model=chosen_model,
            messages=chat_messages,
            temperature=0.55,
            max_tokens=1800,
            response_format={"type": "json_object"},
        )
        _latency_ms = int((perf_counter() - _t0) * 1000)
        raw = (resp.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.exception("agent_chat: GPT call failed for user {}: {}", user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Agent backend is temporarily unavailable",
        ) from exc

    return _postprocess_agent_reply(
        raw, body, chosen_model, reply_lang,
        user_id=user.id, latency_ms=_latency_ms,
    )


def _log_agent_turn(
    *,
    body: AgentChatRequest,
    chosen_model: str,
    done: bool,
    music_params: dict[str, Any],
    suggestions: list[str],
    reply: str,
    user_id: int | None,
    latency_ms: int | None,
) -> None:
    """One structured line per agent turn for offline analysis / tuning.

    Logged to the app log (not the DB) so we don't persist user conversations:
    only coarse signals — module, model, latency, whether it finalised, the key
    music params, and the last user message (truncated) — enough to study where
    the agent over/under-asks and which briefs convert. Grep ``AGENT_TURN``.
    """
    last_user = ""
    user_turns = 0
    for m in body.messages:
        if getattr(m, "role", "") == "user":
            user_turns += 1
            last_user = getattr(m, "content", "") or last_user
    payload = {
        "user_id": user_id,
        "module": body.module,
        "model": chosen_model,
        "latency_ms": latency_ms,
        "done": done,
        "user_turns": user_turns,
        "last_user": last_user[:200],
        "genre": music_params.get("genre") or music_params.get("custom_genre") or "",
        "mood": music_params.get("mood", ""),
        "tempo": music_params.get("tempo", ""),
        "vocal": music_params.get("vocal", ""),
        "suggestions": len(suggestions),
        "reply_len": len(reply),
    }
    logger.info("AGENT_TURN {}", json.dumps(payload, ensure_ascii=False))


def _postprocess_agent_reply(
    raw: str,
    body: AgentChatRequest,
    chosen_model: str,
    reply_lang: str,
    *,
    user_id: int | None = None,
    latency_ms: int | None = None,
) -> AgentChatResponse:
    """Parse + validate + safety-net the raw JSON reply from GPT.

    Extracted so the streaming path can reuse identical post-processing once
    it accumulates the full JSON payload.
    """
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # GPT broke JSON (truncation, literal newlines inside a string, ```json
        # fences…). Salvage ONLY the user-facing reply — never dump the raw JSON
        # blob, which renders as a huge, mostly-empty bubble in the chat.
        logger.warning("agent_chat: GPT returned non-JSON, salvaging reply")
        salvaged = ""
        mm = _REPLY_FIELD_RE.search(raw)
        if mm:
            try:
                salvaged = json.loads(f'"{mm.group(1)}"')
            except json.JSONDecodeError:
                salvaged = mm.group(1)
        salvaged = re.sub(r"\n{3,}", "\n\n", salvaged).strip()
        if not salvaged:
            salvaged = (
                "Sorry, I glitched for a second — could you say that again?"
                if reply_lang == "English"
                else "Извини, я на секунду завис — повтори, пожалуйста?"
            )
        return AgentChatResponse(
            reply=salvaged[:1500], done=False,
            prompt_version=AGENT_PROMPT_VERSION, model=chosen_model,
        )

    reply = str(parsed.get("reply", "")).strip()
    done = bool(parsed.get("done", False))
    summary = str(parsed.get("summary", "")).strip() if done else ""
    prompt = str(parsed.get("prompt", "")).strip() if done else ""
    short_prompt = str(parsed.get("short_prompt", "")).strip() if done else ""
    music_params = _coerce_music_params(parsed.get("music_params")) if done else {}
    research_notes = str(parsed.get("research_notes", "")).strip()[:2000] if done else ""

    # SAFETY NET: if the agent set done=true but ALL music_params strings are
    # empty (it ignored the rule above), log a warning and fill the bare
    # minimum from `intent.params` so the downstream pipeline isn't fed an
    # empty signal. Better an OK prompt than a generic one.
    if done and music_params:
        filled_strings = sum(
            1 for k in ("genre", "subgenre", "mood", "tempo", "era", "suggested_bpm")
            if music_params.get(k)
        )
        has_instruments = bool(music_params.get("key_instruments"))
        if filled_strings == 0 and not has_instruments:
            raw_intent = parsed.get("intent") or {}
            intent_params = raw_intent.get("params") or {}
            logger.warning(
                "[AGENT] music_params empty despite done=true — patching from intent.params"
            )
            for src, dst in (("genre", "genre"), ("custom_genre", "custom_genre"),
                             ("mood", "mood"), ("tempo", "tempo")):
                v = intent_params.get(src)
                if v and not music_params.get(dst):
                    music_params[dst] = str(v).strip()[:128]

    # Cap prompt at Suno's music limit (5000) just in case.
    if len(prompt) > 5000:
        prompt = prompt[:5000].rsplit(" ", 1)[0]
    # `prompt` is deprecated but the frontend still gates the launch button on
    # it — synthesize one from music_params so a model that skipped the legacy
    # field doesn't silently lose the whole brief.
    if done and not prompt:
        fallback_bits = [
            music_params.get("subgenre") or music_params.get("custom_genre") or music_params.get("genre") or "",
            ", ".join(music_params.get("key_instruments") or []),
            music_params.get("mood", ""),
            music_params.get("suggested_bpm", ""),
        ]
        prompt = short_prompt or ", ".join(b for b in fallback_bits if b)
        if prompt:
            logger.warning("[AGENT] done=true without `prompt` — synthesized fallback")
    # short_prompt fallback: distill from the full prompt if GPT omitted it.
    if done and not short_prompt and prompt:
        short_prompt = prompt[:220].rsplit(" ", 1)[0]
    short_prompt = short_prompt[:240]

    intent = (
        _coerce_intent(
            parsed.get("intent"),
            body.module,
            reply_text=reply,
            summary_text=summary,
            prompt_text=prompt,
        )
        if done
        else None
    )

    # Genre is required in the brief. If GPT omitted the line, splice it in
    # using whatever we know from music_params or intent.params.
    if done and summary and not _has_genre_line(summary):
        inferred_genre = (
            (music_params.get("custom_genre") or music_params.get("subgenre") or music_params.get("genre") or "")
            if music_params
            else ""
        )
        if not inferred_genre and intent is not None:
            inferred_genre = intent.params.custom_genre or intent.params.genre
        if inferred_genre:
            label = "Genre" if reply_lang == "English" else "Жанр"
            line = f"• {label}: {inferred_genre}"
            summary = f"{line}\n{summary}" if not summary.startswith("•") else _splice_after_first_bullet(summary, line)

    raw_suggestions = parsed.get("suggestions", [])
    suggestions: list[str] = []
    if isinstance(raw_suggestions, list) and not done:
        for s in raw_suggestions:
            if isinstance(s, str) and s.strip():
                suggestions.append(s.strip()[:60])

    if not reply:
        reply = "Понял." if done else "Можешь рассказать чуть подробнее?"

    _log_agent_turn(
        body=body, chosen_model=chosen_model, done=done,
        music_params=music_params, suggestions=suggestions, reply=reply,
        user_id=user_id, latency_ms=latency_ms,
    )

    return AgentChatResponse(
        reply=reply, done=done, summary=summary, prompt=prompt,
        short_prompt=short_prompt,
        music_params=music_params, research_notes=research_notes,
        intent=intent, suggestions=suggestions,
        prompt_version=AGENT_PROMPT_VERSION,
        model=chosen_model,
    )


@router.post("/chat/stream")
@limiter.limit("30/minute")
async def agent_chat_stream(
    body: Annotated[AgentChatRequest, Body()],
    request: Request,
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
) -> StreamingResponse:
    """SSE variant of /chat — streams `reply` deltas, then a final
    `complete` event with the full AgentChatResponse JSON.

    Shares every system-prompt build, model-routing, language-lock and
    post-processing path with /chat — only the OpenAI call switches to
    stream=True and we emit chunks as they arrive.
    """
    # Canned opener path: no GPT call, no stream — just send the complete
    # event in one shot so the frontend's stream consumer still works.
    if not body.messages:
        canned = AgentChatResponse(
            reply=(
                "Hi! I'm RIFFA Agent — I'll help you build a prompt for our "
                "AI studio. Tell me in a couple of words what you want to make: "
                "a track, an instrumental, cover art or a sound effect?"
                if (body.lang or "").lower().startswith("en") else
                "Привет! Я RIFFA Agent — помогу собрать промпт для нашей "
                "AI-студии. Расскажи в двух словах, что хочется сделать: "
                "трек, инструментал, обложку или эффект?"
            ),
            done=False,
            model="canned",
        )

        async def _canned() -> AsyncIterator[bytes]:
            yield (
                b"event: complete\n"
                b"data: " + canned.model_dump_json().encode("utf-8")
                + b"\n\n"
            )

        return StreamingResponse(_canned(), media_type="text/event-stream")

    api_key = settings.apiyi_key or settings.openai_api_key
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent is not configured",
        )

    client = AsyncOpenAI(api_key=api_key, base_url=settings.openai_base_url)
    windowed = body.messages[-40:]
    reply_lang = _detect_reply_language(windowed, ui_lang=body.lang)
    chat_messages: list[dict[str, str]] = [
        {"role": "system", "content": _SYS_AGENT},
        {
            "role": "system",
            "content": (
                f"Reply language: {reply_lang}. This is the language for "
                f"`reply`, `suggestions`, `intent.note`, `summary`, and every "
                f"other user-facing string in this response. Do not switch "
                f"languages within this turn."
            ),
        },
        {"role": "system", "content": _build_user_context(body)},
    ]
    try:
        stats_block = await _build_user_stats(session, user)
        if stats_block:
            chat_messages.append({"role": "system", "content": stats_block})
    except Exception as exc:
        logger.warning("agent_chat_stream: stats lookup failed for user {}: {}", user.id, exc)

    # Only the windowed slice (last 40 turns) goes to GPT — see agent_chat.
    for m in windowed:
        chat_messages.append(
            {
                "role": "assistant" if m.role == "agent" else "user",
                "content": m.content,
            }
        )

    chat_messages.append({"role": "system", "content": _REF_GROUNDING_RULE})
    try:
        ref_note = await _reference_facts(windowed, client, settings)
        if ref_note:
            chat_messages.append({"role": "system", "content": ref_note})
    except Exception as exc:
        logger.warning("agent_chat_stream: reference grounding failed: {}", exc)

    chosen_model = _pick_model(body.messages)
    return StreamingResponse(
        _stream_agent_completion(body, client, chat_messages, chosen_model, reply_lang, user_id=user.id),
        media_type="text/event-stream",
        # Disable nginx buffering — without this the proxy holds chunks
        # until the connection closes, defeating the whole point of streaming.
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


# ---------------------------------------------------------------------------
# Fast intent classifier — Phase 2.5 hybrid (scripted wizard + LLM fallback)
# ---------------------------------------------------------------------------
#
# ONE cheap gpt-4o-mini call reads a single free-text request and returns the
# module + any parameters the user already stated + routing flags. The frontend
# wizard then collects the REMAINING slots with quick-reply chips (0 GPT calls)
# and finalizes deterministically. GPT is only re-entered for free-text answers,
# lyrics drafting, and artist / obscure-genre research.

_VALID_TEMPO = {"very_slow", "slow", "medium", "fast", "very_fast"}
_VALID_VOCAL = {"male", "female", "no_vocal"}
_VALID_MODULES = {
    "song", "instrumental", "cover_song", "sound_effect", "occasion", "cover_art",
}

_SYS_CLASSIFY = """\
You classify ONE music-creation request for RIFFA and extract any parameters the
user already stated. Output ONLY raw JSON (no markdown, no extra keys), exactly:
{
  "module": "song|instrumental|cover_song|sound_effect|occasion|cover_art",
  "genre": "<English genre name if clearly stated/implied, else ''>",
  "mood": "<happy|calm|sad|energetic|confident|dreamy|aggressive|inspiring|anxious|dramatic|romantic|nostalgic|mysterious|playful|epic, else ''>",
  "tempo": "<very_slow|slow|medium|fast|very_fast, else ''>",
  "vocal": "<male|female|no_vocal, else ''>",
  "topic": "<short subject/idea in the user's language if any, else ''>",
  "needs_lyrics": <true only if module=song AND the user wants sung words>,
  "artist_ref": <true if the user named a specific artist/band/song/producer>,
  "reference_query": "<if artist_ref: the 'Artist - Song' or artist name to look up, else ''>",
  "obscure_genre": <true if the genre is niche and needs research>,
  "too_vague": <true if the request is too vague to route (e.g. "что-то прикольное", "сделай красиво")>,
  "has_exclusions": <true if the user EXCLUDES anything: "без синтезаторов", "no synths", "никаких барабанов", "без автотюна">,
  "has_instrument_details": <true if the user names specific instruments, parts, or production details beyond genre/mood/tempo: "ровная бочка", "интересная бас партия", "с саксофоном", "tape saturation", "жирный бас">
}

MODULE ROUTING (pick exactly one):
- sound_effect: short non-musical sound ("звук дождя", "взрыв", "sfx", "whoosh"). No lyrics, no melody.
- cover_song: user wants to restyle/re-sing an UPLOADED audio file ("сделай кавер", "перепеть").
- cover_art: image / обложка / album cover / artwork.
- occasion: celebratory song for a NAMED recipient/event (birthday / wedding / anniversary).
- instrumental: music with an EXPLICIT no-vocals signal ("без вокала", "инструментал", "no vocals").
- song: default for music with (or unspecified) vocals.
module_hint is the page the user opened — override it only when the words clearly point elsewhere.

EXTRACTION RULES:
- Fill genre/mood/tempo/vocal ONLY when clearly stated or strongly implied. Otherwise "". Do NOT invent — the app asks.
- genre is a normal English genre word/phrase ("lo-fi", "phonk", "deep house"); the server canonicalizes it.
- "topic" = what the track is ABOUT (songs) — keep the user's language.
"""


class AgentClassifyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    module_hint: ModuleKind = "song"


class AgentClassifySlots(BaseModel):
    genre: str = ""        # canonical GENRE_STYLES key (or "")
    mood: str = ""         # canonical mood (or "")
    tempo: str = ""        # one of _VALID_TEMPO (or "")
    vocal: str = ""        # one of _VALID_VOCAL (or "")
    topic: str = ""


class AgentReference(BaseModel):
    artist: str = ""
    title: str = ""
    bpm: float = 0
    year: int = 0
    genre: str = ""
    tempo: str = ""
    tags: list[str] = []          # Last.fm / Perplexity subgenre+mood tags
    similar: list[str] = []       # similar artists (from Perplexity)
    production: str = ""          # production_style (from Perplexity)
    source: str = ""              # "deezer" | "perplexity"


class AgentClassifyResponse(BaseModel):
    module: ModuleKind = "song"
    slots: AgentClassifySlots = Field(default_factory=AgentClassifySlots)
    needs_lyrics: bool = False
    artist_ref: bool = False
    obscure_genre: bool = False
    too_vague: bool = False
    # Signals that the request carries requirements the scripted wizard cannot
    # hold (exclusions → negative_tags; named instruments/production details →
    # key_instruments/techniques). The frontend routes these to the GPT flow —
    # the wizard would silently drop them (2026-07-05 audit).
    has_exclusions: bool = False
    has_instrument_details: bool = False
    # Reference-track enrichment — real BPM/genre/era/mood from Deezer or Perplexity.
    era: str = ""
    suggested_bpm: str = ""
    reference: AgentReference | None = None
    # Perplexity confidence / disambiguation signal for the frontend:
    # reference_uncertain=True → show "Found X — is that right?" chip before committing.
    reference_uncertain: bool = False
    reference_note: str = ""      # human-readable candidate hint for the confirmation chip
    model: str = "gpt-4o-mini"


@router.post("/classify", response_model=AgentClassifyResponse)
@limiter.limit("30/minute")
async def agent_classify(
    body: Annotated[AgentClassifyRequest, Body()],
    request: Request,
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> AgentClassifyResponse:
    """One cheap gpt-4o-mini call: route the module + pre-fill stated slots.

    The frontend wizard collects the remaining slots with quick-reply chips
    (no further GPT) and finalizes deterministically. Falls back to a safe
    default (module_hint, empty slots, too_vague=true) on any error so the
    scripted flow can still proceed.
    """
    api_key = settings.apiyi_key or settings.openai_api_key
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent is not configured",
        )

    client = AsyncOpenAI(api_key=api_key, base_url=settings.openai_base_url)
    try:
        resp = await client.chat.completions.create(  # type: ignore[call-overload]
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _SYS_CLASSIFY},
                {"role": "system", "content": f"module_hint: {body.module_hint}"},
                {"role": "user", "content": body.message},
            ],
            temperature=0.1,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        raw = (resp.choices[0].message.content or "").strip()
        parsed = json.loads(raw)
    except Exception as exc:
        logger.warning("agent_classify failed for user {}: {}", user.id, exc)
        # Safe fallback: keep the page's module, let the scripted wizard ask all.
        return AgentClassifyResponse(module=body.module_hint, too_vague=True)

    module = str(parsed.get("module", "")).strip()
    if module not in _VALID_MODULES:
        module = body.module_hint

    tempo = str(parsed.get("tempo", "")).strip().lower()
    tempo = tempo if tempo in _VALID_TEMPO else ""
    vocal = str(parsed.get("vocal", "")).strip().lower()
    vocal = vocal if vocal in _VALID_VOCAL else ""

    slots = AgentClassifySlots(
        genre=canonical_genre(str(parsed.get("genre", "")).strip()),
        mood=canonical_mood(str(parsed.get("mood", "")).strip().lower()),
        tempo=tempo,
        vocal=vocal,
        topic=str(parsed.get("topic", "")).strip()[:500],
    )

    # ── Reference-track enrichment ──────────────────────────────────────────
    # URL (Spotify / YouTube / Deezer link) → Deezer (exact BPM, fast, free).
    # Plain artist name                     → Perplexity web-search (handles
    #   niche / non-English artists that Deezer top-1 gets wrong).
    # Confidence gate: if Perplexity is unsure (confidence < 0.8 or ambiguous)
    #   we DON'T auto-fill slots — instead we signal the frontend to show a
    #   "Found X — is that right?" confirmation chip before committing.
    era = ""
    suggested_bpm = ""
    reference: AgentReference | None = None
    reference_uncertain = False
    reference_note = ""

    url_ref = detect_reference_url(body.message)
    name_ref = str(parsed.get("reference_query", "")).strip()

    if url_ref:
        # Exact URL → Deezer (capped at 8s)
        try:
            ref = await asyncio.wait_for(
                resolve_reference(url_ref, lastfm_api_key=settings.lastfm_api_key),
                timeout=8.0,
            )
        except Exception:
            ref = None
        if ref and (ref.get("artist") or ref.get("title")):
            if ref.get("genre"):
                slots.genre = ref["genre"]
            if ref.get("tempo"):
                slots.tempo = ref["tempo"]
            era = ref.get("era", "") or ""
            if (ref.get("bpm") or 0) > 0:
                suggested_bpm = str(int(ref["bpm"]))
            reference = AgentReference(
                artist=ref.get("artist", ""),
                title=ref.get("title", ""),
                bpm=ref.get("bpm", 0) or 0,
                year=ref.get("year", 0) or 0,
                genre=ref.get("genre", ""),
                tempo=ref.get("tempo", ""),
                tags=ref.get("tags", []) or [],
                source="deezer",
            )

    elif name_ref:
        # Plain artist/song name → Perplexity web-search (capped at 12s)
        from app.services.artist_research import research_reference
        try:
            pref = await asyncio.wait_for(
                research_reference(name_ref, settings=settings),
                timeout=12.0,
            )
        except Exception:
            pref = None

        if pref:
            confidence = float(pref.get("confidence") or 0)
            ambiguous = bool(pref.get("ambiguous", False))

            if confidence >= 0.8 and not ambiguous:
                # High confidence — fill slots and commit the reference.
                if pref.get("genre"):
                    slots.genre = pref["genre"]
                if pref.get("tempo"):
                    slots.tempo = pref["tempo"]
                era = pref.get("era", "") or ""
                bpm = float(pref.get("bpm") or 0)
                if bpm > 0:
                    suggested_bpm = str(int(bpm))
                reference = AgentReference(
                    artist=pref.get("artist", ""),
                    title="",
                    bpm=bpm,
                    year=0,
                    genre=pref.get("genre", ""),
                    tempo=pref.get("tempo", ""),
                    tags=pref.get("tags", []) or [],
                    similar=pref.get("similar", []) or [],
                    production=pref.get("production", "") or "",
                    source="perplexity",
                )
            else:
                # Low confidence or ambiguous — signal frontend to ask the user.
                reference_uncertain = True
                reference_note = pref.get("note") or pref.get("artist") or name_ref
        else:
            # Perplexity failed / no key — fallback to relevance-gated Deezer.
            try:
                ref = await asyncio.wait_for(
                    resolve_reference(name_ref, lastfm_api_key=settings.lastfm_api_key),
                    timeout=8.0,
                )
            except Exception:
                ref = None
            if ref and (ref.get("artist") or ref.get("title")):
                if ref.get("genre"):
                    slots.genre = ref["genre"]
                if ref.get("tempo"):
                    slots.tempo = ref["tempo"]
                era = ref.get("era", "") or ""
                if (ref.get("bpm") or 0) > 0:
                    suggested_bpm = str(int(ref["bpm"]))
                reference = AgentReference(
                    artist=ref.get("artist", ""),
                    title=ref.get("title", ""),
                    bpm=ref.get("bpm", 0) or 0,
                    year=ref.get("year", 0) or 0,
                    genre=ref.get("genre", ""),
                    tempo=ref.get("tempo", ""),
                    tags=ref.get("tags", []) or [],
                    source="deezer",
                )

    return AgentClassifyResponse(
        module=module,  # type: ignore[arg-type]
        slots=slots,
        needs_lyrics=bool(parsed.get("needs_lyrics", False)),
        artist_ref=bool(parsed.get("artist_ref", False)),
        obscure_genre=bool(parsed.get("obscure_genre", False)),
        too_vague=bool(parsed.get("too_vague", False)),
        has_exclusions=bool(parsed.get("has_exclusions", False)),
        has_instrument_details=bool(parsed.get("has_instrument_details", False)),
        era=era,
        suggested_bpm=suggested_bpm,
        reference=reference,
        reference_uncertain=reference_uncertain,
        reference_note=reference_note,
    )
