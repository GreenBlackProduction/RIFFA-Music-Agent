"""Suno V5.5 prompt builder — at parity with the Telegram bot.

Mirrors ``Test29.04/Test20.04/prompt_engineering.py`` so that the website
generates the same calibre of prompts as the bot. The bot version is the
source of truth: when it changes, port the changes here too.

Key parity points:
  * ``GENRE_STYLES`` — same genre presets (style + weight + constraint).
  * ``MOOD_PROFILES`` — deep mood with separate ``description`` /
    ``vocals`` / ``instruments`` / ``production`` slices, plus
    ``weight_modifier`` / ``constraint_modifier``.
  * ``TEMPO_PROFILES`` — bpm-anchored tempo descriptions.
  * ``CONTEXT_COMBINATIONS`` — extra phrases for specific
    ``(genre, mood, tempo)`` tuples that the bot recognises as iconic.
  * ``DYNAMIC_ELEMENTS`` — stylistic salt randomly added per generation
    so two requests with identical params still produce slightly different
    Suno prompts (variability, not noise).
  * ``build_suno_style()`` shuffles 70-90% of the genre fragments and
    injects 1-2 dynamic elements, exactly like the bot's
    ``build_enhanced_prompt``.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any

# ---------------------------------------------------------------------------
# Genre style presets (ported from bot's ENHANCED_GENRE_STYLES)
# ---------------------------------------------------------------------------

GENRE_STYLES: dict[str, dict[str, Any]] = {
    "Lofi": {
        "style": "lofi hip-hop, dusty vinyl texture, warm analog sound, jazzy chord progressions, mellow drum breaks, tape hiss, nostalgic atmosphere, lo-fi production aesthetic, relaxed groove",
        "weight": 0.85,
        "constraint": 0.30,
    },
    "Ambient": {
        "style": "ambient soundscape, ethereal pads, deep atmospheric textures, reverb-drenched synths, minimal percussion, meditative drones, spatial sound design, immersive sonic environment",
        "weight": 0.90,
        "constraint": 0.20,
    },
    "Chillout": {
        "style": "chillout electronica, smooth downtempo beats, lush synth pads, organic textures, relaxed groove, sophisticated production, warm analog synths, gentle melodic elements",
        "weight": 0.80,
        "constraint": 0.35,
    },
    "Piano": {
        "style": "solo piano composition, expressive dynamics, classical technique, emotional phrasing, rich harmonic progressions, concert hall reverb, intimate performance, nuanced touch",
        "weight": 0.95,
        "constraint": 0.15,
    },
    "Classical": {
        "style": "classical orchestral music, symphonic arrangement, string section, woodwinds, brass ensemble, timpani, elegant composition, baroque or romantic style, concert hall acoustics",
        "weight": 0.90,
        "constraint": 0.20,
    },
    "Orchestral": {
        "style": "cinematic orchestral score, epic string arrangements, powerful brass sections, dramatic percussion, sweeping melodies, film score production, large ensemble, dynamic range",
        "weight": 0.90,
        "constraint": 0.25,
    },
    "Cinematic": {
        "style": "cinematic soundtrack, emotional orchestration, hybrid orchestral-electronic, trailer music elements, epic build-ups, dramatic crescendos, modern film score production",
        "weight": 0.85,
        "constraint": 0.30,
    },
    "Jazz": {
        "style": "jazz ensemble, swing rhythm, improvised solos, walking bass line, ride cymbal patterns, bebop harmonies, sophisticated chord changes, live performance feel",
        "weight": 0.85,
        "constraint": 0.40,
    },
    "Blues": {
        "style": "blues music, 12-bar blues progression, soulful guitar bends, harmonica, shuffle rhythm, emotional vocals, vintage tube amp tone, raw authentic feel",
        "weight": 0.90,
        "constraint": 0.30,
    },
    "Soul": {
        "style": "soul music, powerful vocals, horn section, groovy bass line, tight rhythm section, vintage Motown production, emotional delivery, organic instrumentation",
        "weight": 0.85,
        "constraint": 0.35,
    },
    "Funk": {
        "style": "funk groove, slap bass guitar, tight rhythm guitar, brass section stabs, syncopated drums, danceable beat, James Brown influence, vintage funk production",
        "weight": 0.85,
        "constraint": 0.35,
    },
    "R&B": {
        "style": "R&B, soulful vocals, smooth groove, contemporary urban production, neo-soul elements, emotional delivery, lush harmonies, modern R&B sound",
        "weight": 0.80,
        "constraint": 0.40,
    },
    "Pop": {
        "style": "modern pop production, catchy hooks, polished sound, radio-friendly mix, layered vocals, contemporary pop arrangement, mainstream appeal",
        "weight": 0.75,
        "constraint": 0.45,
    },
    "Rock": {
        "style": "rock band, electric guitars with distortion, powerful drum kit, driving bass line, energetic performance, stadium rock sound, classic rock production",
        "weight": 0.80,
        "constraint": 0.40,
    },
    "Metal": {
        "style": "heavy metal, down-tuned guitars, blast beats, aggressive riffs, powerful drumming, heavy bass, intense atmosphere, modern metal production",
        "weight": 0.85,
        "constraint": 0.30,
    },
    "Punk": {
        "style": "punk rock, raw energy, fast tempo, distorted guitars, rebellious attitude, DIY aesthetic, 2-3 chord aggression",
        "weight": 0.82,
        "constraint": 0.40,
    },
    "Indie": {
        "style": "indie rock or indie pop, lo-fi aesthetic or polished indie sound, alternative sensibility, emotional authenticity, underground appeal",
        "weight": 0.75,
        "constraint": 0.50,
    },
    "Folk": {
        "style": "folk music, acoustic guitar, storytelling lyrics, natural recording, fingerpicking technique, intimate performance, rootsy authenticity",
        "weight": 0.88,
        "constraint": 0.30,
    },
    "Country": {
        "style": "country music, steel guitar, fiddle, americana sounds, heartfelt lyrics, Nashville production, twang and authenticity",
        "weight": 0.85,
        "constraint": 0.35,
    },
    "Acoustic": {
        "style": "acoustic instruments, natural recording, warmth and intimacy, organic sound, minimal production, authentic performance",
        "weight": 0.88,
        "constraint": 0.25,
    },
    "Electronic": {
        "style": "electronic music production, synthesizers, drum machines, digital processing, precise programming, modern electronic sound design",
        "weight": 0.80,
        "constraint": 0.40,
    },
    "EDM": {
        "style": "EDM, high-energy electronic dance music, festival ready, massive drops, huge synth leads, sidechain pumping, crowd energy",
        "weight": 0.78,
        "constraint": 0.45,
    },
    "House": {
        "style": "house music, 4/4 kick drum, deep bass lines, soulful vocals, chord stabs, underground club atmosphere, chicago or deep house style",
        "weight": 0.82,
        "constraint": 0.40,
    },
    "Techno": {
        "style": "techno, industrial soundscapes, repetitive hypnotic rhythms, dark atmosphere, modular synthesizers, berlin club sound",
        "weight": 0.85,
        "constraint": 0.30,
    },
    "Synthwave": {
        "style": "synthwave, retro 80s synths, gated reverb drums, neon-soaked atmosphere, analog warmth, driving arpeggios, cyberpunk aesthetic, nostalgic future",
        "weight": 0.85,
        "constraint": 0.30,
    },
    "Drum & Bass": {
        "style": "drum and bass, fast breakbeats, rolling sub bass, neurofunk textures, jungle energy, complex programming, dancefloor intensity",
        "weight": 0.83,
        "constraint": 0.38,
    },
    "Dubstep": {
        "style": "dubstep, half-time drums, wobble bass, aggressive sub bass, dramatic drops, modulated synths, 140 BPM swing",
        "weight": 0.82,
        "constraint": 0.40,
    },
    "Hip-Hop": {
        "style": "hip-hop production, boom bap or trap beats, sampling aesthetic, lyrical flow, urban sound, 808 bass, crisp snares",
        "weight": 0.80,
        "constraint": 0.45,
    },
    "Trap": {
        "style": "trap production, heavy 808 bass, hi-hat rolls, melodic trap, dark atmospheric elements, modern trap sound design",
        "weight": 0.78,
        "constraint": 0.45,
    },
    "Drill": {
        "style": "UK or Chicago drill, dark melodies, sliding 808s, aggressive flow, trap-influenced percussion, street energy",
        "weight": 0.80,
        "constraint": 0.40,
    },
    "Phonk": {
        "style": "phonk, memphis rap samples, cowbell, dark atmosphere, distorted 808s, lo-fi drift aesthetic, underground phonk sound",
        "weight": 0.82,
        "constraint": 0.38,
    },
    "Reggae": {
        "style": "reggae, offbeat rhythms, bass-heavy production, Jamaican sound, roots and culture, riddim style, warm analog recording",
        "weight": 0.88,
        "constraint": 0.30,
    },
    "Latin": {
        "style": "latin music, rhythmic percussion, salsa or bossa nova elements, spanish guitar, danceable groove, vibrant latin sound",
        "weight": 0.82,
        "constraint": 0.40,
    },
    "Bossa Nova": {
        "style": "bossa nova, gentle samba rhythm, nylon string guitar, intimate vocals, Brazilian jazz influence, sophisticated harmony, cafe atmosphere",
        "weight": 0.90,
        "constraint": 0.20,
    },
    "Gospel": {
        "style": "gospel music, choir vocals, spiritual themes, piano, organ, powerful vocal performance, call and response, emotional conviction",
        "weight": 0.88,
        "constraint": 0.30,
    },
    "Djent": {
        "style": "djent, polyrhythmic guitar riffs, palm-muted chugs, extended-range guitars, complex time signatures, modern progressive metal production",
        "weight": 0.85,
        "constraint": 0.35,
    },
    "Singing Bowls": {
        "style": "Tibetan singing bowls, healing frequencies, meditative drones, spiritual atmosphere, gentle resonance, sacred sound bath",
        "weight": 0.92,
        "constraint": 0.18,
    },
}

# ---------------------------------------------------------------------------
# Mood profiles — vocals + instruments + production all influenced by mood,
# matching ENHANCED_MOOD_DESCRIPTIONS in the bot.
# ---------------------------------------------------------------------------

MOOD_PROFILES: dict[str, dict[str, Any]] = {
    "happy": {
        "description": "joyful, uplifting, bright major chords, cheerful melodies, positive energy, feel-good vibes",
        "vocals": "bright cheerful vocals, smiling delivery, upbeat singing, joyful expression, positive tone",
        "instruments": "bouncy rhythm, playful melodies, bright tones, major key progressions",
        "production": "crisp clear mix, bright EQ, sparkle on top end, energetic compression",
        "weight_modifier": 0.0,
        "constraint_modifier": -0.10,
    },
    "calm": {
        "description": "peaceful, serene, gentle dynamics, soft textures, relaxing atmosphere, tranquil mood",
        "vocals": "soft gentle vocals, whispered delivery, soothing voice, peaceful singing, tender expression",
        "instruments": "delicate playing, soft touch, gentle strumming, minimal percussion, sustained notes",
        "production": "warm analog sound, subtle reverb, gentle compression, spacious mix, natural dynamics",
        "weight_modifier": 0.05,
        "constraint_modifier": -0.15,
    },
    "sad": {
        "description": "melancholic, emotional, minor key, slow tempo, introspective, heartfelt, sorrowful",
        "vocals": "emotional vocals, vulnerable delivery, heartbroken singing, tearful expression, fragile voice",
        "instruments": "mournful melodies, minor chords, slow tempo, expressive playing, emotional phrasing",
        "production": "intimate close-mic'd sound, emotional reverb, raw unprocessed feel, vulnerable mix",
        "weight_modifier": 0.05,
        "constraint_modifier": -0.10,
    },
    "energetic": {
        "description": "high energy, powerful, driving rhythm, intense, dynamic, adrenaline-pumping, vigorous",
        "vocals": "powerful energetic vocals, dynamic delivery, high energy singing, passionate expression, strong projection",
        "instruments": "driving rhythm section, fast tempo, energetic playing, powerful hits, intense performance",
        "production": "punchy mix, aggressive compression, boosted energy, powerful mastering, high impact sound",
        "weight_modifier": 0.0,
        "constraint_modifier": 0.0,
    },
    "confident": {
        "description": "bold, assertive, strong presence, commanding, powerful delivery, self-assured",
        "vocals": "confident powerful vocals, assertive delivery, commanding presence, bold singing, authoritative tone",
        "instruments": "strong rhythmic foundation, bold melodic statements, powerful chord progressions, tight ensemble",
        "production": "bold mix, strong presence, confident mastering, powerful low end, assertive sound",
        "weight_modifier": 0.05,
        "constraint_modifier": -0.05,
    },
    "dreamy": {
        "description": "ethereal, atmospheric, reverb-soaked, floating, surreal, ambient textures, otherworldly",
        "vocals": "ethereal dreamy vocals, floating delivery, reverb-drenched singing, angelic voice, atmospheric expression",
        "instruments": "ambient textures, floating melodies, sustained chords, atmospheric playing, reverb-soaked sounds",
        "production": "spacious reverb, dreamy delays, atmospheric processing, ethereal mix, surreal soundscape",
        "weight_modifier": 0.0,
        "constraint_modifier": 0.10,
    },
    "aggressive": {
        "description": "intense, heavy, distorted, powerful, forceful, raw energy, brutal, unrelenting",
        "vocals": "aggressive screaming vocals, harsh delivery, intense shouting, raw powerful voice, brutal expression, distorted vocals",
        "instruments": "heavy distorted guitars, pounding drums, aggressive bass, brutal riffs, relentless attack",
        "production": "heavy distortion, aggressive compression, brutal mix, raw unpolished sound, maximum intensity",
        "weight_modifier": 0.10,
        "constraint_modifier": -0.15,
    },
    "inspiring": {
        "description": "motivational, uplifting, epic, triumphant, empowering, soaring melodies, heroic",
        "vocals": "inspiring powerful vocals, uplifting delivery, soaring singing, motivational expression, heroic tone",
        "instruments": "epic orchestration, triumphant melodies, powerful crescendos, inspiring harmonies, heroic themes",
        "production": "epic cinematic mix, powerful mastering, inspiring sound, grand production, motivational energy",
        "weight_modifier": 0.05,
        "constraint_modifier": 0.0,
    },
    "anxious": {
        "description": "tense, suspenseful, dissonant, uneasy, nervous energy, unsettling, edgy",
        "vocals": "tense anxious vocals, nervous delivery, uneasy singing, strained voice, unsettling expression",
        "instruments": "dissonant chords, tense rhythms, unsettling melodies, nervous playing, edgy sounds",
        "production": "tense mix, unsettling effects, anxious atmosphere, edgy processing, nervous energy",
        "weight_modifier": 0.0,
        "constraint_modifier": 0.15,
    },
    "dramatic": {
        "description": "epic, cinematic, powerful dynamics, theatrical, intense emotions, grand scale",
        "vocals": "dramatic theatrical vocals, powerful delivery, emotional singing, intense expression, operatic tone",
        "instruments": "dramatic orchestration, powerful dynamics, theatrical performance, intense playing, grand arrangements",
        "production": "cinematic mix, dramatic dynamics, powerful mastering, theatrical sound, epic production",
        "weight_modifier": 0.05,
        "constraint_modifier": 0.05,
    },
    "romantic": {
        "description": "romantic, tender, intimate, loving, warm",
        "vocals": "tender romantic vocals, intimate whispered delivery, smooth croon, expressive singing",
        "instruments": "lush strings, gentle piano, mellow guitar, supportive bass, warm pads",
        "production": "warm analog sound, intimate mix, romantic ambience, lush reverbs, soft compression",
        "weight_modifier": 0.05,
        "constraint_modifier": -0.05,
    },
    "nostalgic": {
        "description": "nostalgic, reminiscent, warm memories, bittersweet, sepia-toned",
        "vocals": "nostalgic warm vocals, reminiscent delivery, soulful timbre, gentle singing",
        "instruments": "vintage instruments, warm chords, gentle melodies, sepia textures",
        "production": "tape saturation, vinyl warmth, vintage processing, retro mix",
        "weight_modifier": 0.05,
        "constraint_modifier": -0.05,
    },
    "mysterious": {
        "description": "mysterious, dark, eerie, atmospheric, suspenseful",
        "vocals": "mysterious whispered vocals, breathy delivery, eerie tone, hushed singing",
        "instruments": "dark synths, sparse percussion, dissonant intervals, suspenseful pads",
        "production": "dark mix, eerie reverbs, suspenseful processing, atmospheric depth",
        "weight_modifier": 0.0,
        "constraint_modifier": 0.10,
    },
    "playful": {
        "description": "playful, fun, lighthearted, whimsical, mischievous",
        "vocals": "playful cheeky vocals, smiling delivery, lighthearted singing, whimsical expression",
        "instruments": "bouncy rhythms, whimsical melodies, plucky bass, ear-candy details",
        "production": "bright bouncy mix, fun stereo effects, lively dynamics",
        "weight_modifier": 0.0,
        "constraint_modifier": 0.05,
    },
    "epic": {
        "description": "epic, grand, majestic, powerful, cinematic",
        "vocals": "powerful operatic vocals, choir support, soaring delivery, majestic singing",
        "instruments": "full orchestra, epic percussion, towering brass, choir",
        "production": "epic cinematic mix, vast soundstage, grand mastering",
        "weight_modifier": 0.10,
        "constraint_modifier": 0.0,
    },
}

# ---------------------------------------------------------------------------
# Tempo profiles — mirrors ENHANCED_TEMPO_DESCRIPTIONS.
# ---------------------------------------------------------------------------

TEMPO_PROFILES: dict[str, dict[str, str]] = {
    "very_slow": {
        "description": "very slow tempo, 60-70 BPM, largo, meditative pace, spacious timing",
        "bpm": "60-70 BPM",
    },
    "slow": {
        "description": "slow tempo, 70-90 BPM, adagio, relaxed pace, unhurried",
        "bpm": "70-90 BPM",
    },
    "medium": {
        "description": "medium tempo, 90-120 BPM, moderato, comfortable pace, steady groove",
        "bpm": "90-120 BPM",
    },
    "fast": {
        "description": "fast tempo, 120-150 BPM, allegro, energetic pace, driving rhythm",
        "bpm": "120-150 BPM",
    },
    "very_fast": {
        "description": "very fast tempo, 150-180+ BPM, presto, rapid pace, intense speed",
        "bpm": "150-180+ BPM",
    },
}

# ---------------------------------------------------------------------------
# Dynamic salt — sprinkled in randomly (1-2 picks) so identical inputs still
# produce slightly different style strings.
# ---------------------------------------------------------------------------

DYNAMIC_ELEMENTS: dict[str, list[str]] = {
    "production_quality": [
        "professional studio production",
        "high-fidelity recording",
        "pristine mix quality",
        "audiophile grade sound",
        "mastered for streaming",
        "radio-ready production",
        "polished studio sound",
    ],
    "atmosphere": [
        "intimate atmosphere",
        "spacious soundstage",
        "close-mic'd feel",
        "room ambience",
        "concert hall reverb",
        "studio acoustics",
        "live performance energy",
    ],
    "texture": [
        "rich harmonic texture",
        "layered sound design",
        "dense arrangement",
        "sparse minimal texture",
        "lush sonic palette",
        "organic sound texture",
    ],
}

# ---------------------------------------------------------------------------
# Iconic (genre, mood, tempo) combinations — extra phrases that nudge Suno
# toward the "right" sub-style. Same set as the bot.
# ---------------------------------------------------------------------------

CONTEXT_COMBINATIONS: dict[tuple[str, str, str], dict[str, Any]] = {
    ("Lofi", "sad", "slow"): {
        "additional": "rainy day vibes, melancholic piano, lonely night atmosphere, introspective mood, emotional depth, nostalgic memories",
        "weight_boost": 0.05,
    },
    ("Ambient", "sad", "slow"): {
        "additional": "deep melancholy, sorrowful drones, emotional soundscape, tearful atmosphere, profound sadness",
        "weight_boost": 0.05,
    },
    ("Trap", "aggressive", "fast"): {
        "additional": "hard-hitting 808s, distorted bass, rage energy, mosh pit vibes, festival banger, brutal drops",
        "weight_boost": 0.10,
    },
    ("Metal", "aggressive", "fast"): {
        "additional": "brutal breakdowns, crushing riffs, blast beats, wall of sound, extreme aggression, headbanging energy",
        "weight_boost": 0.15,
    },
    ("Dubstep", "aggressive", "medium"): {
        "additional": "massive wobble bass, brutal drops, earth-shaking sub, aggressive modulation, heavy distortion",
        "weight_boost": 0.12,
    },
    ("EDM", "energetic", "fast"): {
        "additional": "festival anthem, massive drops, crowd-pleasing energy, peak-time banger, euphoric build-ups",
        "weight_boost": 0.08,
    },
    ("Drum & Bass", "energetic", "very_fast"): {
        "additional": "rolling basslines, complex breaks, jungle energy, dancefloor destroyer, neurofunk intensity",
        "weight_boost": 0.10,
    },
    ("Piano", "calm", "slow"): {
        "additional": "gentle touch, soft pedaling, intimate performance, peaceful meditation, quiet contemplation",
        "weight_boost": 0.05,
    },
    ("Classical", "calm", "slow"): {
        "additional": "serene orchestration, gentle strings, peaceful woodwinds, tranquil atmosphere, meditative quality",
        "weight_boost": 0.05,
    },
    ("Cinematic", "inspiring", "medium"): {
        "additional": "heroic themes, triumphant brass, soaring strings, epic journey, motivational crescendos",
        "weight_boost": 0.08,
    },
    ("Orchestral", "inspiring", "medium"): {
        "additional": "majestic orchestration, powerful brass fanfares, uplifting melodies, victorious themes",
        "weight_boost": 0.08,
    },
    ("Ambient", "dreamy", "slow"): {
        "additional": "floating textures, cosmic atmosphere, weightless feeling, astral projection, lucid dreaming",
        "weight_boost": 0.05,
    },
}


@dataclass
class SongParams:
    user_description: str
    genre: str = ""
    custom_genre: str = ""
    mood: str = ""
    tempo: str = ""
    vocal: str = ""           # "male", "female", "no_vocal", ""
    style_prompt: str = ""    # extra style override / agent prompt


def _normalize(value: str) -> str:
    return value.strip().lower()


def build_suno_style(
    params: SongParams,
    *,
    rng: random.Random | None = None,
) -> tuple[str, float, float]:
    """Build Suno V5.5 (style, weight, constraint).

    The implementation mirrors the bot's ``build_enhanced_prompt``:

    1. Take the genre preset, split its style on commas, sample 70-90 % of the
       fragments and shuffle them — this gives variability across runs while
       keeping the preset's spirit.
    2. Apply small ±0.05 jitter to weight/constraint so two identical inputs
       don't produce literally identical Suno params.
    3. Fold mood ``description`` / ``vocals`` (if vocal) / ``instruments`` /
       ``production`` slices into the style. Mood shifts weight & constraint
       via ``weight_modifier`` / ``constraint_modifier``.
    4. Append tempo description.
    5. Append vocal gender phrase.
    6. If ``(genre, mood, tempo)`` is in ``CONTEXT_COMBINATIONS``, append the
       extra signal and apply a ``weight_boost``.
    7. Sprinkle 1-2 entries from ``DYNAMIC_ELEMENTS`` (random salt).
    8. Append user's free-form ``style_prompt`` as authority over the preset.
    9. Trim to 1000 chars (Suno V5.5 ``style`` limit).

    Pass an explicit ``rng`` (e.g. ``random.Random(seed)``) for tests.
    """

    rng = rng or random.Random()

    genre_key = params.custom_genre or params.genre
    preset = GENRE_STYLES.get(genre_key, {})

    if preset.get("style"):
        base_style = preset["style"]
        weight = float(preset.get("weight", 0.80))
        constraint = float(preset.get("constraint", 0.35))
    else:
        # Unknown genre: fall back to the genre word itself, modest defaults.
        base_style = (genre_key or "music").lower()
        weight = 0.80
        constraint = 0.40

    # Step 1: shuffle 70-90% of comma-separated fragments
    fragments = [f.strip() for f in base_style.split(",") if f.strip()]
    if len(fragments) > 4:
        sample_size = max(int(len(fragments) * rng.uniform(0.7, 0.9)), 5)
        sample_size = min(sample_size, len(fragments))
        fragments = rng.sample(fragments, sample_size)
        rng.shuffle(fragments)
    style_parts: list[str] = list(fragments)

    # Step 2: small jitter
    weight = max(0.70, min(1.0, weight + rng.uniform(-0.05, 0.05)))
    constraint = max(0.10, min(0.60, constraint + rng.uniform(-0.05, 0.05)))

    # Step 3: deep mood influence
    mood_key = _normalize(params.mood)
    mood_data = MOOD_PROFILES.get(mood_key)
    if mood_data:
        style_parts.append(mood_data["description"])
        if params.vocal and params.vocal != "no_vocal":
            style_parts.append(mood_data["vocals"])
        style_parts.append(mood_data["instruments"])
        style_parts.append(mood_data["production"])
        weight = min(1.0, weight + float(mood_data.get("weight_modifier", 0.0)))
        constraint = max(
            0.0,
            min(1.0, constraint + float(mood_data.get("constraint_modifier", 0.0))),
        )

    # Step 4: tempo description
    tempo_key = _normalize(params.tempo)
    tempo_data = TEMPO_PROFILES.get(tempo_key)
    if tempo_data:
        style_parts.append(tempo_data["description"])

    # Step 5: vocal gender phrase
    if params.vocal in {"male", "female"}:
        style_parts.append(f"{params.vocal} vocals, {params.vocal} voice, {params.vocal} vocal delivery")
    elif params.vocal == "no_vocal":
        style_parts.append("instrumental only, no vocals")

    # Step 6: iconic context bumps
    ctx_key = (genre_key, mood_key, tempo_key)
    ctx_data = CONTEXT_COMBINATIONS.get(ctx_key)
    if ctx_data:
        style_parts.append(ctx_data["additional"])
        weight = min(1.0, weight + float(ctx_data.get("weight_boost", 0.0)))

    # Step 7: random salt (1-2 dynamic elements)
    pool = list(DYNAMIC_ELEMENTS.keys())
    num_dynamic = rng.randint(1, 2)
    for category in rng.sample(pool, min(num_dynamic, len(pool))):
        style_parts.append(rng.choice(DYNAMIC_ELEMENTS[category]))

    # Step 8: user override / agent prompt has the highest authority
    if params.style_prompt:
        style_parts.append(params.style_prompt.strip())

    # Step 9: assemble + trim to Suno V5.5 limit
    raw = ", ".join(p for p in style_parts if p)
    if len(raw) > 1000:
        raw = raw[:997].rstrip(", ") + "..."

    return raw, round(weight, 2), round(constraint, 2)


def vocal_gender(vocal: str) -> str | None:
    """Map vocal preference to Suno ``vocalGender`` code (``m`` / ``f``).

    ``no_vocal`` and unknown values return ``None`` (Suno will pick).
    """
    return {"male": "m", "female": "f"}.get(vocal)


__all__ = [
    "GENRE_STYLES",
    "MOOD_PROFILES",
    "TEMPO_PROFILES",
    "DYNAMIC_ELEMENTS",
    "CONTEXT_COMBINATIONS",
    "SongParams",
    "build_suno_style",
    "vocal_gender",
]
