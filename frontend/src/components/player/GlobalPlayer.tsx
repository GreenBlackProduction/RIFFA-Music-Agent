import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

import {
  convertToWav,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const INVALID_FILENAME_CHARS = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);

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
  const current = usePlayer((s) => s.current);
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
  const playerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

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

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !current) return;
    if (el.src !== current.url) {
      el.src = current.url;
      el.currentTime = 0;
    }
    if (isPlaying) {
      el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }, [current, isPlaying, setPlaying]);

  useEffect(() => {
    if (current) document.body.classList.add("has-global-player");
    else document.body.classList.remove("has-global-player");
    return () => document.body.classList.remove("has-global-player");
  }, [current]);

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

  if (!current) return null;

  const rating = ratings[String(current.id)] ?? null;
  const genId = extractGenId(current.id);
  const onRadio = current.isPublic !== undefined ? current.isPublic : radioSet.has(String(current.id));
  const likes = (current.likes ?? 0) + (rating === "like" ? 1 : 0);
  const dislikes = (current.dislikes ?? 0) + (rating === "dislike" ? 1 : 0);

  async function handleRadioToggle() {
    if (!current || radioPending) return;
    if (!genId) { toggleRadio(current.id); return; }
    const nextVal = !onRadio;
    const trackIndex = extractTrackIndex(current.id);
    setRadioPending(true);
    try {
      await toggleHistoryRadio(genId, nextVal, trackIndex);
      setRadioState(current.id, nextVal);
      await queryClient.invalidateQueries({ queryKey: ["history"] });
      await queryClient.invalidateQueries({ queryKey: ["radio"] });
    } catch { /* ignore */ } finally {
      setRadioPending(false);
    }
  }

  /** Toggle like / dislike. For own tracks → /history/{id}/rating
   *  (which auto-publishes to "Моя коллекция" when liking); for community
   *  tracks → /radio/{id}/vote. Cached locally so the icon flips instantly. */
  async function handleRate(kind: "like" | "dislike") {
    if (!current) return;
    const previous = rating;
    const nextLocal: "like" | "dislike" | null = previous === kind ? null : kind;
    setRating(current.id, nextLocal);
    if (!genId) return; // mock track / no backend id
    const apiRating: "like" | "dislike" | "remove" =
      nextLocal === null ? "remove" : nextLocal;
    try {
      if (current.isOwn) {
        await rateGeneration(genId, apiRating);
      } else {
        await voteRadioTrack(genId, apiRating);
      }
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["radio"] });
    } catch {
      // Rollback the optimistic local rating on failure.
      setRating(current.id, previous);
    }
  }

  function fmt(t: number) {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = String(Math.floor(t % 60)).padStart(2, "0");
    return `${m}:${s}`;
  }

  function seekTo(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    el.currentTime = Math.max(0, Math.min(duration, x * duration));
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
    if (!current?.audioId || !current?.isMusicType || wavPending) return;
    const gId = extractGenId(current.id);
    if (!gId) return;
    setBoltOpen(false);
    setWavPending(true);
    try {
      const resp = await convertToWav({ generation_id: gId, audio_id: current.audioId });
      trackGeneration(resp.generation_id, resp.ws_url, "wav_convert", `WAV: ${current.title}`);
    } catch {
      // generation card in sidebar will show error state
    } finally {
      setWavPending(false);
    }
  }

  function handleEnergy(energy: number) {
    if (!playerRef.current) return;
    const size = Math.round(10 + energy * 56);
    const a1 = (0.18 + energy * 0.58).toFixed(2);
    const a2 = (Math.min((0.18 + energy * 0.58) * 1.8, 0.92)).toFixed(2);
    playerRef.current.style.boxShadow =
      `0 30px 80px rgba(0,0,0,0.55), 0 0 ${size}px rgba(124,255,31,${a1}), 0 0 1.5px rgba(124,255,31,${a2})`;
  }

  function handleDownload() {
    if (!current?.url) return;
    const filename = `RIFFA - ${sanitizeFilename(current.title ?? "Track")}.mp3`;
    downloadBlob(current.url, filename);
  }

  return (
    <div className="global-player" ref={playerRef} role="region" aria-label="Плеер">
      <PlayerAura audio={audioRef} active={isPlaying} onEnergy={handleEnergy} />

      {/* LEFT: track info — click opens queue list */}
      <button
        ref={trackBtnRef}
        type="button"
        className={`gp-track${queueOpen ? " gp-track--open" : ""}`}
        onClick={hasQueue ? toggleQueueDropdown : undefined}
        aria-label={hasQueue ? "Список треков" : undefined}
        aria-expanded={hasQueue ? queueOpen : undefined}
        style={hasQueue ? undefined : { cursor: "default", pointerEvents: "none" }}
      >
        <div className="gp-cover" aria-hidden="true">
          {current.cover ? (
            <img src={current.cover} alt="" />
          ) : (
            <div className="gp-cover-fallback">♪</div>
          )}
        </div>
        <div className="gp-meta">
          <span className="gp-title" title={current.title}>{current.title}</span>
          <span className="gp-sub">
            {[current.author, current.meta].filter(Boolean).join(" · ")}
          </span>
        </div>
        {hasQueue && (
          <span className="gp-track-chevron" aria-hidden="true">
            {queueOpen ? "▼" : "▲"}
          </span>
        )}
      </button>

      {/* CENTER: controls + progress */}
      <div className="gp-center">
        <div className="gp-ctrl-row">
          <button
            type="button"
            className="gp-ctrl"
            onClick={prev}
            disabled={!hasQueue}
            aria-label="Предыдущий трек"
            title="Назад"
          >
            <IconPrev />
          </button>
          <button
            type="button"
            className="gp-ctrl gp-ctrl--play"
            onClick={() => setPlaying(!isPlaying)}
            aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
          >
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <button
            type="button"
            className="gp-ctrl"
            onClick={next}
            disabled={!hasQueue}
            aria-label="Следующий трек"
            title="Далее"
          >
            <IconNext />
          </button>
          <button
            type="button"
            className={`gp-ctrl gp-ctrl--shuffle${shuffle ? " gp-ctrl--active" : ""}`}
            onClick={() => setShuffle(!shuffle)}
            aria-label="Случайный порядок"
            aria-pressed={shuffle}
            title="Shuffle"
          >
            <IconShuffle />
          </button>
        </div>

        <div className="gp-progress" onClick={seekTo} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={duration ? Math.round((progress / duration) * 100) : 0}>
          <div
            className="gp-progress-fill"
            style={{ width: duration ? `${(progress / duration) * 100}%` : "0%" }}
          />
        </div>

        <span className="gp-time">
          {fmt(progress)} / {fmt(duration)}
        </span>
      </div>

      {/* RIGHT: actions — flat single row */}
      <div className="gp-actions">
        <button
          type="button"
          className="gp-act gp-act--dl"
          onClick={handleDownload}
          title="Скачать трек"
          aria-label="Скачать трек"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
            <path d="M8 2v8M5 7l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {current.isMusicType && (
          <button
            ref={boltBtnRef}
            type="button"
            className={`gp-act gp-act--bolt${boltOpen ? " gp-act--open" : ""}`}
            onClick={openBolt}
            title="Действия с треком"
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
          aria-label="Лайк"
          aria-pressed={rating === "like"}
        >
          👍{likes > 0 ? <span className="gp-act-count">{likes}</span> : null}
        </button>

        <button
          type="button"
          className={`gp-act gp-act--rate${rating === "dislike" ? " gp-act--dis-on" : ""}`}
          onClick={() => void handleRate("dislike")}
          aria-label="Дизлайк"
          aria-pressed={rating === "dislike"}
        >
          👎{dislikes > 0 ? <span className="gp-act-count">{dislikes}</span> : null}
        </button>

        {current.canRadio && (
          <button
            type="button"
            className={`gp-act gp-act--radio${onRadio ? " gp-act--radio-on" : ""}`}
            onClick={handleRadioToggle}
            disabled={radioPending}
            title={onRadio ? "Убрать с радио" : "Добавить на радио"}
            aria-pressed={onRadio}
          >
            {radioPending ? "…" : onRadio ? "✓ Эфир" : "В эфир"}
          </button>
        )}

        <button
          type="button"
          className="gp-act gp-act--close"
          onClick={stop}
          aria-label="Закрыть плеер"
          title="Закрыть"
        >
          ×
        </button>
      </div>

      {/*
        crossOrigin="anonymous" is required so PlayerAura's createMediaElementSource()
        does not taint cross-origin Suno CDN audio.
      */}
      <audio
        ref={audioRef}
        preload="metadata"
        crossOrigin="anonymous"
        onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
        onTimeUpdate={(e) => setProgress((e.target as HTMLAudioElement).currentTime)}
        onEnded={() => { if (hasQueue) next(); else setPlaying(false); }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />

      {/* Queue dropdown portal */}
      {queueOpen && queuePos && queue.length > 1 &&
        createPortal(
          <div
            ref={queueRef}
            className="gp-queue"
            role="listbox"
            aria-label="Список треков"
            style={{ bottom: queuePos.bottom, left: queuePos.left, minWidth: queuePos.width }}
          >
            {queue.map((t, i) => (
              <button
                key={String(t.id)}
                type="button"
                role="option"
                aria-selected={i === queueIndex}
                className={`gp-queue-item${i === queueIndex ? " gp-queue-item--current" : ""}`}
                onClick={() => { playIndex(i); setQueueOpen(false); }}
              >
                <span className="gp-queue-num">{i + 1}</span>
                <span className="gp-queue-title">{t.title || "Трек"}</span>
                {t.meta && <span className="gp-queue-meta">{t.meta}</span>}
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
            <button type="button" role="menuitem" onClick={() => setBoltOpen(false)}>
              🔁&nbsp; Продлить трек
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleWavConvert()}
              disabled={!current?.audioId || wavPending}
              title={!current?.audioId ? "Нет audio_id — сначала воспроизведи трек из библиотеки" : undefined}
            >
              {wavPending ? "⏳  Запускаю…" : "💿  Конвертировать в WAV"}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
