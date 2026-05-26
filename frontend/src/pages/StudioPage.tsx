import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { usePlayer } from "@/store/player";

import { Panel } from "@/components/ui/Panel";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Coin } from "@/components/ui/Coin";
import { AgentChat, type AgentResult } from "@/components/studio/AgentChat";
import { ModuleIcon } from "@/components/studio/ModuleIcon";
import { VoiceRecorder } from "@/components/studio/VoiceRecorder";
import {
  createLyricsDraft,
  fetchLyricsDraft,
  fetchGeneration,
  generateSong,
  generateInstrumental,
  generateSoundEffect,
  generateCoverSong,
  generateCoverArt,
  generateOccasion,
  openGenerationSocket,
  requestAutoTitle,
  uploadCoverFile,
  uploadCoverRefImage,
  type AgentIntent,
} from "@/lib/api/client";
import { SUNO_LIMITS } from "@/lib/sunoConstraints";
import { blobToWav } from "@/lib/audio/recordToWav";
import { useGenerationStore } from "@/store/generation";
import { MUSIC_TYPES, useLibraryItems } from "@/lib/library";
import "./StudioPage.css";

type LyricsState = "idle" | "generating" | "review" | "approved";

// Шаблоны инструменталов — синхронизированы с ботом (Test20.04/main1.py:299–362, get_preset_keyboard).
// mode="auto" — моментально запускает автогенерацию (подсвечена кнопка сгенерировать).
// mode="prompt" — только заполняет поля как «отправная точка», дальше пользователь докручивает.
const INSTRUMENTAL_PRESETS = [
  { key: "sleep",       title: "Для сна",        emoji: "😴", genre: "Ambient",    mood: "dreamy",     tempo: "very_slow", extra: "music for falling asleep, deeply calming and peaceful atmosphere, soothing and restful mood", mode: "auto"   as const },
  { key: "cafe",        title: "Для кафе",      emoji: "☕", genre: "Jazz",       mood: "calm",       tempo: "slow",      extra: "cozy cafe background atmosphere, warm and inviting mood for conversation over coffee",      mode: "auto"   as const },
  { key: "work",        title: "Для работы",    emoji: "💻", genre: "Lofi",       mood: "calm",       tempo: "slow",      extra: "focus-enhancing background music for deep work, non-distracting and steady concentration mood", mode: "auto"   as const },
  { key: "driving",     title: "Для поездки",   emoji: "🚗", genre: "Synthwave",  mood: "confident",  tempo: "medium",    extra: "open road trip atmosphere, sense of freedom and motion, evening highway vibe",               mode: "auto"   as const },
  { key: "meditation",  title: "Для медитации", emoji: "🧘", genre: "Ambient",    mood: "calm",       tempo: "very_slow", extra: "meditative soundscape, deeply tranquil and spiritual healing atmosphere, mindful presence",  mode: "auto"   as const },
  { key: "party",       title: "Для вечеринки", emoji: "🎉", genre: "Funk",       mood: "energetic",  tempo: "medium",    extra: "modern dance funk for a vibrant party atmosphere, groovy and danceable, lively and full of variety, contemporary and festive energy", mode: "auto" as const },
  { key: "content",     title: "Для контента",  emoji: "🎬", genre: "",  mood: "",  tempo: "",  extra: "Background music for video content",                mode: "prompt" as const },
  { key: "workout",     title: "Тренировка",    emoji: "💪", genre: "",  mood: "",  tempo: "",  extra: "Music for a workout session",                       mode: "prompt" as const },
  { key: "gaming",      title: "Для игр",       emoji: "🎮", genre: "",  mood: "",  tempo: "",  extra: "Music for gaming background",                       mode: "prompt" as const },
  { key: "creative",    title: "Творчество",    emoji: "🎨", genre: "",  mood: "",  tempo: "",  extra: "Music for creative work and inspiration",           mode: "prompt" as const },
] as const;

type PresetKey = typeof INSTRUMENTAL_PRESETS[number]["key"];

// Доступные модели для генерации обложки. cost — число монет RIFFA.
const COVER_ART_MODELS: ReadonlyArray<{ id: string; name: string; descr: string; cost: number }> = [
  { id: "nano-banana",     name: "Nano Banana",       descr: "Базовая модель. Быстро, 1–10 секунд, используется в боте.",                     cost: 1 },
  { id: "nano-banana-2",   name: "Nano Banana 2",     descr: "Улучшенная композиция и детализация, при той же скорости.",                cost: 2 },
  { id: "nano-banana-pro", name: "Nano Banana Pro",   descr: "Самый высокий уровень — фотореализм, типографика, сложные сцены.",   cost: 3 },
] as const;

type Module = "song" | "instrumental" | "sound_effect" | "cover" | "cover_art";

interface ModuleMeta {
  id: Module;
  emoji: string;
  title: string;
  shortDesc: string;
  longDesc: string;
  /** Стоимость в токенах RIFFA за одну генерацию. Для модулей с разными моделями — минимум. */
  cost: number;
  /** Для модулей с несколькими моделями: показываем «от N». */
  costFrom?: boolean;
  postponed?: boolean;
  badge?: string;
}

const MODULES: readonly ModuleMeta[] = [
  {
    id: "song",
    emoji: "🎵",
    title: "Создать песню",
    shortDesc: "Создай сам или попроси помочь AI.",
    longDesc:
      "Полноценный конструктор: жанр, вокал, тембр, темп, текст. Если не знаешь, что выбрать — расскажи идею агенту, он соберёт промпт за тебя.",
    cost: 2,
    badge: "Главный модуль",
  },
  {
    id: "instrumental",
    emoji: "🎹",
    title: "Инструментал",
    shortDesc: "Музыка без слов под видео или фон.",
    longDesc: "Только инструментал: жанр, темп, настроение, описание. Suno без вокала.",
    cost: 2,
  },
  {
    id: "cover",
    emoji: "🎤",
    title: "Кавер-версия",
    shortDesc: "Превратите СВОЁ аудио в полноценный трек.",
    longDesc:
      "Запишите свой голос/напевание/инструмент или загрузите оригинальное аудио — Suno сделает на его основе новый трек в выбранном стиле. Чужие хиты не подойдут — Suno автоматически отклоняет аудио, совпадающее с известными произведениями.",
    cost: 2,
  },
  {
    id: "sound_effect",
    emoji: "⚡",
    title: "Звуковой эффект",
    shortDesc: "SFX, импакты, ambient — как в кино.",
    longDesc: "Источник, среда, длительность, характер — точечный prompt только для эффекта, без музыки.",
    cost: 0.5,
  },
  {
    id: "cover_art",
    emoji: "🎨",
    title: "Обложка",
    shortDesc: "AI-обложки через чат с агентом.",
    longDesc: "Опиши идею агенту в чате или введи prompt сам. Выбери модель нейросети — Nano Banana / Nano Banana 2 / Nano Banana Pro. Получи обложку под любой трек.",
    cost: 1,
    costFrom: true,
  },
];

const GENRES = [
  "Ambient","Piano","Classical","Lofi","Chillout","Downtempo","Orchestral","Cinematic","Strings","Jazz",
  "Blues","Soul","Funk","Indie","Alternative","Country","Reggae","Latin","World","Synthwave","House",
  "Trance","R&B","Hip-Hop","Boom Bap","EDM","Techno","Trap","Phonk","Drum & Bass","Dubstep","Post-Rock",
  "Rock","Metal","Djent","Experimental",
] as const;

const MOODS_RU: ReadonlyArray<readonly [string, string]> = [
  ["happy", "😊 Радостное"], ["calm", "😌 Спокойное"], ["sad", "😢 Грустное"],
  ["energetic", "😤 Энергичное"], ["confident", "😎 Уверенное"], ["dreamy", "🌙 Мечтательное"],
  ["aggressive", "🔥 Агрессивное"], ["inspiring", "🌅 Вдохновляющее"], ["anxious", "😰 Тревожное"],
  ["dramatic", "🎭 Драматичное"],
];
const MOODS_EN: ReadonlyArray<readonly [string, string]> = [
  ["happy", "😊 Happy"], ["calm", "😌 Calm"], ["sad", "😢 Sad"],
  ["energetic", "😤 Energetic"], ["confident", "😎 Confident"], ["dreamy", "🌙 Dreamy"],
  ["aggressive", "🔥 Aggressive"], ["inspiring", "🌅 Inspiring"], ["anxious", "😰 Anxious"],
  ["dramatic", "🎭 Dramatic"],
];

const TEMPOS_RU: ReadonlyArray<readonly [string, string]> = [
  ["very_slow", "🐌 Очень медленный · 60–80 BPM"],
  ["slow", "🚶 Медленный · 80–100 BPM"],
  ["medium", "🚴 Средний · 100–120 BPM"],
  ["fast", "🏃 Быстрый · 120–140 BPM"],
  ["very_fast", "🚀 Очень быстрый · 140–180 BPM"],
];
const TEMPOS_EN: ReadonlyArray<readonly [string, string]> = [
  ["very_slow", "🐌 Very slow · 60–80 BPM"],
  ["slow", "🚶 Slow · 80–100 BPM"],
  ["medium", "🚴 Medium · 100–120 BPM"],
  ["fast", "🏃 Fast · 120–140 BPM"],
  ["very_fast", "🚀 Very fast · 140–180 BPM"],
];

const VOCAL_TYPES_RU: ReadonlyArray<readonly [string, string]> = [
  ["male", "Мужской"], ["female", "Женский"], ["any", "Выбор за ИИ"],
];
const VOCAL_TYPES_EN: ReadonlyArray<readonly [string, string]> = [
  ["male", "Male"], ["female", "Female"], ["any", "AI chooses"],
];

const TIMBRES_RU: ReadonlyArray<readonly [string, string]> = [
  ["balanced", "Сбалансированный"], ["pop", "Эстрадный"], ["warm", "Тёплый"],
  ["raspy", "Хриплый"], ["scream", "Жёсткое screamo"],
];
const TIMBRES_EN: ReadonlyArray<readonly [string, string]> = [
  ["balanced", "Balanced"], ["pop", "Pop / Bright"], ["warm", "Warm"],
  ["raspy", "Raspy"], ["scream", "Heavy screamo"],
];

const LYRICS_MODES_RU: ReadonlyArray<readonly [string, string]> = [
  ["ai-vocal", "ИИ пишет текст и вокал"],
  ["custom-lyrics", "Свой текст"],
  ["instrumental", "Без текста"],
];
const LYRICS_MODES_EN: ReadonlyArray<readonly [string, string]> = [
  ["ai-vocal", "AI writes lyrics + vocals"],
  ["custom-lyrics", "Custom lyrics"],
  ["instrumental", "No lyrics"],
];

const SFX_SOURCES_RU: ReadonlyArray<readonly [string, string]> = [
  ["impact", "Удар / impact"], ["glitch", "Glitch transition"], ["nature", "Природа"],
  ["mechanic", "Механика"], ["whoosh", "Whoosh"], ["custom", "Свой звук"],
];
const SFX_SOURCES_EN: ReadonlyArray<readonly [string, string]> = [
  ["impact", "Impact / hit"], ["glitch", "Glitch transition"], ["nature", "Nature"],
  ["mechanic", "Mechanical"], ["whoosh", "Whoosh"], ["custom", "Custom sound"],
];

const SFX_ENVS_RU: ReadonlyArray<readonly [string, string]> = [
  ["studio", "Чистая студия"], ["room", "Комната"], ["street", "Улица"],
  ["forest", "Лес"], ["space", "Космос"],
];
const SFX_ENVS_EN: ReadonlyArray<readonly [string, string]> = [
  ["studio", "Clean studio"], ["room", "Room"], ["street", "Street"],
  ["forest", "Forest"], ["space", "Space"],
];

const SFX_DURATIONS_RU: ReadonlyArray<readonly [string, string]> = [
  ["short", "Короткий 1–2 сек"], ["medium", "Средний 3–6 сек"], ["long", "Длинный ambience 10+ сек"],
];
const SFX_DURATIONS_EN: ReadonlyArray<readonly [string, string]> = [
  ["short", "Short 1–2 s"], ["medium", "Medium 3–6 s"], ["long", "Long ambience 10+ s"],
];

const SFX_STYLES_RU: ReadonlyArray<readonly [string, string]> = [
  ["cinematic", "Киношный"], ["realistic", "Реалистичный"], ["clean", "Чистый"],
];
const SFX_STYLES_EN: ReadonlyArray<readonly [string, string]> = [
  ["cinematic", "Cinematic"], ["realistic", "Realistic"], ["clean", "Clean"],
];

// Module-level aliases used by prompt-building helpers (outside component scope).
// These always use EN values so that Suno/API prompts are in English regardless
// of the display language. UI uses locale-aware variants defined inside StudioPage.
const MOODS        = MOODS_EN;
const TEMPOS       = TEMPOS_EN;
const VOCAL_TYPES  = VOCAL_TYPES_EN;
const TIMBRES      = TIMBRES_EN;
const LYRICS_MODES = LYRICS_MODES_EN;
const SFX_SOURCES  = SFX_SOURCES_EN;
const SFX_ENVS     = SFX_ENVS_EN;
const SFX_DURATIONS = SFX_DURATIONS_EN;
const SFX_STYLES   = SFX_STYLES_EN;

interface SongState {
  lyricsMode: string;
  // Lyrics-first state machine for the Song module.
  lyricsState: LyricsState;
  lyricsTopic: string;
  lyricsText: string;
  lyricsTitle: string;
  lyricsTaskId: string | null;
  lyricsError: string | null;
  vocal: string;
  timbre: string;
  customTimbre: string;
  genre: string;
  customGenre: string;
  mood: string;
  customMood: string;
  tempo: string;
  customTempo: string;
  extra: string;
  instrumentalExtra: string;
  instrumentalPreset: PresetKey | "";
  sfxSource: string;
  sfxCustomSource: string;
  sfxEnv: string;
  sfxDuration: string;
  sfxStyle: string;
  sfxExtra: string;
  agentPrompt: string;
  coverUrl: string;
  coverFileName: string;
  coverTitle: string;
  coverGenre: string;
  coverCustomGenre: string;
  coverMood: string;
  coverTempo: string;
  coverStyle: string;
  coverLyrics: string;
  coverInstrumental: string;
  coverVocalGender: string;
  coverStyleWeight: string;
  coverWeirdness: string;
  /** Язык авто-генерируемого вокала: "ru"/"en"/"" (Suno auto). */
  coverLanguage: string;
  coverArtPrompt: string;
  coverArtModel: string;
  coverArtRefUrl: string;
  /** Track-name step (last UI step before submit). "auto" — agent names it
   *  (`Artist - Idea (RIFFAMusic)`); "manual" — user types the name. */
  trackNameMode: "auto" | "manual";
  trackName: string;
}

const INITIAL_STATE: SongState = {
  lyricsMode: "ai-vocal",
  lyricsState: "idle",
  lyricsTopic: "",
  lyricsText: "",
  lyricsTitle: "",
  lyricsTaskId: null,
  lyricsError: null,
  vocal: "any",
  timbre: "balanced",
  customTimbre: "",
  genre: "Pop",
  customGenre: "",
  mood: "energetic",
  customMood: "",
  tempo: "medium",
  customTempo: "",
  extra: "",
  instrumentalExtra: "",
  instrumentalPreset: "",
  sfxSource: "impact",
  sfxCustomSource: "",
  sfxEnv: "studio",
  sfxDuration: "short",
  sfxStyle: "cinematic",
  sfxExtra: "",
  agentPrompt: "",
  coverUrl: "",
  coverFileName: "",
  coverTitle: "",
  coverGenre: "",
  coverCustomGenre: "",
  coverMood: "",
  coverTempo: "",
  coverStyle: "",
  coverLyrics: "",
  coverInstrumental: "no",
  coverVocalGender: "auto",
  coverStyleWeight: "0.85",
  coverWeirdness: "0.35",
  coverLanguage: "ru",
  coverArtPrompt: "",
  coverArtModel: "nano-banana",
  coverArtRefUrl: "",
  trackNameMode: "auto",
  trackName: "",
};

const COVER_INSTRUMENTAL_RU: ReadonlyArray<readonly [string, string]> = [
  ["no", "С вокалом"],
  ["yes", "Инструментальный кавер"],
];
const COVER_INSTRUMENTAL_EN: ReadonlyArray<readonly [string, string]> = [
  ["no", "With vocals"],
  ["yes", "Instrumental cover"],
];
const COVER_VOCAL_GENDERS_RU: ReadonlyArray<readonly [string, string]> = [
  ["auto", "Как в оригинале"],
  ["m", "Мужской"],
  ["f", "Женский"],
];
const COVER_VOCAL_GENDERS_EN: ReadonlyArray<readonly [string, string]> = [
  ["auto", "As original"],
  ["m", "Male"],
  ["f", "Female"],
];
const COVER_STYLE_WEIGHTS_RU: ReadonlyArray<readonly [string, string]> = [
  ["0.35", "Свободнее · 0.35"],
  ["0.5", "Средне · 0.5"],
  ["0.65", "Точнее стилю · 0.65"],
  ["0.85", "Максимально по стилю · 0.85"],
];
const COVER_STYLE_WEIGHTS_EN: ReadonlyArray<readonly [string, string]> = [
  ["0.35", "Looser · 0.35"],
  ["0.5", "Balanced · 0.5"],
  ["0.65", "Closer to style · 0.65"],
  ["0.85", "Max style · 0.85"],
];
const COVER_WEIRDNESS_RU: ReadonlyArray<readonly [string, string]> = [
  ["0.2", "Близко к оригиналу · 0.2"],
  ["0.5", "Сбалансированно · 0.5"],
  ["0.8", "Экспериментально · 0.8"],
];
const COVER_WEIRDNESS_EN: ReadonlyArray<readonly [string, string]> = [
  ["0.2", "Close to original · 0.2"],
  ["0.5", "Balanced · 0.5"],
  ["0.8", "Experimental · 0.8"],
];
function valueLabel(value: string, options: ReadonlyArray<readonly [string, string]>): string {
  return options.find(([v]) => v === value)?.[1] ?? value;
}

function buildPrompt(module: Module, state: SongState): string {
  const meta = MODULES.find((m) => m.id === module);
  const parts: string[] = [`Task: ${meta?.title ?? module}`];

  const genreValue =
    state.genre === "custom" && state.customGenre.trim() ? state.customGenre.trim() : state.genre;
  const timbreValue =
    state.timbre === "custom" && state.customTimbre.trim()
      ? state.customTimbre.trim()
      : valueLabel(state.timbre, TIMBRES);
  const moodValue =
    state.mood === "custom" && state.customMood.trim()
      ? state.customMood.trim()
      : valueLabel(state.mood, MOODS);
  const tempoValue =
    state.tempo === "custom" && state.customTempo.trim()
      ? state.customTempo.trim()
      : valueLabel(state.tempo, TEMPOS);

  if (module === "song") {
    if (state.agentPrompt.trim()) {
      parts.push("Agent-collected brief:\n" + state.agentPrompt.trim());
    }
    parts.push(`Lyrics mode: ${valueLabel(state.lyricsMode, LYRICS_MODES)}`);
    parts.push(`Vocal type: ${valueLabel(state.vocal, VOCAL_TYPES)}`);
    parts.push(`Vocal tone/style: ${timbreValue}`);
    // The approved lyrics — either AI-drafted or user-written — get hard-pinned
    // into the prompt, so Suno gets the exact text the user signed off on.
    if (state.lyricsMode !== "instrumental" && state.lyricsText.trim()) {
      parts.push(`Approved lyrics:\n${state.lyricsText.trim()}`);
    } else if (state.lyricsMode === "ai-vocal" && state.lyricsTopic.trim()) {
      parts.push(`Lyrics topic: ${state.lyricsTopic.trim()}`);
    }
  }

  if (module === "instrumental") {
    if (state.instrumentalPreset) {
      const preset = INSTRUMENTAL_PRESETS.find((p) => p.key === state.instrumentalPreset);
      if (preset) parts.push(`Preset: ${preset.title} (${preset.key})`);
    }
    if (state.instrumentalExtra.trim()) {
      parts.push(`Instrumental details: ${state.instrumentalExtra.trim()}`);
    }
  }

  if (module === "song" || module === "instrumental") {
    parts.push(`Music style/genre: ${genreValue}`);
    parts.push(`Mood: ${moodValue}`);
    parts.push(`Tempo: ${tempoValue}`);
  }

  if (module === "sound_effect") {
    const sfxSrc = state.sfxSource === "custom" && state.sfxCustomSource.trim()
      ? state.sfxCustomSource.trim()
      : valueLabel(state.sfxSource, SFX_SOURCES);
    parts.push(`Sound source: ${sfxSrc}`);
    parts.push(`Environment: ${valueLabel(state.sfxEnv, SFX_ENVS)}`);
    parts.push(`Duration: ${valueLabel(state.sfxDuration, SFX_DURATIONS)}`);
    parts.push(`Character: ${valueLabel(state.sfxStyle, SFX_STYLES)}`);
    if (state.sfxExtra.trim()) parts.push(`Attack/tail/intensity/texture: ${state.sfxExtra.trim()}`);
    parts.push("Output: precise SFX prompt, not music, no melody unless requested.");
    return parts.join("\n");
  }

  if (module === "cover") {
    const body: string[] = ["Task: Suno cover (V5_5 · /generate/upload-cover)"];
    body.push(`uploadUrl: ${state.coverUrl.trim() || "—"}`);
    body.push(`title: ${state.coverTitle.trim() || "Cover"}`);
    body.push(`instrumental: ${state.coverInstrumental === "yes"}`);

    // Genre, mood, tempo
    const genre = state.coverGenre === "custom" ? state.coverCustomGenre.trim() : state.coverGenre;
    if (genre) body.push(`Genre: ${genre}`);
    if (state.coverMood) body.push(`Mood: ${valueLabel(state.coverMood, MOODS)}`);
    if (state.coverTempo) body.push(`Tempo: ${valueLabel(state.coverTempo, TEMPOS)}`);

    body.push(`style (≤1000): ${state.coverStyle.trim() || "—"}`);
    if (state.coverInstrumental !== "yes" && state.coverLyrics.trim()) {
      body.push(`prompt (new lyrics, ≤5000):\n${state.coverLyrics.trim()}`);
    }
    if (state.coverVocalGender !== "auto") body.push(`vocalGender: ${state.coverVocalGender}`);
    body.push(`styleWeight: ${state.coverStyleWeight}`);
    body.push(`weirdnessConstraint: ${state.coverWeirdness}`);
    return body.join("\n");
  }

  if (module === "cover_art") {
    const body: string[] = ["Task: cover art generation"];
    const model = COVER_ART_MODELS.find((m) => m.id === state.coverArtModel);
    body.push(`model: ${model?.name ?? state.coverArtModel} (${state.coverArtModel})`);
    if (state.coverArtPrompt.trim()) {
      body.push(`prompt: ${state.coverArtPrompt.trim()}`);
    } else {
      body.push("prompt: — (нужно заполнить самим или через чат с агентом)");
    }
    if (state.coverArtRefUrl) {
      body.push("reference_image: загружен (учесть стиль и композицию референса)");
    }
    body.push("aspect: 1:1 · size: 1024×1024");
    return body.join("\n");
  }

  if (module === "instrumental") parts.push("Output: Suno-ready instrumental prompt, no vocals.");
  else parts.push("Output: detailed Suno-ready prompt with strong prompt engineering.");

  return parts.join("\n");
}

// ─────────────────── Lyrics building blocks ───────────────────
// Two small render-only sub-components that own the lyrics state machine UI.
// Logic lives in StudioPage; these only know how to render based on `state.lyricsState`.

interface LyricsAiBlockProps {
  state: SongState;
  onTopicChange: (v: string) => void;
  onTextChange: (v: string) => void;
  onStart: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
}

function LyricsAiBlock({
  state,
  onTopicChange,
  onTextChange,
  onStart,
  onApprove,
  onEdit,
  onRegenerate,
}: LyricsAiBlockProps) {
  const { t } = useTranslation();
  const { lyricsState, lyricsTopic, lyricsText, lyricsTitle, lyricsError } = state;

  return (
    <label className="builder-step lyrics-block">
      <strong>{t("studio.lyrics.aiTitle")}</strong>
      <span className="muted">{t("studio.lyrics.aiDesc")}</span>
      <textarea
        rows={2}
        value={lyricsTopic}
        onChange={(e) => onTopicChange(e.target.value)}
        placeholder={t("studio.lyrics.aiPlaceholder")}
        maxLength={SUNO_LIMITS.DESCRIPTION_MAX}
        disabled={lyricsState === "generating"}
      />
      <span className="char-counter">
        {lyricsTopic.length} / {SUNO_LIMITS.DESCRIPTION_MAX}
      </span>

      {lyricsState === "idle" && (
        <div className="lyrics-actions">
          <Button onClick={onStart} disabled={!lyricsTopic.trim()}>
            {t("studio.lyrics.generate")}
          </Button>
          {lyricsError && <span className="lyrics-error">{lyricsError}</span>}
        </div>
      )}

      {lyricsState === "generating" && (
        <div className="lyrics-window lyrics-window--generating" aria-live="polite">
          <span className="lyrics-window__shimmer" aria-hidden="true" />
          <span className="lyrics-window__pulse" aria-hidden="true" />
          <p className="lyrics-window__status">{t("studio.lyrics.generating")}</p>
          <p className="muted">{t("studio.lyrics.generatingDesc")}</p>
        </div>
      )}

      {(lyricsState === "review" || lyricsState === "approved") && (
        <>
          {lyricsTitle && (
            <p className="lyrics-window__title">
              <span className="muted">{t("studio.lyrics.titleLabel")}</span> {lyricsTitle}
            </p>
          )}
          <textarea
            className={`lyrics-text${lyricsState === "approved" ? " lyrics-text--approved" : ""}`}
            rows={10}
            value={lyricsText}
            onChange={(e) => onTextChange(e.target.value)}
            readOnly={lyricsState === "approved"}
            maxLength={SUNO_LIMITS.LYRICS_MAX}
          />
          <span className="char-counter">
            {lyricsText.length} / {SUNO_LIMITS.LYRICS_MAX}
          </span>
          <div className="lyrics-actions">
            {lyricsState === "review" ? (
              <>
                <Button onClick={onApprove} disabled={!lyricsText.trim()}>
                  {t("studio.lyrics.accept")}
                </Button>
                <button type="button" className="ghost-btn" onClick={onRegenerate}>
                  {t("studio.lyrics.regenerate")}
                </button>
              </>
            ) : (
              <button type="button" className="ghost-btn" onClick={onEdit}>
                {t("studio.lyrics.edit")}
              </button>
            )}
          </div>
        </>
      )}
    </label>
  );
}

interface LyricsCustomBlockProps {
  state: SongState;
  onTextChange: (v: string) => void;
  onApprove: () => void;
  onEdit: () => void;
}

function LyricsCustomBlock({
  state,
  onTextChange,
  onApprove,
  onEdit,
}: LyricsCustomBlockProps) {
  const { t } = useTranslation();
  const { lyricsState, lyricsText } = state;

  return (
    <label className="builder-step lyrics-block">
      <strong>{t("studio.lyrics.customTitle")}</strong>
      <span className="muted">{t("studio.lyrics.customDesc")}</span>
      <textarea
        className={`lyrics-text${lyricsState === "approved" ? " lyrics-text--approved" : ""}`}
        rows={10}
        value={lyricsText}
        onChange={(e) => onTextChange(e.target.value)}
        readOnly={lyricsState === "approved"}
        maxLength={SUNO_LIMITS.LYRICS_MAX}
        placeholder={t("studio.lyrics.customPlaceholder")}
      />
      <span className="char-counter">
        {lyricsText.length} / {SUNO_LIMITS.LYRICS_MAX}
      </span>
      <div className="lyrics-actions">
        {lyricsState === "approved" ? (
          <button type="button" className="ghost-btn" onClick={onEdit}>
            {t("studio.lyrics.edit")}
          </button>
        ) : (
          <Button onClick={onApprove} disabled={!lyricsText.trim()}>
            {t("studio.lyrics.accept")}
          </Button>
        )}
      </div>
    </label>
  );
}

/* ── Color palette for track covers ─────────────────── */
const TRACK_COLORS = ["c-emr", "c-hi", "c-ink", "c-paper", "c-blue", "c-rose"] as const;
function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TRACK_COLORS[h % TRACK_COLORS.length];
}

function RecentTracks() {
  const { items, isLoading } = useLibraryItems();
  const { playOrToggle, currentId, isPlaying } = usePlayer(
    useShallow((s) => ({
      playOrToggle: s.playOrToggle,
      currentId: s.current?.id ?? null,
      isPlaying: s.isPlaying,
    })),
  );
  const recent = items.slice(0, 8);

  if (isLoading) return <p className="tracks-empty">Загружаем…</p>;
  if (!recent.length) return <p className="tracks-empty">Треков ещё нет — создай первый выше.</p>;

  const queue = recent
    .filter((i) => !!i.audioUrl)
    .map((i) => ({
      id: i.id,
      title: i.title,
      url: i.audioUrl,
      cover: i.coverUrl ?? undefined,
      meta: [i.genre, i.mood].filter(Boolean).join(" · "),
      isOwn: true,
      canRadio: MUSIC_TYPES.has(i.type),
      isMusicType: MUSIC_TYPES.has(i.type),
      isPublic: i.isPublic,
    }));

  return (
    <div className="tracks">
      {recent.map((item) => {
        const isActive = item.id === currentId;
        const color = colorFor(item.generationId);
        const track = {
          id: item.id,
          title: item.title,
          url: item.audioUrl,
          cover: item.coverUrl ?? undefined,
          meta: [item.genre, item.mood].filter(Boolean).join(" · "),
          isOwn: true,
          canRadio: MUSIC_TYPES.has(item.type),
          isMusicType: MUSIC_TYPES.has(item.type),
          isPublic: item.isPublic,
        };
        return (
          <div
            key={item.id}
            className="track"
            onClick={() => item.audioUrl && playOrToggle(track, queue)}
          >
            <div className={`track-cover ${color}`}>
              {item.coverUrl && (
                <img src={item.coverUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              )}
              {item.duration && <span className="duration">{item.duration}</span>}
              <button
                type="button"
                className="play"
                aria-label={isActive && isPlaying ? "Пауза" : "Играть"}
                onClick={(e) => { e.stopPropagation(); item.audioUrl && playOrToggle(track, queue); }}
              >
                {isActive && isPlaying ? "⏸" : "▶"}
              </button>
            </div>
            <div className="track-meta">
              <div className="track-num">{item.type.toUpperCase()}</div>
              <div className="track-title">{item.title || "Без названия"}</div>
              <div className="track-artist">
                {[item.genre, item.mood].filter(Boolean).join(" · ") || "—"}
              </div>
              {item.isPublic && (
                <div className="track-stats"><span className="live">в радио</span></div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StudioPage() {
  const { t, i18n: i18nInst } = useTranslation();
  const isEn = (i18nInst.resolvedLanguage ?? "ru").startsWith("en");
  // Хелпер: даёт переведённое имя/описание модуля по его id (song, instrumental, ...)
  const moduleTrans = (id: string, field: "title" | "short") => {
    const v = t(`studio.modulesById.${id}.${field}`, { defaultValue: "" });
    return typeof v === "string" ? v : "";
  };
  const presetTitle = (key: string, fallback: string) => {
    const v = t(`studioPresets.${key}`, { defaultValue: "" });
    return (typeof v === "string" && v) ? v : fallback;
  };
  const modelDescr = (id: string, fallback: string) => {
    const v = t(`studioModels.${id}.descr`, { defaultValue: "" });
    return (typeof v === "string" && v) ? v : fallback;
  };
  const moduleFullTitle = (id: string, fallback: string) => {
    const v = t(`studioModules.${id}.title`, { defaultValue: "" });
    return (typeof v === "string" && v) ? v : fallback;
  };
  const moduleFullDesc = (id: string, field: "shortDesc" | "longDesc" | "badge", fallback = "") => {
    const v = t(`studioModules.${id}.${field}`, { defaultValue: "" });
    return (typeof v === "string" && v) ? v : fallback;
  };

  // Locale-aware chip arrays for UI display (RU or EN based on language).
  // Note: module-level MOODS/TEMPOS/etc use EN for building Suno prompts.
  const uiMoods       = isEn ? MOODS_EN        : MOODS_RU;
  const uiTempos      = isEn ? TEMPOS_EN       : TEMPOS_RU;
  const uiVocalTypes  = isEn ? VOCAL_TYPES_EN  : VOCAL_TYPES_RU;
  const uiTimbres     = isEn ? TIMBRES_EN      : TIMBRES_RU;
  const uiLyricsModes = isEn ? LYRICS_MODES_EN : LYRICS_MODES_RU;
  const uiSfxSources  = isEn ? SFX_SOURCES_EN  : SFX_SOURCES_RU;
  const uiSfxEnvs     = isEn ? SFX_ENVS_EN     : SFX_ENVS_RU;
  const uiSfxDurations = isEn ? SFX_DURATIONS_EN : SFX_DURATIONS_RU;
  const uiSfxStyles    = isEn ? SFX_STYLES_EN    : SFX_STYLES_RU;
  const uiCoverInstrumental  = isEn ? COVER_INSTRUMENTAL_EN  : COVER_INSTRUMENTAL_RU;
  const uiCoverVocalGenders  = isEn ? COVER_VOCAL_GENDERS_EN : COVER_VOCAL_GENDERS_RU;
  const uiCoverStyleWeights  = isEn ? COVER_STYLE_WEIGHTS_EN : COVER_STYLE_WEIGHTS_RU;
  const uiCoverWeirdness     = isEn ? COVER_WEIRDNESS_EN     : COVER_WEIRDNESS_RU;
  const [searchParams, setSearchParams] = useSearchParams();
  const playerPlay = usePlayer((s) => s.play);
  const [activeModule, setActiveModule] = useState<Module | null>(null);
  const [agentSeed, setAgentSeed] = useState<string | null>(null);
  const [heroIdea, setHeroIdea] = useState("");
  const [state, setState] = useState<SongState>(INITIAL_STATE);
  const [agentOpen, setAgentOpen] = useState(false);
  const [coverArtAgentOpen, setCoverArtAgentOpen] = useState(false);
  const [coverArtRefUploading, setCoverArtRefUploading] = useState(false);
  const [coverArtRefError, setCoverArtRefError] = useState<string | null>(null);

  async function uploadCoverArtRef(file: File) {
    if (!file.type.startsWith("image/")) {
      setCoverArtRefError(isEn ? "Only images (JPG, PNG, WebP) are supported." : "Поддерживаются только изображения (JPG, PNG, WebP).");
      return;
    }
    // 8 MB hard cap — даже crazy-high-res фото с iPhone редко превышает
    if (file.size > 8 * 1024 * 1024) {
      setCoverArtRefError(isEn ? "File exceeds 8 MB. Compress or reduce resolution." : "Файл больше 8 МБ. Сожмите или уменьшите разрешение.");
      return;
    }
    setCoverArtRefError(null);
    setCoverArtRefUploading(true);
    try {
      const publicUrl = await uploadCoverRefImage(file);
      update("coverArtRefUrl", publicUrl);
    } catch (err) {
      setCoverArtRefError(
        err instanceof Error ? err.message : (isEn ? "Could not upload reference" : "Не удалось загрузить референс"),
      );
    } finally {
      setCoverArtRefUploading(false);
    }
  }
  const [presetToast, setPresetToast] = useState<{ title: string; auto: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitRef = useRef<HTMLButtonElement | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const trackGeneration = useGenerationStore((s) => s.track);

  // Cover upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Ref so cleanup (which runs with stale closure) can read current recording state.
  const isRecordingRef = useRef(false);

  // Глубокий линк из telegram-уведомления:
  //   /studio?gen_id=<UUID>  →  фетчим генерацию, открываем первый трек в плеере.
  useEffect(() => {
    const genId = searchParams.get("gen_id");
    if (!genId) return;
    let cancelled = false;
    (async () => {
      try {
        const gen = await fetchGeneration(genId);
        if (cancelled) return;
        const firstTrack = gen.tracks?.[0];
        const audioUrl = firstTrack?.audio_url;
        if (!audioUrl) return;
        const meta = [gen.genre, gen.mood, gen.tempo].filter(Boolean).join(" · ");
        playerPlay(
          {
            id: `${gen.id}#0`,
            title: gen.title || "Трек",
            url: audioUrl,
            author: undefined,
            meta,
            cover: gen.image_url ?? undefined,
            isOwn: true,
            isMusicType: true,
            audioId: firstTrack.audio_id ?? undefined,
            source: "studio",
          },
          gen.tracks
            .filter((t) => !!t.audio_url)
            .map((t, i) => ({
              id: `${gen.id}#${i}`,
              title: gen.title || "Трек",
              url: t.audio_url!,
              meta,
              cover: gen.image_url ?? undefined,
              isOwn: true,
              isMusicType: true,
              audioId: t.audio_id ?? undefined,
              source: "studio" as const,
            })),
        );
      } catch {
        // gen_id может быть невалидным или удалён — игнорируем тихо
      } finally {
        // Чистим URL чтобы повторное обновление страницы не запускало плеер снова
        if (!cancelled) {
          const next = new URLSearchParams(searchParams);
          next.delete("gen_id");
          setSearchParams(next, { replace: true });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams, setSearchParams, playerPlay]);

  useEffect(() => {
    if (activeModule) return;
    document.body.classList.add("studio-landing");
    return () => document.body.classList.remove("studio-landing");
  }, [activeModule]);

  // Cleanup recording on unmount – uses ref so it never sees a stale value.
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && isRecordingRef.current) {
        recorder.stop();
      }
      if (recordingTimerRef.current !== null) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, []);

  const moduleMeta = activeModule ? MODULES.find((m) => m.id === activeModule)! : null;
  const prompt = useMemo(
    () => (activeModule ? buildPrompt(activeModule, state) : ""),
    [activeModule, state],
  );

  // Display-only version: truncate approved lyrics to first 4 lines so the preview
  // block doesn't expand to fill the whole page.
  const previewPrompt = useMemo(() => {
    return prompt.replace(
      /(Approved lyrics:\n)([\s\S]+)/,
      (_, label: string, lyrics: string) => {
        const lines = lyrics.trimEnd().split("\n");
        const preview = lines.slice(0, 4).join("\n");
        const remaining = lines.length - 4;
        return label + preview + (remaining > 0 ? `\n…(ещё ${remaining} строк)` : "");
      },
    );
  }, [prompt]);

  const update = <K extends keyof SongState>(key: K, value: SongState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const renderChipRow = <K extends keyof SongState>(
    options: ReadonlyArray<readonly [string, string]>,
    key: K,
    withCustom = false,
  ) => (
    <div className="chip-row">
      {options.map(([value, label]) => (
        <Chip
          key={value}
          active={state[key] === value}
          onClick={() => update(key, value as SongState[K])}
        >
          {label}
        </Chip>
      ))}
      {withCustom && (
        <Chip
          active={state[key] === "custom"}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onClick={() => update(key, "custom" as any)}
          className="chip--custom"
        >
          {t("studio.customVariant")}
        </Chip>
      )}
    </div>
  );

  function openModule(id: Module) {
    setActiveModule(id);
    setAgentOpen(false);
    setAgentSeed(null);
  }

  function backToTiles() {
    setActiveModule(null);
    setAgentOpen(false);
    setAgentSeed(null);
  }

  function applyInstrumentalPreset(key: PresetKey) {
    const preset = INSTRUMENTAL_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setState((prev) => ({
      ...prev,
      instrumentalPreset: key,
      genre: preset.genre,
      mood: preset.mood,
      tempo: preset.tempo,
      instrumentalExtra: preset.extra,
    }));
    setPresetToast({ title: preset.title, auto: preset.mode === "auto" });
    if (preset.mode === "auto") {
      setTimeout(() => submitRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    }
    setTimeout(() => setPresetToast(null), 3200);
  }

  // ───────────────────── Lyrics flow (AI / custom) ─────────────────────
  // Reset the lyrics state machine whenever the user toggles AI / Custom / Instrumental.
  // Instrumental mode auto-approves (no lyrics needed → other params unlock immediately).
  useEffect(() => {
    if (activeModule !== "song") return;
    if (state.lyricsMode === "instrumental") {
      if (state.lyricsState !== "approved") {
        setState((prev) => ({
          ...prev,
          lyricsState: "approved",
          lyricsText: "",
          lyricsTitle: "",
          lyricsTaskId: null,
          lyricsError: null,
        }));
      }
    } else if (state.lyricsState === "approved" || state.lyricsState === "review") {
      // Switching mode invalidates a previously-approved draft.
      setState((prev) => ({
        ...prev,
        lyricsState: "idle",
        lyricsText: "",
        lyricsTitle: "",
        lyricsTaskId: null,
        lyricsError: null,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lyricsMode, activeModule]);

  // Subscribe to the lyrics-task WebSocket while a draft is generating.
  useEffect(() => {
    if (state.lyricsState !== "generating" || !state.lyricsTaskId) return;
    const wsUrl =
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}` +
      `/api/v1/ws/generation/${state.lyricsTaskId}`;
    const taskId = state.lyricsTaskId;
    let cancelled = false;
    const ws = openGenerationSocket(
      wsUrl,
      (event) => {
        if (cancelled) return;
        if (event.status === "completed") {
          // Pull the final result from the GET endpoint to be safe across schemas.
          fetchLyricsDraft(taskId)
            .then((data) => {
              if (cancelled) return;
              if (data.status === "completed" && data.lyrics) {
                setState((prev) => ({
                  ...prev,
                  lyricsState: "review",
                  lyricsText: data.lyrics ?? "",
                  lyricsTitle: data.title ?? "",
                  lyricsError: null,
                }));
              } else if (data.status === "failed") {
                setState((prev) => ({
                  ...prev,
                  lyricsState: "idle",
                  lyricsError: data.error ?? (isEn ? "Could not fetch lyrics" : "Не удалось получить текст"),
                }));
              }
            })
            .catch((err: unknown) => {
              if (cancelled) return;
              const msg = err instanceof Error ? err.message : (isEn ? "Error fetching lyrics" : "Ошибка получения текста");
              setState((prev) => ({ ...prev, lyricsState: "idle", lyricsError: msg }));
            });
        } else if (event.status === "failed") {
          setState((prev) => ({
            ...prev,
            lyricsState: "idle",
            lyricsError: event.error ?? (isEn ? "Failed to generate lyrics" : "Не удалось сгенерировать текст"),
          }));
        }
      },
      () => {
        if (cancelled) return;
        // WS closed — only relevant if we never reached completed.
        setState((prev) =>
          prev.lyricsState === "generating"
            ? { ...prev, lyricsState: "idle", lyricsError: isEn ? "Connection lost" : "Соединение прервано" }
            : prev,
        );
      },
    );

    return () => {
      cancelled = true;
      ws.close();
    };
  }, [state.lyricsState, state.lyricsTaskId]);

  const startLyricsDraft = useCallback(async () => {
    const topic = state.lyricsTopic.trim();
    if (!topic) {
      setState((prev) => ({ ...prev, lyricsError: t("studio.errLyricsTopicEmpty") }));
      return;
    }
    setState((prev) => ({
      ...prev,
      lyricsState: "generating",
      lyricsError: null,
      lyricsText: "",
      lyricsTitle: "",
    }));
    try {
      const genreValue =
        state.genre === "custom" && state.customGenre.trim()
          ? state.customGenre.trim()
          : state.genre;
      const moodValue =
        state.mood === "custom" && state.customMood.trim()
          ? state.customMood.trim()
          : state.mood;
      const tempoValue =
        state.tempo === "custom" && state.customTempo.trim()
          ? state.customTempo.trim()
          : state.tempo;
      const resp = await createLyricsDraft({
        topic,
        genre: genreValue,
        mood: moodValue,
        tempo: tempoValue,
        vocal: state.vocal,
        language: "ru",
        agent_prompt: state.agentPrompt,
      });
      setState((prev) => ({ ...prev, lyricsTaskId: resp.task_id }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : (isEn ? "Failed to start generation" : "Не удалось запустить генерацию");
      setState((prev) => ({ ...prev, lyricsState: "idle", lyricsError: msg }));
    }
  }, [
    state.lyricsTopic,
    state.genre,
    state.customGenre,
    state.mood,
    state.customMood,
    state.tempo,
    state.customTempo,
    state.vocal,
    state.agentPrompt,
  ]);

  const approveLyrics = useCallback(() => {
    setState((prev) => ({ ...prev, lyricsState: "approved", lyricsError: null }));
  }, []);

  const revertToReview = useCallback(() => {
    setState((prev) => ({ ...prev, lyricsState: "review" }));
  }, []);

  const regenerateLyrics = useCallback(() => {
    setState((prev) => ({
      ...prev,
      lyricsState: "idle",
      lyricsText: "",
      lyricsTitle: "",
      lyricsTaskId: null,
      lyricsError: null,
    }));
  }, []);

  const songParamsLocked =
    activeModule === "song" && state.lyricsState !== "approved";

  async function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Suno upload-cover docs: max 20 МБ, форматы mp3/wav/m4a/ogg, длительность ≤ 8 мин.
    const max = 50 * 1024 * 1024;
    if (file.size > max) {
      alert(isEn ? "File exceeds 50 MB. Compress or trim to 8 min in mp3/m4a/wav/ogg." : "Файл больше 50 МБ. Сожмите или обрежьте до 8 минут в mp3/m4a/wav/ogg.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!SUNO_LIMITS.COVER_AUDIO_FORMATS.includes(ext as typeof SUNO_LIMITS.COVER_AUDIO_FORMATS[number])) {
      alert(
        `Формат .${ext} не поддерживается. Допустимые: ${SUNO_LIMITS.COVER_AUDIO_FORMATS.join(", ")}.`,
      );
      return;
    }

    // Show file name immediately
    setState((prev) => ({ ...prev, coverFileName: file.name, coverUrl: "" }));

    // Validate duration via temp audio element
    const blobUrl = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = "metadata";
    probe.src = blobUrl;

    await new Promise<void>((resolve) => {
      probe.onloadedmetadata = () => {
        const maxSec = SUNO_LIMITS.COVER_AUDIO_MAX_MIN * 60;
        if (probe.duration > maxSec + 1) {
          alert(
            `Длительность ${Math.round(probe.duration)} сек > ${maxSec} сек (Suno: max ${SUNO_LIMITS.COVER_AUDIO_MAX_MIN} мин для /generate/upload-cover).`,
          );
        }
        URL.revokeObjectURL(blobUrl);
        resolve();
      };
      probe.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve();
      };
    });

    // Upload file to S3/MinIO via presigned URL
    setIsUploading(true);
    setUploadError(null);
    try {
      const publicUrl = await uploadCoverFile(file);
      setState((prev) => ({ ...prev, coverUrl: publicUrl }));
    } catch (err) {
      console.error("Upload error:", err);
      const msg = err instanceof Error ? err.message : (isEn ? "File upload error" : "Ошибка загрузки файла");
      setUploadError(isEn ? `Could not upload file: ${msg}` : `Не удалось загрузить файл: ${msg}`);
      setState((prev) => ({ ...prev, coverFileName: "", coverUrl: "" }));
      if (coverFileInputRef.current) coverFileInputRef.current.value = "";
    } finally {
      setIsUploading(false);
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert(
        "Запись звука не поддерживается в этом браузере или контекст не безопасный (нужен HTTPS).\n\n" +
        "Используйте Safari, Chrome или Firefox последней версии."
      );
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const e = err as { name?: string; message?: string } | null;
      const name = e?.name ?? "";
      const message = e?.message ?? "";
      // Логируем точную ошибку в консоль — пользователь может прислать скрин
      console.error("[getUserMedia] error:", err);
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        alert(
          "❌ Доступ к микрофону заблокирован.\n\n" +
          `Браузер сообщил: "${message || name}"\n\n` +
          "Что попробовать:\n" +
          "1. Нажмите на иконку замка в адресной строке → «Микрофон» → «Разрешить»\n" +
          "2. Полностью обновите страницу (Ctrl+Shift+R)\n" +
          "3. Если используете Telegram Mini App — откройте сайт во внешнем браузере"
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        alert("❌ Микрофон не найден. Подключите микрофон и попробуйте снова.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        alert("❌ Микрофон занят другим приложением. Закройте Zoom, Skype и т.п., затем попробуйте снова.");
      } else {
        alert(`❌ Не удалось получить доступ к микрофону.\n\n${name || "Error"}: ${message || "Неизвестная ошибка"}`);
      }
      return;
    }
    try {
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        try {
          const wavFile = await blobToWav(audioBlob, `recording-${Date.now()}.wav`);
          await uploadRecordedFile(wavFile);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Не удалось сконвертировать запись в WAV.";
          alert(`Не удалось обработать запись: ${msg}`);
          setState((prev) => ({ ...prev, coverFileName: "", coverUrl: "" }));
        } finally {
          // Release microphone only after upload is complete
          stream.getTracks().forEach((track) => track.stop());
          isRecordingRef.current = false;
          setIsRecording(false);
          if (recordingTimerRef.current !== null) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
          }
        }
      };

      mediaRecorder.start(250);
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer — use setInterval via window for correct browser return type.
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      // Stream уже получен, ошибка скорее всего в MediaRecorder API
      stream.getTracks().forEach((t) => t.stop());
      const msg = err instanceof Error ? err.message : "Ошибка инициализации записи";
      alert(`❌ Не удалось начать запись: ${msg}`);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
    }
  }

  function cancelRecording() {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      isRecordingRef.current = false;
      setIsRecording(false);
      if (recordingTimerRef.current !== null) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      audioChunksRef.current = [];
    }
  }

  async function uploadRecordedFile(file: File) {
    setIsUploading(true);
    setUploadError(null);
    try {
      setState((prev) => ({ ...prev, coverFileName: file.name, coverUrl: "" }));
      const uploadedUrl = await uploadCoverFile(file);
      setState((prev) => ({ ...prev, coverUrl: uploadedUrl }));
    } catch (err) {
      console.error("Upload error:", err);
      const msg = err instanceof Error ? err.message : (isEn ? "Recording upload error" : "Ошибка загрузки записи");
      setUploadError(isEn ? `Could not upload recording: ${msg}` : `Не удалось загрузить запись: ${msg}`);
      setState((prev) => ({ ...prev, coverFileName: "", coverUrl: "" }));
    } finally {
      setIsUploading(false);
    }
  }

  function startWithIdea(e: React.FormEvent) {
    e.preventDefault();
    const text = heroIdea.trim();
    if (!text) return;
    setAgentSeed(text);
    setActiveModule("song");
    setAgentOpen(true);
    setHeroIdea("");
  }

  async function handleSubmit() {
    if (!moduleMeta || moduleMeta.postponed || submitting) return;
    // cover_art is handled below alongside other modules
    if (activeModule === "cover" && !state.coverUrl) {
      setSubmitError(t("studio.errCoverNeedFile"));
      return;
    }

    const genreValue =
      state.genre === "custom" && state.customGenre.trim() ? state.customGenre.trim() : state.genre;
    // Always send the stable KEY (e.g. "happy") to the backend so the Radio mood
    // grid can group by mood reliably. Labels are for display only.
    const moodValue =
      state.mood === "custom" && state.customMood.trim() ? state.customMood.trim() : state.mood;
    const tempoValue =
      state.tempo === "custom" && state.customTempo.trim()
        ? state.customTempo.trim()
        : state.tempo;

    setSubmitting(true);
    setSubmitError(null);
    try {
      let response: { generation_id: string; ws_url: string };
      let title: string = moduleMeta.title;

      // Resolve track_name once per submit. Manual mode → user-typed text.
      // Auto mode → backend GPT (`requestAutoTitle`) which formats
      // `Artist - Idea (RIFFAMusic)`. Empty submit-time value falls back to
      // the auto formula computed below from the available idea text.
      let resolvedTrackName = state.trackName.trim();
      if (state.trackNameMode === "auto" && !resolvedTrackName) {
        const idea =
          (state.lyricsTopic || prompt || state.instrumentalExtra || state.sfxExtra || "")
            .trim()
            .slice(0, 1000);
        if (idea) {
          try {
            const auto = await requestAutoTitle(idea);
            resolvedTrackName = auto.track_name;
          } catch {
            // Best-effort: fall through and let backend pick a default.
          }
        }
      }

      if (activeModule === "song") {
        // Lyrics-first gating must be honoured — bail out if the user clicked submit somehow.
        if (state.lyricsState !== "approved") {
          setSubmitError(t("studio.errLyricsApproveFirst"));
          setSubmitting(false);
          return;
        }
        const lyricsModeBackend: "ai" | "custom" | "none" =
          state.lyricsMode === "instrumental" ? "none" : "custom";
        // Frontend always supplies the final lyrics directly so Suno gets the exact text
        // the user approved (instead of letting the worker re-call GPT).
        const description = state.lyricsTopic.trim() || prompt.slice(0, 1000);
        response = await generateSong({
          description: description.slice(0, 1000),
          text_mode: lyricsModeBackend,
          lyrics: state.lyricsMode === "instrumental" ? "" : state.lyricsText,
          genre: state.genre !== "custom" ? state.genre : "",
          custom_genre: state.genre === "custom" ? state.customGenre : "",
          mood: moodValue,
          tempo: tempoValue,
          vocal: valueLabel(state.vocal, VOCAL_TYPES),
          track_name: resolvedTrackName,
        });
        title =
          resolvedTrackName ||
          state.lyricsTitle.trim() ||
          state.lyricsTopic.trim().slice(0, 60) ||
          `Песня · ${genreValue}`;
      } else if (activeModule === "instrumental") {
        response = await generateInstrumental({
          description: (state.instrumentalExtra || prompt).slice(0, 500),
          genre: state.genre !== "custom" ? state.genre : "",
          custom_genre: state.genre === "custom" ? state.customGenre : "",
          mood: moodValue,
          tempo: tempoValue,
          track_name: resolvedTrackName,
        });
        const preset = INSTRUMENTAL_PRESETS.find((p) => p.key === state.instrumentalPreset);
        title = resolvedTrackName || preset?.title || `Инструментал · ${genreValue}`;
      } else if (activeModule === "sound_effect") {
        const sfxPrompt = (state.sfxExtra || prompt).slice(0, 500);
        // SFX: show prompt as name + "(RIFFA)" — skip auto-title artist format
        if (state.trackNameMode === "manual" && state.trackName.trim()) {
          title = state.trackName.trim();
        } else {
          const base = (state.sfxExtra.trim() || sfxPrompt).slice(0, 55);
          title = base ? `${base} (RIFFA)` : `SFX · ${valueLabel(state.sfxSource, SFX_SOURCES)}`;
        }
        response = await generateSoundEffect({
          prompt: sfxPrompt,
          track_name: title,
        });
      } else if (activeModule === "cover") {
        // Suno styleWeight / weirdnessConstraint — UI stores them as strings
        // (chip values such as "0.65"). Parse to floats and clamp to [0, 1];
        // omit when blank so backend can keep them unset.
        const parseRatio = (raw: string): number | null => {
          const trimmed = raw.trim();
          if (!trimmed) return null;
          const num = Number.parseFloat(trimmed);
          if (!Number.isFinite(num)) return null;
          return Math.max(0, Math.min(1, num));
        };
        response = await generateCoverSong({
          upload_url: state.coverUrl,
          genre: state.coverGenre === "custom" ? "" : state.coverGenre,
          custom_genre: state.coverGenre === "custom" ? state.coverCustomGenre : "",
          mood: state.coverMood,
          tempo: state.coverTempo,
          style: state.coverStyle,
          lyrics: state.coverLyrics,
          vocal_gender:
            state.coverVocalGender === "m" || state.coverVocalGender === "f"
              ? state.coverVocalGender
              : null,
          instrumental: state.coverInstrumental === "yes",
          style_weight: parseRatio(state.coverStyleWeight),
          weirdness_constraint: parseRatio(state.coverWeirdness),
          lyrics_language: state.coverLanguage || "",
          track_name: resolvedTrackName,
        });
        title =
          resolvedTrackName ||
          state.coverTitle.trim() ||
          `Кавер · ${state.coverFileName || "upload"}`;
      } else if (activeModule === "cover_art") {
        if (!state.coverArtPrompt?.trim()) {
          setSubmitError(t("studio.errCoverArtNoPrompt"));
          setSubmitting(false);
          return;
        }
        title = resolvedTrackName || state.coverArtPrompt.trim().slice(0, 60) || "Обложка";
        response = await generateCoverArt({
          prompt: state.coverArtPrompt.trim(),
          model: state.coverArtModel || "nano-banana",
          title,
          ...(state.coverArtRefUrl ? { reference_url: state.coverArtRefUrl } : {}),
        });
      } else {
        return;
      }

      trackGeneration(response.generation_id, response.ws_url, activeModule, title);
      // Reset the form so the user can start a new generation immediately.
      setState(INITIAL_STATE);
      setSubmitError(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("studio.errSubmitFailed");
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleAgentComplete(result: AgentResult) {
    setState((prev) => ({
      ...prev,
      agentPrompt: result.prompt,
      extra: prev.extra.trim()
        ? prev.extra
        : result.summary,
    }));
    setAgentOpen(false);
  }

  /**
   * Direct-launch path from AgentChat: take the GPT-decided intent and call the matching
   * /api/v1/generate/* endpoint, then drop the resulting card into the Active Generations
   * sidebar. Falls back to a friendly redirect for cover_song / cover_art (which need extra
   * UX that the agent can't currently provide).
   */
  async function handleAgentLaunch(result: AgentResult) {
    const intent: AgentIntent | null = result.intent;
    if (!intent) {
      // Defensive: GPT swore done=true but returned no intent. Fall back to fill-form path.
      handleAgentComplete(result);
      return;
    }

    const params = intent.params;
    const enrichedPrompt = result.prompt;

    if (intent.module === "cover_art") {
      try {
        const promptText = (enrichedPrompt || params.description || "").trim();
        if (!promptText) {
          setSubmitError("Агент не собрал prompt для обложки. Попробуй ещё раз.");
          return;
        }
        const titleText =
          (params.description || "").trim().slice(0, 60) ||
          promptText.slice(0, 60) ||
          "Обложка";
        const resp = await generateCoverArt({
          prompt: promptText,
          model: state.coverArtModel || "nano-banana",
          title: titleText,
        });
        update("coverArtPrompt", promptText);
        trackGeneration(resp.generation_id, resp.ws_url, "cover_art", titleText);
        setActiveModule("cover_art");
        setCoverArtAgentOpen(false);
        setAgentOpen(false);
        setAgentSeed(null);
        setSubmitError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Не удалось запустить обложку";
        setSubmitError(msg);
        throw err;
      }
      return;
    }

    if (intent.module === "cover_song") {
      setSubmitError(
        "Чтобы сделать кавер, перейди в модуль Кавер и загрузи исходный mp3/m4a/wav — тогда я смогу запустить генерацию.",
      );
      setActiveModule("cover");
      setAgentOpen(false);
      setAgentSeed(null);
      return;
    }

    let response: { generation_id: string; ws_url: string };
    let title = "Агент · черновик";
    let trackKind: "song" | "instrumental" | "sound_effect" | "cover" | "occasion" = "song";

    try {
      if (intent.module === "song") {
        const description = (params.description || enrichedPrompt).slice(0, 1000);
        response = await generateSong({
          description,
          text_mode: params.text_mode || "ai",
          lyrics: params.text_mode === "custom" ? (params.lyrics || "") : "",
          genre: params.genre || "",
          custom_genre: params.custom_genre || "",
          mood: params.mood || "",
          tempo: params.tempo || "",
          vocal: params.vocal || "",
          agent_prompt: enrichedPrompt,
        });
        title =
          (params.description || "").slice(0, 60) ||
          `Песня · ${params.genre || "агент"}`;
        trackKind = "song";
      } else if (intent.module === "instrumental") {
        response = await generateInstrumental({
          description: (params.description || enrichedPrompt).slice(0, 500),
          genre: params.genre || "",
          custom_genre: params.custom_genre || "",
          mood: params.mood || "",
          tempo: params.tempo || "",
          agent_prompt: enrichedPrompt,
        });
        title =
          (params.description || "").slice(0, 60) ||
          `Инструментал · ${params.genre || "агент"}`;
        trackKind = "instrumental";
      } else if (intent.module === "sound_effect") {
        const sfxPrompt = (params.description || enrichedPrompt).slice(0, 500) || "ambient";
        response = await generateSoundEffect({
          prompt: sfxPrompt,
          agent_prompt: enrichedPrompt,
        });
        title = sfxPrompt.slice(0, 60) || "SFX · агент";
        trackKind = "sound_effect";
      } else if (intent.module === "occasion") {
        response = await generateOccasion({
          occasion_type: params.occasion_type || "general",
          answers: { description: params.description || "" },
          genre: params.genre || "",
          mood: params.mood || "",
          vocal: params.vocal || "",
          agent_prompt: enrichedPrompt,
        });
        title =
          (params.description || "").slice(0, 60) ||
          `Поздравление · ${params.occasion_type || "событие"}`;
        trackKind = "occasion";
      } else {
        // Exhaustive fallthrough — should be impossible thanks to the early returns above.
        handleAgentComplete(result);
        return;
      }

      trackGeneration(response.generation_id, response.ws_url, trackKind, title);
      setAgentOpen(false);
      setAgentSeed(null);
      setSubmitError(null);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Не получилось запустить генерацию. Попробуй ещё раз.";
      setSubmitError(msg);
      throw err;
    }
  }

  // ───────────────────── tile picker ─────────────────────
  if (!activeModule) {
    return (
      <div className="studio">
        <div className="top-meta">
          <div className="breadcrumb">
            <b>{t("studio.breadcrumb", { defaultValue: "студия" })}</b>
          </div>
          
        </div>

        <h1 className="h-page">
          {t("studio.heroQuestion")} <em>{t("studio.heroAccent")}</em>.
        </h1>
        <p className="h-lead">{t("studio.heroLead")}</p>

        <form className="studio-quick" onSubmit={startWithIdea}>
          <input
            className="studio-quick__input"
            type="text"
            value={heroIdea}
            onChange={(e) => setHeroIdea(e.target.value)}
            placeholder={t("studio.heroInputPlaceholder")}
            aria-label={t("studio.heroInputAria")}
          />
          <button type="submit" className="btn btn-primary" disabled={!heroIdea.trim()}>
            {t("studio.heroSubmit", { defaultValue: "передать агенту →" })}
          </button>
        </form>

        <div className="h-section">
          <div className="tag"><span className="num">01</span> · {t("studio.sectionModules", { defaultValue: "модули" })}</div>
          <h2>{t("studio.sectionModulesTitle", { defaultValue: "выбери тип контента" })}</h2>
          <div className="right">{t("studio.sectionModulesRight", { defaultValue: "все на единых токенах" })}</div>
        </div>

        <div className="modules">
          {MODULES.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className={`module${i === 0 ? " is-main" : ""}${m.postponed ? " is-soon" : ""}`}
              onClick={() => !m.postponed && openModule(m.id)}
              disabled={m.postponed}
            >
              <div className="module-head">
                <div className="module-icon"><ModuleIcon kind={m.id} /></div>
                {m.badge && <span className="module-badge">{t("studio.mainModule", { defaultValue: "главный" })}</span>}
                {m.postponed && <span className="module-badge is-soon">{t("studio.soonBadge", { defaultValue: "скоро" })}</span>}
              </div>
              <h3>{moduleTrans(m.id, "title") || m.title}</h3>
              <p>{moduleTrans(m.id, "short") || m.shortDesc}</p>
              <div className="module-cost">
                <span>{m.id === "song" ? "suno v5.5" : m.id === "instrumental" ? t("studio.noVocal", { defaultValue: "без вокала" }) : m.id === "cover" ? t("studio.withAudio", { defaultValue: "+ ваше аудио" }) : m.id === "sound_effect" ? t("studio.sfxDur", { defaultValue: "до 30 сек" }) : "nano-banana"}</span>
                <span className="price">{m.costFrom ? "~" : ""}{m.cost} <Coin size={11} /></span>
              </div>
            </button>
          ))}
        </div>

        <div className="h-section">
          <div className="tag"><span className="num">02</span> · {t("studio.sectionRecent", { defaultValue: "недавнее" })}</div>
          <h2>{t("studio.sectionRecentTitle", { defaultValue: "последние треки" })}</h2>
          <Link className="right" to="/library">{t("studio.sectionRecentRight", { defaultValue: "все →" })}</Link>
        </div>

        <RecentTracks />
      </div>
    );
  }

  // ─────────────────── selected module editor ───────────────────
  return (
    <div className="studio">
      <div className="top-meta">
        <div className="breadcrumb">
          <button type="button" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "var(--ink-3)" }} onClick={backToTiles}>
            {t("studio.breadcrumb", { defaultValue: "студия" })}
          </button>
          <span>/</span><b>{moduleFullTitle(moduleMeta!.id, moduleMeta!.title)}</b>
        </div>
        
      </div>

      <h1 className="h-page">
        {moduleFullTitle(moduleMeta!.id, moduleMeta!.title)}
      </h1>
      <p className="h-lead">{moduleFullDesc(moduleMeta!.id, "longDesc", moduleMeta!.longDesc)}</p>

      <Panel className="builder-panel">
        {activeModule === "song" && !agentOpen && (
          <div className="agent-cta agent-cta--hero">
            <div className="agent-cta__glow" aria-hidden="true" />
            <div className="agent-cta__body">
              <span className="agent-cta__badge">{t("studio.agentCta.badge")}</span>
              <strong className="agent-cta__question">{t("studio.agentCta.question")}</strong>
              <strong className="agent-cta__title">{t("studio.agentCta.title")}</strong>
              <p className="agent-cta__text">{t("studio.agentCta.text")}</p>
              {state.agentPrompt && (
                <p className="agent-cta__check">{t("studio.agentCta.briefReady")}</p>
              )}
            </div>
            <Button onClick={() => setAgentOpen((v) => !v)}>
              {agentOpen ? t("studio.agentCta.close") : state.agentPrompt ? t("studio.agentCta.reopen") : t("studio.agentCta.open")}
            </Button>
          </div>
        )}

        {agentOpen && activeModule === "song" && (
          <AgentChat
            key={agentSeed ?? "fresh"}
            module="song"
            initialAnswer={agentSeed ?? undefined}
            selectedGenre={
              state.genre === "custom" && state.customGenre.trim()
                ? state.customGenre.trim()
                : state.genre
            }
            selectedMood={
              state.mood === "custom" && state.customMood.trim()
                ? state.customMood.trim()
                : state.mood
            }
            selectedTempo={
              state.tempo === "custom" && state.customTempo.trim()
                ? state.customTempo.trim()
                : state.tempo
            }
            selectedVocal={state.vocal}
            onComplete={(r) => { handleAgentComplete(r); setAgentSeed(null); }}
            onLaunch={handleAgentLaunch}
            onCancel={() => { setAgentOpen(false); setAgentSeed(null); }}
          />
        )}

        {activeModule === "song" && (
          <div className="builder-grid">
            <div className="builder-step">
              <strong>{t("studio.song.step1Label")}</strong>
              <span className="muted">{t("studio.song.step1Desc")}</span>
              {renderChipRow(uiLyricsModes, "lyricsMode")}
            </div>

            {state.lyricsMode === "ai-vocal" && (
              <LyricsAiBlock
                state={state}
                onTopicChange={(v) => update("lyricsTopic", v)}
                onTextChange={(v) => update("lyricsText", v)}
                onStart={startLyricsDraft}
                onApprove={approveLyrics}
                onEdit={revertToReview}
                onRegenerate={regenerateLyrics}
              />
            )}

            {state.lyricsMode === "custom-lyrics" && (
              <LyricsCustomBlock
                state={state}
                onTextChange={(v) => update("lyricsText", v)}
                onApprove={approveLyrics}
                onEdit={revertToReview}
              />
            )}

            {state.lyricsMode === "instrumental" && (
              <div className="builder-step">
                <span className="muted">{t("studio.song.noLyricsHint")}</span>
              </div>
            )}

            <div
              className={`builder-step${songParamsLocked ? " builder-step--locked" : ""}`}
              aria-disabled={songParamsLocked}
            >
              <strong>{t("studio.song.step2Label")}</strong>
              <span className="muted">{t("studio.song.step2Desc")}</span>
              {renderChipRow(uiVocalTypes, "vocal")}
              {songParamsLocked && (
                <span className="lock-hint">{t("studio.song.lockHint")}</span>
              )}
            </div>

            <div
              className={`builder-step${songParamsLocked ? " builder-step--locked" : ""}`}
              aria-disabled={songParamsLocked}
            >
              <strong>{t("studio.song.step3Label")}</strong>
              <span className="muted">{t("studio.song.step3Desc")}</span>
              {renderChipRow(uiTimbres, "timbre", true)}
              {state.timbre === "custom" && (
                <input
                  className="inline-input"
                  placeholder="Например: sultry whisper, powerful belt, raspy rock"
                  value={state.customTimbre}
                  onChange={(e) => update("customTimbre", e.target.value)}
                />
              )}
            </div>
          </div>
        )}

        {activeModule === "instrumental" && (
          <>
            <div className="builder-step preset-section">
              <header className="preset-section__head">
                <strong>{t("studio.instrumental.presetTitle")}</strong>
                <span className="muted">{t("studio.instrumental.presetDesc")}</span>
              </header>
              <div className="preset-grid">
                {INSTRUMENTAL_PRESETS.map((preset) => {
                  const active = state.instrumentalPreset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      className={`preset-card preset-card--${preset.mode}${active ? " preset-card--active" : ""}`}
                      onClick={() => applyInstrumentalPreset(preset.key)}
                      aria-pressed={active}
                    >
                      <span className={`preset-card__tag preset-card__tag--${preset.mode}`}>
                        {preset.mode === "auto" ? t("studio.instrumental.presetModeAuto") : t("studio.instrumental.presetModePrompt")}
                      </span>
                      <span className="preset-card__title">
                        <span aria-hidden="true">{preset.emoji}</span>
                        {presetTitle(preset.key, preset.title)}
                      </span>
                      <span className="preset-card__meta">
                        {preset.mode === "auto"
                          ? `${valueLabel(preset.tempo, TEMPOS).replace(/ ·.*$/, "")} · ${preset.genre}`
                          : t("studio.instrumental.presetPickHint")}
                      </span>
                    </button>
                  );
                })}
              </div>
              {presetToast && (
                <div className={`preset-toast preset-toast--${presetToast.auto ? "auto" : "prompt"}`} role="status">
                  {presetToast.auto
                    ? t("studio.instrumental.presetToastAuto", { title: presetToast.title })
                    : t("studio.instrumental.presetToastPrompt", { title: presetToast.title })}
                </div>
              )}
            </div>

            <label className="builder-step">
              <strong>{t("studio.instrumental.extraLabel")}</strong>
              <span className="muted">{t("studio.instrumental.extraDesc")}</span>
              <textarea
                rows={5}
                value={state.instrumentalExtra}
                onChange={(e) => update("instrumentalExtra", e.target.value)}
                placeholder={t("studio.instrumental.extraPlaceholder")}
              />
            </label>
          </>
        )}

        {activeModule === "sound_effect" && (
          <div className="builder-grid">
            <div className="builder-step">
              <strong>{t("studio.sfx.sourceLabel")}</strong>
              <div className="chip-row">
                {uiSfxSources.filter(([v]) => v !== "custom").map(([value, label]) => (
                  <Chip
                    key={value}
                    active={state.sfxSource === value}
                    onClick={() => update("sfxSource", value)}
                  >
                    {label}
                  </Chip>
                ))}
                <Chip
                  active={state.sfxSource === "custom"}
                  onClick={() => update("sfxSource", "custom")}
                  className="chip--custom"
                >
                  {t("studio.sfx.customSource")}
                </Chip>
              </div>
              {state.sfxSource === "custom" && (
                <input
                  className="inline-input"
                  type="text"
                  placeholder="Например: Crash cymbal, Rain drops, Engine roar..."
                  value={state.sfxCustomSource}
                  onChange={(e) => update("sfxCustomSource", e.target.value)}
                  maxLength={128}
                />
              )}
            </div>
            <div className="builder-step">
              <strong>{t("studio.sfx.envLabel")}</strong>
              {renderChipRow(uiSfxEnvs, "sfxEnv")}
            </div>
            <div className="builder-step">
              <strong>{t("studio.sfx.durationLabel")}</strong>
              {renderChipRow(uiSfxDurations, "sfxDuration")}
            </div>
            <div className="builder-step">
              <strong>{t("studio.sfx.styleLabel")}</strong>
              {renderChipRow(uiSfxStyles, "sfxStyle")}
            </div>
            <label className="builder-step">
              <strong>{t("studio.sfx.detailsLabel")}</strong>
              <span className="muted">
                {t("studio.sfx.detailsDesc", { max: SUNO_LIMITS.SFX_PROMPT_MAX })}
              </span>
              <textarea
                rows={4}
                value={state.sfxExtra}
                maxLength={SUNO_LIMITS.SFX_PROMPT_MAX}
                onChange={(e) => update("sfxExtra", e.target.value)}
              />
              <span className="char-counter">
                {state.sfxExtra.length} / {SUNO_LIMITS.SFX_PROMPT_MAX}
              </span>
            </label>
          </div>
        )}

        {activeModule === "cover" && (
          <div className="builder-grid">
            <div className="cover-rules">
              <strong className="cover-rules__title">{t("studio.cover.howWorksTitle")}</strong>
              <p className="cover-rules__lead">{t("studio.cover.howWorksLead")}</p>
              <div className="cover-rules__cols">
                <div className="cover-rules__col cover-rules__col--ok">
                  <strong>{t("studio.cover.fitsTitle")}</strong>
                  <ul>
                    {(t("studio.cover.fitsItems", { returnObjects: true }) as string[]).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="cover-rules__col cover-rules__col--bad">
                  <strong>{t("studio.cover.noFitsTitle")}</strong>
                  <ul>
                    {(t("studio.cover.noFitsItems", { returnObjects: true }) as string[]).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                  <p className="cover-rules__note">{t("studio.cover.errorNote")}</p>
                </div>
              </div>
              <p className="cover-rules__hint">{t("studio.cover.tipHint")}</p>
            </div>
            <div className="builder-step">
              <strong>{t("studio.cover.audioLabel")}</strong>
              <span className="muted">{t("studio.cover.audioDesc")}</span>
              <span className="muted" style={{ marginTop: "0.5rem", display: "block", fontSize: "0.85rem" }}>
                <strong>{isEn ? "Technical limits:" : "Технические ограничения:"}</strong> {isEn ? "formats" : "форматы"} {SUNO_LIMITS.COVER_AUDIO_FORMATS.join(", ")}, {isEn ? `up to ${SUNO_LIMITS.COVER_AUDIO_MAX_MIN} min` : `длительность до ${SUNO_LIMITS.COVER_AUDIO_MAX_MIN} минут`}
              </span>
              <input
                className="inline-input"
                type="url"
                placeholder="https://example.com/track.mp3"
                value={state.coverUrl}
                onChange={(e) => update("coverUrl", e.target.value)}
              />
              <div className="cover-upload-row">
                <input
                  ref={coverFileInputRef}
                  type="file"
                  accept="audio/mp3,audio/mpeg,audio/mp4,audio/m4a,audio/wav,audio/ogg,.mp3,.m4a,.wav,.ogg"
                  onChange={handleCoverFile}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  className={`cover-upload-btn${isUploading ? " cover-upload-btn--loading" : state.coverFileName && state.coverUrl ? " cover-upload-btn--done" : ""}`}
                  onClick={() => !isUploading && coverFileInputRef.current?.click()}
                  disabled={isRecording || isUploading}
                >
                  {isUploading ? t("studio.cover.uploading") : state.coverFileName && state.coverUrl ? `✓ ${state.coverFileName}` : (isEn ? "📎 Attach file" : "📎 Прикрепить файл")}
                </button>
                <button
                  type="button"
                  className="cover-upload-btn cover-upload-btn--record"
                  onClick={startRecording}
                  disabled={!!state.coverFileName || isRecording || isUploading}
                  title={t("studio.cover.recordTitle")}
                >
                  {t("studio.cover.recordBtn")}
                </button>
                {state.coverFileName && !isUploading && (
                  <button
                    type="button"
                    className="cover-upload-clear"
                    onClick={() => {
                      setState((prev) => ({ ...prev, coverUrl: "", coverFileName: "" }));
                      setUploadError(null);
                      if (coverFileInputRef.current) coverFileInputRef.current.value = "";
                    }}
                  >
                    {t("studio.cover.reset")}
                  </button>
                )}
                {isUploading && <span className="muted" style={{ fontSize: "0.8rem" }}>{t("studio.cover.uploadingMsg")}</span>}
                {uploadError && <span style={{ color: "var(--accent-2)", fontSize: "0.8rem" }}>{uploadError}</span>}
              </div>
            </div>

            <div className="builder-step">
              <strong>{t("studio.cover.formatLabel")}</strong>
              <span className="muted">{t("studio.cover.formatDesc")}</span>
              {renderChipRow(uiCoverInstrumental, "coverInstrumental")}
            </div>

            {state.coverInstrumental !== "yes" && (
              <>
                <div className="builder-step">
                  <strong>{t("studio.cover.vocalGenderLabel")}</strong>
                  <span className="muted">{t("studio.cover.vocalGenderDesc")}</span>
                  {renderChipRow(uiCoverVocalGenders, "coverVocalGender")}
                </div>

                <div className="builder-step">
                  <strong>{t("studio.cover.languageLabel")}</strong>
                  <span className="muted">{t("studio.cover.languageDesc")}</span>
                  <div className="chip-row">
                    {(["ru", "en", "es", "fr", "de", "it", "ja", "ko"] as const).map((code) => (
                      <Chip
                        key={code}
                        active={state.coverLanguage === code}
                        onClick={() => update("coverLanguage", code)}
                      >
                        {t(`studio.cover.lang.${code}`)}
                      </Chip>
                    ))}
                    <Chip
                      active={state.coverLanguage === ""}
                      onClick={() => update("coverLanguage", "")}
                    >
                      {t("studio.cover.langAuto")}
                    </Chip>
                  </div>
                </div>
              </>
            )}

            <div className="builder-step">
              <strong>{t("studio.cover.genreLabel")}</strong>
              <span className="muted">{t("studio.cover.genreDesc")}</span>
              <div className="chip-row">
                {GENRES.map((g) => (
                  <Chip
                    key={g}
                    active={state.coverGenre === g}
                    onClick={() => update("coverGenre", g)}
                  >
                    {g}
                  </Chip>
                ))}
                <Chip
                  active={state.coverGenre === "custom"}
                  onClick={() => update("coverGenre", "custom")}
                  className="chip--custom"
                >
                  {t("studio.cover.customGenreBtn")}
                </Chip>
              </div>
              {state.coverGenre === "custom" && (
                <input
                  className="inline-input"
                  type="text"
                  placeholder="Например: Synthpop, Vaporwave, Afrobeat..."
                  value={state.coverCustomGenre}
                  onChange={(e) => update("coverCustomGenre", e.target.value)}
                  maxLength={128}
                />
              )}
            </div>

            <div className="builder-step">
              <strong>{t("studio.cover.moodLabel")}</strong>
              {renderChipRow(uiMoods, "coverMood")}
            </div>

            <div className="builder-step">
              <strong>{t("studio.cover.tempoLabel")}</strong>
              {renderChipRow(uiTempos, "coverTempo")}
            </div>

            <label className="builder-step">
              <strong>{t("studio.cover.styleLabel")}</strong>
              <span className="muted">{t("studio.cover.styleDesc")}</span>
              <textarea
                rows={4}
                value={state.coverStyle}
                onChange={(e) => update("coverStyle", e.target.value)}
                placeholder="warm piano, brushed drums, vinyl crackle, nostalgic"
                maxLength={1000}
              />
            </label>

            {state.coverInstrumental !== "yes" && (
              <label className="builder-step">
                <strong>{t("studio.cover.newLyricsLabel")}</strong>
                <span className="muted">{t("studio.cover.newLyricsDesc")}</span>
                <textarea
                  rows={6}
                  value={state.coverLyrics}
                  onChange={(e) => update("coverLyrics", e.target.value)}
                  placeholder={t("studio.cover.newLyricsPlaceholder")}
                  maxLength={5000}
                />
              </label>
            )}

            <div className="builder-step">
              <strong>{t("studio.cover.styleWeightLabel")}</strong>
              <span className="muted">{t("studio.cover.styleWeightDesc")}</span>
              {renderChipRow(uiCoverStyleWeights, "coverStyleWeight")}
            </div>

            <div className="builder-step">
              <strong>{t("studio.cover.weirdnessLabel")}</strong>
              <span className="muted">{t("studio.cover.weirdnessDesc")}</span>
              {renderChipRow(uiCoverWeirdness, "coverWeirdness")}
            </div>
          </div>
        )}

        {activeModule === "cover_art" && (
          <div className="builder-grid">
            <div className="builder-step">
              <strong>{t("studio.coverArt.modelLabel")}</strong>
              <span className="muted">{t("studio.coverArt.modelDesc")}</span>
              <div className="model-grid">
                {COVER_ART_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`model-card${state.coverArtModel === m.id ? " model-card--active" : ""}`}
                    onClick={() => update("coverArtModel", m.id)}
                    aria-pressed={state.coverArtModel === m.id}
                  >
                    <span className="model-card__head">
                      <strong>{m.name}</strong>
                      <span className="model-card__cost">
                        {m.cost}
                        <Coin size={14} className="riffa-coin--after" />
                      </span>
                    </span>
                    <span className="model-card__descr">{modelDescr(m.id, m.descr)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="builder-step cover-art-agent-cta">
              <header className="preset-section__head">
                <strong>{t("studio.coverArt.agentLabel")}</strong>
                <span className="muted">{t("studio.coverArt.agentDesc")}</span>
              </header>
              <Button onClick={() => setCoverArtAgentOpen((v) => !v)}>
                {coverArtAgentOpen ? t("studio.coverArt.agentClose") : t("studio.coverArt.agentOpen")}
              </Button>
            </div>

            {coverArtAgentOpen && (
              <AgentChat
                module="cover_art"
                agentInitiates={true}
                onComplete={(r) => {
                  if (r.prompt) update("coverArtPrompt", r.prompt);
                  setCoverArtAgentOpen(false);
                }}
                onLaunch={handleAgentLaunch}
                onCancel={() => setCoverArtAgentOpen(false)}
              />
            )}

            <label className="builder-step">
              <strong>{t("studio.coverArt.promptLabel")}</strong>
              <span className="muted">{t("studio.coverArt.promptDesc")}</span>
              <textarea
                rows={5}
                value={state.coverArtPrompt}
                onChange={(e) => update("coverArtPrompt", e.target.value)}
                placeholder="Например: neon retro city at night, vaporwave gradient sky, lone figure on balcony, cinematic, no text"
              />
            </label>

            <div className="builder-step">
              <strong>{t("studio.coverArt.refLabel")}</strong>
              <span className="muted">{t("studio.coverArt.refDesc")}</span>
              <div
                className={`ref-upload${state.coverArtRefUrl ? " ref-upload--has-preview" : ""}`}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  for (const item of items) {
                    if (item.type.startsWith("image/")) {
                      e.preventDefault();
                      const file = item.getAsFile();
                      if (file) void uploadCoverArtRef(file);
                      return;
                    }
                    if (item.type === "text/plain") {
                      item.getAsString((text) => {
                        const trimmed = text.trim();
                        if (/^https?:\/\/.+/i.test(trimmed)) update("coverArtRefUrl", trimmed);
                      });
                      return;
                    }
                  }
                }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer?.files?.[0];
                  if (file && file.type.startsWith("image/")) {
                    void uploadCoverArtRef(file);
                  }
                }}
              >
                <div className="ref-upload__controls">
                  <input
                    type="text"
                    className="inline-input"
                    placeholder={t("studio.coverArt.refPlaceholder")}
                    value={state.coverArtRefUrl}
                    onChange={(e) => update("coverArtRefUrl", e.target.value)}
                    disabled={coverArtRefUploading}
                  />
                  <label className="ref-upload__btn">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      disabled={coverArtRefUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void uploadCoverArtRef(file);
                      }}
                    />
                    {coverArtRefUploading ? t("studio.coverArt.refUploading") : t("studio.coverArt.refFileBtn")}
                  </label>
                </div>
                {coverArtRefError && (
                  <div className="ref-upload__error" style={{ color: "var(--err, #ff6b6b)", fontSize: 12, marginTop: 6 }}>
                    {coverArtRefError}
                  </div>
                )}
                {state.coverArtRefUrl && (
                  <div className="ref-upload__preview">
                    <img src={state.coverArtRefUrl} alt={t("studio.coverArt.refAlt")} />
                    <button
                      type="button"
                      className="ref-upload__remove"
                      onClick={() => update("coverArtRefUrl", "")}
                      aria-label={t("studio.coverArt.refRemoveAria")}
                    >
                      ×
                    </button>
                  </div>
                )}
                {!state.coverArtRefUrl && (
                  <div className="ref-upload__hint">
                    {t("studio.coverArt.refDragHint")}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {(activeModule === "song" || activeModule === "instrumental") && (
          <div className="builder-grid">
            <div
              className={`builder-step${songParamsLocked ? " builder-step--locked" : ""}`}
              aria-disabled={songParamsLocked}
            >
              <strong>{t("studio.genreLabel")}</strong>
              <span className="muted">{t("studio.genreDesc")}</span>
              <div className="chip-row chip-row--dense">
                {GENRES.map((g) => (
                  <Chip key={g} active={state.genre === g} onClick={() => update("genre", g)}>
                    {g}
                  </Chip>
                ))}
                <Chip
                  active={state.genre === "custom"}
                  onClick={() => update("genre", "custom")}
                  className="chip--custom"
                >
                  {t("studio.customVariant")}
                </Chip>
              </div>
              {state.genre === "custom" && (
                <input
                  className="inline-input"
                  placeholder={t("studio.genreCustomPlaceholder")}
                  value={state.customGenre}
                  onChange={(e) => update("customGenre", e.target.value)}
                />
              )}
            </div>

            <div
              className={`builder-step${songParamsLocked ? " builder-step--locked" : ""}`}
              aria-disabled={songParamsLocked}
            >
              <strong>{t("studio.mood")}</strong>
              {renderChipRow(uiMoods, "mood", true)}
              {state.mood === "custom" && (
                <input
                  className="inline-input"
                  placeholder={t("studio.moodCustomPlaceholder")}
                  value={state.customMood}
                  onChange={(e) => update("customMood", e.target.value)}
                />
              )}
            </div>

            <div
              className={`builder-step${songParamsLocked ? " builder-step--locked" : ""}`}
              aria-disabled={songParamsLocked}
            >
              <strong>{t("studio.tempo")}</strong>
              {renderChipRow(uiTempos, "tempo", true)}
              {state.tempo === "custom" && (
                <input
                  className="inline-input"
                  placeholder={t("studio.tempoCustomPlaceholder")}
                  value={state.customTempo}
                  onChange={(e) => update("customTempo", e.target.value)}
                />
              )}
            </div>
          </div>
        )}

        {/* Track-naming step — shown for every module that produces an audio
          * file. Two modes: "auto" (агент сам соберёт `Артист - Идея
          * (RIFFAMusic)`) и "manual" (своё название). Идёт перед итоговым
          * prompt'ом, чтобы быть последним явным выбором перед запуском. */}
        {(activeModule === "song" ||
          activeModule === "instrumental" ||
          activeModule === "cover" ||
          activeModule === "sound_effect") && (
          <div className="track-name-block">
            <label className="block-label">{t("studio.trackName.label")}</label>
            <div className="track-name-modes">
              <label className="track-name-mode">
                <input
                  type="radio"
                  name="trackNameMode"
                  value="auto"
                  checked={state.trackNameMode === "auto"}
                  onChange={() => update("trackNameMode", "auto")}
                />
                <span>
                  <strong>{t("studio.trackName.auto")}</strong>
                  <span className="muted">
                    {t("studio.trackName.autoDesc")}
                  </span>
                </span>
              </label>
              <label className="track-name-mode">
                <input
                  type="radio"
                  name="trackNameMode"
                  value="manual"
                  checked={state.trackNameMode === "manual"}
                  onChange={() => update("trackNameMode", "manual")}
                />
                <span>
                  <strong>{t("studio.trackName.manual")}</strong>
                  <span className="muted">{t("studio.trackName.manualDesc", { max: SUNO_LIMITS.TITLE_MAX })}</span>
                </span>
              </label>
            </div>
            {state.trackNameMode === "manual" && (
              <>
                <input
                  type="text"
                  className="inline-input"
                  placeholder={t("studio.trackName.manualPlaceholder")}
                  value={state.trackName}
                  onChange={(e) => update("trackName", e.target.value)}
                  maxLength={SUNO_LIMITS.TITLE_MAX}
                />
                <span className="char-counter">
                  {state.trackName.length} / {SUNO_LIMITS.TITLE_MAX}
                </span>
              </>
            )}
          </div>
        )}

        <div className="prompt-preview">
          <header>
            <strong>{t("studio.promptPreview.label")}</strong>
            <span className="muted">{t("studio.promptPreview.desc")}</span>
          </header>
          {(activeModule === "song" || activeModule === "instrumental" || activeModule === "cover" || activeModule === "sound_effect") && (
            <div className="prompt-preview__track-name">
              <span className="prompt-preview__track-label">{t("studio.trackName.previewLabel")}</span>
              {state.trackNameMode === "manual" && state.trackName.trim()
                ? <span className="prompt-preview__track-value">{state.trackName.trim()}</span>
                : <span className="prompt-preview__track-auto">{t("studio.trackName.previewAuto")}</span>
              }
            </div>
          )}
          <pre>{previewPrompt}</pre>
        </div>

        {submitError && (
          <div className="submit-error" role="alert">
            {submitError}
          </div>
        )}

        <Button
          ref={submitRef}
          onClick={handleSubmit}
          disabled={moduleMeta!.postponed || submitting || songParamsLocked || isUploading}
          className={presetToast?.auto ? "submit-btn submit-btn--flash" : "submit-btn"}
        >
          {moduleMeta!.postponed
            ? t("studio.submitSoon")
            : submitting
              ? t("studio.submitGenerating")
              : songParamsLocked
                ? t("studio.submitApproveLyrics")
                : t("studio.generate")}
        </Button>
      </Panel>

      <VoiceRecorder
        isRecording={isRecording}
        recordingTime={recordingTime}
        onStop={stopRecording}
        onCancel={cancelRecording}
      />
    </div>
  );
}
