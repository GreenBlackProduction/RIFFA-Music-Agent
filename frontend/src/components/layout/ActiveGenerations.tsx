/**
 * Sidebar panel that hosts every in-flight (and recently finished) generation.
 *
 * - Subscribes to {@link useGenerationStore}.
 * - Cards animate in/out with framer-motion via `layoutId` per id, so when a
 *   generation kicks off in the StudioPage it visually flies into this panel.
 * - Cards stay visible until the user explicitly clicks ×, at which point the
 *   store dismisses them and the card animates out.
 * - Once a generation completes, the card exposes inline action buttons
 *   (▶ play for audio, 🖼 preview for cover art) so the user can interact
 *   with the result without leaving the current page.
 */

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

import { retryGeneration } from "@/lib/api/client";
import {
  ActiveGeneration,
  type CompletedTrackLike,
  useGenerationStore,
} from "@/store/generation";
import { usePlayer } from "@/store/player";

import "./ActiveGenerations.css";

const STEP_LABELS: Record<string, string> = {
  start: "Запуск...",
  lyrics: "Пишем текст...",
  enriching_music: "Обогащаю музыкальный prompt...",
  music: "Отправляю в Suno AI...",
  submitting: "Отправка запроса...",
  queued: "В очереди...",
  generating: "Suno AI создаёт музыку...",
  submitting_wav: "Конвертация в WAV...",
  converting_wav: "Конвертация в WAV...",
};

const TYPE_LABELS: Record<string, string> = {
  song: "Песня",
  instrumental: "Инструментал",
  sound_effect: "Звуковой эффект",
  cover: "Кавер",
  cover_song: "Кавер",
  occasion: "Поздравление",
  cover_art: "Обложка",
  lyrics: "Текст",
  extend: "Продление",
  wav_convert: "Конвертация",
};

const TYPE_ICONS: Record<string, string> = {
  song: "🎤",
  instrumental: "🎼",
  sound_effect: "🔊",
  cover: "🎚️",
  cover_song: "🎚️",
  occasion: "🎉",
  cover_art: "🖼️",
  lyrics: "✍️",
  extend: "⏩",
  wav_convert: "💿",
};

const cardVariants: Variants = {
  initial: { opacity: 0, x: -32, scale: 0.92 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -32, scale: 0.92, transition: { duration: 0.18 } },
};

function pickPreviewImage(gen: ActiveGeneration): string | null {
  const r = gen.result;
  if (!r) return null;
  if (typeof r.image_url === "string" && r.image_url) return r.image_url;
  const tracks = Array.isArray(r.tracks) ? r.tracks : [];
  for (const t of tracks) {
    if (t.image_url) return t.image_url;
  }
  return null;
}

function getPlayableTracks(gen: ActiveGeneration): CompletedTrackLike[] {
  const tracks = gen.result?.tracks;
  if (Array.isArray(tracks) && tracks.length > 0) {
    return tracks.filter((t): t is CompletedTrackLike => !!t && !!t.audio_url);
  }
  // WAV convert and SFX return a single top-level audio_url
  const topUrl = gen.result?.audio_url;
  if (typeof topUrl === "string" && topUrl) {
    return [{ audio_url: topUrl, title: gen.title, audio_id: gen.result?.audio_id as string | undefined }];
  }
  return [];
}

interface CardActionsProps {
  gen: ActiveGeneration;
  onOpenPreview: (url: string, title: string) => void;
}

function CompletedActions({ gen, onOpenPreview }: CardActionsProps) {
  const playerCurrent = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const play = usePlayer((s) => s.play);
  const toggle = usePlayer((s) => s.toggle);

  const tracks = getPlayableTracks(gen);
  const previewImage = pickPreviewImage(gen);
  const isMusicType =
    gen.type === "song" ||
    gen.type === "instrumental" ||
    gen.type === "cover" ||
    gen.type === "cover_song" ||
    gen.type === "wav_convert" ||
    gen.type === "sound_effect";

  function playerIdFor(idx: number): string {
    return tracks.length > 1 ? `${gen.id}#${idx}` : gen.id;
  }

  function handlePlay(track: CompletedTrackLike, idx: number) {
    if (!track.audio_url) return;
    const playerKey = playerIdFor(idx);
    if (playerCurrent?.id === playerKey) {
      toggle();
      return;
    }
    play({
      id: playerKey,
      title: track.title || gen.title || "Трек",
      url: track.audio_url,
      cover: track.image_url,
      meta: TYPE_LABELS[gen.type] ?? gen.type,
      isMusicType,
      audioId: track.audio_id || undefined,
    });
  }

  if (tracks.length === 0 && !previewImage) {
    return <p className="active-gen__done">✓ Готово</p>;
  }

  return (
    <div className="active-gen__actions" role="group" aria-label="Действия с готовой генерацией">
      {/* When Suno returns 2 variants, expose them as V1 / V2 with independent
       *  play controls — clicking V1 plays only V1, and (combined with the
       *  Radio button on each card in the library) the user can pick which
       *  variant goes to public Radio without affecting the other. */}
      {tracks.map((t, i) => {
        const playerKey = playerIdFor(i);
        const isCurrent = playerCurrent?.id === playerKey;
        const isThisPlaying = isCurrent && isPlaying;
        const label = tracks.length > 1 ? `V${i + 1}` : "Слушать";
        return (
          <button
            key={playerKey}
            type="button"
            className={`active-gen__action active-gen__action--play${isCurrent ? " active-gen__action--current" : ""}`}
            onClick={() => handlePlay(t, i)}
            aria-label={`${isThisPlaying ? "Пауза" : "Воспроизвести"} ${label}`}
            aria-pressed={isCurrent}
            title={t.title || label}
          >
            <span aria-hidden="true">{isThisPlaying ? "⏸" : "▶"}</span>
            <span>{label}</span>
          </button>
        );
      })}
      {previewImage ? (
        <button
          type="button"
          className="active-gen__action active-gen__action--preview"
          onClick={() => onOpenPreview(previewImage, gen.title || "Превью")}
          aria-label="Открыть обложку"
          title="Открыть обложку"
        >
          <span aria-hidden="true">🖼</span>
          <span>Обложка</span>
        </button>
      ) : null}
    </div>
  );
}

function FailedActions({ gen }: { gen: ActiveGeneration }) {
  const track = useGenerationStore((s) => s.track);
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      const resp = await retryGeneration(gen.id);
      track(resp.generation_id, resp.ws_url, gen.type, gen.title);
    } catch {
      // leave failed state visible
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="active-gen__failed-body">
      <p className="active-gen__error">{gen.error ?? "Ошибка"}</p>
      <button
        type="button"
        className="active-gen__retry"
        onClick={handleRetry}
        disabled={retrying}
        title="Повторить генерацию"
      >
        {retrying ? "Запускаю..." : "Повторить"}
      </button>
    </div>
  );
}

function CardBody({ gen, onOpenPreview }: CardActionsProps) {
  if (gen.status === "completed") {
    return <CompletedActions gen={gen} onOpenPreview={onOpenPreview} />;
  }
  if (gen.status === "failed") {
    return <FailedActions gen={gen} />;
  }
  return (
    <>
      <div className="active-gen__bar" aria-hidden="true">
        <div className="active-gen__bar-fill" style={{ width: `${gen.progress}%` }} />
      </div>
      <p className="active-gen__step">
        {gen.step ? (STEP_LABELS[gen.step] ?? gen.step) : "Ожидание..."}
      </p>
    </>
  );
}

export function CollapsedGenerationProgress() {
  const active = useGenerationStore((s) => s.active);
  const entries = useMemo(
    () =>
      Object.values(active).filter((gen) => gen.status === "queued" || gen.status === "processing"),
    [active],
  );

  useEffect(() => {
    document.body.classList.toggle("has-collapsed-progress", entries.length > 0);
    return () => document.body.classList.remove("has-collapsed-progress");
  }, [entries.length]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <aside className="collapsed-gen-progress" aria-label="Прогресс генераций">
      {entries.map((gen) => {
        const label = gen.title || TYPE_LABELS[gen.type] || "Генерация";
        const step = gen.step ? (STEP_LABELS[gen.step] ?? gen.step) : "Ожидание";
        return (
          <div key={gen.id} className="collapsed-gen-progress__row">
            <div className="collapsed-gen-progress__meta">
              <span className="collapsed-gen-progress__title">{label}</span>
              <span className="collapsed-gen-progress__percent">{Math.round(gen.progress)}%</span>
            </div>
            <div className="collapsed-gen-progress__bar" aria-hidden="true">
              <div className="collapsed-gen-progress__fill" style={{ width: `${gen.progress}%` }} />
            </div>
            <span className="collapsed-gen-progress__step">{step}</span>
          </div>
        );
      })}
    </aside>
  );
}

export function ActiveGenerations() {
  const active = useGenerationStore((s) => s.active);
  const dismiss = useGenerationStore((s) => s.dismiss);
  const entries = Object.values(active);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  function openPreview(url: string, title: string) {
    setPreview({ url, title });
  }

  return (
    <section className="active-gen-panel" aria-label="Активные генерации">
      {entries.length > 0 && (
        <header className="active-gen-panel__head">
          <span>Генерации</span>
          <span className="muted">{entries.length}</span>
        </header>
      )}
      <AnimatePresence initial={false}>
        {entries.map((gen) => (
          <motion.div
            key={gen.id}
            layoutId={`active-gen-${gen.id}`}
            className={`active-gen active-gen--${gen.status}`}
            variants={cardVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
          >
            <div className="active-gen__head">
              <span className="active-gen__icon" aria-hidden="true">
                {TYPE_ICONS[gen.type] ?? "🎵"}
              </span>
              <div className="active-gen__meta">
                <strong className="active-gen__title">{gen.title || "Генерация"}</strong>
                <span className="active-gen__type">
                  {TYPE_LABELS[gen.type] ?? gen.type}
                </span>
              </div>
              <button
                type="button"
                className="active-gen__close"
                onClick={() => dismiss(gen.id)}
                aria-label="Скрыть карточку"
                title="Скрыть"
              >
                ×
              </button>
            </div>
            <CardBody gen={gen} onOpenPreview={openPreview} />
          </motion.div>
        ))}
      </AnimatePresence>

      {preview && createPortal(
        <div
          className="active-gen-preview"
          role="dialog"
          aria-modal="true"
          aria-label={preview.title}
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            className="active-gen-preview__close"
            onClick={(e) => {
              e.stopPropagation();
              setPreview(null);
            }}
            aria-label="Закрыть"
          >
            ×
          </button>
          <img
            src={preview.url}
            alt={preview.title}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="active-gen-preview__title">{preview.title}</div>
        </div>,
        document.body,
      )}
    </section>
  );
}
