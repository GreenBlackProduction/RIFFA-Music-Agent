import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Coin } from "@/components/ui/Coin";
import { AgentChat, type AgentResult } from "@/components/studio/AgentChat";
import { LibraryCard } from "@/components/studio/LibraryCard";
import { ModuleIcon } from "@/components/studio/ModuleIcon";
import { VoiceRecorder } from "@/components/studio/VoiceRecorder";
import {
  createLyricsDraft,
  fetchLyricsDraft,
  generateSong,
  generateInstrumental,
  generateSoundEffect,
  generateCoverSong,
  generateCoverArt,
  generateOccasion,
  openGenerationSocket,
  requestAutoTitle,
  uploadCoverFile,
  type AgentIntent,
} from "@/lib/api/client";
import { SUNO_LIMITS } from "@/lib/sunoConstraints";
import { blobToWav } from "@/lib/audio/recordToWav";
import { useGenerationStore } from "@/store/generation";
import "./StudioPage.css";

type LyricsState = "idle" | "generating" | "review" | "approved";

// Шаблоны инструменталов — синхронизированы с ботом (Test20.04/main1.py:299–362, get_preset_keyboard).
// mode="auto" — моментально запускает автогенерацию (подсвечена кнопка сгенерировать).
// mode="prompt" — только заполняет поля как «отправная точка», дальше пользователь докручивает.
const INSTRUMENTAL_PRESETS = [
  { key: "sleep",       title: "Для сна",        emoji: "😴", genre: "Ambient",    mood: "dreamy",     tempo: "very_slow", extra: "relaxing sleep music, gentle pads, slow evolving textures, no percussion", mode: "auto"   as const },
  { key: "cafe",        title: "Для кафе",      emoji: "☕", genre: "Jazz",       mood: "calm",       tempo: "slow",      extra: "cozy cafe background, smooth jazz, upright bass, brushed drums, warm saxophone",                mode: "auto"   as const },
  { key: "work",        title: "Для работы",    emoji: "💻", genre: "Lofi",       mood: "calm",       tempo: "slow",      extra: "focus beats, soft lofi hip-hop, vinyl crackle, muted piano, non-distracting",                  mode: "auto"   as const },
  { key: "driving",     title: "Для поездки",   emoji: "🚗", genre: "Synthwave",  mood: "confident",  tempo: "medium",    extra: "road trip synthwave, wide pads, driving analog bass, subtle arpeggios, night highway vibe",    mode: "auto"   as const },
  { key: "meditation",  title: "Для медитации", emoji: "🧘", genre: "Ambient",    mood: "calm",       tempo: "very_slow", extra: "meditation soundscape, tibetan bowls, airy pads, binaural feel, healing",                     mode: "auto"   as const },
  { key: "content",     title: "Для контента",  emoji: "🎬", genre: "Cinematic",  mood: "inspiring",  tempo: "medium",    extra: "background music for videos, modern cinematic, light percussion, uplifting strings",          mode: "prompt" as const },
  { key: "workout",     title: "Тренировка",    emoji: "💪", genre: "EDM",        mood: "energetic",  tempo: "fast",      extra: "energetic workout beat, driving kick, punchy synths, motivational atmosphere",                 mode: "prompt" as const },
  { key: "gaming",      title: "Для игр",       emoji: "🎮", genre: "Electronic", mood: "energetic",  tempo: "fast",      extra: "epic gaming soundtrack, intense synths, orchestral hits, tension and action",                 mode: "prompt" as const },
  { key: "creative",    title: "Творчество",    emoji: "🎨", genre: "Downtempo",  mood: "dreamy",     tempo: "medium",    extra: "inspiring creative downtempo, warm keys, dreamy textures, artistic atmosphere",               mode: "prompt" as const },
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
    shortDesc: "Перепой любимый трек в новом стиле.",
    longDesc:
      "Загрузи ссылку на оригинал (mp3/m4a) и опиши новый стиль — Suno V5.5 сделает кавер с нужным вокалом и жанром.",
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

const MOODS: ReadonlyArray<readonly [string, string]> = [
  ["happy", "😊 Радостное"], ["calm", "😌 Спокойное"], ["sad", "😢 Грустное"],
  ["energetic", "😤 Энергичное"], ["confident", "😎 Уверенное"], ["dreamy", "🌙 Мечтательное"],
  ["aggressive", "🔥 Агрессивное"], ["inspiring", "🌅 Вдохновляющее"], ["anxious", "😰 Тревожное"],
  ["dramatic", "🎭 Драматичное"],
];

const TEMPOS: ReadonlyArray<readonly [string, string]> = [
  ["very_slow", "🐌 Очень медленный · 60–80 BPM"],
  ["slow", "🚶 Медленный · 80–100 BPM"],
  ["medium", "🚴 Средний · 100–120 BPM"],
  ["fast", "🏃 Быстрый · 120–140 BPM"],
  ["very_fast", "🚀 Очень быстрый · 140–180 BPM"],
];

const VOCAL_TYPES: ReadonlyArray<readonly [string, string]> = [
  ["male", "Мужской"], ["female", "Женский"], ["any", "Выбор за ИИ"],
];

const TIMBRES: ReadonlyArray<readonly [string, string]> = [
  ["balanced", "Сбалансированный"], ["pop", "Эстрадный"], ["warm", "Тёплый"],
  ["raspy", "Хриплый"], ["scream", "Жёсткое screamo"],
];

const LYRICS_MODES: ReadonlyArray<readonly [string, string]> = [
  ["ai-vocal", "ИИ пишет текст и вокал"],
  ["custom-lyrics", "Свой текст"],
  ["instrumental", "Без текста"],
];

const SFX_SOURCES: ReadonlyArray<readonly [string, string]> = [
  ["impact", "Удар / impact"], ["glitch", "Glitch transition"], ["nature", "Природа"],
  ["mechanic", "Механика"], ["whoosh", "Whoosh"], ["custom", "Свой звук"],
];

const SFX_ENVS: ReadonlyArray<readonly [string, string]> = [
  ["studio", "Чистая студия"], ["room", "Комната"], ["street", "Улица"],
  ["forest", "Лес"], ["space", "Космос"],
];

const SFX_DURATIONS: ReadonlyArray<readonly [string, string]> = [
  ["short", "Короткий 1–2 сек"], ["medium", "Средний 3–6 сек"], ["long", "Длинный ambience 10+ сек"],
];

const SFX_STYLES: ReadonlyArray<readonly [string, string]> = [
  ["cinematic", "Киношный"], ["realistic", "Реалистичный"], ["clean", "Чистый"],
];

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
  coverStyleWeight: "0.65",
  coverWeirdness: "0.5",
  coverArtPrompt: "",
  coverArtModel: "nano-banana",
  coverArtRefUrl: "",
  trackNameMode: "auto",
  trackName: "",
};

const COVER_INSTRUMENTAL: ReadonlyArray<readonly [string, string]> = [
  ["no", "С вокалом"],
  ["yes", "Инструментальный кавер"],
];

const COVER_VOCAL_GENDERS: ReadonlyArray<readonly [string, string]> = [
  ["auto", "Как в оригинале"],
  ["m", "Мужской"],
  ["f", "Женский"],
];

const COVER_STYLE_WEIGHTS: ReadonlyArray<readonly [string, string]> = [
  ["0.35", "Свободнее · 0.35"],
  ["0.5", "Средне · 0.5"],
  ["0.65", "Точнее стилю · 0.65"],
  ["0.85", "Максимально по стилю · 0.85"],
];

const COVER_WEIRDNESS: ReadonlyArray<readonly [string, string]> = [
  ["0.2", "Близко к оригиналу · 0.2"],
  ["0.5", "Сбалансированно · 0.5"],
  ["0.8", "Экспериментально · 0.8"],
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

function HeroAIIcon() {
  return (
    <div className="hero-ai-icon" aria-hidden="true">
      <img src="/icons8-chatgpt.png" alt="" className="hero-ai-icon__img" />
    </div>
  );
}

function formatCost(value: number): string {
  // Целые показываем как "2", дроби — как "0.5".
  return Number.isInteger(value) ? String(value) : value.toString();
}

function ModuleCost({ meta }: { meta: ModuleMeta }) {
  return (
    <span className="tile__cost" aria-label={`Стоимость: ${meta.costFrom ? "от " : ""}${formatCost(meta.cost)} токенов`}>
      {meta.costFrom ? "от " : ""}
      {formatCost(meta.cost)}
      <Coin size={14} className="riffa-coin--after" />
    </span>
  );
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
  const { lyricsState, lyricsTopic, lyricsText, lyricsTitle, lyricsError } = state;

  return (
    <label className="builder-step lyrics-block">
      <strong>Тема песни</strong>
      <span className="muted">
        Опиши идею в одном-двух предложениях. ИИ напишет текст, ты сможешь его принять,
        отредактировать или сгенерировать заново.
      </span>
      <textarea
        rows={2}
        value={lyricsTopic}
        onChange={(e) => onTopicChange(e.target.value)}
        placeholder="Например: песня про летний город, ночные огни и свободу"
        maxLength={SUNO_LIMITS.DESCRIPTION_MAX}
        disabled={lyricsState === "generating"}
      />
      <span className="char-counter">
        {lyricsTopic.length} / {SUNO_LIMITS.DESCRIPTION_MAX}
      </span>

      {lyricsState === "idle" && (
        <div className="lyrics-actions">
          <Button onClick={onStart} disabled={!lyricsTopic.trim()}>
            ✨ Сгенерировать текст
          </Button>
          {lyricsError && <span className="lyrics-error">{lyricsError}</span>}
        </div>
      )}

      {lyricsState === "generating" && (
        <div className="lyrics-window lyrics-window--generating" aria-live="polite">
          <span className="lyrics-window__shimmer" aria-hidden="true" />
          <span className="lyrics-window__pulse" aria-hidden="true" />
          <p className="lyrics-window__status">ИИ пишет текст…</p>
          <p className="muted">
            Обычно занимает 5–15 секунд. Окно переливается фирменными цветами,
            пока модель обдумывает строчки.
          </p>
        </div>
      )}

      {(lyricsState === "review" || lyricsState === "approved") && (
        <>
          {lyricsTitle && (
            <p className="lyrics-window__title">
              <span className="muted">Название:</span> {lyricsTitle}
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
                  ✓ Принять текст
                </Button>
                <button type="button" className="ghost-btn" onClick={onRegenerate}>
                  ↻ Сгенерировать заново
                </button>
              </>
            ) : (
              <button type="button" className="ghost-btn" onClick={onEdit}>
                ✎ Изменить текст
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
  const { lyricsState, lyricsText } = state;

  return (
    <label className="builder-step lyrics-block">
      <strong>Свой текст песни</strong>
      <span className="muted">
        Используй структуру: [Куплет], [Припев], [Скит], [Проигрыш], [Бридж]. Утверди текст,
        чтобы разблокировать остальные параметры.
      </span>
      <textarea
        className={`lyrics-text${lyricsState === "approved" ? " lyrics-text--approved" : ""}`}
        rows={10}
        value={lyricsText}
        onChange={(e) => onTextChange(e.target.value)}
        readOnly={lyricsState === "approved"}
        maxLength={SUNO_LIMITS.LYRICS_MAX}
        placeholder={"[Куплет 1]\n...\n\n[Припев]\n..."}
      />
      <span className="char-counter">
        {lyricsText.length} / {SUNO_LIMITS.LYRICS_MAX}
      </span>
      <div className="lyrics-actions">
        {lyricsState === "approved" ? (
          <button type="button" className="ghost-btn" onClick={onEdit}>
            ✎ Изменить текст
          </button>
        ) : (
          <Button onClick={onApprove} disabled={!lyricsText.trim()}>
            ✓ Принять текст
          </Button>
        )}
      </div>
    </label>
  );
}

export function StudioPage() {
  const [activeModule, setActiveModule] = useState<Module | null>(null);
  const [agentSeed, setAgentSeed] = useState<string | null>(null);
  const [heroIdea, setHeroIdea] = useState("");
  const [state, setState] = useState<SongState>(INITIAL_STATE);
  const [agentOpen, setAgentOpen] = useState(false);
  const [coverArtAgentOpen, setCoverArtAgentOpen] = useState(false);
  const [presetToast, setPresetToast] = useState<{ title: string; auto: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitRef = useRef<HTMLButtonElement | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const trackGeneration = useGenerationStore((s) => s.track);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (activeModule) return;
    document.body.classList.add("studio-landing");
    return () => document.body.classList.remove("studio-landing");
  }, [activeModule]);

  // Cleanup recording on unmount. Inline the stop() call instead of
  // referencing the local `stopRecording` so the effect's deps list stays
  // honest (otherwise react-hooks/exhaustive-deps wants every render-fresh
  // closure listed, even though we only need teardown on unmount).
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && isRecording) {
        recorder.stop();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording]);

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
          ✏️ Свой вариант
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
                  lyricsError: data.error ?? "Не удалось получить текст",
                }));
              }
            })
            .catch((err: unknown) => {
              if (cancelled) return;
              const msg = err instanceof Error ? err.message : "Ошибка получения текста";
              setState((prev) => ({ ...prev, lyricsState: "idle", lyricsError: msg }));
            });
        } else if (event.status === "failed") {
          setState((prev) => ({
            ...prev,
            lyricsState: "idle",
            lyricsError: event.error ?? "Не удалось сгенерировать текст",
          }));
        }
      },
      () => {
        if (cancelled) return;
        // WS closed — only relevant if we never reached completed.
        setState((prev) =>
          prev.lyricsState === "generating"
            ? { ...prev, lyricsState: "idle", lyricsError: "Соединение прервано" }
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
      setState((prev) => ({ ...prev, lyricsError: "Опиши тему — пара слов о чём песня" }));
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
      const msg = err instanceof Error ? err.message : "Не удалось запустить генерацию";
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
      alert("Файл больше 50 МБ. Сожмите или обрежьте до 8 минут в mp3/m4a/wav/ogg.");
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
    try {
      const publicUrl = await uploadCoverFile(file);
      setState((prev) => ({ ...prev, coverUrl: publicUrl }));
    } catch (err) {
      console.error("Upload error:", err);
      const msg = err instanceof Error ? err.message : "Ошибка загрузки файла";
      alert(`Не удалось загрузить файл: ${msg}`);
      setState((prev) => ({ ...prev, coverFileName: "", coverUrl: "" }));
      if (coverFileInputRef.current) coverFileInputRef.current.value = "";
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // MediaRecorder always produces webm/opus on Chrome (and mp4/aac on
        // Safari) — neither is in Suno's allow-list (mp3/wav/m4a/ogg). Decode
        // via WebAudio and re-encode to 16-bit PCM WAV before upload.
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());
        try {
          const wavFile = await blobToWav(audioBlob, `recording-${Date.now()}.wav`);
          await uploadRecordedFile(wavFile);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Не удалось сконвертировать запись в WAV.";
          alert(`Не удалось обработать запись: ${msg}`);
          setState((prev) => ({ ...prev, coverFileName: "", coverUrl: "" }));
        }
        setIsRecording(false);
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось получить доступ к микрофону";
      alert(msg);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  }

  function cancelRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      audioChunksRef.current = [];
    }
  }

  async function uploadRecordedFile(file: File) {
    try {
      setState((prev) => ({ ...prev, coverFileName: file.name, coverUrl: "" }));
      const uploadedUrl = await uploadCoverFile(file);
      setState((prev) => ({ ...prev, coverUrl: uploadedUrl }));
    } catch (err) {
      console.error("Upload error:", err);
      const msg = err instanceof Error ? err.message : "Ошибка загрузки записи";
      alert(`Не удалось загрузить запись: ${msg}`);
      setState((prev) => ({ ...prev, coverFileName: "", coverUrl: "" }));
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
      setSubmitError("Для кавера сначала загрузи исходный трек (mp3/m4a/wav).");
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
          setSubmitError("Сначала утверди текст песни — без него остальные параметры не отправим.");
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
          track_name: resolvedTrackName,
        });
        title =
          resolvedTrackName ||
          state.coverTitle.trim() ||
          `Кавер · ${state.coverFileName || "upload"}`;
      } else if (activeModule === "cover_art") {
        if (!state.coverArtPrompt?.trim()) {
          setSubmitError("Опиши идею обложки — используй чат с агентом или напиши промт вручную.");
          setSubmitting(false);
          return;
        }
        title = resolvedTrackName || state.coverArtPrompt.trim().slice(0, 60) || "Обложка";
        response = await generateCoverArt({
          prompt: state.coverArtPrompt.trim(),
          model: state.coverArtModel || "nano-banana",
          title,
          ...(state.coverArtRefUrl && !state.coverArtRefUrl.startsWith("data:")
            ? { reference_url: state.coverArtRefUrl }
            : {}),
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
        err instanceof Error ? err.message : "Ошибка запуска генерации. Попробуй ещё раз.";
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
    const featured = MODULES[0];
    const supporting = MODULES.slice(1);
    return (
      <div className="studio studio--landing">
        <div className="studio-grid">
          <section className="hero-card">
            <div className="hero-card__inner">
              <div className="hero-card__title-row">
                <h1 className="hero-card__title">
                  Что создаём <span className="hero-card__accent">сегодня</span>?
                </h1>
                <HeroAIIcon />
              </div>
              <p className="hero-card__subtitle">
                Выбери модуль и собери prompt через понятные кнопки. Не знаешь, что выбрать —
                расскажи идею агенту, он соберёт его за тебя.
              </p>
              <form className="hero-card__form" onSubmit={startWithIdea}>
                <input
                  className="hero-card__input"
                  type="text"
                  value={heroIdea}
                  onChange={(e) => setHeroIdea(e.target.value)}
                  placeholder="Опиши идею в одном предложении…"
                  aria-label="Опиши идею для агента"
                />
                <button
                  type="submit"
                  className="hero-card__submit"
                  aria-label="Передать агенту"
                  disabled={!heroIdea.trim()}
                >
                  →
                </button>
              </form>
              <span className="hero-card__hint">Агент сам разберётся: задаст уточняющие вопросы только если нужно — и сразу запустит генерацию.</span>
            </div>
            <div className="hero-card__glow" aria-hidden="true" />
          </section>

          <button
            type="button"
            className={`tile tile--featured-square${activeModule === featured.id ? " tile--active" : ""}`}
            onClick={() => openModule(featured.id)}
          >
            <div className="tile__inner">
              <ModuleIcon kind={featured.id} />
              {featured.badge && <span className="tile__badge">{featured.badge}</span>}
              <div className="tile__body">
                <h3 className="tile__title">{featured.title}</h3>
                <p className="tile__short">{featured.shortDesc}</p>
              </div>
              <ModuleCost meta={featured} />
            </div>
          </button>

          {supporting.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`tile tile--row${m.postponed ? " tile--postponed" : ""}${activeModule === m.id ? " tile--active" : ""}`}
              onClick={() => !m.postponed && openModule(m.id)}
              disabled={m.postponed}
            >
              <div className="tile__inner">
                <ModuleIcon kind={m.id} />
                {m.postponed && <span className="tile__badge tile__badge--muted">Скоро</span>}
                <div className="tile__body">
                  <h3 className="tile__title">{m.title}</h3>
                  <p className="tile__short">{m.shortDesc}</p>
                </div>
                <ModuleCost meta={m} />
              </div>
            </button>
          ))}

          <LibraryCard />
        </div>
      </div>
    );
  }

  // ─────────────────── selected module editor ───────────────────
  return (
    <div className="studio">
      <Panel className="builder-panel">
        <header className="builder-head">
          <button type="button" className="builder-back" onClick={backToTiles}>
            ← Все модули
          </button>
          <div className="builder-head__main">
            <span className="builder-head__icon builder-head__icon--active" aria-hidden="true">
              <ModuleIcon kind={activeModule} />
            </span>
            <div className="builder-head__text">
              <h2>{moduleMeta!.title}</h2>
              <p className="muted">{moduleMeta!.longDesc}</p>
            </div>
          </div>
        </header>

        {activeModule === "song" && !agentOpen && (
          <div className="agent-cta agent-cta--hero">
            <div className="agent-cta__glow" aria-hidden="true" />
            <div className="agent-cta__body">
              <span className="agent-cta__badge">AI агент</span>
              <strong className="agent-cta__title">Расскажи идею — запущу генерацию за тебя</strong>
              <p className="agent-cta__text">
                Не знаешь, что выбрать? Просто опиши идею — агент задаст уточняющие
                вопросы только если нужно, соберёт детальный prompt для Suno и сам
                запустит нужный модуль.
              </p>
              {state.agentPrompt && (
                <p className="agent-cta__check">Бриф собран — он добавится к финальному prompt ниже.</p>
              )}
            </div>
            <Button onClick={() => setAgentOpen((v) => !v)}>
              {agentOpen ? "Закрыть чат" : state.agentPrompt ? "Открыть чат заново" : "Рассказать агенту"}
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
              <strong>1. Текст и вокал</strong>
              <span className="muted">
                ИИ пишет текст, ты вводишь свой структурированный текст или делаешь без слов
              </span>
              {renderChipRow(LYRICS_MODES, "lyricsMode")}
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
                <span className="muted">
                  Без вокала и без текста. Жанр, настроение и темп уже доступны для выбора.
                </span>
              </div>
            )}

            <div
              className={`builder-step${songParamsLocked ? " builder-step--locked" : ""}`}
              aria-disabled={songParamsLocked}
            >
              <strong>2. Тип вокала</strong>
              <span className="muted">Кто должен исполнить песню</span>
              {renderChipRow(VOCAL_TYPES, "vocal")}
              {songParamsLocked && (
                <span className="lock-hint">Сначала утверди текст</span>
              )}
            </div>

            <div
              className={`builder-step${songParamsLocked ? " builder-step--locked" : ""}`}
              aria-disabled={songParamsLocked}
            >
              <strong>3. Тембр и стилистика вокала</strong>
              <span className="muted">Влияет на vocal tone, delivery, intensity, voice texture</span>
              {renderChipRow(TIMBRES, "timbre", true)}
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
                <strong>Шаблон задачи</strong>
                <span className="muted">
                  Сразу запускается в автоматическом режиме (для сна, кафе, работы, поездки, медитации). Остальные берутся как отправная точка — докрутишь вручную.
                </span>
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
                        {preset.mode === "auto" ? "мгновенно" : "как старт"}
                      </span>
                      <span className="preset-card__title">
                        <span aria-hidden="true">{preset.emoji}</span>
                        {preset.title}
                      </span>
                      <span className="preset-card__meta">
                        {valueLabel(preset.tempo, TEMPOS).replace(/ ·.*$/, "")} · {preset.genre}
                      </span>
                    </button>
                  );
                })}
              </div>
              {presetToast && (
                <div className={`preset-toast preset-toast--${presetToast.auto ? "auto" : "prompt"}`} role="status">
                  {presetToast.auto
                    ? `Шаблон «${presetToast.title}» готов — жми «Сгенерировать».`
                    : `Шаблон «${presetToast.title}» применён как отправная точка. Подправь жанр / настроение / детали ниже.`}
                </div>
              )}
            </div>

            <label className="builder-step">
              <strong>Дополнительное описание</strong>
              <span className="muted">Инструменты, референсы, задача трека, атмосфера. Шаблон уже предзаполнил поле.</span>
              <textarea
                rows={5}
                value={state.instrumentalExtra}
                onChange={(e) => update("instrumentalExtra", e.target.value)}
                placeholder="Например: фон для fashion-видео, мягкий синтезатор, глубокий бас, без вокала"
              />
            </label>
          </>
        )}

        {activeModule === "sound_effect" && (
          <div className="builder-grid">
            <div className="builder-step">
              <strong>Источник звука</strong>
              <div className="chip-row">
                {SFX_SOURCES.filter(([v]) => v !== "custom").map(([value, label]) => (
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
                  ✏️ Свой звук
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
              <strong>Среда</strong>
              {renderChipRow(SFX_ENVS, "sfxEnv")}
            </div>
            <div className="builder-step">
              <strong>Длительность</strong>
              {renderChipRow(SFX_DURATIONS, "sfxDuration")}
            </div>
            <div className="builder-step">
              <strong>Характер</strong>
              {renderChipRow(SFX_STYLES, "sfxStyle")}
            </div>
            <label className="builder-step">
              <strong>Дополнительные детали</strong>
              <span className="muted">
                Атака, tail, интенсивность, текстура. До {SUNO_LIMITS.SFX_PROMPT_MAX} символов
                — лимит /generate/sounds.
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
            <div className="builder-step">
              <strong>Исходный аудиофайл</strong>
              <span className="muted">
                Загрузите файл или укажите публичную ссылку на трек.
              </span>
              <span className="muted" style={{ marginTop: "0.5rem", display: "block" }}>
                <strong>Что можно загрузить:</strong>
                <br />• Оригинал чужой песни для кавер-версии
                <br />• Ваше напевание или мелодию
                <br />• Короткий риф или музыкальную идею
              </span>
              <span className="muted" style={{ marginTop: "0.5rem", display: "block", fontSize: "0.85rem" }}>
                <strong>Технические ограничения:</strong> форматы {SUNO_LIMITS.COVER_AUDIO_FORMATS.join(", ")}, длительность до {SUNO_LIMITS.COVER_AUDIO_MAX_MIN} минут
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
                  className="cover-upload-btn"
                  onClick={() => coverFileInputRef.current?.click()}
                  disabled={isRecording}
                >
                  📎 {state.coverFileName ? `Загружено: ${state.coverFileName}` : "Прикрепить свой файл"}
                </button>
                <button
                  type="button"
                  className="cover-upload-btn cover-upload-btn--record"
                  onClick={startRecording}
                  disabled={!!state.coverFileName || isRecording}
                  title="Записать голос"
                >
                  🎤 Запись звука
                </button>
                {state.coverFileName && (
                  <button
                    type="button"
                    className="cover-upload-clear"
                    onClick={() => {
                      setState((prev) => ({ ...prev, coverUrl: "", coverFileName: "" }));
                      if (coverFileInputRef.current) coverFileInputRef.current.value = "";
                    }}
                  >
                    × сбросить
                  </button>
                )}
              </div>
            </div>

            <div className="builder-step">
              <strong>Формат</strong>
              <span className="muted">С вокалом или чистый инструментал поверх оригинала.</span>
              {renderChipRow(COVER_INSTRUMENTAL, "coverInstrumental")}
            </div>

            <div className="builder-step">
              <strong>Пол вокалиста</strong>
              <span className="muted">Для V5.5. «Как в оригинале» — Suno подберёт сам.</span>
              {renderChipRow(COVER_VOCAL_GENDERS, "coverVocalGender")}
            </div>

            <div className="builder-step">
              <strong>Жанр</strong>
              <span className="muted">Выбери из списка или укажи свой.</span>
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
                  ✏️ Свой жанр
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
              <strong>Настроение</strong>
              {renderChipRow(MOODS, "coverMood")}
            </div>

            <div className="builder-step">
              <strong>Темп</strong>
              {renderChipRow(TEMPOS, "coverTempo")}
            </div>

            <label className="builder-step">
              <strong>Дополнительные детали стиля</strong>
              <span className="muted">
                Инструменты, атмосфера, референсы. До 1000 символов (Suno-лимит для V5.5).
              </span>
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
                <strong>Новый текст (опционально)</strong>
                <span className="muted">
                  Если хочешь поменять слова — впиши тут. До 5000 символов. Пусто = Suno повторит оригинальный текст в новой подаче.
                </span>
                <textarea
                  rows={6}
                  value={state.coverLyrics}
                  onChange={(e) => update("coverLyrics", e.target.value)}
                  placeholder={"[Куплет 1]\nНовый текст\n[Припев]\n..."}
                  maxLength={5000}
                />
              </label>
            )}

            <div className="builder-step">
              <strong>Стилевая точность (styleWeight)</strong>
              <span className="muted">Насколько Suno должен следовать стилю из описания (0 — свободно, 1 — строго).</span>
              {renderChipRow(COVER_STYLE_WEIGHTS, "coverStyleWeight")}
            </div>

            <div className="builder-step">
              <strong>Степень отхода (weirdnessConstraint)</strong>
              <span className="muted">Насколько далеко можно уйти от оригинала.</span>
              {renderChipRow(COVER_WEIRDNESS, "coverWeirdness")}
            </div>
          </div>
        )}

        {activeModule === "cover_art" && (
          <div className="builder-grid">
            <div className="builder-step">
              <strong>Модель для генерации</strong>
              <span className="muted">Каждая модель даёт разный художественный язык и стоит по-разному.</span>
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
                    <span className="model-card__descr">{m.descr}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="builder-step cover-art-agent-cta">
              <header className="preset-section__head">
                <strong>Чат с агентом</strong>
                <span className="muted">
                  Расскажи агенту, какую обложку хочешь — он соберёт prompt под выбранную модель и сразу запустит генерацию.
                </span>
              </header>
              <Button onClick={() => setCoverArtAgentOpen((v) => !v)}>
                {coverArtAgentOpen ? "Закрыть чат" : "Открыть чат с агентом"}
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
              <strong>Prompt обложки</strong>
              <span className="muted">Можно отредактировать, что собрал агент, или ввести свой с нуля.</span>
              <textarea
                rows={5}
                value={state.coverArtPrompt}
                onChange={(e) => update("coverArtPrompt", e.target.value)}
                placeholder="Например: neon retro city at night, vaporwave gradient sky, lone figure on balcony, cinematic, no text"
              />
            </label>

            <div className="builder-step">
              <strong>Референс изображение</strong>
              <span className="muted">
                Загрузите изображение, вставьте ссылку или нажмите Ctrl+V для вставки из буфера.
              </span>
              <div
                className={`ref-upload${state.coverArtRefUrl ? " ref-upload--has-preview" : ""}`}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  for (const item of items) {
                    if (item.type.startsWith("image/")) {
                      e.preventDefault();
                      const file = item.getAsFile();
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === "string") update("coverArtRefUrl", reader.result);
                        };
                        reader.readAsDataURL(file);
                      }
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
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string") update("coverArtRefUrl", reader.result);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              >
                <div className="ref-upload__controls">
                  <input
                    type="text"
                    className="inline-input"
                    placeholder="Вставьте URL изображения..."
                    value={state.coverArtRefUrl.startsWith("data:") ? "" : state.coverArtRefUrl}
                    onChange={(e) => update("coverArtRefUrl", e.target.value)}
                  />
                  <label className="ref-upload__btn">
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === "string") update("coverArtRefUrl", reader.result);
                        };
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      }}
                    />
                    📎 Файл
                  </label>
                </div>
                {state.coverArtRefUrl && (
                  <div className="ref-upload__preview">
                    <img src={state.coverArtRefUrl} alt="Референс" />
                    <button
                      type="button"
                      className="ref-upload__remove"
                      onClick={() => update("coverArtRefUrl", "")}
                      aria-label="Убрать референс"
                    >
                      ×
                    </button>
                  </div>
                )}
                {!state.coverArtRefUrl && (
                  <div className="ref-upload__hint">
                    Перетащите изображение сюда или нажмите Ctrl+V
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
              <strong>Стиль музыки / жанр</strong>
              <span className="muted">Стили из логики Telegram-бота + свой вариант</span>
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
                  ✏️ Свой вариант
                </Chip>
              </div>
              {state.genre === "custom" && (
                <input
                  className="inline-input"
                  placeholder="Опиши свой стиль (например, retrowave 80s)"
                  value={state.customGenre}
                  onChange={(e) => update("customGenre", e.target.value)}
                />
              )}
            </div>

            <div
              className={`builder-step${songParamsLocked ? " builder-step--locked" : ""}`}
              aria-disabled={songParamsLocked}
            >
              <strong>Настроение</strong>
              {renderChipRow(MOODS, "mood", true)}
              {state.mood === "custom" && (
                <input
                  className="inline-input"
                  placeholder="Например: nostalgic and bittersweet, triumphant"
                  value={state.customMood}
                  onChange={(e) => update("customMood", e.target.value)}
                />
              )}
            </div>

            <div
              className={`builder-step${songParamsLocked ? " builder-step--locked" : ""}`}
              aria-disabled={songParamsLocked}
            >
              <strong>Темп</strong>
              {renderChipRow(TEMPOS, "tempo", true)}
              {state.tempo === "custom" && (
                <input
                  className="inline-input"
                  placeholder="Например: 130 BPM, upbeat и пульсирующий"
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
            <label className="block-label">Название трека</label>
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
                  <strong>Авто</strong>
                  <span className="muted">
                    «Артист — Идея <span className="track-name-suffix">(RIFFAMusic)</span>»
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
                  <strong>Своё название</strong>
                  <span className="muted">Введи вручную (до {SUNO_LIMITS.TITLE_MAX} символов)</span>
                </span>
              </label>
            </div>
            {state.trackNameMode === "manual" && (
              <>
                <input
                  type="text"
                  className="inline-input"
                  placeholder="Например: Снежный какао"
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
            <strong>Итоговый prompt</strong>
            <span className="muted">То, что отправится в Suno / SFX API</span>
          </header>
          {(activeModule === "song" || activeModule === "instrumental" || activeModule === "cover" || activeModule === "sound_effect") && (
            <div className="prompt-preview__track-name">
              <span className="prompt-preview__track-label">Название трека:</span>
              {state.trackNameMode === "manual" && state.trackName.trim()
                ? <span className="prompt-preview__track-value">{state.trackName.trim()}</span>
                : <span className="prompt-preview__track-auto">Авто — «Артист&nbsp;— Идея (RIFFAMusic)»</span>
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
          disabled={moduleMeta!.postponed || submitting || songParamsLocked}
          className={presetToast?.auto ? "submit-btn submit-btn--flash" : "submit-btn"}
        >
          {moduleMeta!.postponed
            ? "Скоро"
            : submitting
              ? "Запускаем…"
              : songParamsLocked
                ? "Сначала утверди текст"
                : "Сгенерировать"}
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
