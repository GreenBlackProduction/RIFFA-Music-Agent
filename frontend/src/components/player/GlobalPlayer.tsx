import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  convertToWav,
  generateSimilar,
  renameGeneration,
  rateGeneration,
  toggleHistoryRadio,
  voteRadioTrack,
} from "@/lib/api/client";
import { HISTORY_QUERY_KEY } from "@/lib/library";
import { usePlayer } from "@/store/player";
import { useGenerationStore } from "@/store/generation";

import "./GlobalPlayer.css";
import { PlayerAura } from "./PlayerAura";

/* SVG icons for player controls — prevents emoji rendering on iPad/iOS */
const IconPrev = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="3" y="5" width="3" height="14" rx="1" />
    <path d="M21 5.5v13a1 1 0 0 1-1.54.84l-10-6.5a1 1 0 0 1 0-1.68l10-6.5A1 1 0 0 1 21 5.5z" />
  </svg>
);
const IconNext = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="18" y="5" width="3" height="14" rx="1" />
    <path d="M3 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 3 5.5z" />
  </svg>
);
const IconPlay = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 4.5v15a1 1 0 0 0 1.5.87l13-7.5a1 1 0 0 0 0-1.74l-13-7.5A1 1 0 0 0 6 4.5z" />
  </svg>
);
const IconPause = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="5" y="4" width="5" height="16" rx="1.5" />
    <rect x="14" y="4" width="5" height="16" rx="1.5" />
  </svg>
);
const IconShuffle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </svg>
);
const IconThumbUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
    <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
);
const IconThumbDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
    <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
  </svg>
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const INVALID_FILENAME_CHARS = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);

// Псевдослучайные высоты столбиков waveform (90 баров, 18–100%) — тоньше и чаще.
const WAVE_BARS = (() => {
  const arr: number[] = [];
  for (let i = 0; i < 90; i++) {
    // Детерминированный псевдо-шум: сочетание синусов на разных частотах.
    const v =
      0.5 +
      0.3 * Math.sin(i * 0.7) +
      0.15 * Math.sin(i * 1.9 + 1.3) +
      0.1 * Math.sin(i * 3.1 + 2.7);
    arr.push(Math.max(0.18, Math.min(1, v)));
  }
  return arr;
})();

function extractGenId(id: string | number): string | null {
  const s = String(id).split("#")[0];
  return UUID_RE.test(s) ? s : null;
}

function extractTrackIndex(id: string | number): number | null {
  const parts = String(id).split("#");
  if (parts.length < 2) return null;
  const idx = Number.parseInt(parts[1], 10);
  return Number.isFinite(idx) && idx >= 0 ? idx : null;
}

function sanitizeFilename(name: string): string {
  const safeName = Array.from(name)
    .filter((char) => char >= " " && !INVALID_FILENAME_CHARS.has(char))
    .join("")
    .trim();
  return safeName || "Track";
}

async function downloadBlob(url: string, filename: string) {
  try {
    const resp = await fetch(url, { mode: "cors" });
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 8000);
  } catch {
    // CORS or network issue — open in new tab as fallback
    window.open(url, "_blank", "noopener");
  }
}

export function GlobalPlayer() {
  const { t } = useTranslation();
  // Узкие selectors через примитивы — useEffect-ы не пересчитываются
  // когда меняются другие поля current (ratings, isPublic и т.п.).
  // Это критично: при тоггле радио / изменении лайков current-объект
  // мог пересоздаваться, что приводило к повторным вызовам el.play()
  // во время буферизации → заикания и обрыв воспроизведения.
  const currentId = usePlayer((s) => (s.current ? String(s.current.id) : null));
  const currentUrl = usePlayer((s) => s.current?.url ?? null);
  const currentTitle = usePlayer((s) => s.current?.title ?? "");
  const currentAuthor = usePlayer((s) => s.current?.author ?? "");
  const currentMeta = usePlayer((s) => s.current?.meta ?? "");
  const currentSource = usePlayer((s) => s.current?.source ?? null);
  const currentCover = usePlayer((s) => s.current?.cover ?? null);
  const currentCanRadio = usePlayer((s) => s.current?.canRadio ?? false);
  const currentIsMusicType = usePlayer((s) => s.current?.isMusicType ?? false);
  const currentAudioId = usePlayer((s) => s.current?.audioId ?? null);
  const currentIsOwn = usePlayer((s) => s.current?.isOwn);
  const currentLikes = usePlayer((s) => s.current?.likes ?? 0);
  const currentDislikes = usePlayer((s) => s.current?.dislikes ?? 0);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const setPlaying = usePlayer((s) => s.setPlaying);
  const stop = usePlayer((s) => s.stop);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const shuffle = usePlayer((s) => s.shuffle);
  const setShuffle = usePlayer((s) => s.setShuffle);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const playIndex = usePlayer((s) => s.playIndex);
  const hasQueue = queue.length > 1;
  const ratings = usePlayer((s) => s.ratings);
  const setRating = usePlayer((s) => s.setRating);
  const radioSet = usePlayer((s) => s.radioSet);
  const toggleRadio = usePlayer((s) => s.toggleRadio);
  const setRadioState = usePlayer((s) => s.setRadioState);
  const [radioPending, setRadioPending] = useState(false);
  const [wavPending, setWavPending] = useState(false);
  const queryClient = useQueryClient();
  const trackGeneration = useGenerationStore((s) => s.track);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  // Track what URL we've set so we compare against our value, not the
  // browser-normalised el.src (relative vs absolute causes false reloads).
  const currentSrcRef = useRef<string>("");
  // Suppress the onPause event fired by some browsers during a seek gesture.
  const seekingRef = useRef(false);
  // Track active drag for the progress bar.
  const draggingRef = useRef(false);
  // Last setPositionState update — throttle to ~1Hz to keep MediaSession
  // happy without flooding it from every timeupdate (4 Hz × N hooks).
  const lastPosUpdateRef = useRef(0);
  // Last time we attempted onError-driven recovery — debounce so a broken
  // URL doesn't pin us in an infinite reload loop.
  const lastErrorRecoveryRef = useRef(0);
  // Suppress the onPause event that fires when el.load() aborts a currently
  // playing resource.  Without this, switching tracks while playing would
  // call setPlaying(false) → kill the canplay listener → track never starts.
  const suppressNextPauseRef = useRef(false);
  // Always-current shadow of isPlaying so canplay callbacks don't see stale
  // closure values captured at the time the effect ran.
  const isPlayingRef = useRef(isPlaying);
  // Если URL обложки не загрузился — переключаемся на ♪
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => { setCoverFailed(false); }, [currentCover]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Queue dropdown
  const [queueOpen, setQueueOpen] = useState(false);
  const [queuePos, setQueuePos] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const queueRef = useRef<HTMLDivElement>(null);
  const trackBtnRef = useRef<HTMLButtonElement>(null);

  // Bolt menu
  const [boltOpen, setBoltOpen] = useState(false);
  const [boltPos, setBoltPos] = useState<{ bottom: number; right: number } | null>(null);
  const boltBtnRef = useRef<HTMLButtonElement>(null);
  const boltMenuRef = useRef<HTMLDivElement>(null);

  // Collapsed mode — компактная плашка только с обложкой, названием и
  // play/pause. На мобильном плеер занимает 3 ряда (track-info / controls
  // / actions), это много места. Юзер может свернуть его до одной строки.
  const [collapsed, setCollapsed] = useState(false);

  // URL changes + play/pause — единый эффект, чтобы избежать гонок.
  // Раньше src ставился в одном useEffect, а el.play() — в другом. Они
  // запускались в одном React commit, и play() звался ДО того как audio
  // успевал загрузить хоть один байт. На медленных мобильных сетях это
  // приводило к заиканиям и иногда к полному обрыву воспроизведения.
  //
  // Теперь: при смене URL ждём `canplay` и только тогда играем.
  // Если play/pause тоггл без смены URL — просто переключаем состояние.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !currentUrl) return;
    if (draggingRef.current) return;

    // URL сменился — перезагружаем src и ждём готовности.
    if (currentSrcRef.current !== currentUrl) {
      currentSrcRef.current = currentUrl;
      el.src = currentUrl;
      el.currentTime = 0;
      setProgress(0);
      // el.load() при наличии playing-трека вызывает событие pause
      // (браузер прерывает воспроизведение).  Без флага onPause
      // сбрасывал бы isPlaying=false → убивал canplay-листенер →
      // трек никогда не начинался.
      suppressNextPauseRef.current = true;
      // Явный load() — на Android Chrome без него audio иногда
      // «застревает» на старом источнике, особенно в фоне.
      el.load();
      if (isPlaying) {
        // Ждём первого `canplay` — означает, что есть достаточно
        // данных, чтобы начать воспроизведение без немедленного обрыва.
        // isPlayingRef.current вместо closure-значения isPlaying: если
        // пользователь нажал паузу пока шла загрузка, читаем актуальное.
        const onCanPlay = () => {
          el.removeEventListener("canplay", onCanPlay);
          if (!isPlayingRef.current) return;
          el.play().catch(() => setPlaying(false));
        };
        el.addEventListener("canplay", onCanPlay, { once: true });
        return () => {
          el.removeEventListener("canplay", onCanPlay);
        };
      }
      return;
    }

    // URL тот же — просто тоггл play/pause.
    if (isPlaying && el.paused) {
      el.play().catch(() => setPlaying(false));
    } else if (!isPlaying && !el.paused) {
      el.pause();
    }
  }, [currentUrl, isPlaying, setPlaying]);

  // Восстановление воспроизведения после возврата вкладки из фона.
  // На Android Chrome агрессивно «замораживает» вкладки в фоне:
  // событий `pagehide` + `freeze` (Page Lifecycle API), а при возврате —
  // `resume` или `pageshow` (если возвращение из bfcache). В этих сценариях
  // браузер мог:
  //   • поставить аудио на паузу (нормально для мобильных в фоне);
  //   • вытолкнуть аудио из памяти и потерять `src` (редко, но бывает).
  // Поэтому при возврате вкладки в активное состояние мы:
  //   1) если потерян src — переустанавливаем его и currentTime;
  //   2) если предполагалось играть — продолжаем воспроизведение.
  useEffect(() => {
    function resumePlaybackIfNeeded() {
      const el = audioRef.current;
      if (!el || !currentUrl || !isPlaying) return;
      // Браузер мог потерять src при «freeze» вкладки.
      if (!el.src || el.src === window.location.href) {
        el.src = currentUrl;
        el.load();
      }
      if (el.paused) {
        el.play().catch(() => undefined);
      }
    }
    function onVisible() {
      if (document.hidden) return;
      resumePlaybackIfNeeded();
    }
    function onPageShow() {
      // bfcache restore — вкладка вернулась из стека истории.
      resumePlaybackIfNeeded();
    }
    function onResume() {
      // Page Lifecycle API resume — вкладка вышла из frozen state.
      resumePlaybackIfNeeded();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("resume", onResume);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("resume", onResume);
    };
  }, [isPlaying, currentUrl]);

  // Native 'ended' event — bypasses the React rendering pipeline so the
  // next track starts with zero gap.  This is critical for iOS / Android
  // lock-screen background playback: if we go through Zustand → re-render →
  // useEffect the browser may see a gap and terminate the audio session.
  //
  // Strategy:
  //   1. Read fresh queue state via getState() (no stale closure).
  //   2. Set el.src directly and call el.play() while still inside the
  //      audio callback — the audio session is active at this point.
  //   3. Update currentSrcRef BEFORE store.next() so the main useEffect
  //      sees currentSrcRef === currentUrl and skips the URL-change branch.
  //
  // The React synthetic onEnded is removed from the JSX — it would advance
  // the queue a second time and cause double-track skipping.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    function handleEnded() {
      if (!el) return;
      const store = usePlayer.getState();
      const { queue, queueIndex, shuffle } = store;
      if (queue.length <= 1) { store.setPlaying(false); return; }
      const nextIdx = shuffle
        ? Math.floor(Math.random() * queue.length)
        : (queueIndex + 1) % queue.length;
      const nxt = queue[nextIdx];
      if (!nxt?.url) { store.setPlaying(false); return; }
      // Suppress load()-induced pause before setting new src.
      suppressNextPauseRef.current = true;
      currentSrcRef.current = nxt.url;
      // CRITICAL on mobile: DO NOT call el.load() here. Calling load() tears
      // down the existing audio session, and mobile Safari / Chrome treat
      // the next el.play() as a fresh autoplay attempt with no user gesture
      // — it silently rejects, the canplay fallback never gets a gesture
      // either, and the track quietly fails to start. Assigning .src alone
      // keeps the audio session alive and play() continues to be allowed
      // because we are still inside the `ended` event callback.
      el.src = nxt.url;
      const playAttempt = el.play();
      if (playAttempt && typeof playAttempt.catch === "function") {
        playAttempt.catch(() => {
          if (!el) return;
          // Last-ditch: wait for canplay and retry once. Won't help if the
          // browser already rejected because of autoplay policy, but covers
          // the case where the new src just hadn't buffered yet.
          const onCanPlay = () => {
            el.removeEventListener("canplay", onCanPlay);
            el.play().catch(() => undefined);
          };
          el.addEventListener("canplay", onCanPlay, { once: true });
        });
      }
      // Sync UI state; since currentSrcRef is already updated, the
      // main useEffect's URL-change branch won't fire again.
      store.next();
    }
    el.addEventListener("ended", handleEnded);
    return () => el.removeEventListener("ended", handleEnded);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Media Session API — lock screen / notification centre controls.
  // Lets the OS know audio is playing so it doesn't kill the tab on screen lock.
  // ВАЖНО для iOS: правильно настроенный MediaSession (с metadata,
  // playbackState и positionState) удерживает «Now Playing» в Control
  // Center и привязывает его к нашему PWA. Без этого iOS может выгрузить
  // вкладку из памяти и перенаправить контролы на другой app.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentUrl) return;
    const cover = currentCover;
    const artwork = cover
      ? [
          { src: cover, sizes: "96x96", type: "image/webp" },
          { src: cover, sizes: "192x192", type: "image/webp" },
          { src: cover, sizes: "256x256", type: "image/webp" },
          { src: cover, sizes: "384x384", type: "image/webp" },
          { src: cover, sizes: "512x512", type: "image/webp" },
        ]
      : [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTitle || "RIFFA",
      artist: currentAuthor || "RIFFA Music",
      album: currentMeta || "",
      artwork,
    });
  }, [currentUrl, currentTitle, currentAuthor, currentMeta, currentCover]);

  // playbackState ↔ isPlaying — даём системе чёткий сигнал.
  // На iOS это критически важно: без правильного state lock-screen
  // плеер может «забыть» о нас при долгом фоновом воспроизведении.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentUrl) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying, currentUrl]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const el = audioRef.current;
    navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
    navigator.mediaSession.setActionHandler("previoustrack", () => hasQueue && prev());
    navigator.mediaSession.setActionHandler("nexttrack", () => hasQueue && next());
    // Перемотка из lock-screen / Control Center на 10 секунд.
    const skip = (delta: number) => () => {
      if (!el || !isFinite(el.duration)) return;
      el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + delta));
      setProgress(el.currentTime);
    };
    try { navigator.mediaSession.setActionHandler("seekbackward", skip(-10)); } catch { /* unsupported */ }
    try { navigator.mediaSession.setActionHandler("seekforward",  skip(+10)); } catch { /* unsupported */ }
    try {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (!el || details.seekTime == null) return;
        el.currentTime = details.seekTime;
        setProgress(details.seekTime);
      });
    } catch { /* unsupported */ }
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      try { navigator.mediaSession.setActionHandler("seekbackward", null); } catch { /* ignore */ }
      try { navigator.mediaSession.setActionHandler("seekforward",  null); } catch { /* ignore */ }
      try { navigator.mediaSession.setActionHandler("seekto",       null); } catch { /* ignore */ }
    };
  }, [setPlaying, hasQueue, prev, next]);

  // Положение в треке — без этого iOS постепенно «забывает» о нашей
  // сессии и закрывает плашку в Control Center. Throttle до 1 Hz —
  // ниже стандартного timeupdate (~4 Hz), но достаточно для прогресса
  // на lock-screen. Без throttle на слабых Android устройствах вызов
  // setPositionState 4 раза в секунду заметно ест CPU и вызывает
  // микро-заикания.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentUrl) return;
    if (typeof navigator.mediaSession.setPositionState !== "function") return;
    if (!duration || !isFinite(duration) || duration <= 0) return;
    const now = Date.now();
    if (now - lastPosUpdateRef.current < 950) return;
    lastPosUpdateRef.current = now;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1.0,
        position: Math.max(0, Math.min(progress, duration)),
      });
    } catch { /* invalid state — ignore */ }
  }, [currentUrl, duration, progress]);

  useEffect(() => {
    if (currentUrl) document.body.classList.add("has-global-player");
    else document.body.classList.remove("has-global-player");
    return () => document.body.classList.remove("has-global-player");
  }, [currentUrl]);

  // Close queue on outside click
  useEffect(() => {
    if (!queueOpen) return;
    function onOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (trackBtnRef.current?.contains(t) || queueRef.current?.contains(t)) return;
      setQueueOpen(false);
    }
    document.addEventListener("click", onOutside, true);
    return () => document.removeEventListener("click", onOutside, true);
  }, [queueOpen]);

  // Close bolt on outside click
  useEffect(() => {
    if (!boltOpen) return;
    function onOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (boltBtnRef.current?.contains(t) || boltMenuRef.current?.contains(t)) return;
      setBoltOpen(false);
    }
    document.addEventListener("click", onOutside, true);
    return () => document.removeEventListener("click", onOutside, true);
  }, [boltOpen]);

  if (!currentId || !currentUrl) return null;

  const rating = ratings[currentId] ?? null;
  const genId = extractGenId(currentId);
  // radioSet синхронизируется при play(), так что является источником
  // истины для текущего состояния. Если current.isPublic явно задан и
  // отличается от radioSet — отдаём приоритет radioSet (он отражает
  // последний явный toggle пользователя).
  const onRadio = radioSet.has(currentId);
  const likes = currentLikes + (rating === "like" ? 1 : 0);
  const dislikes = currentDislikes + (rating === "dislike" ? 1 : 0);
  // Radio-foreign = трек играет из радио и НЕ принадлежит текущему юзеру.
  // Скрываем скачивание/конвертацию/extend (это контент чужого автора);
  // вместо этого в bolt-menu остаётся только «Сгенерировать похожий».
  const isRadioForeign = currentSource === "radio" && currentIsOwn === false;

  async function handleRadioToggle() {
    if (!currentId || radioPending) return;
    if (!genId) { toggleRadio(currentId); return; }
    const nextVal = !onRadio;
    const trackIndex = extractTrackIndex(currentId);
    setRadioPending(true);
    try {
      await toggleHistoryRadio(genId, nextVal, trackIndex);
      setRadioState(currentId, nextVal);
      await queryClient.invalidateQueries({ queryKey: ["history"] });
      await queryClient.invalidateQueries({ queryKey: ["radio"] });
    } catch { /* ignore */ } finally {
      setRadioPending(false);
    }
  }

  /** Toggle like / dislike. Try the «own track» endpoint first, fall back
   *  to the radio-vote endpoint when the server says «not your track». This
   *  removes the previous flaky behaviour where the like would briefly
   *  light up and immediately reset on tracks whose `isOwn` flag came from
   *  cache and didn't match the server (e.g. tracks copied into the user's
   *  collection from someone else's radio publish).
   *  We keep the optimistic local UI even on errors — the user clearly
   *  meant to vote, and the worst case is a quiet log entry. */
  async function handleRate(kind: "like" | "dislike") {
    if (!currentId) return;
    const previous = rating;
    const nextLocal: "like" | "dislike" | null = previous === kind ? null : kind;
    setRating(currentId, nextLocal);
    if (!genId) return; // mock track / no backend id
    const apiRating: "like" | "dislike" | "remove" =
      nextLocal === null ? "remove" : nextLocal;

    const tryOwn = currentIsOwn !== false;
    const trackIndex = extractTrackIndex(currentId) ?? 0;
    let succeeded = false;
    try {
      if (tryOwn) {
        await rateGeneration(genId, apiRating);
      } else {
        await voteRadioTrack(genId, apiRating, trackIndex);
      }
      succeeded = true;
    } catch (err) {
      // If the primary endpoint says 404 (not your track / not public),
      // fall back to the other one. Covers the case where current.isOwn
      // is stale or wrong.
      const status = (err as { status?: number })?.status;
      if (status === 404 || status === 403) {
        try {
          if (tryOwn) {
            await voteRadioTrack(genId, apiRating, trackIndex);
          } else {
            await rateGeneration(genId, apiRating);
          }
          succeeded = true;
        } catch (err2) {
          // Both endpoints rejected — log and keep the optimistic UI.
          console.warn("[player] rating failed on both endpoints", err2);
        }
      } else {
        console.warn("[player] rating failed", err);
      }
    }
    if (succeeded) {
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["radio"] });
    }
  }

  function fmt(t: number) {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = String(Math.floor(t % 60)).padStart(2, "0");
    return `${m}:${s}`;
  }

  /** Compute target time from a pointer X position relative to the progress bar.
   *  Used by both initial click and drag. */
  function computeSeekTime(clientX: number): number | null {
    const bar = progressRef.current;
    const el = audioRef.current;
    if (!bar || !el || !duration || !isFinite(duration)) return null;
    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return x * duration;
  }

  /** Apply currentTime, preferring fastSeek when available — iOS Safari often
   *  ignores a plain `currentTime =` assignment if the target is outside the
   *  loaded buffer, which on a quick click looks like the track jumping back
   *  to where it was playing (and on a fresh track, that's 0). */
  function applySeek(el: HTMLAudioElement, t: number) {
    try {
      const fast = (el as HTMLAudioElement & { fastSeek?: (n: number) => void }).fastSeek;
      if (typeof fast === "function") {
        fast.call(el, t);
        return;
      }
    } catch { /* fall through */ }
    try { el.currentTime = t; } catch { /* ignore */ }
  }

  /** Single-click or start of drag — capture the pointer so we keep getting
   *  pointermove events even when the cursor leaves the bar. */
  function handleSeekStart(e: React.PointerEvent<HTMLDivElement>) {
    const el = audioRef.current;
    if (!el) return;
    const t = computeSeekTime(e.clientX);
    if (t === null) return;
    seekingRef.current = true;
    draggingRef.current = true;
    applySeek(el, t);
    setProgress(t);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture can fail in rare cases — fall back to global listeners
    }
  }

  function handleSeekMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const el = audioRef.current;
    if (!el) return;
    const t = computeSeekTime(e.clientX);
    if (t === null) return;
    applySeek(el, t);
    setProgress(t);
  }

  function handleSeekEnd(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
    // Wait for the audio element to actually finish seeking before letting
    // timeupdate overwrite progress. Without this, a quick click pushes
    // currentTime but the next timeupdate fires with the old position
    // (because the seek hasn't completed yet) and the bar — and the audio —
    // snap back to where they were. Using the `seeked` event tracks real
    // browser state instead of guessing with a timer. 1.5 s safety net in
    // case the browser never fires `seeked` (lost network, broken codec).
    const el = audioRef.current;
    if (!el) { seekingRef.current = false; return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("seeked", finish);
      seekingRef.current = false;
    };
    el.addEventListener("seeked", finish, { once: true });
    window.setTimeout(finish, 1500);
  }

  function toggleQueueDropdown() {
    if (!trackBtnRef.current) return;
    const r = trackBtnRef.current.getBoundingClientRect();
    setQueuePos({ bottom: window.innerHeight - r.top + 6, left: r.left, width: Math.max(r.width, 240) });
    setQueueOpen((v) => !v);
  }

  function openBolt() {
    if (boltBtnRef.current) {
      const r = boltBtnRef.current.getBoundingClientRect();
      setBoltPos({ bottom: window.innerHeight - r.top + 6, right: window.innerWidth - r.right });
    }
    setBoltOpen((v) => !v);
  }

  async function handleWavConvert() {
    if (!currentAudioId || !currentIsMusicType || wavPending || !currentId) return;
    const gId = extractGenId(currentId);
    if (!gId) return;
    setBoltOpen(false);
    setWavPending(true);
    try {
      const resp = await convertToWav({ generation_id: gId, audio_id: currentAudioId });
      trackGeneration(resp.generation_id, resp.ws_url, "wav_convert", `WAV: ${currentTitle}`);
    } catch {
      // generation card in sidebar will show error state
    } finally {
      setWavPending(false);
    }
  }

  async function handleGenerateSimilar() {
    if (!currentId) return;
    const gId = extractGenId(currentId);
    if (!gId) return;
    setBoltOpen(false);
    try {
      const resp = await generateSimilar(gId);
      trackGeneration(
        resp.generation_id,
        resp.ws_url,
        "song",
        t("globalPlayer.similarTrackTracking", {
          defaultValue: "Похожий трек: {{title}}",
          title: currentTitle,
        }),
      );
    } catch {
      // sidebar generation card surfaces the error
    }
  }

  function handleDownload() {
    if (!currentUrl) return;
    const filename = `RIFFA - ${sanitizeFilename(currentTitle ?? "Track")}.mp3`;
    downloadBlob(currentUrl, filename);
  }

  function openRename() {
    setBoltOpen(false);
    const initial = currentTitle ?? "";
    // Lightweight prompt — keeps the player chrome clean and works on every
    // platform incl. Telegram Mini App where modals over the bottom bar are
    // awkward. The library row already has a full modal for power users.
    const next = window.prompt(
      t("globalPlayer.renamePromptLabel", { defaultValue: "Новое название трека" }),
      initial,
    );
    if (!next) return;
    const trimmed = next.trim().slice(0, 80);
    if (!trimmed || trimmed === initial) return;
    void (async () => {
      const gId = extractGenId(currentId!);
      if (!gId) return;
      const idx = extractTrackIndex(currentId!);
      try {
        await renameGeneration(gId, trimmed, idx);
        // Mirror the new title in the local store and invalidate any list
        // queries so the library/radio rows update without a refresh.
        usePlayer.setState((s) => ({
          current: s.current ? { ...s.current, title: trimmed } : s.current,
          queue: s.queue.map((q) => (q.id === currentId ? { ...q, title: trimmed } : q)),
        }));
        await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
        await queryClient.invalidateQueries({ queryKey: ["radio"] });
      } catch {
        // Swallow — invalidation would surface a stale title which the next
        // refresh will correct. Avoid a popup over the player chrome.
      }
    })();
  }

  return (
    <div
      className={`global-player${collapsed ? " global-player--collapsed" : ""}`}
      role="region"
      aria-label={t("globalPlayer.regionLabel")}
    >
      <PlayerAura audio={audioRef} active={isPlaying} />

      {/* LEFT: track info — click opens queue list */}
      <button
        ref={trackBtnRef}
        type="button"
        className={`gp-track${queueOpen ? " gp-track--open" : ""}`}
        onClick={hasQueue ? toggleQueueDropdown : undefined}
        aria-label={hasQueue ? t("globalPlayer.queueLabel") : undefined}
        aria-expanded={hasQueue ? queueOpen : undefined}
        style={hasQueue ? undefined : { cursor: "default", pointerEvents: "none" }}
      >
        <div className="gp-cover" aria-hidden="true">
          {currentCover && !coverFailed ? (
            <img src={currentCover} alt="" onError={() => setCoverFailed(true)} />
          ) : (
            <div className="gp-cover-fallback">♪</div>
          )}
        </div>
        <div className="gp-meta">
          <span className="gp-title" title={currentTitle}>{currentTitle}</span>
          <span className="gp-sub">
            {[currentAuthor, currentMeta].filter(Boolean).join(" · ")}
          </span>
        </div>
        {hasQueue && (
          <span className="gp-track-chevron" aria-hidden="true">
            {queueOpen ? "▼" : "▲"}
          </span>
        )}
      </button>

      {/* CENTER: controls + progress — play в геометрическом центре */}
      <div className="gp-center">
        <div className="gp-ctrl-row">
          <div className="gp-ctrl-side gp-ctrl-side--left">
            <button
              type="button"
              className={`gp-ctrl gp-ctrl--shuffle${shuffle ? " gp-ctrl--active" : ""}`}
              onClick={() => setShuffle(!shuffle)}
              aria-label={t("globalPlayer.shuffleAria")}
              aria-pressed={shuffle}
              title="Shuffle"
            >
              <IconShuffle />
            </button>
            <button
              type="button"
              className="gp-ctrl"
              onClick={prev}
              disabled={!hasQueue}
              aria-label={t("globalPlayer.prevAria")}
              title={t("globalPlayer.prev")}
            >
              <IconPrev />
            </button>
          </div>
          <button
            type="button"
            className="gp-ctrl gp-ctrl--play"
            onClick={() => setPlaying(!isPlaying)}
            aria-label={isPlaying ? t("globalPlayer.pauseAria") : t("globalPlayer.playAria")}
          >
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <div className="gp-ctrl-side gp-ctrl-side--right">
            <button
              type="button"
              className="gp-ctrl"
              onClick={next}
              disabled={!hasQueue}
              aria-label={t("globalPlayer.nextAria")}
              title={t("globalPlayer.next")}
            >
              <IconNext />
            </button>
            {/* Зеркальный пустой слот — чтобы play оставался строго в центре */}
            <span className="gp-ctrl-spacer" aria-hidden />
          </div>
        </div>

        <div
          ref={progressRef}
          className="gp-progress"
          onPointerDown={handleSeekStart}
          onPointerMove={handleSeekMove}
          onPointerUp={handleSeekEnd}
          onPointerCancel={handleSeekEnd}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={duration ? Math.round((progress / duration) * 100) : 0}
          style={{ touchAction: "none" }}
        >
          {WAVE_BARS.map((h, i) => {
            const ratio = duration ? progress / duration : 0;
            const active = i / WAVE_BARS.length < ratio;
            return (
              <span
                key={i}
                className={`gp-wave-bar${active ? " gp-wave-bar--active" : ""}`}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            );
          })}
        </div>

        <span className="gp-time">
          {fmt(progress)} / {fmt(duration)}
        </span>
      </div>

      {/* RIGHT: actions — flat single row */}
      <div className="gp-actions">
        {!isRadioForeign && (
          <button
            type="button"
            className="gp-act gp-act--dl"
            onClick={handleDownload}
            title={t("globalPlayer.download")}
            aria-label={t("globalPlayer.download")}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
              <path d="M8 2v8M5 7l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            MP3
          </button>
        )}

        {(currentIsMusicType || isRadioForeign) && (
          <button
            ref={boltBtnRef}
            type="button"
            className={`gp-act gp-act--bolt${boltOpen ? " gp-act--open" : ""}`}
            onClick={openBolt}
            title={isRadioForeign
              ? t("globalPlayer.generateSimilarTitle", { defaultValue: "Сгенерировать похожий трек" })
              : t("globalPlayer.trackActions")}
            aria-expanded={boltOpen}
            aria-haspopup="menu"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
              <path d="M9 2L4 9h4l-1 5 5-7H8l1-5z" fill="currentColor" />
            </svg>
          </button>
        )}

        <button
          type="button"
          className={`gp-act gp-act--rate${rating === "like" ? " gp-act--like-on" : ""}`}
          onClick={() => void handleRate("like")}
          aria-label={t("globalPlayer.likeAria")}
          aria-pressed={rating === "like"}
        >
          <IconThumbUp />{likes > 0 ? <span className="gp-act-count">{likes}</span> : null}
        </button>

        <button
          type="button"
          className={`gp-act gp-act--rate${rating === "dislike" ? " gp-act--dis-on" : ""}`}
          onClick={() => void handleRate("dislike")}
          aria-label={t("globalPlayer.dislikeAria")}
          aria-pressed={rating === "dislike"}
        >
          <IconThumbDown />{dislikes > 0 ? <span className="gp-act-count">{dislikes}</span> : null}
        </button>

        {currentCanRadio && (
          <button
            type="button"
            className={`gp-act gp-act--radio${onRadio ? " gp-act--radio-on" : ""}`}
            onClick={handleRadioToggle}
            disabled={radioPending}
            title={onRadio ? t("fileActions.removeFromRadio") : t("fileActions.addToRadio")}
            aria-pressed={onRadio}
          >
            {radioPending ? "…" : onRadio ? t("globalPlayer.radioOn") : t("globalPlayer.radioOff")}
          </button>
        )}

        <button
          type="button"
          className="gp-act gp-act--collapse"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? t("globalPlayer.expand") : t("globalPlayer.collapse")}
          title={collapsed ? t("globalPlayer.expand") : t("globalPlayer.collapse")}
          aria-pressed={collapsed}
        >
          <span aria-hidden style={{ display: "inline-block", lineHeight: 1 }}>
            {collapsed ? "▲" : "▼"}
          </span>
        </button>

        <button
          type="button"
          className="gp-act gp-act--close"
          onClick={stop}
          aria-label={t("globalPlayer.closeAria")}
          title={t("globalPlayer.close")}
        >
          ×
        </button>
      </div>

      {/* Source badge — закреплён в правом-нижнем углу плеера */}
      {currentSource && (
        <span className="gp-source">
          <span className="gp-source__dot" aria-hidden />
          {currentSource === "library" ? t("globalPlayer.sourceLibrary", { defaultValue: "из библиотеки" })
           : currentSource === "radio"   ? t("globalPlayer.sourceRadio",   { defaultValue: "из радио" })
           : currentSource === "studio"  ? t("globalPlayer.sourceStudio",  { defaultValue: "из студии" })
           : t("globalPlayer.sourceShare", { defaultValue: "по ссылке" })}
        </span>
      )}

      {/*
        Аудио играет напрямую через HTML5 — без Web Audio API. Это даёт
        нативное фоновое воспроизведение при сворачивании браузера/Telegram.
        playsInline нужен iOS чтобы не перехватывать audio в встроенный плеер.
      */}
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
        onTimeUpdate={(e) => {
          // Don't fight user's drag, and don't overwrite the just-set
          // position while the browser is still finishing the seek — that
          // race is what makes a click on the progress bar look like a
          // jump back to the start of the track.
          if (draggingRef.current || seekingRef.current) return;
          setProgress((e.target as HTMLAudioElement).currentTime);
        }}
        /* onEnded handled by native listener above — see useEffect */
        onPause={() => {
          // Пауза вызванная el.load() при смене трека — не пользователь.
          if (suppressNextPauseRef.current) {
            suppressNextPauseRef.current = false;
            return;
          }
          // Игнорируем pause-event когда вкладка скрыта — браузер может
          // сам приостановить аудио. Не сбрасываем isPlaying, тогда при
          // возврате на вкладку плеер автоматически продолжит.
          if (document.hidden) return;
          if (!seekingRef.current && !draggingRef.current) setPlaying(false);
        }}
        onPlay={() => setPlaying(true)}
        onError={(e) => {
          // Android Chrome иногда выгружает audio из памяти после долгого
          // фона и оставляет нас с MEDIA_ERR_NETWORK / MEDIA_ERR_SRC_NOT_SUPPORTED.
          // Восстанавливаем источник и пробуем продолжить с текущей позиции.
          const el = e.currentTarget as HTMLAudioElement;
          const now = Date.now();
          if (now - lastErrorRecoveryRef.current < 3000) return; // не зацикливаемся
          lastErrorRecoveryRef.current = now;
          const url = currentSrcRef.current;
          if (!url) return;
          const savedTime = el.currentTime;
          try {
            suppressNextPauseRef.current = true;
            el.src = url;
            el.load();
            if (savedTime > 0 && isFinite(savedTime)) {
              const onReady = () => {
                el.removeEventListener("loadedmetadata", onReady);
                try { el.currentTime = savedTime; } catch { /* ignore */ }
                if (isPlaying) el.play().catch(() => undefined);
              };
              el.addEventListener("loadedmetadata", onReady, { once: true });
            } else if (isPlaying) {
              const onCanPlay = () => {
                el.removeEventListener("canplay", onCanPlay);
                el.play().catch(() => undefined);
              };
              el.addEventListener("canplay", onCanPlay, { once: true });
            }
          } catch {
            /* nothing more we can do */
          }
        }}
      />

      {/* Queue dropdown portal */}
      {queueOpen && queuePos && queue.length > 1 &&
        createPortal(
          <div
            ref={queueRef}
            className="gp-queue"
            role="listbox"
            aria-label={t("globalPlayer.queueLabel")}
            style={{ bottom: queuePos.bottom, left: queuePos.left, minWidth: queuePos.width }}
          >
            {queue.map((qt, i) => (
              <button
                key={String(qt.id)}
                type="button"
                role="option"
                aria-selected={i === queueIndex}
                className={`gp-queue-item${i === queueIndex ? " gp-queue-item--current" : ""}`}
                onClick={() => { playIndex(i); setQueueOpen(false); }}
              >
                <span className="gp-queue-num">{i + 1}</span>
                <span className="gp-queue-title">{qt.title || t("globalPlayer.queueTrackFallback")}</span>
                {qt.meta && <span className="gp-queue-meta">{qt.meta}</span>}
                {i === queueIndex && <span className="gp-queue-playing" aria-hidden>♪</span>}
              </button>
            ))}
          </div>,
          document.body,
        )}

      {/* Bolt menu portal */}
      {boltOpen && boltPos &&
        createPortal(
          <div
            ref={boltMenuRef}
            role="menu"
            className="file-bolt-menu"
            style={{ bottom: boltPos.bottom, right: boltPos.right }}
          >
            {isRadioForeign ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleGenerateSimilar()}
              >
                ⚡&nbsp; {t("globalPlayer.generateSimilar", { defaultValue: "Сгенерировать похожий трек" })}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleWavConvert()}
                  disabled={!currentAudioId || wavPending}
                  title={!currentAudioId ? t("globalPlayer.convertWavTooltip") : undefined}
                >
                  {wavPending ? t("globalPlayer.convertWavRunning") : t("globalPlayer.convertWav")}
                </button>
                {genId && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openRename}
                  >
                    ✏️&nbsp; {t("globalPlayer.renameTrack", { defaultValue: "Переименовать трек" })}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleGenerateSimilar()}
                >
                  ⚡&nbsp; {t("globalPlayer.generateSimilar", { defaultValue: "Сгенерировать похожий трек" })}
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
