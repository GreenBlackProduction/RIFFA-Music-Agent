import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

import { Button } from "@/components/ui/Button";
import {
  agentChat,
  type AgentChatResponse,
  streamAgentChat,
  classifyAgent,
  createLyricsDraft,
  fetchLyricsDraft,
  type AgentChatMessage,
  type AgentIntent,
  type AgentIntentParams,
  type AgentModuleKind,
} from "@/lib/api/client";
import "./AgentChat.css";

// ─── Session persistence (localStorage, TTL 1 hour) ───────────────────────
// Единый ключ независимо от модуля: агент помнит диалог при переходе
// между страницами / модулями. Module передаётся только как hint бэкенду
// для первого приветствия — если есть сохранённая история, оно пропускается.

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;  // 24 часа
const UNIFIED_SESSION_KEY = "riffa_agent_unified_v1";

function sessionKey(_module: string) {
  return UNIFIED_SESSION_KEY;
}

interface SavedAgentSession {
  messages: UiMessage[];
  history: AgentChatMessage[];
  wizardPhase: string;
  wizardParamsCurrent: WizardParams;
  effectiveModule?: AgentModuleKind;
  scripted?: boolean;
  lyricsGenerated: boolean;
  done: boolean;
  result: AgentResult | null;
  savedAt: number;
}

function loadAgentSession(module: string): SavedAgentSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(module));
    if (!raw) return null;
    const s: SavedAgentSession = JSON.parse(raw);
    if (Date.now() - (s.savedAt ?? 0) > SESSION_TTL_MS) {
      localStorage.removeItem(sessionKey(module));
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function saveAgentSession(module: string, data: Omit<SavedAgentSession, "savedAt">) {
  try {
    localStorage.setItem(sessionKey(module), JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch { /* storage full / unavailable */ }
}

function clearAgentSession(module: string) {
  localStorage.removeItem(sessionKey(module));
}

// ─── Wizard chips ──────────────────────────────────────────────────────────
// Genre chip VALUES must be exact `GENRE_STYLES` keys (genre_data.py): the
// server-side prompt builder (`build_suno_style`) only lands on a rich preset
// on an exact key match — a grouped label like "Hip-Hop / Trap" silently falls
// back to a generic prompt. Labels == keys here (genres are an international
// vocabulary). "Pick for me" carries an empty value (mood/tempo still guide).
const GENRE_CHIPS: { label: string; value: string }[] = [
  { label: "Pop", value: "Pop" },
  { label: "Hip-Hop", value: "Hip-Hop" },
  { label: "Lofi", value: "Lofi" },
  { label: "Phonk", value: "Phonk" },
  { label: "Rock", value: "Rock" },
  { label: "Electronic", value: "Electronic" },
  { label: "House", value: "House" },
  { label: "Trap", value: "Trap" },
  { label: "R&B", value: "R&B" },
  { label: "Synthwave", value: "Synthwave" },
  { label: "Jazz", value: "Jazz" },
  { label: "Drum & Bass", value: "Drum & Bass" },
  { label: "Classical", value: "Classical" },
  { label: "Ambient", value: "Ambient" },
];

// Mood labels → backend values (both languages). Values are canonical mood keys.
const MOOD_CHIPS_RU = ["Энергичное", "Меланхоличное", "Агрессивное", "Спокойное", "Вдохновляющее", "Романтичное"];
const MOOD_CHIPS_EN = ["Energetic", "Melancholic", "Aggressive", "Calm", "Inspiring", "Romantic"];
const MOOD_VALUES =   ["energetic",  "sad",          "aggressive",  "calm",  "inspiring",  "romantic"];

const TEMPO_CHIPS_RU = ["Медленный", "Средний", "Быстрый"];
const TEMPO_CHIPS_EN = ["Slow",      "Medium",  "Fast"];
const TEMPO_VALUES =   ["slow",      "medium",  "fast"];

const VOCAL_CHIPS_RU = ["Мужской", "Женский"];
const VOCAL_CHIPS_EN = ["Male",    "Female"];
const VOCAL_VALUES =   ["male",    "female"];

function useWizardChips(lang: string) {
  const isEn = lang.startsWith("en");
  return {
    genreChips:  GENRE_CHIPS,
    genrePickLabel: isEn ? "Not sure — pick for me" : "Не знаю — подбери сам",
    moodChips:   isEn ? MOOD_CHIPS_EN  : MOOD_CHIPS_RU,
    tempoChips:  isEn ? TEMPO_CHIPS_EN : TEMPO_CHIPS_RU,
    vocalChips:  isEn ? VOCAL_CHIPS_EN : VOCAL_CHIPS_RU,
    moodValue:   (label: string) => MOOD_VALUES[
      (isEn ? MOOD_CHIPS_EN : MOOD_CHIPS_RU).indexOf(label)
    ] ?? label.toLowerCase(),
    tempoValue:  (label: string) => TEMPO_VALUES[
      (isEn ? TEMPO_CHIPS_EN : TEMPO_CHIPS_RU).indexOf(label)
    ] ?? label.toLowerCase(),
    vocalValue:  (label: string) => VOCAL_VALUES[
      (isEn ? VOCAL_CHIPS_EN : VOCAL_CHIPS_RU).indexOf(label)
    ] ?? label.toLowerCase(),
    // value → localised label (for brief/ack display)
    moodLabel:   (value: string) => {
      const i = MOOD_VALUES.indexOf(value);
      return i >= 0 ? (isEn ? MOOD_CHIPS_EN : MOOD_CHIPS_RU)[i] : value;
    },
    tempoLabel:  (value: string) => {
      const i = TEMPO_VALUES.indexOf(value);
      return i >= 0 ? (isEn ? TEMPO_CHIPS_EN : TEMPO_CHIPS_RU)[i] : value;
    },
    vocalLabel:  (value: string) => {
      const i = VOCAL_VALUES.indexOf(value);
      return i >= 0 ? (isEn ? VOCAL_CHIPS_EN : VOCAL_CHIPS_RU)[i]
        : value === "no_vocal" ? (isEn ? "none" : "нет") : value;
    },
  };
}

// ─── Types ─────────────────────────────────────────────────────────────────

type WizardPhase = "free" | "lyrics_review" | "lyrics_confirm" | "genre" | "mood" | "tempo" | "vocal" | "confirm" | "ref_confirm";

interface WizardParams {
  lyrics: string;
  topic: string;       // what the track is about (songs) / SFX description
  genre: string;       // canonical GENRE_STYLES key
  customGenre: string; // free-typed genre that isn't a canonical key
  mood: string;
  tempo: string;
  vocal: string;
  era: string;         // from a reference track (e.g. "2010s")
  suggestedBpm: string; // from a reference track
  refTags: string[];   // Last.fm scene tags from a reference track
  // true only when the USER explicitly chose the value (chip / typed).
  // Classifier pre-fills mood/tempo but we still ask — the user either
  // confirms with a chip or types a new value; only then do we skip the step.
  moodConfirmed: boolean;
  tempoConfirmed: boolean;
  // Lyrics decision for songs — the agent NEVER generates text without the
  // user picking one of these first. "" = not asked yet, "write" = pre-write
  // via Suno + review, "ai" = let Suno write during generation, "instrumental"
  // = no words at all.
  lyricsDecision: "" | "write" | "ai" | "instrumental";
}

const EMPTY_WIZARD: WizardParams = {
  lyrics: "", topic: "", genre: "", customGenre: "", mood: "", tempo: "", vocal: "",
  era: "", suggestedBpm: "", refTags: [], moodConfirmed: false, tempoConfirmed: false,
  lyricsDecision: "",
};

// Editable copy of the finalized brief — lets the user tweak the core params
// before launch without another GPT round. Merged back into intent.params +
// musicParams on launch (the worker re-enriches server-side).
interface EditableBrief {
  description: string;
  genre: string;        // canonical key (from a chip)
  customGenre: string;  // free-typed genre
  mood: string;
  tempo: string;
  vocal: string;
  lyrics: string;       // Suno-written, user-approved lyrics (songs only)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractError(err: unknown): { message: string; is401: boolean } {
  if (err && typeof err === "object" && "status" in err && "detail" in err) {
    const e = err as { status: number; detail: string };
    return { message: e.detail, is401: e.status === 401 };
  }
  if (err instanceof Error) return { message: err.message, is401: false };
  const isEn = (i18next.resolvedLanguage ?? "ru").startsWith("en");
  return { message: isEn ? "Could not reach the assistant" : "Не удалось связаться с ассистентом", is401: false };
}

function hasLyrics(text: string): boolean {
  return /\[\s*(verse|chorus|bridge|outro|intro|pre.chorus|куплет|припев|проигрыш|бридж|финал)/i.test(text);
}

function extractLyrics(text: string): string {
  const start = text.search(/\[\s*(verse|chorus|bridge|outro|intro|pre.chorus|куплет|припев|проигрыш|бридж|финал)/i);
  if (start < 0) return text;
  let lyrics = text.slice(start).trim();
  // Drop trailing question paragraph
  const lastDouble = lyrics.lastIndexOf("\n\n");
  if (lastDouble > 0) {
    const tail = lyrics.slice(lastDouble).trim();
    if (tail.endsWith("?") || /подходит|хочешь|переписать|добавить|изменить/i.test(tail)) {
      lyrics = lyrics.slice(0, lastDouble).trim();
    }
  }
  return lyrics;
}

function AgentAvatar({ thinking }: { thinking?: boolean }) {
  return (
    <div className={`agent-chat__avatar-icon${thinking ? " agent-chat__avatar-icon--thinking" : ""}`}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="3" fill="var(--paper)" />
        <circle cx="8" cy="8" r="6" stroke="var(--paper)" strokeWidth="1.2" strokeOpacity="0.4" />
      </svg>
    </div>
  );
}

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const IconPencil = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);
const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 0 1 15.5-6.36L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.36L3 16M3 21v-5h5" />
  </svg>
);
const IconWarn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// ─── Props / result types ──────────────────────────────────────────────────

export interface AgentChatProps {
  onComplete?: (result: AgentResult) => void;
  onCancel: () => void;
  onLaunch?: (result: AgentResult) => void | Promise<void>;
  initialAnswer?: string;
  module?: AgentModuleKind;
  agentInitiates?: boolean;
  selectedGenre?: string;
  selectedMood?: string;
  selectedTempo?: string;
  selectedVocal?: string;
}

export interface AgentResult {
  summary: string;
  prompt: string;
  shortPrompt?: string;
  intent: AgentIntent | null;
  transcript?: AgentChatMessage[];
  musicParams?: Record<string, unknown>;
  researchNotes?: string;
  /** A/B-test stamps from the agent's last turn — echoed back on launch. */
  promptVersion?: string;
  model?: string;
}

interface UiMessage {
  id: string;
  role: "agent" | "user";
  text: string;
  suggestions?: string[];
  isLyricsMessage?: boolean; // marks the bubble that contains lyrics
}

// ─── Component ─────────────────────────────────────────────────────────────

export function AgentChat({
  onComplete,
  onCancel,
  onLaunch,
  initialAnswer,
  module = "song",
  selectedGenre = "",
  selectedMood = "",
  selectedTempo = "",
  selectedVocal = "",
  agentInitiates = false,
}: AgentChatProps) {
  const { i18n: i18nInst } = useTranslation();
  const chips = useWizardChips(i18nInst.resolvedLanguage ?? i18nInst.language ?? "ru");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [history, setHistory] = useState<AgentChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const isEn = (i18nInst.resolvedLanguage ?? "ru").startsWith("en");
  const [thinkingStatus, setThinkingStatus] = useState(isEn ? "Thinking…" : "Думаю…");
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);

  // Wizard state
  const [wizardPhase, setWizardPhase] = useState<WizardPhase>("free");
  const wizardParams = useRef<WizardParams>({ ...EMPTY_WIZARD });
  const lyricsGeneratedRef = useRef(false); // true once agent has drafted lyrics

  // Module the conversation is actually about — starts as the page's module,
  // then the classifier may re-route it (e.g. SFX request on the Song page).
  const [effectiveModule, setEffectiveModule] = useState<AgentModuleKind>(module);
  const effectiveModuleRef = useRef<AgentModuleKind>(module);
  useEffect(() => { effectiveModuleRef.current = effectiveModule; }, [effectiveModule]);
  // true once we've entered the scripted (no-GPT) wizard for this conversation
  const scriptedRef = useRef(false);
  // first user message — fallback description for SFX (prompt min_length=1)
  const firstUserMsgRef = useRef("");

  const [result, setResult] = useState<AgentResult | null>(null);

  // Brief editor (#2) — user can tweak the finalized params before launch.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editedBrief, setEditedBrief] = useState<EditableBrief | null>(null);
  // Inline lyrics editor (chat): non-null = the lyrics text being edited.
  const [editingLyrics, setEditingLyrics] = useState<string | null>(null);
  // Collapsible lyrics block inside the brief editor.
  const [briefLyricsOpen, setBriefLyricsOpen] = useState(false);

  // Seed the brief editor from the finalized result (and reset when the chat
  // re-opens for refinement). User edits live in `editedBrief`, not `result`.
  useEffect(() => {
    if (done && result?.intent) {
      const ip = result.intent.params ?? {};
      const mp = (result.musicParams ?? {}) as Record<string, unknown>;
      const str = (k: string) => (typeof mp[k] === "string" ? (mp[k] as string) : "");
      setEditedBrief({
        description: ip.description || result.prompt || "",
        genre: str("genre") || ip.genre || "",
        customGenre: str("custom_genre") || ip.custom_genre || "",
        mood: str("mood") || ip.mood || "",
        tempo: str("tempo") || ip.tempo || "",
        vocal: str("vocal") || ip.vocal || "",
        lyrics: ip.lyrics || wizardParams.current.lyrics || "",
      });
      setEditorOpen(false);
    } else if (!done) {
      setEditedBrief(null);
      setEditorOpen(false);
    }
  }, [done, result]);

  const thinkingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const thinkingTick = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bootedRef = useRef(false);
  const historyRef = useRef<AgentChatMessage[]>([]); // kept in sync with history state

  // Keep historyRef in sync so wizard handlers can read latest history
  useEffect(() => { historyRef.current = history; }, [history]);

  // ── thinking phases ──
  const startThinking = useCallback((lyricsPhase: boolean, isBootstrap: boolean) => {
    thinkingTimers.current.forEach(clearTimeout);
    thinkingTimers.current = [];
    if (thinkingTick.current) clearInterval(thinkingTick.current);
    setThinkingElapsed(0);
    const startTime = Date.now();
    thinkingTick.current = setInterval(() => {
      setThinkingElapsed(Math.round((Date.now() - startTime) / 1000));
    }, 1000);

    const phases = isBootstrap
      ? [
          { delay: 0,    text: isEn ? "Processing your message…"  : "Обрабатываю сообщение…" },
          { delay: 2000, text: isEn ? "Formulating a reply…"       : "Формулирую ответ…" },
        ]
      : lyricsPhase
      ? [
          { delay: 0,     text: isEn ? "Analysing the topic…"          : "Анализирую тему…" },
          { delay: 2500,  text: isEn ? "Writing the lyrics…"           : "Пишу текст песни…" },
          { delay: 7000,  text: isEn ? "Picking words and rhymes…"     : "Подбираю слова и рифмы…" },
          { delay: 14000, text: isEn ? "Refining the draft…"           : "Дорабатываю черновик…" },
          { delay: 22000, text: isEn ? "Almost done, just a bit more…" : "Почти готово, ещё немного…" },
        ]
      : [
          { delay: 0,     text: isEn ? "Analysing the request…"           : "Анализирую запрос…" },
          { delay: 2500,  text: isEn ? "Thinking about a response…"       : "Думаю над ответом…" },
          { delay: 6000,  text: isEn ? "Picking parameters…"              : "Подбираю параметры…" },
          { delay: 12000, text: isEn ? "Processing details…"              : "Обрабатываю детали…" },
          { delay: 20000, text: isEn ? "This is taking a bit longer than usual…" : "Это занимает немного больше обычного…" },
        ];

    phases.forEach(({ delay, text }) => {
      const t = setTimeout(() => setThinkingStatus(text), delay);
      thinkingTimers.current.push(t);
    });
  }, []);

  const stopThinking = useCallback(() => {
    thinkingTimers.current.forEach(clearTimeout);
    thinkingTimers.current = [];
    if (thinkingTick.current) { clearInterval(thinkingTick.current); thinkingTick.current = null; }
    setThinkingElapsed(0);
    setThinkingStatus(isEn ? "Thinking…" : "Думаю…");
  }, [isEn]);

  // ── scroll ──
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking, done]);

  // ── restore saved session (runs before bootstrap) ──
  useEffect(() => {
    const saved = loadAgentSession(module);
    if (saved?.messages?.length) {
      setMessages(saved.messages);
      const hist = saved.history ?? [];
      setHistory(hist);
      historyRef.current = hist;
      setWizardPhase((saved.wizardPhase as WizardPhase) ?? "free");
      wizardParams.current = { ...EMPTY_WIZARD, ...(saved.wizardParamsCurrent ?? {}) };
      if (saved.effectiveModule) {
        setEffectiveModule(saved.effectiveModule);
        effectiveModuleRef.current = saved.effectiveModule;
      }
      scriptedRef.current = saved.scripted ?? false;
      lyricsGeneratedRef.current = saved.lyricsGenerated ?? false;
      if (saved.done && saved.result) {
        setDone(true);
        setResult(saved.result);
      }
      bootedRef.current = true; // skip greeting — session already has messages
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── auto-save session on every message change ──
  useEffect(() => {
    if (messages.length === 0) return;
    saveAgentSession(module, {
      messages,
      history,
      wizardPhase,
      wizardParamsCurrent: wizardParams.current,
      effectiveModule,
      scripted: scriptedRef.current,
      lyricsGenerated: lyricsGeneratedRef.current,
      done,
      result,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, history, wizardPhase, done, result, effectiveModule]);

  // ── bootstrap ──
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const seed = (initialAnswer ?? "").trim();
    if (agentInitiates && !seed) {
      (async () => {
        setThinking(true);
        startThinking(false, true);
        try {
          const opening = await agentChat({
            module, messages: [],
            selected_genre: selectedGenre, selected_mood: selectedMood,
            selected_tempo: selectedTempo, selected_vocal: selectedVocal,
          });
          const openingMsg: UiMessage = {
            id: "agent-0", role: "agent", text: opening.reply,
            suggestions: opening.suggestions?.length ? opening.suggestions : undefined,
          };
          setMessages([openingMsg]);
          setHistory([{ role: "agent", content: opening.reply }]);
        } catch (err) {
          const { message, is401 } = extractError(err);
          setNeedsAuth(is401);
          setError(is401 ? (isEn ? "Sign in to use the agent" : "Войдите в аккаунт чтобы использовать агента") : message);
        } finally {
          setThinking(false);
          stopThinking();
        }
      })();
    } else if (seed) {
      appendUserMessage(seed);
      void classifyAndRoute(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentInitiates]);

  // ── Local wizard helpers ──

  function addLocalPair(
    userText: string,
    agentText: string,
    agentSuggestions?: string[],
  ) {
    const now = Date.now();
    const uMsg: UiMessage = { id: `u-${now}`, role: "user", text: userText };
    const aMsg: UiMessage = {
      id: `a-${now + 1}`, role: "agent", text: agentText,
      suggestions: agentSuggestions,
    };
    setMessages((prev) => [...prev, uMsg, aMsg]);
    setHistory((prev) => {
      const next = [
        ...prev,
        { role: "user" as const, content: userText },
        { role: "agent" as const, content: agentText },
      ];
      historyRef.current = next;
      return next;
    });
  }

  function appendUserMessage(text: string) {
    const id = `u-${Date.now()}`;
    setMessages((prev) => [...prev, { id, role: "user", text }]);
    setHistory((prev) => {
      const next = [...prev, { role: "user" as const, content: text }];
      historyRef.current = next;
      return next;
    });
  }

  function pushAgentMessage(text: string) {
    const id = `a-${Date.now()}`;
    setMessages((prev) => [...prev, { id, role: "agent", text }]);
    setHistory((prev) => {
      const next = [...prev, { role: "agent" as const, content: text }];
      historyRef.current = next;
      return next;
    });
  }

  // ── Classify-first routing ──
  // The first user message hits the cheap gpt-4o-mini classifier; clear,
  // parametric requests enter the scripted (no-GPT) wizard, everything
  // nuanced (vague / artist refs / custom lyrics / niche genre / image /
  // occasion / cover) falls through to the full streaming GPT flow. If the
  // classify endpoint is unavailable we degrade gracefully to the GPT flow.
  async function classifyAndRoute(text: string) {
    firstUserMsgRef.current = text;
    setThinking(true);
    setError(null);
    startThinking(false, true);

    let cls: Awaited<ReturnType<typeof classifyAgent>> | null = null;
    try {
      cls = await classifyAgent({ message: text, module_hint: module });
    } catch (err) {
      const { is401 } = extractError(err);
      if (is401) {
        setNeedsAuth(true);
        setError(isEn ? "Sign in to use the agent" : "Войдите в аккаунт чтобы использовать агента");
        setThinking(false);
        stopThinking();
        return;
      }
      cls = null; // endpoint missing / errored → GPT fallback below
    }
    setThinking(false);
    stopThinking();

    if (!cls) {
      await sendInternal(text, historyRef.current, { alreadyAppended: true });
      return;
    }

    // Pre-fill any slots the classifier already extracted.
    const s = cls.slots;
    wizardParams.current.genre = s.genre || "";
    wizardParams.current.mood = s.mood || "";
    wizardParams.current.tempo = s.tempo || "";
    wizardParams.current.vocal = s.vocal || "";
    wizardParams.current.topic = s.topic || "";
    wizardParams.current.era = cls.era || "";
    wizardParams.current.suggestedBpm = cls.suggested_bpm || "";
    wizardParams.current.refTags = cls.reference?.tags || [];
    setEffectiveModule(cls.module);
    effectiveModuleRef.current = cls.module;

    // Perplexity found a candidate but is not confident / name is ambiguous —
    // ask the user to confirm before committing anything.
    if (cls.reference_uncertain && cls.reference_note) {
      pushAgentMessage(
        isEn
          ? `🔎 Found a candidate: ${cls.reference_note}\nIs that the right artist? Confirm or paste a direct link.`
          : `🔎 Нашёл кандидата: ${cls.reference_note}\nЭто тот самый артист? Подтверди или скинь прямую ссылку.`,
      );
      setWizardPhase("ref_confirm");
      return;
    }

    // A resolved reference track gives real BPM/genre/era — show it and
    // treat the request as scriptable even if the user named an artist.
    const hasReference = !!cls.reference && !!(cls.reference.artist || cls.reference.title);
    if (hasReference && cls.reference) {
      const r = cls.reference;
      const bits = [
        r.bpm > 0 ? `~${Math.round(r.bpm)} BPM` : "",
        r.genre || "",
        r.year > 0 ? String(r.year) : "",
      ].filter(Boolean).join(" · ");
      const tagLine = r.tags?.length ? `\n${isEn ? "Tags" : "Теги"}: ${r.tags.join(", ")}` : "";
      const sourceLabel = r.source === "perplexity" ? " · web" : "";
      pushAgentMessage(
        `${isEn ? "🎯 Reference" : "🎯 Референс"}: ${[r.artist, r.title].filter(Boolean).join(" — ")}` +
        (bits ? ` · ${bits}` : "") + sourceLabel +
        `. ${isEn ? "Tuned the parameters to it." : "Подобрал параметры под него."}` +
        tagLine,
      );
    }

    const scriptable =
      cls.module === "song" || cls.module === "instrumental" || cls.module === "sound_effect";
    const needsGpt =
      cls.too_vague || (cls.artist_ref && !hasReference);

    if (scriptable && !needsGpt) {
      enterScriptedWizard();
    } else {
      await sendInternal(text, historyRef.current, { alreadyAppended: true });
    }
  }

  // Module → ordered list of scripted slots to collect via chips.
  function moduleSequence(m: AgentModuleKind): WizardPhase[] {
    if (m === "instrumental") return ["genre", "mood", "tempo"];
    if (m === "song" || m === "occasion") return ["genre", "mood", "tempo", "vocal"];
    return []; // sound_effect / cover_* — nothing to ask
  }

  // First unfilled slot after `current` (null = start), skipping slots the
  // classifier already filled. "finalize" when nothing is left to ask.
  function nextScriptedPhase(current: WizardPhase | null): WizardPhase | "finalize" {
    const seq = moduleSequence(effectiveModuleRef.current);
    const p = wizardParams.current;
    const filled = (slot: WizardPhase) =>
      slot === "genre" ? !!(p.genre || p.customGenre)
        // mood/tempo: only skip when the USER explicitly confirmed (chip/typed).
        // Classifier pre-fills them, but we still want to ask so the user can
        // adjust or confirm — avoids "the agent decided for me" confusion.
        : slot === "mood" ? p.moodConfirmed
        : slot === "tempo" ? p.tempoConfirmed
        : slot === "vocal" ? !!p.vocal
        : false;
    const start = current === null ? 0 : seq.indexOf(current) + 1;
    for (let i = start; i < seq.length; i++) {
      if (!filled(seq[i])) return seq[i];
    }
    return "finalize";
  }

  function questionFor(phase: WizardPhase): string {
    const p = wizardParams.current;
    switch (phase) {
      case "genre": return isEn ? "Which genre?" : "Какой жанр?";
      case "mood": {
        const hint = p.mood ? (isEn ? ` (auto: ${chips.moodLabel(p.mood)})` : ` (авто: ${chips.moodLabel(p.mood)})`) : "";
        return isEn ? `What mood?${hint}` : `Какое настроение?${hint}`;
      }
      case "tempo": {
        const hint = p.tempo
          ? (isEn ? ` (auto: ${chips.tempoLabel(p.tempo)}${p.suggestedBpm ? `, ~${p.suggestedBpm} BPM` : ""})` : ` (авто: ${chips.tempoLabel(p.tempo)}${p.suggestedBpm ? `, ~${p.suggestedBpm} BPM` : ""})`)
          : "";
        return isEn ? `Tempo?${hint}` : `Какой темп?${hint}`;
      }
      case "vocal": return isEn ? "Vocals?" : "Какой вокал?";
      default: return "";
    }
  }

  function recognizedSummary(): string {
    const p = wizardParams.current;
    const got: string[] = [];
    if (p.genre || p.customGenre) got.push(p.customGenre || p.genre);
    if (p.mood) got.push(chips.moodLabel(p.mood));
    if (p.tempo) got.push(chips.tempoLabel(p.tempo));
    if (got.length) return (isEn ? "Got it: " : "Принято: ") + got.join(", ") + ".";
    return isEn ? "Got it!" : "Принято!";
  }

  // Enter the scripted wizard: ask the first unfilled slot, or finalize
  // immediately when the classifier already supplied everything.
  function enterScriptedWizard() {
    scriptedRef.current = true;
    const first = nextScriptedPhase(null);
    if (first === "finalize") {
      // SFX has nothing to ask — build straight away. For music where the
      // classifier/reference already filled everything, confirm before building
      // instead of silently finalizing (so the user can adjust first).
      if (effectiveModuleRef.current === "sound_effect") {
        pushAgentMessage(isEn ? "Got it — building the prompt…" : "Принято — собираю промт…");
        finalizeDeterministic();
      } else {
        pushAgentMessage(
          `${recognizedSummary()} ${isEn ? "Build the brief, or adjust something?" : "Собрать бриф — или что-то поправить?"}`,
        );
        setWizardPhase("confirm");
      }
      return;
    }
    pushAgentMessage(`${recognizedSummary()} ${questionFor(first)}`);
    setWizardPhase(first);
  }

  // Advance the scripted wizard after a slot was answered (chip or free text).
  function advanceAfterSlot(answerLabel: string, currentPhase: WizardPhase) {
    const next = nextScriptedPhase(currentPhase);
    if (next === "finalize") {
      if (scriptedRef.current) {
        addLocalPair(answerLabel, isEn ? "Building the prompt…" : "Собираю промт…");
        finalizeDeterministic();
      } else {
        void gptFinalize(answerLabel);
      }
      return;
    }
    addLocalPair(answerLabel, questionFor(next));
    setWizardPhase(next);
  }

  // Build music_params + intent fully on the client — no GPT. The worker still
  // runs build_suno_style + enrich_music_prompt server-side from the canonical
  // genre/mood/tempo, so prompt quality is preserved.
  function finalizeDeterministic() {
    const p = wizardParams.current;
    const m = effectiveModuleRef.current;

    // Song without lyrics yet: NEVER auto-write text. Ask the user first what
    // they want (decision saved in p.lyricsDecision):
    //   "write" → pre-write via Suno + review in chat
    //   "ai"    → let Suno write the words during music generation (no review)
    //   ""      → not asked yet → show the lyrics_confirm chips and stop here
    if (m === "song" && !p.lyrics) {
      if (p.lyricsDecision === "write") {
        void runSunoLyrics();
        return;
      }
      if (p.lyricsDecision !== "ai") {
        setWizardPhase("lyrics_confirm");
        pushAgentMessage(
          isEn
            ? "Want me to write the lyrics for you to review, let Suno write them, or make it instrumental (no words)?"
            : "Написать текст песни (покажу на проверку), пусть Suno сама сочинит, или сделать инструментал без слов?",
        );
        return;
      }
      // "ai" → fall through; text_mode is set to "ai" below and Suno writes
      // the words during generation.
    }

    // Reference scene-tags (post-hardcore, progressive metal…) become the custom
    // genre so the worker LEADS the style with them, not the broad "rock". Mirrors
    // the manual flow (typing tags into the genre field), which routes via the
    // top-level custom_genre and works perfectly — agent_music_params can drop.
    const refGenre = p.refTags.slice(0, 5).join(", ");
    const customGenre = p.customGenre || refGenre;

    const musicParams: Record<string, unknown> = {};
    if (p.genre) musicParams.genre = p.genre;
    if (customGenre) musicParams.custom_genre = customGenre;
    if (p.mood) musicParams.mood = p.mood;
    if (p.tempo) musicParams.tempo = p.tempo;
    if (m === "instrumental") musicParams.vocal = "no_vocal";
    else if (p.vocal) musicParams.vocal = p.vocal;
    // Reference-track enrichment (Deezer) — feeds SongParams.era / suggested_bpm.
    if (p.era) musicParams.era = p.era;
    if (p.suggestedBpm) musicParams.suggested_bpm = p.suggestedBpm;
    if (refGenre) musicParams.subgenre = refGenre;

    const topic = p.topic.trim();
    const params: AgentIntentParams = {};
    if (m === "sound_effect") {
      params.description = topic || firstUserMsgRef.current || "ambient";
    } else {
      params.description = topic;
      if (p.genre) params.genre = p.genre;
      if (customGenre) params.custom_genre = customGenre;
      if (p.mood) params.mood = p.mood;
      if (p.tempo) params.tempo = p.tempo;
      if (m === "song") {
        params.vocal = p.vocal;
        if (p.lyrics) {
          params.lyrics = p.lyrics;
          params.text_mode = "custom"; // Suno-written, user-approved lyrics
        } else {
          params.text_mode = "ai";
        }
      }
    }

    const intent: AgentIntent = {
      module: m,
      confidence: "high",
      params,
      note: buildNote(),
    };
    const summary = buildSummary();
    const researchNotes = p.refTags.length
      ? `Reference style tags (Last.fm): ${p.refTags.join(", ")}. Reflect these subgenres in the instrumentation, rhythm and production.`
      : "";
    setResult({
      summary,
      prompt: topic,
      shortPrompt: summary,
      intent,
      musicParams,
      researchNotes,
      promptVersion: "v3.1-scripted",
      model: "scripted",
    });
    setDone(true);
    setWizardPhase("free");
  }

  function buildSummary(): string {
    const p = wizardParams.current;
    const m = effectiveModuleRef.current;
    const lines = [`${isEn ? "Module" : "Модуль"}: ${moduleLabel(m)}`];
    if (m === "sound_effect") {
      lines.push(`${isEn ? "Description" : "Описание"}: ${p.topic || firstUserMsgRef.current || "—"}`);
      return lines.join("\n");
    }
    if (p.topic) lines.push(`${isEn ? "Topic" : "Тема"}: ${p.topic}`);
    const g = p.customGenre || p.genre;
    lines.push(`${isEn ? "Genre" : "Жанр"}: ${g || (isEn ? "agent's pick" : "на выбор агента")}`);
    if (p.mood) lines.push(`${isEn ? "Mood" : "Настроение"}: ${chips.moodLabel(p.mood)}`);
    if (p.tempo) lines.push(`${isEn ? "Tempo" : "Темп"}: ${chips.tempoLabel(p.tempo)}`);
    if (m === "instrumental") lines.push(`${isEn ? "Vocals" : "Вокал"}: ${isEn ? "none" : "нет"}`);
    else if (m === "song") {
      lines.push(`${isEn ? "Vocals" : "Вокал"}: ${p.vocal ? chips.vocalLabel(p.vocal) : (isEn ? "AI decides" : "на выбор")}`);
      lines.push(`${isEn ? "Lyrics" : "Текст"}: ${isEn ? "AI-written" : "пишет ИИ"}`);
    }
    return lines.join("\n");
  }

  function buildNote(): string {
    const p = wizardParams.current;
    const m = effectiveModuleRef.current;
    const g = p.customGenre || p.genre || (isEn ? "a fitting genre" : "подходящий жанр");
    const moodPart = p.mood ? `, ${chips.moodLabel(p.mood)}` : "";
    return isEn
      ? `I'll launch ${moduleLabel(m)} — ${g}${moodPart}. Tweak below if anything's off.`
      : `Запущу: ${moduleLabel(m).toLowerCase()} — ${g}${moodPart}. Поправь ниже, если что-то не так.`;
  }

  // Legacy GPT finalize — used only on the GPT path (scripted=false), e.g.
  // after the user accepted custom lyrics drafted by the model.
  async function gptFinalize(lastAnswerLabel: string) {
    const buildingMsg = isEn ? "Building the final prompt…" : "Собираю финальный промт…";
    const now = Date.now();
    const uMsg: UiMessage = { id: `u-${now}`, role: "user", text: lastAnswerLabel };
    const thinkMsg: UiMessage = { id: `a-${now + 1}`, role: "agent", text: buildingMsg };
    setMessages((prev) => [...prev, uMsg, thinkMsg]);
    const nextHistory: AgentChatMessage[] = [
      ...historyRef.current,
      { role: "user", content: lastAnswerLabel },
      { role: "agent", content: buildingMsg },
    ];
    setHistory(nextHistory);
    historyRef.current = nextHistory;

    const p = wizardParams.current;
    const finalizeMsg =
      `Финализируй. Все параметры собраны: ` +
      (p.customGenre || p.genre ? `жанр=${p.customGenre || p.genre}, ` : "") +
      `настроение=${p.mood || "energetic"}, темп=${p.tempo || "medium"}, вокал=${p.vocal || "male"}. ` +
      `Текст утверждён (custom). Запускай с done=true.`;

    await sendInternal(finalizeMsg, nextHistory, { isFinalize: true });
  }

  // ── Suno-written lyrics (songs) ──────────────────────────────────────────
  // The brief is collected with chips; for a song we then ask Suno's /lyrics
  // endpoint to WRITE the text (Russian) and the user approves / regenerates /
  // edits it in chat before the brief is built. No GPT lyric drafting → no
  // chatty appendix leaking into the prompt.
  async function runSunoLyrics() {
    const p = wizardParams.current;
    setWizardPhase("lyrics_review");
    setEditingLyrics(null);
    setThinking(true);
    startThinking(true, false);
    try {
      const { task_id } = await createLyricsDraft({
        topic: p.topic || firstUserMsgRef.current || p.customGenre || p.genre || "песня",
        genre: p.customGenre || p.genre || "",
        mood: p.mood || "",
        tempo: p.tempo || "",
        vocal: p.vocal || "",
        language: "ru",
      });
      let lyrics = "";
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await fetchLyricsDraft(task_id);
        if (res.status === "completed" && res.lyrics) { lyrics = res.lyrics; break; }
        if (res.status === "failed") throw new Error(res.error || "lyrics failed");
      }
      setThinking(false);
      stopThinking();
      if (!lyrics) {
        pushAgentMessage(isEn ? "Suno is still writing — tap “Build brief” to retry." : "Suno ещё пишет — нажми «Собрать бриф», чтобы повторить.");
        setWizardPhase("confirm");
        return;
      }
      wizardParams.current.lyrics = lyrics;
      lyricsGeneratedRef.current = true;
      pushAgentMessage(isEn ? "Suno wrote the lyrics 👇 Accept, regenerate or edit." : "Suno написала текст 👇 Прими, перегенерируй или поправь.");
      setMessages((prev) => [
        ...prev,
        { id: `lyr-${Date.now()}`, role: "agent", text: lyrics, isLyricsMessage: true },
      ]);
    } catch {
      setThinking(false);
      stopThinking();
      wizardParams.current.lyrics = "";
      pushAgentMessage(isEn ? "Couldn't get lyrics from Suno. Tap “Build brief” to retry." : "Не удалось получить текст от Suno. Нажми «Собрать бриф», чтобы повторить.");
      setWizardPhase("confirm");
    }
  }

  // Accept the Suno lyrics → build the brief (text_mode=custom).
  function handleAcceptLyrics() {
    addLocalPair(
      isEn ? "Accept lyrics" : "Принимаю текст",
      isEn ? "Building the brief…" : "Собираю бриф…",
    );
    finalizeDeterministic();
  }

  // Ask Suno for another version of the lyrics.
  function handleRegenerateLyrics() {
    addLocalPair(
      isEn ? "Regenerate" : "Перегенерировать",
      isEn ? "Asking Suno for another version…" : "Прошу у Suno другой вариант…",
    );
    wizardParams.current.lyrics = "";
    void runSunoLyrics();
  }

  // Open / save the inline lyrics editor.
  function handleEditLyrics() {
    setEditingLyrics(wizardParams.current.lyrics || "");
  }

  function saveEditedLyrics() {
    if (editingLyrics === null) return;
    const v = editingLyrics.trim();
    wizardParams.current.lyrics = v;
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].isLyricsMessage) {
          const copy = [...prev];
          copy[i] = { ...copy[i], text: v };
          return copy;
        }
      }
      return prev;
    });
    setEditingLyrics(null);
  }

  function handleGenreSelect(value: string, label: string) {
    wizardParams.current.genre = value;
    wizardParams.current.customGenre = "";
    advanceAfterSlot(label, "genre");
  }

  // Free-typed genre answer (e.g. "phonk, drum and bass, neurofunk"). Stored
  // verbatim as custom_genre (up to 5 styles) — the worker enriches it into a
  // full style description. No re-classification → no "name it twice" stall.
  function handleGenreText(text: string) {
    const genres = text
      .split(/[,;/]|\bи\b|\band\b|·|\+/i)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    const joined = genres.join(", ") || text.trim();
    wizardParams.current.genre = "";
    wizardParams.current.customGenre = joined;
    advanceAfterSlot(joined, "genre");
  }

  // Lyrics-confirm chips — the agent only writes text after the user picks one.
  function handleLyricsWrite() {
    wizardParams.current.lyricsDecision = "write";
    addLocalPair(
      isEn ? "Write the lyrics" : "Напиши текст",
      isEn ? "Writing the lyrics with Suno…" : "Пишу текст через Suno…",
    );
    void runSunoLyrics();
  }
  function handleLyricsAuto() {
    wizardParams.current.lyricsDecision = "ai";
    addLocalPair(
      isEn ? "Let Suno write" : "Пусть Suno сочинит",
      isEn ? "Building the prompt…" : "Собираю промт…",
    );
    finalizeDeterministic();
  }
  function handleLyricsInstrumental() {
    wizardParams.current.lyricsDecision = "instrumental";
    handleNoVocal();
  }

  function handleMoodSelect(mood: string) {
    wizardParams.current.mood = chips.moodValue(mood);
    wizardParams.current.moodConfirmed = true;
    advanceAfterSlot(mood, "mood");
  }

  function handleTempoSelect(tempo: string) {
    wizardParams.current.tempo = chips.tempoValue(tempo);
    wizardParams.current.tempoConfirmed = true;
    advanceAfterSlot(tempo, "tempo");
  }

  function handleVocalSelect(vocal: string) {
    wizardParams.current.vocal = chips.vocalValue(vocal);
    advanceAfterSlot(vocal, "vocal");
  }

  // "No vocals" turns the song into an instrumental — keeps every collected
  // param (genre/mood/tempo/reference), just drops the vocal + lyrics path.
  // A chip (not free text) so nothing gets re-classified and lost.
  function handleNoVocal() {
    addLocalPair(
      isEn ? "No vocals" : "Без вокала",
      isEn ? "Building the prompt…" : "Собираю промт…",
    );
    setEffectiveModule("instrumental");
    effectiveModuleRef.current = "instrumental";
    wizardParams.current.vocal = "no_vocal";
    wizardParams.current.lyrics = "";
    finalizeDeterministic();
  }

  // Free-typed text mid-wizard is NOT a blind slot answer — re-interpret it.
  // Re-classify (cheap, also resolves Deezer references): a new reference or
  // new params get merged and we re-ask what's missing; anything the classifier
  // can't turn into params is a real message → hand to GPT. Never auto-finalizes.
  async function refineFromText(text: string) {
    setThinking(true);
    setError(null);
    startThinking(false, true);
    let cls: Awaited<ReturnType<typeof classifyAgent>> | null = null;
    try {
      cls = await classifyAgent({ message: text, module_hint: effectiveModuleRef.current });
    } catch (err) {
      const { is401 } = extractError(err);
      if (is401) {
        setNeedsAuth(true);
        setError(isEn ? "Sign in to use the agent" : "Войдите в аккаунт чтобы использовать агента");
        setThinking(false);
        stopThinking();
        return;
      }
      cls = null;
    }
    setThinking(false);
    stopThinking();

    if (!cls) {
      await sendInternal(text, historyRef.current, { alreadyAppended: true });
      return;
    }

    // Perplexity found a candidate but is not confident — ask before committing.
    if (cls.reference_uncertain && cls.reference_note) {
      pushAgentMessage(
        isEn
          ? `🔎 Found a candidate: ${cls.reference_note}\nIs that the right artist? Confirm or paste a direct link.`
          : `🔎 Нашёл кандидата: ${cls.reference_note}\nЭто тот самый артист? Подтверди или скинь ссылку.`,
      );
      setWizardPhase("ref_confirm");
      return;
    }

    const p = wizardParams.current;
    const ref = cls.reference && (cls.reference.artist || cls.reference.title) ? cls.reference : null;
    let changed = false;

    if (ref) {
      if (cls.slots.genre) { p.genre = cls.slots.genre; p.customGenre = ""; }
      if (cls.slots.tempo) p.tempo = cls.slots.tempo;
      if (cls.era) p.era = cls.era;
      if (cls.suggested_bpm) p.suggestedBpm = cls.suggested_bpm;
      p.refTags = ref.tags || [];
      const bits = [
        ref.bpm > 0 ? `~${Math.round(ref.bpm)} BPM` : "",
        ref.genre || "",
        ref.year > 0 ? String(ref.year) : "",
      ].filter(Boolean).join(" · ");
      pushAgentMessage(
        `${isEn ? "🎯 Reference" : "🎯 Референс"}: ${[ref.artist, ref.title].filter(Boolean).join(" — ")}` +
        (bits ? ` · ${bits}` : "") + `. ${isEn ? "Using it as the basis." : "Беру за основу."}`,
      );
      changed = true;
    } else {
      if (cls.slots.genre) { p.genre = cls.slots.genre; p.customGenre = ""; changed = true; }
      if (cls.slots.mood) { p.mood = cls.slots.mood; p.moodConfirmed = true; changed = true; }
      if (cls.slots.tempo) { p.tempo = cls.slots.tempo; p.tempoConfirmed = true; changed = true; }
      if (cls.slots.vocal) { p.vocal = cls.slots.vocal; changed = true; }
      if (cls.slots.topic) { p.topic = cls.slots.topic; changed = true; }
      const m = cls.module;
      if ((m === "song" || m === "instrumental" || m === "sound_effect") && m !== effectiveModuleRef.current) {
        setEffectiveModule(m);
        effectiveModuleRef.current = m;
        changed = true;
      }
    }

    // Nothing parametric in the message → it's a real question/instruction → GPT.
    if (!changed) {
      await sendInternal(text, historyRef.current, { alreadyAppended: true });
      return;
    }

    // Re-ask what's still missing, or offer to build — but never auto-finalize.
    const next = nextScriptedPhase(null);
    if (next === "finalize") {
      pushAgentMessage(isEn ? "Anything else, or shall I build the brief?" : "Что-то ещё уточнить — или собрать бриф?");
      setWizardPhase("confirm");
    } else {
      pushAgentMessage(`${recognizedSummary()} ${questionFor(next)}`);
      setWizardPhase(next);
    }
  }

  // ── Main GPT send ──

  async function sendInternal(
    text: string,
    baseHistory: AgentChatMessage[],
    opts: { isFinalize?: boolean; alreadyAppended?: boolean } = {},
  ) {
    const { isFinalize = false, alreadyAppended = false } = opts;

    // `alreadyAppended` — the caller already pushed the user turn into the UI +
    // history (classify-first path). `isFinalize` — synthetic prompt, no UI echo.
    if (!isFinalize && !alreadyAppended) {
      const userMsg: UiMessage = { id: `u-${Date.now()}`, role: "user", text };
      setMessages((prev) => [...prev, userMsg]);
    }

    let nextHistory: AgentChatMessage[];
    if (alreadyAppended) {
      nextHistory = baseHistory;
    } else {
      nextHistory = [...baseHistory, { role: "user", content: text }];
      if (!isFinalize) {
        setHistory(nextHistory);
        historyRef.current = nextHistory;
      }
    }

    setThinking(true);
    setError(null);

    // Only show lyrics-phase ("Пишу текст…") when the agent has ALREADY drafted
    // lyrics in this thread — predicting from the user's wording produced false
    // positives (any «текст / напиши» triggered the lyrics phase even for plain
    // chitchat).
    const historyHasLyricsAlready = !lyricsGeneratedRef.current && nextHistory.some(
      (m) => m.role === "agent" && hasLyrics(m.content)
    );
    startThinking(historyHasLyricsAlready, false);

    const p = wizardParams.current;
    try {
      const chatReq = {
        module: effectiveModuleRef.current,
        messages: nextHistory,
        // Always feed the classifier-extracted canonical slots so the GPT path
        // builds on the same parameters the scripted path would.
        selected_genre: p.customGenre || p.genre || selectedGenre,
        selected_mood: p.mood || selectedMood,
        selected_tempo: p.tempo || selectedTempo,
        selected_vocal: p.vocal || selectedVocal,
      };

      // Streaming-first: open SSE, append reply deltas to a placeholder
      // message as they arrive, then finalize on `complete`. Falls back
      // to the one-shot endpoint on any stream error so the user always
      // gets a response.
      let resp: AgentChatResponse | null = null;
      let streamedSomething = false;
      const placeholderId = `agent-${Date.now()}`;
      try {
        for await (const ev of streamAgentChat(chatReq)) {
          if (ev.type === "reply") {
            if (!streamedSomething) {
              // First delta — drop the thinking spinner and inject an
              // empty agent bubble we can append into.
              stopThinking();
              setThinking(false);
              setMessages((prev) => [
                ...prev,
                { id: placeholderId, role: "agent", text: "" },
              ]);
              streamedSomething = true;
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === placeholderId ? { ...m, text: m.text + ev.delta } : m,
              ),
            );
          } else if (ev.type === "complete") {
            resp = ev.data;
          } else if (ev.type === "error") {
            // bubble up to outer catch via throw — triggers the fallback
            throw new Error(ev.detail);
          }
        }
      } catch {
        // Stream errored mid-flight or refused to start. Fall back to the
        // classic one-shot endpoint so the conversation still progresses.
        resp = await agentChat(chatReq);
        // Strip the partial placeholder so we don't end up with two agent
        // bubbles when the fallback succeeds.
        if (streamedSomething) {
          setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
          streamedSomething = false;
        }
      }
      if (!resp) {
        throw new Error("agent: no complete event received");
      }

      // Detect lyrics in this response
      const containsLyrics = hasLyrics(resp.reply);
      if (containsLyrics && !lyricsGeneratedRef.current) {
        lyricsGeneratedRef.current = true;
        wizardParams.current.lyrics = extractLyrics(resp.reply);
        setWizardPhase("lyrics_review");
      } else if (wizardPhase === "lyrics_review" || isFinalize) {
        // After lyrics phase or finalize — keep wizard phase state, don't reset
      } else {
        // Still in free mode — suggestions come from GPT normally
      }

      const finalSuggestions =
        wizardPhase === "free" && !containsLyrics && resp.suggestions?.length
          ? resp.suggestions
          : undefined;
      if (streamedSomething) {
        // Stream already painted the bubble — just patch the final text
        // (in case the stream truncated mid-escape) and attach metadata.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? {
                  ...m,
                  text: resp!.reply,
                  suggestions: finalSuggestions,
                  isLyricsMessage: containsLyrics,
                }
              : m,
          ),
        );
      } else {
        const replyMsg: UiMessage = {
          id: `agent-${Date.now()}`,
          role: "agent",
          text: resp.reply,
          suggestions: finalSuggestions,
          isLyricsMessage: containsLyrics,
        };
        setMessages((prev) => [...prev, replyMsg]);
      }

      const finalHistory: AgentChatMessage[] = [
        ...nextHistory,
        { role: "agent", content: resp.reply },
      ];
      setHistory(finalHistory);
      historyRef.current = finalHistory;

      if (resp.done && resp.prompt) {
        // Merge wizard-collected lyrics into intent params
        const intent = resp.intent ?? null;
        if (intent && wizardParams.current.lyrics) {
          intent.params.lyrics = wizardParams.current.lyrics;
          intent.params.text_mode = "custom";
        }
        setResult({
          summary: resp.summary, prompt: resp.prompt,
          shortPrompt: resp.short_prompt, intent,
          musicParams: resp.music_params, researchNotes: resp.research_notes,
          promptVersion: resp.prompt_version, model: resp.model,
        });
        setDone(true);
        setWizardPhase("free");
      }
    } catch (err) {
      const { message, is401 } = extractError(err);
      setNeedsAuth(is401);
      setError(is401 ? "Войдите в аккаунт чтобы использовать агента" : message);
    } finally {
      setThinking(false);
      stopThinking();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || thinking || done) return;
    setDraft("");

    // Genre phase: typed text IS the genre answer (one or several styles).
    // Take it verbatim as custom_genre and advance — no re-classification, so
    // multi-genre answers never bounce the user back to "name your genre again".
    if (wizardPhase === "genre" && scriptedRef.current) {
      appendUserMessage(text);
      handleGenreText(text);
      return;
    }

    // ref_confirm: user typed a correction or pasted a link — re-classify it.
    if (wizardPhase === "ref_confirm") {
      setWizardPhase("free");
      appendUserMessage(text);
      await classifyAndRoute(text);
      return;
    }

    // Typed text mid-wizard is a message, not a blind slot answer. In the
    // scripted path re-interpret it (refineFromText); in the GPT path just
    // converse. Chips remain the instant scripted route.
    if (
      wizardPhase === "mood" || wizardPhase === "tempo" ||
      wizardPhase === "vocal" || wizardPhase === "confirm"
    ) {
      appendUserMessage(text);
      if (scriptedRef.current) await refineFromText(text);
      else await sendInternal(text, historyRef.current, { alreadyAppended: true });
      return;
    }

    // If user types freely while in lyrics_review, treat as edit request → reset to free
    if (wizardPhase === "lyrics_review") setWizardPhase("free");

    await routeUserText(text);
  }

  // The very first user message routes through the classifier (cheap, one
  // call), which decides scripted-wizard vs full GPT flow; later turns go
  // straight to the GPT conversation.
  async function routeUserText(text: string) {
    const isFirstUserTurn = !historyRef.current.some((m) => m.role === "user");
    if (isFirstUserTurn) {
      appendUserMessage(text);
      await classifyAndRoute(text);
      return;
    }
    await sendInternal(text, historyRef.current);
  }

  function isMusicModule(m?: AgentModuleKind) {
    return m === "song" || m === "instrumental" || m === "occasion";
  }

  // Merge the user's brief edits back into both intent.params and musicParams
  // (the worker prefers musicParams.genre, so they must stay in sync).
  function applyBriefEdits(r: AgentResult): AgentResult {
    const e = editedBrief;
    if (!e || !r.intent) return r;
    const params: AgentIntentParams = { ...r.intent.params, description: e.description };
    const mp: Record<string, unknown> = { ...(r.musicParams ?? {}) };
    if (isMusicModule(r.intent.module)) {
      const isInstr = r.intent.module === "instrumental";
      params.genre = e.genre;
      params.custom_genre = e.customGenre;
      params.mood = e.mood;
      params.tempo = e.tempo;
      params.vocal = isInstr ? "" : e.vocal;
      mp.genre = e.genre;
      mp.custom_genre = e.customGenre;
      mp.mood = e.mood;
      mp.tempo = e.tempo;
      mp.vocal = isInstr ? "no_vocal" : e.vocal;
      if (!isInstr && e.lyrics) {
        params.lyrics = e.lyrics;
        params.text_mode = "custom";
      }
    }
    return { ...r, intent: { ...r.intent, params }, musicParams: mp, prompt: e.description || r.prompt };
  }

  // Brief lines for display — derived from the (possibly edited) brief so the
  // card always reflects what will actually launch.
  function briefLines(): string[] {
    const e = editedBrief;
    const m = result?.intent?.module;
    if (!e || !m) return [];
    if (!isMusicModule(m)) {
      return [`${isEn ? "Description" : "Описание"}: ${e.description || "—"}`];
    }

    const shortWords = (s: string, n = 25) => {
      const w = s.trim().split(/\s+/);
      return w.length <= n ? s.trim() : w.slice(0, n).join(" ") + "…";
    };
    const mp = (result?.musicParams ?? {}) as Record<string, unknown>;
    const lines: string[] = [];

    // 1. Жанр — все выбранные (не ограничиваем 3)
    const gRaw = e.customGenre || e.genre;
    const g = gRaw ? gRaw.split(",").map((x) => x.trim()).filter(Boolean).join(", ") : "";
    lines.push(`${isEn ? "Genre" : "Жанр"}: ${g || (isEn ? "agent's pick" : "на выбор агента")}`);

    // 2. Субжанры / теги стиля (Last.fm, Deezer)
    const subgenre = typeof mp.subgenre === "string" ? mp.subgenre.trim() : "";
    if (subgenre) {
      lines.push(`${isEn ? "Style tags" : "Теги стиля"}: ${subgenre}`);
    }

    // 3. Настроение
    if (e.mood) lines.push(`${isEn ? "Mood" : "Настроение"}: ${chips.moodLabel(e.mood)}`);

    // 4. Темп
    if (e.tempo) lines.push(`${isEn ? "Tempo" : "Темп"}: ${chips.tempoLabel(e.tempo)}`);

    // 5. BPM — показываем когда есть (даже вместе с темпом — разные единицы)
    const bpm = typeof mp.suggested_bpm === "string" ? mp.suggested_bpm.trim() : "";
    if (bpm) lines.push(`BPM: ~${bpm}`);

    // 6. Вокал
    if (m === "instrumental") {
      lines.push(`${isEn ? "Vocals" : "Вокал"}: ${isEn ? "none" : "нет"}`);
    } else {
      lines.push(`${isEn ? "Vocals" : "Вокал"}: ${e.vocal ? chips.vocalLabel(e.vocal) : (isEn ? "AI decides" : "на выбор")}`);
    }

    // 7. Атмосфера / тема (до 25 слов)
    if (e.description) {
      lines.push(`${isEn ? "Atmosphere" : "Атмосфера"}: ${shortWords(e.description)}`);
    }

    // 8. Эпоха
    const era = typeof mp.era === "string" ? mp.era.trim() : "";
    if (era) lines.push(`${isEn ? "Era" : "Эпоха"}: ${era}`);

    // 9. Описание стиля из референс-трека (Last.fm теги в researchNotes)
    // Показываем только первые 10 слов — полный набор тегов уже есть в «Теги стиля»
    const rn = result?.researchNotes ?? "";
    if (rn && !subgenre) {
      // researchNotes: "Reference style tags (Last.fm): tag1, tag2, …"
      const tagsMatch = /(?:tags?[:\s]+)(.*)/i.exec(rn);
      const tagStr = tagsMatch ? tagsMatch[1].trim() : "";
      if (tagStr) lines.push(`${isEn ? "Style tags" : "Теги стиля"}: ${shortWords(tagStr, 10)}`);
    }

    // 10. Текст / лирика (для песни)
    if (m === "song") {
      if (e.lyrics) {
        const firstLine = e.lyrics.split("\n").find((l) => l.trim() && !l.trim().startsWith("[")) || "";
        if (firstLine) lines.push(`${isEn ? "Lyrics" : "Текст"}: ${firstLine.slice(0, 60)}…`);
      } else {
        lines.push(`${isEn ? "Lyrics" : "Текст"}: ${isEn ? "Suno writes" : "пишет Suno"}`);
      }
    }

    return lines;
  }

  function handleAccept() {
    if (!result || !onComplete) return;
    onComplete(applyBriefEdits({ ...result, transcript: history }));
  }

  async function handleLaunch() {
    if (!result || !onLaunch || launching) return;
    setLaunching(true);
    setError(null);
    try {
      await onLaunch(applyBriefEdits({ ...result, transcript: history }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось запустить генерацию");
    } finally {
      setLaunching(false);
    }
  }

  // ── Render helpers ──

  function renderChipsForPhase(isLastAgentMsg: boolean) {
    if (!isLastAgentMsg || thinking || done) return null;

    // "Build the brief" escape hatch — lets the user finalize whenever they
    // want instead of answering every question (scripted path only).
    const buildChip = scriptedRef.current ? (
      <button
        key="__build"
        type="button"
        className="agent-suggestion-chip agent-suggestion-chip--build"
        onClick={() => finalizeDeterministic()}
      >
        {isEn ? "✅ Build brief" : "✅ Собрать бриф"}
      </button>
    ) : null;

    // Wizard phase chips (local — no GPT call)
    if (wizardPhase === "genre") {
      return (
        <div className="agent-suggestions">
          {chips.genreChips.map((g) => (
            <button key={g.value} type="button" className="agent-suggestion-chip" onClick={() => handleGenreSelect(g.value, g.label)}>{g.label}</button>
          ))}
          <button key="__pick" type="button" className="agent-suggestion-chip" onClick={() => handleGenreSelect("", chips.genrePickLabel)}>{chips.genrePickLabel}</button>
          {buildChip}
        </div>
      );
    }
    if (wizardPhase === "mood") {
      const autoMood = wizardParams.current.mood ? chips.moodLabel(wizardParams.current.mood) : null;
      return (
        <div className="agent-suggestions">
          {autoMood && (
            <button
              key="__auto"
              type="button"
              className="agent-suggestion-chip agent-suggestion-chip--build"
              onClick={() => handleMoodSelect(autoMood)}
            >
              {isEn ? `✓ Auto: ${autoMood}` : `✓ Авто: ${autoMood}`}
            </button>
          )}
          {chips.moodChips.filter((m) => m !== autoMood).slice(0, 4).map((m) => (
            <button key={m} type="button" className="agent-suggestion-chip" onClick={() => handleMoodSelect(m)}>{m}</button>
          ))}
          {buildChip}
        </div>
      );
    }
    if (wizardPhase === "tempo") {
      const autoTempo = wizardParams.current.tempo ? chips.tempoLabel(wizardParams.current.tempo) : null;
      return (
        <div className="agent-suggestions">
          {autoTempo && (
            <button
              key="__auto"
              type="button"
              className="agent-suggestion-chip agent-suggestion-chip--build"
              onClick={() => handleTempoSelect(autoTempo)}
            >
              {isEn ? `✓ Auto: ${autoTempo}` : `✓ Авто: ${autoTempo}`}
              {wizardParams.current.suggestedBpm ? ` (~${wizardParams.current.suggestedBpm} BPM)` : ""}
            </button>
          )}
          {chips.tempoChips.filter((t) => t !== autoTempo).map((tp) => (
            <button key={tp} type="button" className="agent-suggestion-chip" onClick={() => handleTempoSelect(tp)}>{tp}</button>
          ))}
          {buildChip}
        </div>
      );
    }
    if (wizardPhase === "vocal") {
      return (
        <div className="agent-suggestions">
          {chips.vocalChips.map((v) => (
            <button key={v} type="button" className="agent-suggestion-chip" onClick={() => void handleVocalSelect(v)}>{v}</button>
          ))}
          <button key="__novocal" type="button" className="agent-suggestion-chip" onClick={handleNoVocal}>{isEn ? "🎹 No vocals" : "🎹 Без вокала"}</button>
          {buildChip}
        </div>
      );
    }
    if (wizardPhase === "lyrics_confirm") {
      return (
        <div className="agent-suggestions">
          <button type="button" className="agent-suggestion-chip agent-suggestion-chip--build" onClick={handleLyricsWrite}>
            {isEn ? "✍️ Write the lyrics" : "✍️ Напиши текст"}
          </button>
          <button type="button" className="agent-suggestion-chip" onClick={handleLyricsAuto}>
            {isEn ? "🤖 Let Suno write" : "🤖 Пусть Suno сочинит"}
          </button>
          <button type="button" className="agent-suggestion-chip" onClick={handleLyricsInstrumental}>
            {isEn ? "🎹 Instrumental (no words)" : "🎹 Инструментал без слов"}
          </button>
        </div>
      );
    }
    if (wizardPhase === "ref_confirm") {
      return (
        <div className="agent-suggestions">
          <button
            type="button"
            className="agent-suggestion-chip agent-suggestion-chip--build"
            onClick={() => {
              setWizardPhase("free");
              // "Yes" — re-run the original first message so classify commits the reference.
              const orig = firstUserMsgRef.current;
              if (orig) void classifyAndRoute(orig);
              else enterScriptedWizard();
            }}
          >
            {isEn ? "✅ Yes, that's right" : "✅ Да, всё верно"}
          </button>
          <button
            type="button"
            className="agent-suggestion-chip"
            onClick={() => {
              pushAgentMessage(
                isEn
                  ? "Paste a Spotify / Deezer / YouTube link and I'll look it up precisely."
                  : "Скинь ссылку на Spotify / Deezer / YouTube — определю точно.",
              );
              setWizardPhase("free");
            }}
          >
            {isEn ? "🔗 Give a link" : "🔗 Дать ссылку"}
          </button>
          <button
            type="button"
            className="agent-suggestion-chip"
            onClick={() => {
              pushAgentMessage(
                isEn
                  ? "Sure — who should the reference be? Name the artist or paste a link."
                  : "Хорошо — кто должен быть референсом? Напиши имя или скинь ссылку.",
              );
              setWizardPhase("free");
            }}
          >
            {isEn ? "🔄 Different artist" : "🔄 Другой артист"}
          </button>
        </div>
      );
    }
    if (wizardPhase === "confirm") {
      return <div className="agent-suggestions">{buildChip}</div>;
    }
    return null;
  }

  function renderBriefEditor() {
    const e = editedBrief;
    const m = result?.intent?.module;
    if (!e || !m) return null;
    const music = isMusicModule(m);
    const setF = (patch: Partial<EditableBrief>) =>
      setEditedBrief((b) => (b ? { ...b, ...patch } : b));
    return (
      <div className="agent-edit">
        <div className="agent-edit__field">
          <label>{music ? (isEn ? "Topic" : "Тема") : (isEn ? "Description" : "Описание")}</label>
          <input
            type="text"
            value={e.description}
            onChange={(ev) => setF({ description: ev.target.value })}
            placeholder={music ? (isEn ? "what the track is about" : "о чём трек") : (isEn ? "describe the sound" : "опиши звук")}
          />
        </div>

        {music && (
          <>
            <div className="agent-edit__field">
              <label>{isEn ? "Genre" : "Жанр"}</label>
              <input
                type="text"
                value={e.customGenre || e.genre}
                onChange={(ev) => setF({ customGenre: ev.target.value, genre: "" })}
                placeholder={isEn ? "e.g. Phonk" : "напр. Phonk"}
              />
              <div className="agent-edit__chips">
                {chips.genreChips.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    className={`agent-edit__chip${e.genre === g.value && !e.customGenre ? " is-active" : ""}`}
                    onClick={() => setF({ genre: g.value, customGenre: "" })}
                  >{g.label}</button>
                ))}
              </div>
            </div>

            <div className="agent-edit__field">
              <label>{isEn ? "Mood" : "Настроение"}</label>
              <div className="agent-edit__chips">
                {chips.moodChips.map((label) => {
                  const val = chips.moodValue(label);
                  return (
                    <button key={val} type="button"
                      className={`agent-edit__chip${e.mood === val ? " is-active" : ""}`}
                      onClick={() => setF({ mood: val })}>{label}</button>
                  );
                })}
              </div>
            </div>

            <div className="agent-edit__field">
              <label>{isEn ? "Tempo" : "Темп"}</label>
              <div className="agent-edit__chips">
                {chips.tempoChips.map((label) => {
                  const val = chips.tempoValue(label);
                  return (
                    <button key={val} type="button"
                      className={`agent-edit__chip${e.tempo === val ? " is-active" : ""}`}
                      onClick={() => setF({ tempo: val })}>{label}</button>
                  );
                })}
              </div>
            </div>

            {m !== "instrumental" && (
              <div className="agent-edit__field">
                <label>{isEn ? "Vocals" : "Вокал"}</label>
                <div className="agent-edit__chips">
                  {chips.vocalChips.map((label) => {
                    const val = chips.vocalValue(label);
                    return (
                      <button key={val} type="button"
                        className={`agent-edit__chip${e.vocal === val ? " is-active" : ""}`}
                        onClick={() => setF({ vocal: val })}>{label}</button>
                    );
                  })}
                  <button type="button"
                    className={`agent-edit__chip${!e.vocal ? " is-active" : ""}`}
                    onClick={() => setF({ vocal: "" })}>{isEn ? "Any" : "Любой"}</button>
                </div>
              </div>
            )}

            {m !== "instrumental" && e.lyrics && (
              <div className="agent-edit__field">
                <label>{isEn ? "Lyrics" : "Текст"}</label>
                {briefLyricsOpen ? (
                  <textarea
                    className="agent-edit__lyrics"
                    value={e.lyrics}
                    onChange={(ev) => setF({ lyrics: ev.target.value })}
                    rows={12}
                  />
                ) : (
                  <button
                    type="button"
                    className="agent-edit__lyrics-preview"
                    onClick={() => setBriefLyricsOpen(true)}
                  >
                    <span>{e.lyrics.split("\n").filter((l) => l.trim() && !l.trim().startsWith("[")).slice(0, 2).join(" / ").slice(0, 90) || "…"}</span>
                    <em>{isEn ? "expand & edit" : "развернуть и править"}</em>
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── JSX ──

  // Which thinking label to show
  const showLyricsIndicator =
    thinking &&
    !lyricsGeneratedRef.current &&
    (thinkingStatus.includes("Пишу текст") || thinkingStatus.includes("Анализирую тему") ||
     thinkingStatus.includes("Подбираю слова") || thinkingStatus.includes("Writing") ||
     thinkingStatus.includes("Analysing") || thinkingStatus.includes("Picking words"));

  return (
    <div className="agent-chat">
      <header className="agent-chat__head">
        <div className="agent-chat__head-left">
          <AgentAvatar thinking={thinking} />
          <div>
            <strong>RIFFA Agent</strong>
            <p className="agent-chat__head-hint">
              {done
                ? (isEn ? "Brief ready" : "Бриф готов")
                : thinking
                ? thinkingStatus
                : messages.length === 0
                ? (isEn ? "Waiting for your message" : "Жду твоего сообщения")
                : (isEn ? "Building prompt" : "Собираю промт")}
            </p>
          </div>
        </div>
        <div className="agent-chat__head-right">
          {messages.length > 0 && (
            <button
              type="button"
              className="agent-chat__new"
              onClick={() => {
                clearAgentSession(module);
                setMessages([]);
                setHistory([]);
                historyRef.current = [];
                setWizardPhase("free");
                wizardParams.current = { ...EMPTY_WIZARD };
                lyricsGeneratedRef.current = false;
                scriptedRef.current = false;
                firstUserMsgRef.current = "";
                setEffectiveModule(module);
                effectiveModuleRef.current = module;
                setDone(false);
                setResult(null);
                setError(null);
                bootedRef.current = false;
              }}
              title="Начать новый диалог"
              aria-label="Новый чат"
            >
              <IconRefresh />
              <span>Новый чат</span>
            </button>
          )}
          <button type="button" className="agent-chat__close" onClick={onCancel} aria-label="Закрыть чат">
            <IconClose />
            <span className="agent-chat__close-text">закрыть чат</span>
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="agent-chat__feed">
        {messages.length === 0 && !thinking && !error && (
          <div className="agent-chat__empty">
            <span>{agentInitiates ? "Загружаем агента…" : "Напиши первым — агент ответит"}</span>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isLast = idx === messages.length - 1;
          const isLastAgent = isLast && msg.role === "agent";

          return (
            <div key={msg.id} className={`agent-row agent-row--${msg.role}`}>
              <div className={`agent-bubble agent-bubble--${msg.role}`}>
                <p style={{ whiteSpace: "pre-wrap" }}>{(msg.text || "").replace(/\n{3,}/g, "\n\n").trim() || "…"}</p>
              </div>

              {/* Lyrics approve / regenerate / edit buttons (Suno-written text) */}
              {msg.isLyricsMessage && wizardPhase === "lyrics_review" && isLastAgent && !thinking && (
                editingLyrics !== null ? (
                  <div className="agent-lyrics-edit">
                    <textarea
                      className="agent-lyrics-edit__area"
                      value={editingLyrics}
                      onChange={(ev) => setEditingLyrics(ev.target.value)}
                      rows={12}
                      autoFocus
                    />
                    <div className="agent-lyrics-actions">
                      <button type="button" className="agent-lyrics-btn agent-lyrics-btn--accept" onClick={saveEditedLyrics}>
                        <IconCheck /> {isEn ? "Save" : "Сохранить"}
                      </button>
                      <button type="button" className="agent-lyrics-btn" onClick={() => setEditingLyrics(null)}>
                        <IconClose /> {isEn ? "Cancel" : "Отмена"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="agent-lyrics-actions">
                    <button type="button" className="agent-lyrics-btn agent-lyrics-btn--accept" onClick={handleAcceptLyrics}>
                      <IconCheck /> {isEn ? "Accept" : "Принять текст"}
                    </button>
                    <button type="button" className="agent-lyrics-btn" onClick={handleRegenerateLyrics}>
                      <IconRefresh /> {isEn ? "Regenerate" : "Перегенерировать"}
                    </button>
                    <button type="button" className="agent-lyrics-btn agent-lyrics-btn--edit" onClick={handleEditLyrics}>
                      <IconPencil /> {isEn ? "Edit" : "Редактировать"}
                    </button>
                  </div>
                )
              )}

              {/* Wizard or GPT chips */}
              {isLastAgent && wizardPhase !== "lyrics_review" && (
                <>
                  {renderChipsForPhase(true)}
                  {/* GPT suggestions — only in free phase */}
                  {wizardPhase === "free" && !thinking && !done && msg.suggestions?.length && (
                    <div className="agent-suggestions">
                      {msg.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="agent-suggestion-chip"
                          onClick={() => { setDraft(""); void routeUserText(s); }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {thinking && (
          <div className="agent-bubble agent-bubble--agent agent-bubble--thinking">
            <div className="agent-thinking">
              <span className="agent-typing"><span /><span /><span /></span>
              <span className="agent-thinking__status">{thinkingStatus}</span>
              {showLyricsIndicator && (
                <span className="agent-thinking__lyrics-badge"><IconPencil /> Генерирую текст</span>
              )}
              {thinkingElapsed >= 5 && (
                <span className="agent-thinking__elapsed">{thinkingElapsed}с</span>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="agent-chat__error">
            <p><IconWarn /> {error}</p>
            {needsAuth && (
              <Button variant="secondary" onClick={() => navigate("/login")}>
                Войти в аккаунт
              </Button>
            )}
          </div>
        )}

        {done && result && (
          <div className="agent-result">
            {result.intent?.note && (
              <p className="agent-result__intent">
                <span className="agent-result__intent-badge">{moduleLabel(result.intent.module)}</span>
                <span>{result.intent.note}</span>
              </p>
            )}
            <div className="agent-result__brief-head">
              <h4>{isEn ? "Brief" : "Бриф"}</h4>
              {result.intent && (
                <button
                  type="button"
                  className="agent-result__edit-toggle"
                  onClick={() => setEditorOpen((v) => !v)}
                >
                  <IconPencil /> {editorOpen ? (isEn ? "Done" : "Готово") : (isEn ? "Edit" : "Изменить")}
                </button>
              )}
            </div>
            {editorOpen && result.intent ? (
              renderBriefEditor()
            ) : (
              <pre className="agent-result__summary">{briefLines().join("\n") || result.summary || "—"}</pre>
            )}
            {/* The Suno prompt (short OR full) is intentionally NOT shown — the
                user only sees the distilled brief above (genres + mood + a short
                atmosphere line). The worker builds the real prompt server-side. */}
          </div>
        )}
      </div>

      {!done ? (
        <form className="agent-chat__compose" onSubmit={handleSubmit}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              wizardPhase === "lyrics_review"
                ? "Напиши свои правки к тексту…"
                : wizardPhase !== "free"
                ? "Или напиши свой вариант…"
                : "Напиши ответ"
            }
            disabled={thinking}
            autoFocus
          />
          <Button type="submit" disabled={!draft.trim() || thinking}>
            Отправить
          </Button>
        </form>
      ) : (
        <div className="agent-chat__actions">
          {onLaunch && result?.intent ? (
            <Button onClick={handleLaunch} disabled={launching}>
              {launching ? (isEn ? "Launching…" : "Запускаю…") : (isEn ? "Launch generation" : "Запустить генерацию")}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              // Re-open the chat but KEEP the previous result so the user
              // can still launch the original brief if they change their
              // mind, and so the backend agent has the brief in context.
              setDone(false);
              setWizardPhase("free");
            }}
            disabled={launching}
          >
            {isEn ? "Refine the brief" : "Дополнить бриф"}
          </Button>
          {onComplete && (
            <Button variant="secondary" onClick={handleAccept} disabled={launching}>
              {isEn ? "Insert into form" : "Вставить в форму"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function moduleLabel(module: AgentModuleKind): string {
  switch (module) {
    case "song": return "Песня";
    case "instrumental": return "Инструментал";
    case "sound_effect": return "SFX";
    case "occasion": return "Поздравление";
    case "cover_song": return "Кавер";
    case "cover_art": return "Обложка";
    default: return module;
  }
}
