"""Expanded genre library, era modifiers, dynamic elements, and context combinations
for the RIFFA prompt engineering system.

This module is imported by ``prompt_engineering.py`` and provides the knowledge base
for ``build_suno_style()``. It is separate from the builder logic so the data can
evolve independently.
"""

from __future__ import annotations

from typing import Any

# ══════════════════════════════════════════════════════════════════════════════
# GENRE STYLES — 100+ presets with detailed instrumentation and production
# ══════════════════════════════════════════════════════════════════════════════

GENRE_STYLES: dict[str, dict[str, Any]] = {
    # ── Lo-fi / Ambient / Chill ──────────────────────────────────────────
    "Lofi": {
        "style": "lofi hip-hop, dusty vinyl texture, warm analog sound, jazzy chord progressions, mellow drum breaks, tape hiss, nostalgic atmosphere, lo-fi production aesthetic, relaxed groove",
        "weight": 0.85,
        "constraint": 0.30,
        "parent_genre": "Electronic",
        "era_affinity": ["2010s", "2020s"],
    },
    "Ambient": {
        "style": "ambient soundscape, ethereal pads, deep atmospheric textures, reverb-drenched synths, minimal percussion, meditative drones, spatial sound design, immersive sonic environment",
        "weight": 0.90,
        "constraint": 0.20,
        "parent_genre": "Electronic",
        "era_affinity": ["1970s", "1980s", "1990s", "2000s", "2010s", "2020s"],
    },
    "Chillout": {
        "style": "chillout electronica, smooth downtempo beats, lush synth pads, organic textures, relaxed groove, sophisticated production, warm analog synths, gentle melodic elements",
        "weight": 0.80,
        "constraint": 0.35,
        "parent_genre": "Electronic",
        "era_affinity": ["1990s", "2000s"],
    },
    "Trip-Hop": {
        "style": "trip-hop, downtempo breakbeats, dark cinematic atmosphere, smoky jazz samples, deep sub-bass, melancholic strings, turntable scratches, haunting female vocals, Massive Attack influenced production",
        "weight": 0.88,
        "constraint": 0.28,
        "parent_genre": "Electronic",
        "era_affinity": ["1990s"],
    },
    "Downtempo": {
        "style": "downtempo electronica, slow hypnotic grooves, warm bass pulses, organic percussion, found-sound textures, subtle glitch elements, meditative flow, sunrise/sunset energy",
        "weight": 0.82,
        "constraint": 0.30,
        "parent_genre": "Electronic",
        "era_affinity": ["2000s", "2010s"],
    },
    "Vaporwave": {
        "style": "vaporwave, slowed-down 80s samples, chopped and screwed aesthetics, corporate muzak deconstruction, heavy reverb washes, pitched-down vocals, nostalgic consumer capitalism critique, glitchy transitions, mallsoft ambience",
        "weight": 0.88,
        "constraint": 0.35,
        "parent_genre": "Electronic",
        "era_affinity": ["2010s", "2020s"],
    },

    # ── Piano / Classical / Orchestral ───────────────────────────────────
    "Piano": {
        "style": "solo piano composition, expressive dynamics, classical technique, emotional phrasing, rich harmonic progressions, concert hall reverb, intimate performance, nuanced touch",
        "weight": 0.95,
        "constraint": 0.15,
        "parent_genre": "Classical",
        "era_affinity": ["1700s", "1800s", "1900s", "1950s", "1960s", "1970s"],
    },
    "Classical": {
        "style": "classical orchestral music, symphonic arrangement, string section, woodwinds, brass ensemble, timpani, elegant composition, baroque or romantic style, concert hall acoustics",
        "weight": 0.90,
        "constraint": 0.20,
        "parent_genre": "Classical",
        "era_affinity": ["1700s", "1800s", "1900s"],
    },
    "Orchestral": {
        "style": "cinematic orchestral score, epic string arrangements, powerful brass sections, dramatic percussion, sweeping melodies, film score production, large ensemble, dynamic range",
        "weight": 0.90,
        "constraint": 0.25,
        "parent_genre": "Classical",
        "era_affinity": ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"],
    },
    "Cinematic": {
        "style": "cinematic soundtrack, emotional orchestration, hybrid orchestral-electronic, trailer music elements, epic build-ups, dramatic crescendos, modern film score production",
        "weight": 0.85,
        "constraint": 0.30,
        "parent_genre": "Classical",
        "era_affinity": ["2000s", "2010s", "2020s"],
    },
    "Minimalism": {
        "style": "minimalist composition, repetitive patterns, gradual phase shifts, hypnotic arpeggios, Steve Reich influenced, sparse texture, meditative pulse, evolving slowly over time",
        "weight": 0.92,
        "constraint": 0.18,
        "parent_genre": "Classical",
        "era_affinity": ["1960s", "1970s", "1980s", "2010s", "2020s"],
    },

    # ── Jazz / Blues / Soul / Funk ──────────────────────────────────────
    "Jazz": {
        "style": "jazz ensemble, swing rhythm, improvised solos, walking bass line, ride cymbal patterns, bebop harmonies, sophisticated chord changes, live performance feel",
        "weight": 0.85,
        "constraint": 0.40,
        "parent_genre": "Jazz",
        "era_affinity": ["1940s", "1950s", "1960s"],
    },
    "Smooth Jazz": {
        "style": "smooth jazz, polished production, soprano saxophone lead, electric piano pads, gentle funk bass, light percussion, radio-friendly mix, sophisticated easy-listening",
        "weight": 0.78,
        "constraint": 0.45,
        "parent_genre": "Jazz",
        "era_affinity": ["1980s", "1990s"],
    },
    "Jazz Fusion": {
        "style": "jazz fusion, electric jazz, synthesizer solos, complex time signatures, rock-influenced energy, virtuosic improvisation, wah-wah guitar, funky electric bass, Weather Report influenced",
        "weight": 0.82,
        "constraint": 0.42,
        "parent_genre": "Jazz",
        "era_affinity": ["1970s", "1980s"],
    },
    "Blues": {
        "style": "blues music, 12-bar blues progression, soulful guitar bends, harmonica, shuffle rhythm, emotional vocals, vintage tube amp tone, raw authentic feel",
        "weight": 0.90,
        "constraint": 0.30,
        "parent_genre": "Blues",
        "era_affinity": ["1950s", "1960s", "1970s"],
    },
    "Soul": {
        "style": "soul music, powerful vocals, horn section, groovy bass line, tight rhythm section, vintage Motown production, emotional delivery, organic instrumentation",
        "weight": 0.85,
        "constraint": 0.35,
        "parent_genre": "R&B",
        "era_affinity": ["1960s", "1970s"],
    },
    "Neo-Soul": {
        "style": "neo-soul, lush jazzy harmonies, laid-back groove, Fender Rhodes electric piano, warm analog production, soulful breathy vocals, hip-hop influenced drums, Erykah Badu / D'Angelo inspired, organic textures",
        "weight": 0.84,
        "constraint": 0.32,
        "parent_genre": "R&B",
        "era_affinity": ["1990s", "2000s", "2010s"],
    },
    "Funk": {
        "style": "funk groove, slap bass guitar, tight rhythm guitar, brass section stabs, syncopated drums, danceable beat, James Brown influence, vintage funk production",
        "weight": 0.85,
        "constraint": 0.35,
        "parent_genre": "Funk",
        "era_affinity": ["1970s", "1980s"],
    },
    "R&B": {
        "style": "R&B, soulful vocals, smooth groove, contemporary urban production, neo-soul elements, emotional delivery, lush harmonies, modern R&B sound",
        "weight": 0.80,
        "constraint": 0.40,
        "parent_genre": "R&B",
        "era_affinity": ["1990s", "2000s", "2010s", "2020s"],
    },
    "Gospel": {
        "style": "gospel music, choir vocals, spiritual themes, piano, organ, powerful vocal performance, call and response, emotional conviction",
        "weight": 0.88,
        "constraint": 0.30,
        "parent_genre": "R&B",
        "era_affinity": ["1950s", "1960s", "1970s", "1980s", "1990s"],
    },

    # ── Pop / Contemporary ──────────────────────────────────────────────
    "Pop": {
        "style": "modern pop production, catchy hooks, polished sound, radio-friendly mix, layered vocals, contemporary pop arrangement, mainstream appeal",
        "weight": 0.75,
        "constraint": 0.45,
        "parent_genre": "Pop",
        "era_affinity": ["2000s", "2010s", "2020s"],
    },
    "Hyperpop": {
        "style": "hyperpop, glitchy maximalist production, pitched-up autotuned vocals, distorted 808s, chaotic energy, internet-age aesthetic, abrasive synths, sugary melodies, SOPHIE / 100 gecs influenced, genre-defying",
        "weight": 0.82,
        "constraint": 0.48,
        "parent_genre": "Pop",
        "era_affinity": ["2020s"],
    },
    "K-Pop": {
        "style": "K-pop production, polished maximalist arrangement, genre-blending sections, tight synchronized energy, bright synth hooks, crisp percussion, layered vocal harmonies, rap verse break, dynamic key changes, bubblegum-meets-EDM fusion",
        "weight": 0.78,
        "constraint": 0.48,
        "parent_genre": "Pop",
        "era_affinity": ["2010s", "2020s"],
    },
    "Synth-Pop": {
        "style": "synth-pop, analog synthesizer melodies, drum machine rhythms, catchy vocal hooks, new wave energy, glossy production, Depeche Mode / Pet Shop Boys influenced, 80s nostalgic sheen",
        "weight": 0.82,
        "constraint": 0.38,
        "parent_genre": "Pop",
        "era_affinity": ["1980s", "2000s", "2010s", "2020s"],
    },
    "New Wave": {
        "style": "new wave, angular guitar riffs, synth-driven hooks, danceable post-punk energy, quirky vocal delivery, tight snare drum sound, stylish production, Talking Heads / The Cure influenced",
        "weight": 0.80,
        "constraint": 0.40,
        "parent_genre": "Pop",
        "era_affinity": ["1980s"],
    },
    "Bedroom Pop": {
        "style": "bedroom pop, intimate DIY production, lo-fi charm, gentle vocals, simple drum machine beats, warm guitar or synth beds, confessional lyrics, Clairo / Rex Orange County influenced, cozy homemade feel",
        "weight": 0.80,
        "constraint": 0.35,
        "parent_genre": "Pop",
        "era_affinity": ["2010s", "2020s"],
    },
    "City Pop": {
        "style": "Japanese city pop, funky bass lines, glossy 80s production, brass section stabs, Fender Rhodes, crisp drum fills, optimistic urban energy, Tatsuro Yamashita / Mariya Takeuchi influenced, summer night driving feel",
        "weight": 0.84,
        "constraint": 0.32,
        "parent_genre": "Pop",
        "era_affinity": ["1980s"],
    },
    "J-Pop": {
        "style": "J-pop, high-energy melodic hooks, busy arrangement, bright synthesizer layers, tight rhythm section, emotionally expressive vocals, anime-theme energy, key changes, polished Japanese production",
        "weight": 0.78,
        "constraint": 0.44,
        "parent_genre": "Pop",
        "era_affinity": ["1990s", "2000s", "2010s", "2020s"],
    },
    "Art Pop": {
        "style": "art pop, experimental pop structures, avant-garde sensibilities, unconventional instrumentation, sophisticated harmony, Kate Bush / Bjork influenced, theatrical delivery, genre-defying ambition",
        "weight": 0.82,
        "constraint": 0.38,
        "parent_genre": "Pop",
        "era_affinity": ["1980s", "1990s", "2000s", "2010s", "2020s"],
    },

    # ── Rock / Metal ─────────────────────────────────────────────────────
    "Rock": {
        "style": "rock band, electric guitars with distortion, powerful drum kit, driving bass line, energetic performance, stadium rock sound, classic rock production",
        "weight": 0.78,
        "constraint": 0.42,
        "parent_genre": "Rock",
        "era_affinity": ["1970s", "1980s", "1990s", "2000s"],
    },
    "Punk": {
        "style": "punk rock, fast distorted power chords, aggressive drumming, shouted vocals, raw energy, DIY production, short song structure, anti-establishment attitude",
        "weight": 0.88,
        "constraint": 0.30,
        "parent_genre": "Rock",
        "era_affinity": ["1970s", "1980s", "1990s"],
    },
    "Indie": {
        "style": "indie rock, jangly guitars, lo-fi production aesthetic, introspective lyrics, DIY spirit, melodic bass lines, understated vocals, college rock influence",
        "weight": 0.82,
        "constraint": 0.38,
        "parent_genre": "Rock",
        "era_affinity": ["1990s", "2000s", "2010s"],
    },
    "Metal": {
        "style": "heavy metal, distorted guitars, powerful drumming, aggressive vocals, fast tempos, epic solos, intense energy, dark atmosphere",
        "weight": 0.85,
        "constraint": 0.35,
        "parent_genre": "Metal",
        "era_affinity": ["1980s", "1990s"],
    },
    "Grunge": {
        "style": "grunge, heavily distorted guitars, quiet-loud dynamics, angsty vocals, sludgy riffs, raw unpolished production, 90s Seattle sound, Nirvana / Soundgarden influenced, flannel-wearing energy",
        "weight": 0.86,
        "constraint": 0.32,
        "parent_genre": "Rock",
        "era_affinity": ["1990s"],
    },
    "Shoegaze": {
        "style": "shoegaze, wall of guitar noise, ethereal vocals buried in reverb, swirling feedback textures, dreamy distortion, gliding pitch-bend riffs, My Bloody Valentine / Slowdive influenced, hypnotic drone",
        "weight": 0.88,
        "constraint": 0.28,
        "parent_genre": "Rock",
        "era_affinity": ["1990s", "2010s", "2020s"],
    },
    "Dream Pop": {
        "style": "dream pop, lush reverb-drenched guitars, breathy ethereal vocals, soft focus production, floating melodies, Cocteau Twins / Beach House influenced, hazy romantic atmosphere, gentle drum machine or brushes",
        "weight": 0.86,
        "constraint": 0.30,
        "parent_genre": "Rock",
        "era_affinity": ["1990s", "2010s", "2020s"],
    },
    "Post-Rock": {
        "style": "post-rock, slow-building instrumental crescendos, cinematic dynamics, tremolo-picked guitars, bowed instruments, sparse-to-epic structure, Mogwai / Explosions in the Sky influenced, emotional sweep",
        "weight": 0.88,
        "constraint": 0.25,
        "parent_genre": "Rock",
        "era_affinity": ["1990s", "2000s", "2010s"],
    },
    "Post-Punk": {
        "style": "post-punk revival, angular guitar stabs, motorik drumbeat, wiry tension, danceable darkness, Joy Division / Interpol influenced, bass-driven melodies, sharp production",
        "weight": 0.84,
        "constraint": 0.35,
        "parent_genre": "Rock",
        "era_affinity": ["1980s", "2000s"],
    },
    "Black Metal": {
        "style": "black metal, tremolo-picked guitar walls, blast beat drumming, shrieked vocals, lo-fi necro production, cold Nordic atmosphere, minor key dissonance, corpse paint darkness",
        "weight": 0.92,
        "constraint": 0.22,
        "parent_genre": "Metal",
        "era_affinity": ["1990s", "2000s"],
    },
    "Death Metal": {
        "style": "death metal, guttural growled vocals, heavily down-tuned guitars, blast beats, technical riffing, brutal intensity, low-end heaviness, double-kick drumming, dark aggressive energy",
        "weight": 0.90,
        "constraint": 0.25,
        "parent_genre": "Metal",
        "era_affinity": ["1990s", "2000s"],
    },
    "Doom Metal": {
        "style": "doom metal, extremely slow tempo, massive low-tuned guitar riffs, crushing bass, funeral pacing, Black Sabbath influenced, dark oppressive atmosphere, walls of amplifier distortion",
        "weight": 0.92,
        "constraint": 0.22,
        "parent_genre": "Metal",
        "era_affinity": ["1970s", "1980s", "1990s", "2000s", "2010s"],
    },
    "Stoner Rock": {
        "style": "stoner rock, fuzzed-out guitar riffs, desert rock groove, warm tube amp saturation, psychedelic blues influences, heavy bass, laid-back but powerful, Kyuss / Queens of the Stone Age influenced",
        "weight": 0.86,
        "constraint": 0.32,
        "parent_genre": "Rock",
        "era_affinity": ["1990s", "2000s", "2010s"],
    },
    "Thrash Metal": {
        "style": "thrash metal, fast aggressive palm-muted riffing, rapid double-bass drumming, shouted vocals, high-speed energy, Metallica / Slayer influenced, mosh pit intensity, precise tight performance",
        "weight": 0.88,
        "constraint": 0.30,
        "parent_genre": "Metal",
        "era_affinity": ["1980s", "1990s"],
    },
    "Progressive Metal": {
        "style": "progressive metal, odd time signatures, technical virtuosity, complex song structures, extended instrumental passages, dynamic range from whisper to roar, Dream Theater / Tool influenced, polished production",
        "weight": 0.84,
        "constraint": 0.35,
        "parent_genre": "Metal",
        "era_affinity": ["1990s", "2000s", "2010s"],
    },
    "Metalcore": {
        "style": "metalcore, breakdown-heavy riffs, screamed verses with sung choruses, chugging palm-muted guitars, double-kick drums, emotional aggression, polished heavy production, Killswitch Engage influenced",
        "weight": 0.85,
        "constraint": 0.35,
        "parent_genre": "Metal",
        "era_affinity": ["2000s", "2010s"],
    },
    "Industrial": {
        "style": "industrial rock, mechanical drum machine rhythms, distorted synthesizers, abrasive guitar textures, processed vocals, factory-floor aesthetic, Nine Inch Nails / Ministry influenced, cold metallic production",
        "weight": 0.86,
        "constraint": 0.32,
        "parent_genre": "Rock",
        "era_affinity": ["1990s", "2000s"],
    },
    "Nu-Metal": {
        "style": "nu-metal, down-tuned 7-string guitars, hip-hop influenced rhythms, turntable scratches, rap-sung vocal delivery, aggressive bass, angsty energy, Korn / Linkin Park influenced, early 2000s production",
        "weight": 0.82,
        "constraint": 0.38,
        "parent_genre": "Metal",
        "era_affinity": ["1990s", "2000s"],
    },
    "Djent": {
        "style": "djent, polyrhythmic guitar riffs, palm-muted chugs, extended-range guitars, complex time signatures, modern progressive metal production",
        "weight": 0.85,
        "constraint": 0.35,
        "parent_genre": "Metal",
        "era_affinity": ["2010s", "2020s"],
    },
    "Post-Hardcore": {
        "style": "post-hardcore, angular guitar work, emotional intensity, screamed and sung vocals, complex song structures, driving rhythms, Fugazi / At the Drive-In influenced, raw passionate energy",
        "weight": 0.84,
        "constraint": 0.35,
        "parent_genre": "Rock",
        "era_affinity": ["1990s", "2000s", "2010s"],
    },

    # ── Folk / Country / Acoustic ────────────────────────────────────────
    "Folk": {
        "style": "folk music, acoustic guitar, storytelling lyrics, gentle vocals, organic instrumentation, natural room ambience, harmonica, warm intimate production",
        "weight": 0.88,
        "constraint": 0.25,
        "parent_genre": "Folk",
        "era_affinity": ["1960s", "1970s"],
    },
    "Country": {
        "style": "country music, steel guitar, fiddle, acoustic guitar strumming, storytelling vocals, train beat drums, Nashville production, twang, Americana roots",
        "weight": 0.86,
        "constraint": 0.28,
        "parent_genre": "Country",
        "era_affinity": ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s"],
    },
    "Acoustic": {
        "style": "acoustic music, nylon or steel string guitar, natural resonance, fingerpicking, unplugged warmth, intimate vocal delivery, minimal processing, pure organic sound",
        "weight": 0.90,
        "constraint": 0.20,
        "parent_genre": "Folk",
        "era_affinity": ["1970s", "1980s", "1990s", "2000s", "2010s", "2020s"],
    },
    "Bluegrass": {
        "style": "bluegrass, rapid banjo rolls, mandolin chops, fiddle solos, upright bass, tight vocal harmonies, acoustic virtuosity, driving train-beat rhythm, high lonesome sound, Appalachian roots",
        "weight": 0.90,
        "constraint": 0.22,
        "parent_genre": "Country",
        "era_affinity": ["1940s", "1950s", "1960s", "1970s"],
    },
    "Celtic Folk": {
        "style": "Celtic folk, tin whistle melodies, fiddle drones, bodhran percussion, uilleann pipes, acoustic guitar, reels and jigs, Irish/Scottish traditional, pub session energy",
        "weight": 0.88,
        "constraint": 0.25,
        "parent_genre": "Folk",
        "era_affinity": ["1700s", "1800s", "1900s", "1950s", "1960s", "1970s"],
    },

    # ── Electronic / Dance ───────────────────────────────────────────────
    "Electronic": {
        "style": "electronic music, synthesized sounds, programmed beats, digital production, futuristic textures, diverse subgenres, modern production techniques",
        "weight": 0.78,
        "constraint": 0.40,
        "parent_genre": "Electronic",
        "era_affinity": ["1980s", "1990s", "2000s", "2010s", "2020s"],
    },
    "EDM": {
        "style": "EDM festival sound, massive supersaw drops, uplifting chord progressions, big-room reverb, sidechain compression, energetic builds, crowd-pleasing energy",
        "weight": 0.75,
        "constraint": 0.48,
        "parent_genre": "Electronic",
        "era_affinity": ["2010s"],
    },
    "House": {
        "style": "house music, four-on-the-floor kick drum, soulful samples, disco influence, 120-130 BPM, grooving bass line, classic Chicago/New York house sound",
        "weight": 0.80,
        "constraint": 0.40,
        "parent_genre": "Electronic",
        "era_affinity": ["1980s", "1990s"],
    },
    "Deep House": {
        "style": "deep house, warm chord stabs, soulful jazz-influenced harmonies, smooth sub-bass, relaxed 120-125 BPM groove, subtle percussion, sophisticated late-night vibe, Larry Heard / Moodymann influenced",
        "weight": 0.82,
        "constraint": 0.35,
        "parent_genre": "Electronic",
        "era_affinity": ["1990s", "2000s", "2010s"],
    },
    "Tech House": {
        "style": "tech house, driving 125-128 BPM groove, punchy kick drum, crisp hi-hats, rolling bass line, minimal vocal hooks, warehouse energy, Fisher / Chris Lake influenced, peak-time dancefloor",
        "weight": 0.80,
        "constraint": 0.40,
        "parent_genre": "Electronic",
        "era_affinity": ["2000s", "2010s", "2020s"],
    },
    "Techno": {
        "style": "techno, driving 130-140 BPM, dark industrial textures, relentless kick drum, hypnotic synth loops, warehouse aesthetic, Detroit/Berlin underground sound",
        "weight": 0.85,
        "constraint": 0.35,
        "parent_genre": "Electronic",
        "era_affinity": ["1990s", "2000s"],
    },
    "Minimal Techno": {
        "style": "minimal techno, stripped-back percussion, micro-sound design, subtle evolving textures, hypnotic repetition, precise production, Robert Hood / Ricardo Villalobos influenced, deep listening",
        "weight": 0.88,
        "constraint": 0.25,
        "parent_genre": "Electronic",
        "era_affinity": ["2000s", "2010s"],
    },
    "Acid Techno": {
        "style": "acid techno, squelching TB-303 bass lines, hypnotic 303 modulation, driving kick drum, warehouse rave energy, raw analogue distortion, relentless acid sound, 130-140 BPM",
        "weight": 0.85,
        "constraint": 0.33,
        "parent_genre": "Electronic",
        "era_affinity": ["1990s", "2000s"],
    },
    "Trance": {
        "style": "trance music, uplifting supersaw melodies, rolling bass line, euphoric breakdowns, 138 BPM driving energy, emotional chord progressions, Armin van Buuren / Above & Beyond influenced, hands-in-the-air moments",
        "weight": 0.78,
        "constraint": 0.45,
        "parent_genre": "Electronic",
        "era_affinity": ["1990s", "2000s"],
    },
    "Synthwave": {
        "style": "synthesizer-driven retro wave music, 80s nostalgia, pulsating bass lines, gated reverb drums, neon atmosphere, cinematic synthesizer arpeggios, outrun aesthetics, vintage analogue warmth",
        "weight": 0.85,
        "constraint": 0.35,
        "parent_genre": "Electronic",
        "era_affinity": ["2010s", "2020s"],
    },
    "Drum & Bass": {
        "style": "drum and bass, fast 170-175 BPM, complex amen break patterns, deep sub-bass, rolling bass line, dark atmospheric pads, MC vocals, jungle influence, high energy",
        "weight": 0.82,
        "constraint": 0.38,
        "parent_genre": "Electronic",
        "era_affinity": ["1990s", "2000s"],
    },
    "Liquid DnB": {
        "style": "liquid drum and bass, smooth soulful melodies, rolling breaks, warm sub-bass, jazz-influenced harmonies, uplifting atmosphere, Calibre / London Elektricity influenced, 170-175 BPM, sophisticated",
        "weight": 0.82,
        "constraint": 0.35,
        "parent_genre": "Electronic",
        "era_affinity": ["2000s", "2010s"],
    },
    "Jungle": {
        "style": "jungle, chopped amen breaks, deep rolling sub-bass, ragga MC samples, 160-170 BPM, dark atmospheric pads, 90s UK rave culture, dub/reggae influence, raw breakbeat science",
        "weight": 0.85,
        "constraint": 0.32,
        "parent_genre": "Electronic",
        "era_affinity": ["1990s"],
    },
    "UK Garage": {
        "style": "UK garage, swung 2-step rhythm, shuffling hi-hats, warm sub-bass wobble, pitched vocal chops, 130-135 BPM,伦敦 underground energy, MJ Cole / Disclosure influenced, skippy groove",
        "weight": 0.82,
        "constraint": 0.38,
        "parent_genre": "Electronic",
        "era_affinity": ["1990s", "2000s", "2020s"],
    },
    "Dubstep": {
        "style": "dubstep, heavy wobble bass, half-time 140 BPM, sparse syncopated drums, deep sub-bass, dark atmospheric production, UK underground sound",
        "weight": 0.85,
        "constraint": 0.35,
        "parent_genre": "Electronic",
        "era_affinity": ["2000s", "2010s"],
    },
    "Future Bass": {
        "style": "future bass, shimmering supersaw chords, vocal chop melodies, trap-influenced drums, emotional build-ups, euphoric drops, Flume / Illenium influenced, sparkling production, 140-160 BPM",
        "weight": 0.78,
        "constraint": 0.45,
        "parent_genre": "Electronic",
        "era_affinity": ["2010s", "2020s"],
    },
    "Hardstyle": {
        "style": "hardstyle, distorted pounding kick drum, reverse bass, screeching synth leads, euphoric melodies, 150 BPM relentless energy, Dutch festival sound, Headhunterz influenced, raw power",
        "weight": 0.85,
        "constraint": 0.38,
        "parent_genre": "Electronic",
        "era_affinity": ["2000s", "2010s"],
    },
    "IDM": {
        "style": "intelligent dance music, complex glitchy beats, experimental sound design, intricate programming, cerebral electronic, Aphex Twin / Autechre / Boards of Canada influenced, unpredictable structures",
        "weight": 0.88,
        "constraint": 0.28,
        "parent_genre": "Electronic",
        "era_affinity": ["1990s", "2000s", "2010s"],
    },
    "Breakbeat": {
        "style": "breakbeat, funky drum breaks, syncopated rhythm, heavy bass groove, sampled loops, Chemical Brothers / Prodigy influenced, 120-140 BPM, dancefloor energy, 90s big beat crossover",
        "weight": 0.82,
        "constraint": 0.38,
        "parent_genre": "Electronic",
        "era_affinity": ["1990s", "2000s"],
    },
    "Witch House": {
        "style": "witch house, occult-themed dark electronic, heavily slowed-down beats, ethereal processed vocals, drone elements, horror film atmosphere, Salem / Crystal Castles influenced, haunting reverb",
        "weight": 0.88,
        "constraint": 0.30,
        "parent_genre": "Electronic",
        "era_affinity": ["2010s", "2020s"],
    },
    "Darkwave": {
        "style": "darkwave, gothic synthesizer melodies, cold drum machine patterns, deep baritone vocals, post-punk electronic fusion, 80s horror aesthetic, Clan of Xymox / She Past Away influenced, melancholic dance",
        "weight": 0.85,
        "constraint": 0.32,
        "parent_genre": "Electronic",
        "era_affinity": ["1980s", "2010s", "2020s"],
    },
    "Coldwave": {
        "style": "coldwave, minimal synthesizer lines, icy production, detached vocals, post-punk austerity, french noir atmosphere, rigid drum machine, Joy Division electronic-era, stark and beautiful",
        "weight": 0.86,
        "constraint": 0.28,
        "parent_genre": "Electronic",
        "era_affinity": ["1980s"],
    },

    # ── Hip-Hop / Rap ────────────────────────────────────────────────────
    "Hip-Hop": {
        "style": "hip-hop beat, boom-bap drums, sampled loops, turntable scratches, deep bass, classic MPC swing, 90s East Coast production, lyrical focus",
        "weight": 0.82,
        "constraint": 0.38,
        "parent_genre": "Hip-Hop",
        "era_affinity": ["1990s"],
    },
    "Boom Bap": {
        "style": "boom bap hip-hop, hard-hitting kick and snare, sampled jazz loops, gritty MPC swing, turntable scratches, 85-95 BPM, 90s New York sound, DJ Premier / Pete Rock influenced, raw hip-hop foundation",
        "weight": 0.88,
        "constraint": 0.32,
        "parent_genre": "Hip-Hop",
        "era_affinity": ["1990s"],
    },
    "Trap": {
        "style": "trap music, rolling 808 hi-hats, deep 808 sub-bass, dark atmospheric pads, snappy snare, aggressive ad-libs, Atlanta production, Metro Boomin style",
        "weight": 0.80,
        "constraint": 0.42,
        "parent_genre": "Hip-Hop",
        "era_affinity": ["2010s", "2020s"],
    },
    "Drill": {
        "style": "UK drill, sliding 808 bass, dark minor-key melodies, sparse hi-hat patterns, aggressive energy, 140-145 BPM, gritty London production, Pop Smoke / Chief Keef influenced",
        "weight": 0.84,
        "constraint": 0.38,
        "parent_genre": "Hip-Hop",
        "era_affinity": ["2010s", "2020s"],
    },
    "Phonk": {
        "style": "phonk, Memphis rap samples, distorted cowbell melodies, gritty 808 bass lines, nostalgic 90s hip-hop aesthetic, dark lo-fi texture, Three 6 Mafia influenced, trunk-rattling production",
        "weight": 0.85,
        "constraint": 0.35,
        "parent_genre": "Hip-Hop",
        "era_affinity": ["2010s", "2020s"],
    },
    "Cloud Rap": {
        "style": "cloud rap, ethereal reverb-drenched production, dreamlike pads, slow sparse beats, introspective auto-tuned vocals, Yung Lean / Clams Casino influenced, hazy atmospheric sound",
        "weight": 0.84,
        "constraint": 0.32,
        "parent_genre": "Hip-Hop",
        "era_affinity": ["2010s", "2020s"],
    },
    "Emo Rap": {
        "style": "emo rap, melodic auto-tuned vocals, guitar sample loops, trap-influenced drums, introspective emotional lyrics, Juice WRLD / Lil Peep influenced, genre-blending between rap and alternative",
        "weight": 0.80,
        "constraint": 0.42,
        "parent_genre": "Hip-Hop",
        "era_affinity": ["2010s", "2020s"],
    },
    "Grime": {
        "style": "grime, 140 BPM, aggressive square-wave bass, sparse syncopated drums, rapid-fire MC delivery, UK underground energy, Skepta / Wiley influenced, raw Eskibeat sound",
        "weight": 0.85,
        "constraint": 0.36,
        "parent_genre": "Hip-Hop",
        "era_affinity": ["2000s", "2010s"],
    },
    "G-Funk": {
        "style": "G-Funk, smooth funky synth leads, deep 808 bass, laid-back 90-100 BPM groove, talkbox vocals, Parliament/Funkadelic samples, Dr. Dre / Warren G influenced, West Coast cruising sound",
        "weight": 0.84,
        "constraint": 0.34,
        "parent_genre": "Hip-Hop",
        "era_affinity": ["1990s"],
    },
    "Crunk": {
        "style": "crunk, heavy 808 bass, aggressive synth brass, shouted hype ad-libs, energetic 150+ BPM, Lil Jon influenced, club-destroying energy, call-and-response chants",
        "weight": 0.82,
        "constraint": 0.40,
        "parent_genre": "Hip-Hop",
        "era_affinity": ["2000s"],
    },
    "Jersey Club": {
        "style": "jersey club, bed-squeak sample, triplet kick patterns, chopped vocal samples, 130-140 BPM, bouncy dance energy, Newark sound, DJ Sliink / Uniiqu3 influenced, party energy",
        "weight": 0.80,
        "constraint": 0.42,
        "parent_genre": "Electronic",
        "era_affinity": ["2010s", "2020s"],
    },
    "Plugg": {
        "style": "plugg, airy melodic beats, soft 808 bass, ethereal synth pads, sparse crisp hi-hats, laid-back vibe, BeatPluggz / Pierre Bourne influenced, cloud-rap adjacent, psychedelic trap",
        "weight": 0.82,
        "constraint": 0.38,
        "parent_genre": "Hip-Hop",
        "era_affinity": ["2020s"],
    },

    # ── Latin / Reggae / World ──────────────────────────────────────────
    "Reggae": {
        "style": "reggae rhythm, off-beat guitar skank, deep bass line, one-drop drum pattern, organ bubble, roots reggae vibe, Bob Marley influence, laid-back island groove",
        "weight": 0.88,
        "constraint": 0.28,
        "parent_genre": "Reggae",
        "era_affinity": ["1970s", "1980s"],
    },
    "Dancehall": {
        "style": "dancehall, digital riddim production, energetic dance tempo, heavy bass, catchy melodic hooks, Jamaican patois vocals, Sean Paul / Vybz Kartel influenced, club energy",
        "weight": 0.82,
        "constraint": 0.38,
        "parent_genre": "Reggae",
        "era_affinity": ["1990s", "2000s", "2010s"],
    },
    "Latin": {
        "style": "Latin music, rhythmic percussion, Spanish guitar, passionate vocals, dance-friendly groove, salsa and reggaeton influences, warm tropical production",
        "weight": 0.82,
        "constraint": 0.35,
        "parent_genre": "Latin",
        "era_affinity": ["1970s", "1980s", "1990s", "2000s", "2010s", "2020s"],
    },
    "Reggaeton": {
        "style": "reggaeton, infectious dembow rhythm, steady kick drum pattern, synth melody hooks, Spanish-language rap-sung vocals, Bad Bunny / J Balvin influenced, 90-100 BPM, club-tested groove, Caribbean heat",
        "weight": 0.80,
        "constraint": 0.42,
        "parent_genre": "Latin",
        "era_affinity": ["2000s", "2010s", "2020s"],
    },
    "Dembow": {
        "style": "dembow, rapid-fire percussion, minimalist rhythmic loop, repetitive hypnotic beat, 110-120 BPM, Dominican street energy, raw and infectious, El Alfa influenced, perreo-ready",
        "weight": 0.85,
        "constraint": 0.38,
        "parent_genre": "Latin",
        "era_affinity": ["2010s", "2020s"],
    },
    "Bossa Nova": {
        "style": "bossa nova, gentle samba rhythm, nylon string guitar, intimate vocals, Brazilian jazz influence, sophisticated harmony, cafe atmosphere",
        "weight": 0.90,
        "constraint": 0.20,
        "parent_genre": "Latin",
        "era_affinity": ["1960s"],
    },
    "Samba": {
        "style": "samba, driving percussion ensemble, surdo bass drums, tamborim and agogo bells, cuica friction drum, carnival energy, Brazilian rhythms, batucada groove, celebratory pulse",
        "weight": 0.88,
        "constraint": 0.28,
        "parent_genre": "Latin",
        "era_affinity": ["1950s", "1960s", "1970s"],
    },
    "Cumbia": {
        "style": "cumbia, guacharaca percussion, accordion melody, steady bass line, 2/4 dance rhythm, Colombian folk roots, pan-Latin popularity, infectious groove, tropical warmth",
        "weight": 0.86,
        "constraint": 0.30,
        "parent_genre": "Latin",
        "era_affinity": ["1950s", "1960s", "1970s"],
    },
    "Bachata": {
        "style": "bachata, romantic Spanish guitar leads, bongo and guira percussion, deep emotional vocals, 4/4 rhythm at 120-130 BPM, Dominican origins, Romeo Santos influenced, sensual dance groove",
        "weight": 0.84,
        "constraint": 0.32,
        "parent_genre": "Latin",
        "era_affinity": ["1990s", "2000s", "2010s"],
    },

    # ── Afrobeats / Amapiano / Global ────────────────────────────────────
    "Afrobeats": {
        "style": "afrobeats, infectious rhythmic groove, complex percussion layers, melodic synth hooks, call-and-response energy, Burna Boy / Wizkid influenced, 100-115 BPM, Lagos-to-the-world, sunny celebratory vibe",
        "weight": 0.80,
        "constraint": 0.40,
        "parent_genre": "World",
        "era_affinity": ["2010s", "2020s"],
    },
    "Amapiano": {
        "style": "amapiano, deep log drum bass lines, jazzy piano melodies, shaker-heavy percussion, 110-115 BPM, South African house fusion, soulful vocals, Kabza De Small influenced, smooth but driving groove",
        "weight": 0.82,
        "constraint": 0.38,
        "parent_genre": "Electronic",
        "era_affinity": ["2020s"],
    },
    "Highlife": {
        "style": "highlife, melodic guitar lines, horn section, upbeat rhythm, Ghanaian/Nigerian roots, 1960s West African sound, call-and-response, warm organic production, celebratory",
        "weight": 0.86,
        "constraint": 0.28,
        "parent_genre": "World",
        "era_affinity": ["1950s", "1960s", "1970s"],
    },
    "Bollywood": {
        "style": "Bollywood music, orchestral arrangement with Indian instruments, tabla and dholak percussion, sitar and veena melodies, dramatic emotional delivery, song-and-dance spectacle, vibrant energy",
        "weight": 0.82,
        "constraint": 0.38,
        "parent_genre": "World",
        "era_affinity": ["1970s", "1980s", "1990s", "2000s", "2010s"],
    },
    "Raï": {
        "style": "Raï music, Algerian folk-pop, quarter-tone melodies, gasba flute, darbuka percussion, passionate vocals, synthesizer arrangements, desert-to-club energy, Cheb Khaled influenced",
        "weight": 0.84,
        "constraint": 0.32,
        "parent_genre": "World",
        "era_affinity": ["1980s", "1990s"],
    },

    # ── Experimental / Avant-garde ────────────────────────────────────────
    "Noise": {
        "style": "noise music, abrasive textures, feedback walls, industrial distortion, unconventional sound sources, extreme dynamics, Merzbow influenced, textural violence, anti-musical intensity",
        "weight": 0.95,
        "constraint": 0.15,
        "parent_genre": "Experimental",
        "era_affinity": ["1980s", "1990s", "2000s", "2010s"],
    },
    "Drone": {
        "style": "drone music, sustained tones, slow harmonic evolution, immersive sound bath, minimal movement, deep resonance, Sunn O))) / La Monte Young influenced, meditative or oppressive depending on timbre",
        "weight": 0.94,
        "constraint": 0.15,
        "parent_genre": "Experimental",
        "era_affinity": ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"],
    },
    "Musique Concrete": {
        "style": "musique concrete, found sound manipulation, tape collage techniques, acousmatic composition, field recordings, processed beyond recognition, Pierre Schaeffer / Pierre Henry influenced, early electronic experimentalism",
        "weight": 0.95,
        "constraint": 0.12,
        "parent_genre": "Experimental",
        "era_affinity": ["1950s", "1960s"],
    },
    "Singing Bowls": {
        "style": "Tibetan singing bowls, healing frequencies, meditative drones, spiritual atmosphere, gentle resonance, sacred sound bath",
        "weight": 0.92,
        "constraint": 0.18,
        "parent_genre": "Experimental",
        "era_affinity": ["2010s", "2020s"],
    },
}


# ══════════════════════════════════════════════════════════════════════════════
# MOOD PROFILES — 15 emotional palettes with vocal/instrumental/production slices
# ══════════════════════════════════════════════════════════════════════════════

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
        "description": "theatrical, intense emotions, sweeping gestures, powerful contrasts, operatic scale, grand, cinematic",
        "vocals": "dramatic theatrical vocals, powerful operatic delivery, intense emotional expression, soaring sustained notes",
        "instruments": "grand orchestral swells, dramatic percussion hits, sweeping string lines, bold brass fanfares",
        "production": "cinematic wide dynamics, dramatic silence-to-explosion, theatrical mix, grand reverb",
        "weight_modifier": 0.05,
        "constraint_modifier": 0.05,
    },
    "romantic": {
        "description": "loving, tender, passionate, warm, intimate, sensual, affectionate, heartfelt",
        "vocals": "romantic tender vocals, intimate delivery, loving expression, warm tone, passionate singing, heartfelt",
        "instruments": "gentle piano, soft strings, warm acoustic guitar, tender melodic phrasing, delicate touch",
        "production": "intimate close sound, warm analog glow, soft focus mix, gentle compression, romantic reverb",
        "weight_modifier": 0.0,
        "constraint_modifier": -0.05,
    },
    "nostalgic": {
        "description": "wistful, reminiscent, bittersweet, memory-laden, vintage warmth, longing, retro, sentimental",
        "vocals": "nostalgic reflective vocals, wistful delivery, memory-soaked singing, vintage tone, sentimental expression",
        "instruments": "vintage instruments, warm analog tones, old-school playing style, retro effects, classic arrangement",
        "production": "vintage production, tape warmth, retro reverb, nostalgic mix, old-school mastering, warm saturation",
        "weight_modifier": 0.05,
        "constraint_modifier": -0.05,
    },
    "mysterious": {
        "description": "enigmatic, dark, suspenseful, cryptic, shadowy, intrigue, noir, occult, haunting",
        "vocals": "mysterious haunting vocals, cryptic delivery, shadowy tone, enigmatic expression, dark seductive voice",
        "instruments": "dark atmospheric textures, eerie melodies, brooding bass lines, unsettling chords, sparse haunting notes",
        "production": "dark reverb, shadowy mix, mysterious effects processing, low-end emphasis, negative space",
        "weight_modifier": 0.05,
        "constraint_modifier": 0.05,
    },
    "playful": {
        "description": "fun, quirky, lighthearted, whimsical, mischievous, bouncy, childlike, humorous",
        "vocals": "playful quirky vocals, bouncy delivery, whimsical expression, fun tone, mischievous singing",
        "instruments": "bouncy melodies, quirky sound effects, playful percussion, unusual instruments, toy-like sounds",
        "production": "bright punchy mix, playful effects, bouncy compression, clean crisp sound, fun processing",
        "weight_modifier": -0.05,
        "constraint_modifier": -0.05,
    },
    "epic": {
        "description": "grand, majestic, monumental, world-shaking, larger-than-life, heroic, massive, colossal",
        "vocals": "epic powerful vocals, choir-backed delivery, heroic tone, massive expression, legendary performance",
        "instruments": "massive orchestral forces, epic brass fanfares, huge drum sections, full choir, cinematic instrumentation",
        "production": "cinematic blockbuster mix, vast soundstage, huge dynamics, towering mastering, wall-of-sound production",
        "weight_modifier": 0.10,
        "constraint_modifier": 0.0,
    },
}


# ══════════════════════════════════════════════════════════════════════════════
# TEMPO PROFILES — 5 levels with BPM anchors
# ══════════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════════
# ERA MODIFIERS — 8 decades of production technology and musical culture
# ══════════════════════════════════════════════════════════════════════════════

ERA_MODIFIERS: dict[str, dict[str, str]] = {
    "1950s": {
        "production": "1950s production, mono recording, tube warmth, tape saturation, ribbon microphones, vintage compression, live-room ambience, slap-back echo",
        "instruments": "standup bass, brushed drums, hollow-body electric guitar, valve amplifiers, honky-tonk piano, doo-wop vocal harmonies, saxophone section, early Fender Telecaster",
        "vibe": "post-war optimism, early rock-n-roll energy, doo-wop sweetness, rockabilly swagger",
    },
    "1960s": {
        "production": "1960s production, 4-track recording, spring reverb, plate reverb, analog console warmth, tape echo, early stereo experimentation, Abbey Road techniques",
        "instruments": "jangle electric guitar, farfisa organ, hammond B3, mellotron, fuzz pedals, sitars, vox amplifiers, Rickenbacker 12-string, hofner bass",
        "vibe": "psychedelic exploration, british invasion, motown groove, folk revival, surf rock energy",
    },
    "1970s": {
        "production": "1970s production, 8-24 track analog, dead drum rooms, phaser/flanger effects, wah pedals, analog synthesizers, early drum machines, classic rock console sound",
        "instruments": "minimoog, rhodes electric piano, clavinet, talkbox, leslie rotating speaker, extended-range guitars, ludwig vistalite drums, musicman stingray bass",
        "vibe": "analog warmth, funk/disco groove, prog rock ambition, punk raw energy, singer-songwriter intimacy",
    },
    "1980s": {
        "production": "1980s production, gated reverb, DX7 FM synthesis, linndrum, digital delay, chorus effect, early sampling, SSL console mix, big studio polish",
        "instruments": "roland juno/jupiter, yamaha DX7, simmons electronic drums, keytar, pointy guitars, roland TR-808, EMU emulator, yamaha NS-10 monitors",
        "vibe": "digital sheen, excess and polish, new wave/new romantic, thrash metal intensity, synth-pop perfection, hair metal spectacle",
    },
    "1990s": {
        "production": "1990s production, ADAT digital recording, akai samplers, turntablism, early DAW, grunge/alternative mixing, loudness war beginning, protools emergence",
        "instruments": "akai MPC, roland TR-909, korg M1, big muff, rack-mounted effects, mesa boogie rectifier, prs guitars, warwick bass",
        "vibe": "alternative authenticity, hip-hop golden age, rave culture, shoegaze textures, industrial crunch",
    },
    "2000s": {
        "production": "2000s production, protools dominance, autotune effect, loudness war compression, software synthesizers, early dubstep wobble, blog-era indie, laptop production",
        "instruments": "software instruments, laptop production, autotune vocals, 7-string guitars, line 6 pod, native instruments, access virus TI, tech 21 sansamp",
        "vibe": "digital maximalism, bloghaus, emo/pop-punk, crunk/snap, garage rock revival, post-punk revival",
    },
    "2010s": {
        "production": "2010s production, streaming-optimized mastering, vocal chops, future bass supersaws, trap hi-hats, bedroom production, Soundcloud aesthetic, splice samples, serum synthesizer",
        "instruments": "serum/massive, splice samples, 808s, sidechained pads, vocal chops, spline EQ, izotope ozone, omnisphere, kontakt libraries",
        "vibe": "streaming-native sound, genre fluidity, lo-fi revival, hyperpop emergence, future bass euphoria, emo rap crossover",
    },
    "2020s": {
        "production": "2020s production, AI-assisted tools, spatial audio, hyperpop extremes, phonk revival, amapiano log drums, jersey club bounce, tiktok-native formats, genreless fluidity",
        "instruments": "AI generation tools, splice loops, modular synths, granular synthesis, distorted 808s, resampled textures, phase plant, portal granular, rc-20 retro color",
        "vibe": "genreless fluidity, tiktok-native formats, global fusion, nostalgia cycles, post-genre future, bedroom-to-stadium pipeline",
    },
}


# Genre × era specific instrumentation. The generic ERA_MODIFIERS["instruments"]
# is era-only ("1990s gear"); this overlay nails the *genre's* signature kit for
# that decade (1990s techno = TR-909/TB-303, not a generic 90s rack). Keyed by
# the exact GENRE_STYLES key + ERA_MODIFIERS decade. Takes priority over the
# generic era instruments in build_suno_style. Focused on the genres/eras where
# the gear genuinely changes the sound (and that reference lookups land on).
GENRE_ERA_INSTRUMENTS: dict[str, dict[str, str]] = {
    "Techno": {
        "1990s": "Roland TR-909 kick, TB-303 acid lines, Detroit drum machines, raw analog rave stabs, hardware-sequenced loops",
        "2000s": "minimal Berlin techno loops, analog hardware jams, dub-techno chords, Roland TR-909",
        "2010s": "modular synthesis, eurorack sequencing, hypnotic warehouse loops, granular textures, hardware live jams",
        "2020s": "dense modular sound design, hybrid analog-digital, peak-time festival synths, distorted hardware",
    },
    "Acid Techno": {
        "1990s": "Roland TB-303 squelch, TR-909, resonant acid sweeps, raw rave energy",
        "2010s": "overdriven TB-303 acid, modular acid lines, hardware distortion",
    },
    "House": {
        "1990s": "Roland TR-909, house piano stabs, Korg M1 organ bass, sampled disco loops, MPC swing",
        "2010s": "sidechained supersaws, vocal chops, big-room synth stabs, festival drops",
        "2020s": "lo-fi house textures, organic house percussion, modern analog warmth",
    },
    "Trance": {
        "1990s": "Roland JP-8000 supersaw, classic trance gate, Access Virus leads, uplifting arpeggios",
        "2000s": "epic supersaw leads, Virus TI, huge breakdowns, sidechain pump, euphoric pads",
    },
    "Synthwave": {
        "1980s": "Roland Juno-106, Yamaha DX7, LinnDrum, gated reverb, analog arpeggios, neon synth leads",
        "2010s": "modern synthwave production, OB-6, lush retro analog pads, outrun arpeggios",
    },
    "Drum & Bass": {
        "1990s": "chopped Amen break, Reese bass, jungle breakbeats, Akai S1000 sampler grit",
        "2010s": "neurofunk Reese bass, surgical drum processing, heavy sub-bass design",
    },
    "Boom Bap": {
        "1990s": "SP-1200 and Akai MPC60 swing, dusty vinyl samples, boom-bap drums, jazzy chops, vinyl crackle",
    },
    "Trap": {
        "2010s": "Roland TR-808 booming sub-bass, rapid hi-hat rolls, snappy claps, FL Studio trap kit",
        "2020s": "distorted 808 slides, pitched vocal chops, dark melodic trap synths",
    },
    "Phonk": {
        "1990s": "Memphis tape hiss, lo-fi cowbell, distorted 808, screwed vinyl samples",
        "2020s": "drift phonk cowbell, heavily distorted 808s, aggressive sidechain, lo-fi grit",
    },
    "Funk": {
        "1970s": "Clavinet, wah-wah guitar, Fender Rhodes, analog horn section, Moog bass, tight live rhythm section",
    },
    "Rock": {
        "1970s": "tube amp stacks, Hammond organ, Rhodes, live room drums, tape saturation, analog warmth",
        "1980s": "gated reverb drums, chorus-soaked guitars, DX7 pads, arena production",
        "1990s": "grunge distortion, raw overdriven guitars, analog fuzz, live unpolished drums",
    },
    "Pop": {
        "1980s": "DX7 keys, LinnDrum, gated snare, synth-pop sheen, analog bass synth",
        "2010s": "EDM-pop synths, sidechained drops, polished vocal processing, digital production",
    },
}


# ══════════════════════════════════════════════════════════════════════════════
# DYNAMIC ELEMENTS — 8 categories, 150+ techniques for variation and depth
# ══════════════════════════════════════════════════════════════════════════════

DYNAMIC_ELEMENTS: dict[str, list[str]] = {
    "production_quality": [
        "professional studio production",
        "high-fidelity recording",
        "pristine mix quality",
        "audiophile grade sound",
        "mastered for streaming",
        "radio-ready production",
        "polished studio sound",
        "raw lo-fi production aesthetic",
        "intimate bedroom recording quality",
        "live-in-studio organic capture",
        "vintage analog signal chain",
        "DIY home recording charm",
        "audiophile hi-res mastering",
        "underground cassette tape production",
        "modern pristine digital clarity",
        "warm tube-driven analog path",
        "live-to-tape no-overdubs approach",
        "experimental production ethos",
        "mainstream commercial sheen",
        "anti-commercial underground grit",
    ],
    "atmosphere_space": [
        "intimate atmosphere",
        "spacious soundstage",
        "close-mic'd feel",
        "room ambience",
        "concert hall reverb",
        "studio acoustics",
        "live performance energy",
        "cathedral-like spaciousness",
        "claustrophobic tight space",
        "open-air natural ambience",
        "underwater submerged feeling",
        "cavernous depth and echo",
        "warm living-room intimacy",
        "vast cinematic expanse",
        "industrial warehouse acoustics",
        "dense fog of reverb",
        "bone-dry dead room silence",
        "nightclub PA system feel",
        "desert canyon natural reverb",
        "forest clearing organic resonance",
    ],
    "vocal_technique": [
        "breathy falsetto delivery",
        "chest voice power belts",
        "melismatic R&B runs",
        "rapid-fire triplet flow",
        "spoken word cadence",
        "call-and-response phrasing",
        "harmonized double-tracked leads",
        "octave-layered backing vocals",
        "gospel choir swells",
        "operatic vibrato passages",
        "intimate close-mic whisper",
        "distorted megaphone vocal effect",
        "vocoder-processed robotic timbre",
        "shouted punk delivery",
        "growled extreme metal vocals",
        "sung-through-teeth indie delivery",
        "airy head voice float",
        "gravelly blues rasp",
        "autotuned melodic delivery",
        "talk-singing conversational style",
        "yodeled alpine inflection",
        "throat singing overtone harmonics",
        "vibrato-heavy sustained notes",
        "staccato percussive vocal attack",
        "falsetto-to-chest register switches",
    ],
    "instrumental_technique": [
        "palm-muted guitar chugs",
        "tremolo-picked guitar lines",
        "sweep-picked arpeggios",
        "tapped guitar harmonics",
        "slap and pop bass technique",
        "walking bass lines",
        "stride piano style",
        "glissando string sweeps",
        "trilled woodwind ornaments",
        "staccato string ostinatos",
        "pizzicato plucked strings",
        "bowed legato phrases",
        "natural harmonic chimes",
        "pitch-bend synth leads",
        "wah-wah guitar expression",
        "fuzz-drenched power chords",
        "feedback sustain walls",
        "fingerpicked acoustic patterns",
        "slide guitar glissandos",
        "double-stop string bends",
        "pedal-tone sustained notes",
        "ostinato repeating motifs",
        "arco double bass drones",
        "col legno percussive strings",
        "sul ponticello eerie timbre",
    ],
    "rhythm_groove": [
        "swung shuffle feel",
        "syncopated off-beat accents",
        "polyrhythmic layered patterns",
        "triplet-based subdivision feel",
        "dotted rhythm bounce",
        "half-time breakdown feel",
        "double-time acceleration",
        "four-on-the-floor kick pattern",
        "offbeat skank guitar",
        "clave rhythm foundation",
        "dembow rhythmic pattern",
        "bossa nova comping pattern",
        "samba batucada groove",
        "broken beat experimental pulse",
        "odd time signature (5/4, 7/8)",
        "ghost-note snare drum fills",
        "laid-back behind-the-beat feel",
        "pushing ahead on-beat energy",
        "train-beat country rhythm",
        "amen break choppage",
    ],
    "arrangement_structure": [
        "verse-chorus dynamic contrast",
        "dramatic build-up and drop",
        "breakdown section with filtered fade",
        "bridge modulation key change",
        "tempo change mid-song",
        "beat switch section",
        "false ending then final chorus",
        "fade-in atmospheric intro",
        "cold ending abrupt finish",
        "filter sweep riser buildup",
        "DJ scratch transition",
        "half-time breakdown bridge",
        "double-time outro acceleration",
        "spoken word interlude",
        "instrumental solo break",
        "a cappella vocal-only moment",
        "drop-to-silence then restart",
        "layered crescendo finale",
        "stripped-back intimate verse",
        "wall-of-sound chorus explosion",
    ],
    "texture_timbre": [
        "rich harmonic texture",
        "layered sound design",
        "dense arrangement",
        "sparse minimal texture",
        "lush sonic palette",
        "organic sound texture",
        "granular synthesis glitch",
        "saturated analog warmth",
        "bit-crushed digital degradation",
        "glassy crystalline timbre",
        "woody organic resonance",
        "metallic cold overtones",
        "velvety smooth texture",
        "gritty distorted timbre",
        "bell-like pure harmonics",
        "breathy airy quality",
        "growling low-end texture",
        "shimmering high-frequency sparkle",
        "murky dark tonal density",
        "transparent open clarity",
    ],
    "mixing_effect": [
        "sidechain compression pump",
        "stutter edit glitch effect",
        "reverse reverb swell",
        "tape stop slowdown effect",
        "vinyl crackle and dust texture",
        "telephone filter bandpass EQ",
        "wide stereo image spread",
        "narrow mono focus",
        "gated reverb drum sound",
        "slap-back delay echo",
        "ping-pong stereo delay",
        "spring reverb drip",
        "phaser sweeping modulation",
        "flanger jet-plane swoosh",
        "chorus widening effect",
        "overdriven console saturation",
    ],
}


# ══════════════════════════════════════════════════════════════════════════════
# GENRE CATEGORY → TECHNIQUE BIAS — which categories get more weight per genre parent
# ══════════════════════════════════════════════════════════════════════════════

GENRE_TECHNIQUE_BIAS: dict[str, dict[str, float]] = {
    "Metal": {"instrumental_technique": 0.5, "rhythm_groove": 0.3, "mixing_effect": 0.2},
    "Rock": {"instrumental_technique": 0.4, "arrangement_structure": 0.3, "mixing_effect": 0.3},
    "Electronic": {"mixing_effect": 0.4, "texture_timbre": 0.3, "arrangement_structure": 0.3},
    "Hip-Hop": {"rhythm_groove": 0.4, "vocal_technique": 0.3, "mixing_effect": 0.3},
    "Pop": {"vocal_technique": 0.4, "arrangement_structure": 0.3, "production_quality": 0.3},
    "R&B": {"vocal_technique": 0.5, "rhythm_groove": 0.3, "texture_timbre": 0.2},
    "Jazz": {"instrumental_technique": 0.4, "rhythm_groove": 0.4, "texture_timbre": 0.2},
    "Classical": {"arrangement_structure": 0.4, "instrumental_technique": 0.3, "atmosphere_space": 0.3},
    "Folk": {"instrumental_technique": 0.4, "texture_timbre": 0.3, "atmosphere_space": 0.3},
    "Country": {"instrumental_technique": 0.4, "vocal_technique": 0.3, "rhythm_groove": 0.3},
    "Latin": {"rhythm_groove": 0.5, "instrumental_technique": 0.3, "vocal_technique": 0.2},
    "Reggae": {"rhythm_groove": 0.5, "mixing_effect": 0.3, "atmosphere_space": 0.2},
    "World": {"rhythm_groove": 0.4, "instrumental_technique": 0.3, "vocal_technique": 0.3},
    "Experimental": {"texture_timbre": 0.4, "mixing_effect": 0.3, "arrangement_structure": 0.3},
    "Blues": {"instrumental_technique": 0.5, "vocal_technique": 0.3, "texture_timbre": 0.2},
    "Funk": {"rhythm_groove": 0.5, "instrumental_technique": 0.3, "vocal_technique": 0.2},
}


# ══════════════════════════════════════════════════════════════════════════════
# CONTEXT COMBINATIONS — iconic (genre, mood, tempo) triple-nudges
# ══════════════════════════════════════════════════════════════════════════════

CONTEXT_COMBINATIONS: dict[tuple[str, str, str], dict[str, Any]] = {
    # ── Original 12 ───────────────────────────────────────────────────────
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

    # ── New: Electronic/Dance ──────────────────────────────────────────────
    ("Synthwave", "nostalgic", "fast"): {
        "additional": "retro-futuristic neon glow, outrun night drive, 80s cinematic nostalgia, palm trees and gridlines, analog warmth",
        "weight_boost": 0.06,
    },
    ("Trance", "dreamy", "fast"): {
        "additional": "euphoric hands-in-the-air moment, emotional breakdown with piano motif, driving energy release, Armin van Buuren influenced climax",
        "weight_boost": 0.06,
    },
    ("Deep House", "calm", "medium"): {
        "additional": "sophisticated late-night groove, warm chord stabs, soulful vocal sample, intimate club atmosphere, deep listening experience",
        "weight_boost": 0.04,
    },
    ("Techno", "mysterious", "fast"): {
        "additional": "dark warehouse energy, relentless hypnotic drive, industrial textures, Berghain-influenced intensity, strobe-lit tension",
        "weight_boost": 0.06,
    },
    ("Hardstyle", "aggressive", "very_fast"): {
        "additional": "distorted kick drum assault, raw reverse bass, euphoric melody climax, Dutch festival energy, crowd explosion moment",
        "weight_boost": 0.10,
    },
    ("UK Garage", "playful", "medium"): {
        "additional": "skippy 2-step groove, pitched vocal chop hooks, warm sub-bass wobble, 伦敦 summer energy, garage revival bounce",
        "weight_boost": 0.04,
    },
    ("Liquid DnB", "calm", "very_fast"): {
        "additional": "smooth rolling breaks, jazz-influenced melodic warmth, soulful atmospheric pads, sunrise set energy, deep musicality at speed",
        "weight_boost": 0.04,
    },

    # ── New: Hip-Hop/Rap ──────────────────────────────────────────────────
    ("Boom Bap", "confident", "slow"): {
        "additional": "hard-hitting snare crack, sampled jazz loop crackle, 90s New York street energy, lyrical focus, head-nod groove",
        "weight_boost": 0.08,
    },
    ("Drill", "mysterious", "fast"): {
        "additional": "sliding 808 menace, dark piano loop, gritty underground tension, shadowy atmosphere, street narrative intensity",
        "weight_boost": 0.06,
    },
    ("Phonk", "aggressive", "medium"): {
        "additional": "distorted cowbell melody, Memphis rap sample aesthetic, trunk-rattling bass, dark night cruising energy, underground swagger",
        "weight_boost": 0.08,
    },
    ("Cloud Rap", "dreamy", "slow"): {
        "additional": "hazy reverb fog, ethereal sample drift, introspective auto-tuned confession, floating above the beat, dream-state delivery",
        "weight_boost": 0.06,
    },
    ("Grime", "aggressive", "fast"): {
        "additional": "raw Eskibeat square-wave bass, rapid-fire MC sparring, pirate radio energy, underground London urgency, 140 BPM intensity",
        "weight_boost": 0.08,
    },
    ("G-Funk", "calm", "slow"): {
        "additional": "smooth funky synth whine, laid-back West Coast cruise, Parliament sample groove, summer afternoon in LA, lowrider bounce",
        "weight_boost": 0.06,
    },

    # ── New: Rock/Metal ────────────────────────────────────────────────────
    ("Shoegaze", "dreamy", "medium"): {
        "additional": "wall of swirling guitar noise, buried ethereal vocals, hypnotic feedback wash, pedalboard worship, blissful sonic immersion",
        "weight_boost": 0.08,
    },
    ("Grunge", "sad", "medium"): {
        "additional": "quiet-verse loud-chorus dynamic, angsty guitar distortion, raw emotional delivery, 90s Seattle grey-sky energy, cathartic release",
        "weight_boost": 0.06,
    },
    ("Post-Rock", "inspiring", "slow"): {
        "additional": "slow-burn instrumental crescendo, tremolo-picked climax, cinematic emotional sweep, melodic catharsis, Explosions in the Sky influenced",
        "weight_boost": 0.06,
    },
    ("Black Metal", "mysterious", "very_fast"): {
        "additional": "tremolo-picked blizzard of sound, blast-beat fury, cold Nordic atmosphere, shrieked existential pain, lo-fi necro production",
        "weight_boost": 0.10,
    },
    ("Doom Metal", "sad", "very_slow"): {
        "additional": "crushing slow-motion riffs, funeral pacing, immense low-end weight, oppressive darkness, wall of amplifier worship",
        "weight_boost": 0.10,
    },
    ("Industrial", "aggressive", "medium"): {
        "additional": "mechanical drum machine precision, distorted synth aggression, processed vocal menace, factory-floor aesthetic, NIN-influenced tension",
        "weight_boost": 0.06,
    },
    ("Stoner Rock", "calm", "slow"): {
        "additional": "desert highway fuzz riff, warm tube saturation, psychedelic blues jam, hazy afternoon groove, Kyuss-influenced low-slung energy",
        "weight_boost": 0.06,
    },
    ("Progressive Metal", "dramatic", "medium"): {
        "additional": "odd-time technical precision, dynamic whisper-to-roar range, extended instrumental journey, cerebral and visceral, Dream Theater influenced",
        "weight_boost": 0.06,
    },

    # ── New: Pop/Contemporary ──────────────────────────────────────────────
    ("Hyperpop", "energetic", "fast"): {
        "additional": "glitchy maximalist explosion, pitched-up vocal chop euphoria, distorted 808 drop, internet-native chaos, SOPHIE-influenced future pop",
        "weight_boost": 0.06,
    },
    ("K-Pop", "energetic", "fast"): {
        "additional": "genre-shifting section energy, polished maximalist production, tight synchronized performance, explosive chorus payoff, bubblegum-meets-EDM fusion",
        "weight_boost": 0.06,
    },
    ("City Pop", "nostalgic", "medium"): {
        "additional": "glossy 80s Japanese production, funky bass line, summer night driving energy, Tatsuro Yamashita influenced, optimistic retro sophistication",
        "weight_boost": 0.06,
    },
    ("Synth-Pop", "romantic", "medium"): {
        "additional": "analog synthesizer romance, drum machine heartbeat, Depeche Mode influenced dark pop, 80s melancholic dance, stylish new wave energy",
        "weight_boost": 0.04,
    },
    ("Bedroom Pop", "calm", "slow"): {
        "additional": "intimate DIY confession, warm lo-fi charm, cozy homemade production, gentle vulnerability, Clairo-influenced soft energy",
        "weight_boost": 0.04,
    },

    # ── New: Latin/World ───────────────────────────────────────────────────
    ("Reggaeton", "energetic", "medium"): {
        "additional": "infectious dembow groove, synth hook earworm, perreo-ready rhythm, Caribbean heat, Bad Bunny influenced global energy",
        "weight_boost": 0.06,
    },
    ("Afrobeats", "happy", "medium"): {
        "additional": "complex percussion layers, joyful call-and-response, sunny Lagos energy, Burna Boy influenced global groove, dancefloor celebration",
        "weight_boost": 0.06,
    },
    ("Amapiano", "calm", "medium"): {
        "additional": "deep log drum bass, jazzy piano elegance, shaker-heavy South African groove, sophisticated dance, Kabza De Small influenced",
        "weight_boost": 0.06,
    },
    ("Bossa Nova", "romantic", "slow"): {
        "additional": "intimate nylon string guitar, gentle whisper-quiet vocals, Rio de Janeiro sunset, Jobim-influenced elegance, quiet sophistication",
        "weight_boost": 0.06,
    },
    ("Dancehall", "energetic", "fast"): {
        "additional": "digital riddim energy, catchy vocal hook, Jamaican dance floor heat, Sean Paul influenced bounce, unstoppable groove",
        "weight_boost": 0.06,
    },
    ("Bachata", "romantic", "medium"): {
        "additional": "sensual Spanish guitar lead, bongo and guira pulse, passionate romantic delivery, Dominican heart, Romeo Santos influenced intimacy",
        "weight_boost": 0.04,
    },

    # ── New: Jazz/Blues/Soul ───────────────────────────────────────────────
    ("Neo-Soul", "calm", "slow"): {
        "additional": "lush Fender Rhodes warmth, laid-back hip-hop-influenced drums, jazzy harmonic sophistication, Erykah Badu / D'Angelo inspired, organic groove",
        "weight_boost": 0.06,
    },
    ("Jazz Fusion", "energetic", "fast"): {
        "additional": "virtuosic electric improvisation, synthesizer-blazing solos, funky electric bass, Weather Report-influenced complexity, genre-defying ambition",
        "weight_boost": 0.06,
    },
    ("Blues", "sad", "slow"): {
        "additional": "soulful bent-note guitar cry, 12-bar emotional release, raw tube amp expression, late-night solitary mood, authentic heartbreak",
        "weight_boost": 0.06,
    },
    ("Funk", "energetic", "fast"): {
        "additional": "tight syncopated groove, slap bass virtuosity, brass section punch, James Brown-influenced dance imperative, unstoppable rhythmic energy",
        "weight_boost": 0.06,
    },
    ("Gospel", "inspiring", "medium"): {
        "additional": "soul-stirring choir swells, call-and-response spiritual power, emotional conviction, church-raised vocal excellence, transcendent energy",
        "weight_boost": 0.06,
    },

    # ── New: Folk/Acoustic ─────────────────────────────────────────────────
    ("Bluegrass", "energetic", "very_fast"): {
        "additional": "rapid-fire banjo rolls, mandolin chop drive, fiddle break virtuosity, high lonesome vocal harmony, Appalachian barn-dance energy",
        "weight_boost": 0.08,
    },
    ("Celtic Folk", "happy", "fast"): {
        "additional": "reel and jig dance energy, tin whistle melodic flight, bodhran driving pulse, Irish pub session joy, traditional celebration",
        "weight_boost": 0.06,
    },
    ("Acoustic", "romantic", "slow"): {
        "additional": "fingerpicked intimacy, natural wood resonance, unplugged warmth, whispered closeness, pure organic emotion",
        "weight_boost": 0.04,
    },
}
