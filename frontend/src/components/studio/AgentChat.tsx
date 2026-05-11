import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import {
  agentChat,
  type AgentChatMessage,
  type AgentIntent,
  type AgentModuleKind,
} from "@/lib/api/client";
import "./AgentChat.css";

// ─── Session persistence (localStorage, TTL 1 hour) ───────────────────────

const SESSION_TTL_MS = 60 * 60 * 1000;

function sessionKey(module: string) {
  return `riffa_agent_v2_${module}`;
}

interface SavedAgentSession {
  messages: UiMessage[];
  history: AgentChatMessage[];
  wizardPhase: string;
  wizardParamsCurrent: WizardParams;
  lyricsGenerated: boolean;
  done: boolean;
  result: { summary: string; prompt: string; intent: AgentIntent | null } | null;
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

const GENRE_CHIPS = [
  "Pop", "Rock", "Lo-fi / Chill", "Electronic / EDM",
  "Hip-Hop / Trap", "Классика / Оркестр", "Не знаю — подбери сам",
];
const MOOD_CHIPS = [
  "Энергичное", "Меланхоличное", "Агрессивное",
  "Спокойное", "Вдохновляющее", "Романтичное",
];
const TEMPO_CHIPS = ["Медленный", "Средний", "Быстрый"];
const VOCAL_CHIPS = ["Мужской", "Женский"];

// Mapping ru → en for backend params
const TEMPO_MAP: Record<string, string> = {
  "Медленный": "slow", "Средний": "medium", "Быстрый": "fast",
};
const MOOD_MAP: Record<string, string> = {
  "Энергичное": "energetic", "Меланхоличное": "sad", "Агрессивное": "aggressive",
  "Спокойное": "calm", "Вдохновляющее": "inspiring", "Романтичное": "romantic",
};
const VOCAL_MAP: Record<string, string> = {
  "Мужской": "male", "Женский": "female",
};

// ─── Types ─────────────────────────────────────────────────────────────────

type WizardPhase = "free" | "lyrics_review" | "genre" | "mood" | "tempo" | "vocal";

interface WizardParams {
  lyrics: string;
  genre: string;
  mood: string;
  tempo: string;
  vocal: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractError(err: unknown): { message: string; is401: boolean } {
  if (err && typeof err === "object" && "status" in err && "detail" in err) {
    const e = err as { status: number; detail: string };
    return { message: e.detail, is401: e.status === 401 };
  }
  if (err instanceof Error) return { message: err.message, is401: false };
  return { message: "Не удалось связаться с ассистентом", is401: false };
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

function AgentAvatar() {
  return (
    <img
      src="/riffa-logo.png"
      alt="RIFFA"
      width={28}
      height={28}
      className="agent-chat__avatar-img"
      aria-hidden="true"
    />
  );
}

// ─── Props / result types ──────────────────────────────────────────────────

export interface AgentChatProps {
  onComplete: (result: AgentResult) => void;
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
  intent: AgentIntent | null;
  transcript: AgentChatMessage[];
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
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [history, setHistory] = useState<AgentChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState("Думаю…");
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);

  // Wizard state
  const [wizardPhase, setWizardPhase] = useState<WizardPhase>("free");
  const wizardParams = useRef<WizardParams>({ lyrics: "", genre: "", mood: "", tempo: "", vocal: "" });
  const lyricsGeneratedRef = useRef(false); // true once agent has drafted lyrics

  const [result, setResult] = useState<
    { summary: string; prompt: string; intent: AgentIntent | null } | null
  >(null);

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
          { delay: 0,    text: "Обрабатываю сообщение…" },
          { delay: 2000, text: "Формулирую ответ…" },
        ]
      : lyricsPhase
      ? [
          { delay: 0,     text: "Анализирую тему…" },
          { delay: 2500,  text: "Пишу текст песни…" },
          { delay: 7000,  text: "Подбираю слова и рифмы…" },
          { delay: 14000, text: "Дорабатываю черновик…" },
          { delay: 22000, text: "Почти готово, ещё немного…" },
        ]
      : [
          { delay: 0,     text: "Анализирую запрос…" },
          { delay: 2500,  text: "Думаю над ответом…" },
          { delay: 6000,  text: "Подбираю параметры…" },
          { delay: 12000, text: "Обрабатываю детали…" },
          { delay: 20000, text: "Это занимает немного больше обычного…" },
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
    setThinkingStatus("Думаю…");
  }, []);

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
      wizardParams.current = saved.wizardParamsCurrent ?? { lyrics: "", genre: "", mood: "", tempo: "", vocal: "" };
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
      lyricsGenerated: lyricsGeneratedRef.current,
      done,
      result,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, history, wizardPhase, done, result]);

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
          setError(is401 ? "Войдите в аккаунт чтобы использовать агента" : message);
        } finally {
          setThinking(false);
          stopThinking();
        }
      })();
    } else if (seed) {
      void sendInternal(seed, []);
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

  // Called when user clicks "✓ Принять текст"
  function handleAcceptLyrics() {
    addLocalPair(
      "✓ Принимаю текст",
      "Отлично, текст принят! Теперь выбери жанр музыки:",
      GENRE_CHIPS,
    );
    setWizardPhase("genre");
  }

  // Called when user clicks "✏ Редактировать"
  function handleEditLyrics() {
    // Return to free mode so user can type their edits
    setWizardPhase("free");
  }

  function handleGenreSelect(genre: string) {
    wizardParams.current.genre = genre === "Не знаю — подбери сам" ? "" : genre;
    const agentMsg = genre === "Не знаю — подбери сам"
      ? "Агент подберёт жанр! Какое настроение хочешь?"
      : `${genre} — хороший выбор! Настроение трека?`;
    addLocalPair(genre, agentMsg, MOOD_CHIPS);
    setWizardPhase("mood");
  }

  function handleMoodSelect(mood: string) {
    wizardParams.current.mood = MOOD_MAP[mood] || mood.toLowerCase();
    addLocalPair(mood, "Темп?", TEMPO_CHIPS);
    setWizardPhase("tempo");
  }

  function handleTempoSelect(tempo: string) {
    wizardParams.current.tempo = TEMPO_MAP[tempo] || "medium";
    addLocalPair(tempo, "Вокал?", VOCAL_CHIPS);
    setWizardPhase("vocal");
  }

  async function handleVocalSelect(vocal: string) {
    wizardParams.current.vocal = VOCAL_MAP[vocal] || "";
    // Add local user message immediately, then finalize via GPT
    const now = Date.now();
    const uMsg: UiMessage = { id: `u-${now}`, role: "user", text: vocal };
    const thinkMsg: UiMessage = { id: `a-${now + 1}`, role: "agent", text: "Собираю финальный промт…" };
    setMessages((prev) => [...prev, uMsg, thinkMsg]);
    const nextHistory: AgentChatMessage[] = [
      ...historyRef.current,
      { role: "user", content: vocal },
      { role: "agent", content: "Собираю финальный промт…" },
    ];
    setHistory(nextHistory);
    historyRef.current = nextHistory;

    // Build finalization message with all collected params
    const p = wizardParams.current;
    const finalizeMsg =
      `Финализируй. Все параметры собраны: ` +
      (p.genre ? `жанр=${p.genre}, ` : "") +
      `настроение=${p.mood || "energetic"}, темп=${p.tempo || "medium"}, вокал=${p.vocal || "male"}. ` +
      `Текст утверждён (custom). Запускай с done=true.`;

    await sendInternal(finalizeMsg, nextHistory, true /* isFinalizeCall */);
  }

  // ── Main GPT send ──

  async function sendInternal(
    text: string,
    baseHistory: AgentChatMessage[],
    isFinalizeCall = false,
  ) {
    if (!isFinalizeCall) {
      const userMsg: UiMessage = { id: `u-${Date.now()}`, role: "user", text };
      setMessages((prev) => [...prev, userMsg]);
    }

    const nextHistory: AgentChatMessage[] = isFinalizeCall
      ? [...baseHistory, { role: "user", content: text }]
      : [...baseHistory, { role: "user", content: text }];

    if (!isFinalizeCall) {
      setHistory(nextHistory);
      historyRef.current = nextHistory;
    }

    setThinking(true);
    setError(null);

    // Only show lyrics-phase thinking indicator BEFORE lyrics have been generated
    const mightGenerateLyrics =
      !lyricsGeneratedRef.current &&
      /текст|лирик|слова|куплет|припев|стих|напиши|черновик/i.test(text);
    const historyHasLyricsAlready = !lyricsGeneratedRef.current && nextHistory.some(
      (m) => hasLyrics(m.content)
    );
    startThinking(mightGenerateLyrics || historyHasLyricsAlready, false);

    const p = wizardParams.current;
    try {
      const resp = await agentChat({
        module,
        messages: nextHistory,
        selected_genre: isFinalizeCall ? (p.genre || selectedGenre) : selectedGenre,
        selected_mood: isFinalizeCall ? (p.mood || selectedMood) : selectedMood,
        selected_tempo: isFinalizeCall ? (p.tempo || selectedTempo) : selectedTempo,
        selected_vocal: isFinalizeCall ? (p.vocal || selectedVocal) : selectedVocal,
      });

      // Detect lyrics in this response
      const containsLyrics = hasLyrics(resp.reply);
      if (containsLyrics && !lyricsGeneratedRef.current) {
        lyricsGeneratedRef.current = true;
        wizardParams.current.lyrics = extractLyrics(resp.reply);
        setWizardPhase("lyrics_review");
      } else if (wizardPhase === "lyrics_review" || isFinalizeCall) {
        // After lyrics phase or finalize — keep wizard phase state, don't reset
      } else {
        // Still in free mode — suggestions come from GPT normally
      }

      const replyMsg: UiMessage = {
        id: `agent-${Date.now()}`,
        role: "agent",
        text: resp.reply,
        // Only attach GPT suggestions when NOT in wizard mode
        suggestions:
          wizardPhase === "free" && !containsLyrics && resp.suggestions?.length
            ? resp.suggestions
            : undefined,
        isLyricsMessage: containsLyrics,
      };
      setMessages((prev) => [...prev, replyMsg]);

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
        setResult({ summary: resp.summary, prompt: resp.prompt, intent });
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
    // If user types freely while in lyrics_review, treat as edit request → reset to free
    if (wizardPhase === "lyrics_review") setWizardPhase("free");
    await sendInternal(text, historyRef.current);
  }

  function handleAccept() {
    if (!result) return;
    onComplete({ summary: result.summary, prompt: result.prompt, intent: result.intent, transcript: history });
  }

  async function handleLaunch() {
    if (!result || !onLaunch || launching) return;
    setLaunching(true);
    setError(null);
    try {
      await onLaunch({ summary: result.summary, prompt: result.prompt, intent: result.intent, transcript: history });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось запустить генерацию");
    } finally {
      setLaunching(false);
    }
  }

  // ── Render helpers ──

  function renderChipsForPhase(isLastAgentMsg: boolean) {
    if (!isLastAgentMsg || thinking || done) return null;

    // Wizard phase chips (local — no GPT call)
    if (wizardPhase === "genre") {
      return (
        <div className="agent-suggestions">
          {GENRE_CHIPS.map((g) => (
            <button key={g} type="button" className="agent-suggestion-chip" onClick={() => handleGenreSelect(g)}>{g}</button>
          ))}
        </div>
      );
    }
    if (wizardPhase === "mood") {
      return (
        <div className="agent-suggestions">
          {MOOD_CHIPS.map((m) => (
            <button key={m} type="button" className="agent-suggestion-chip" onClick={() => handleMoodSelect(m)}>{m}</button>
          ))}
        </div>
      );
    }
    if (wizardPhase === "tempo") {
      return (
        <div className="agent-suggestions">
          {TEMPO_CHIPS.map((t) => (
            <button key={t} type="button" className="agent-suggestion-chip" onClick={() => handleTempoSelect(t)}>{t}</button>
          ))}
        </div>
      );
    }
    if (wizardPhase === "vocal") {
      return (
        <div className="agent-suggestions">
          {VOCAL_CHIPS.map((v) => (
            <button key={v} type="button" className="agent-suggestion-chip" onClick={() => void handleVocalSelect(v)}>{v}</button>
          ))}
        </div>
      );
    }
    return null;
  }

  // ── JSX ──

  // Which thinking label to show
  const showLyricsIndicator =
    thinking &&
    !lyricsGeneratedRef.current &&
    (thinkingStatus.includes("Пишу текст") || thinkingStatus.includes("Анализирую тему") || thinkingStatus.includes("Подбираю слова"));

  return (
    <div className="agent-chat">
      <header className="agent-chat__head">
        <div className="agent-chat__head-left">
          <span className="agent-chat__avatar" aria-hidden="true">
            <AgentAvatar />
          </span>
          <div>
            <strong>RIFFA Agent</strong>
            <p className="agent-chat__head-hint">
              {done
                ? "Бриф готов"
                : thinking
                ? thinkingStatus
                : messages.length === 0
                ? "Жду твоего сообщения"
                : "GPT-4o · собираю промт"}
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
                wizardParams.current = { lyrics: "", genre: "", mood: "", tempo: "", vocal: "" };
                lyricsGeneratedRef.current = false;
                setDone(false);
                setResult(null);
                setError(null);
                bootedRef.current = false;
              }}
              title="Начать новый диалог"
              aria-label="Новый чат"
            >
              ↺ Новый чат
            </button>
          )}
          <button type="button" className="agent-chat__close" onClick={onCancel} aria-label="Закрыть чат">
            <span aria-hidden="true">✕</span>
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
            <div key={msg.id}>
              <div className={`agent-bubble agent-bubble--${msg.role}`}>
                <p style={{ whiteSpace: "pre-wrap" }}>{msg.text}</p>
              </div>

              {/* Lyrics accept / edit buttons */}
              {msg.isLyricsMessage && wizardPhase === "lyrics_review" && isLastAgent && !thinking && (
                <div className="agent-lyrics-actions">
                  <button
                    type="button"
                    className="agent-lyrics-btn agent-lyrics-btn--accept"
                    onClick={handleAcceptLyrics}
                  >
                    ✓ Принять текст
                  </button>
                  <button
                    type="button"
                    className="agent-lyrics-btn agent-lyrics-btn--edit"
                    onClick={handleEditLyrics}
                  >
                    ✏ Редактировать
                  </button>
                </div>
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
                          onClick={() => { setDraft(""); void sendInternal(s, historyRef.current); }}
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
                <span className="agent-thinking__lyrics-badge">✍ Генерирую текст</span>
              )}
              {thinkingElapsed >= 5 && (
                <span className="agent-thinking__elapsed">{thinkingElapsed}с</span>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="agent-chat__error">
            <p>⚠ {error}</p>
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
            <h4>Бриф</h4>
            <pre className="agent-result__summary">{result.summary || "—"}</pre>
            <h4>Готовый prompt для Suno</h4>
            <pre className="agent-result__prompt">{result.prompt}</pre>
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
              {launching ? "Запускаю…" : "🚀 Запустить генерацию"}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={handleAccept} disabled={launching}>
            Вставить в форму
          </Button>
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
