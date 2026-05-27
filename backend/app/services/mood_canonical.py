"""Map arbitrary mood strings to the 11 canonical RIFFA mood keys.

The Radio page filters tracks by exact mood match (`Generation.mood == 'sad'`).
The agent and prompt engineer freely emit moods like "melancholic", "nostalgic",
"haunting" — those would never match the filter and the track would be
unreachable from Radio mood categories. Canonicalising at write-time keeps the
Radio filter useful while still allowing the agent to think in nuanced terms.

Canonical keys (must match the `MOODS` list in frontend RadioPage.tsx and the
mood profiles in `services/genre_data.py`):

  happy, calm, sad, energetic, confident, dreamy,
  aggressive, inspiring, anxious, dramatic
  (+ "vocal" is a track-type label, not a mood — handled separately)
"""

from __future__ import annotations


_MOOD_ALIASES: dict[str, str] = {
    # happy
    "happy": "happy", "joyful": "happy", "joy": "happy", "cheerful": "happy",
    "fun": "happy", "bright": "happy", "playful": "happy", "sunny": "happy",
    "carefree": "happy", "blissful": "happy", "gleeful": "happy",

    # calm
    "calm": "calm", "chill": "calm", "relaxed": "calm", "peaceful": "calm",
    "mellow": "calm", "serene": "calm", "soothing": "calm", "tranquil": "calm",
    "laid-back": "calm", "laidback": "calm", "easygoing": "calm", "gentle": "calm",
    "soft": "calm", "lazy": "calm", "cozy": "calm",

    # sad
    "sad": "sad", "melancholic": "sad", "melancholy": "sad", "mournful": "sad",
    "sorrowful": "sad", "blue": "sad", "depressed": "sad", "longing": "sad",
    "wistful": "sad", "bittersweet": "sad", "lonely": "sad", "sombre": "sad",
    "somber": "sad", "tearful": "sad", "heartbroken": "sad", "grief": "sad",

    # energetic
    "energetic": "energetic", "lively": "energetic", "hyped": "energetic",
    "vibrant": "energetic", "driving": "energetic", "pumping": "energetic",
    "high-energy": "energetic", "upbeat": "energetic", "exciting": "energetic",
    "dynamic": "energetic", "punchy": "energetic", "thrilling": "energetic",

    # confident
    "confident": "confident", "bold": "confident", "fierce": "confident",
    "swagger": "confident", "powerful": "confident", "assertive": "confident",
    "strong": "confident", "proud": "confident", "cocky": "confident",
    "boastful": "confident", "victorious": "confident",

    # dreamy
    "dreamy": "dreamy", "ethereal": "dreamy", "romantic": "dreamy",
    "nostalgic": "dreamy", "atmospheric": "dreamy", "floating": "dreamy",
    "hazy": "dreamy", "lush": "dreamy", "celestial": "dreamy",
    "starry": "dreamy", "tender": "dreamy", "intimate": "dreamy",
    "warm": "dreamy", "yearning": "dreamy",

    # aggressive
    "aggressive": "aggressive", "intense": "aggressive", "harsh": "aggressive",
    "brutal": "aggressive", "angry": "aggressive", "raging": "aggressive",
    "furious": "aggressive", "heavy": "aggressive", "savage": "aggressive",
    "violent": "aggressive", "wrathful": "aggressive", "menacing": "aggressive",

    # inspiring
    "inspiring": "inspiring", "motivational": "inspiring", "uplifting": "inspiring",
    "anthemic": "inspiring", "triumphant": "inspiring", "heroic": "inspiring",
    "hopeful": "inspiring", "rousing": "inspiring", "empowering": "inspiring",
    "courageous": "inspiring", "victorious-uplifting": "inspiring",

    # anxious
    "anxious": "anxious", "tense": "anxious", "nervous": "anxious",
    "paranoid": "anxious", "restless": "anxious", "uneasy": "anxious",
    "dark": "anxious", "ominous": "anxious", "haunting": "anxious",
    "eerie": "anxious", "creepy": "anxious", "unsettling": "anxious",
    "spooky": "anxious", "foreboding": "anxious", "sinister": "anxious",

    # dramatic
    "dramatic": "dramatic", "epic": "dramatic", "cinematic": "dramatic",
    "theatrical": "dramatic", "majestic": "dramatic", "grand": "dramatic",
    "operatic": "dramatic", "sweeping": "dramatic", "monumental": "dramatic",
    "orchestral": "dramatic", "climactic": "dramatic",
}


def canonical_mood(raw: str) -> str:
    """Map an arbitrary mood string to one of the canonical RIFFA mood keys.

    Returns an empty string when the input doesn't resemble any known mood —
    the caller decides whether to keep the raw value or drop it.
    """
    key = (raw or "").strip().lower().replace("_", "-")
    if not key:
        return ""
    if key in _MOOD_ALIASES:
        return _MOOD_ALIASES[key]
    # Try first word in a multi-word phrase: "very sad and slow" → "very" (no
    # match), fall through to walking each token.
    for token in key.split():
        token = token.strip(".,;:!?-")
        if token in _MOOD_ALIASES:
            return _MOOD_ALIASES[token]
    return ""


__all__ = ["canonical_mood"]
