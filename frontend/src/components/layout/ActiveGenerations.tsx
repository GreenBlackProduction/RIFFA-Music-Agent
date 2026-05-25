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
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { retryGeneration } from "@/lib/api/client";
import {
  ActiveGeneration,
  type CompletedTrackLike,
  useGenerationStore,
} from "@/store/generation";
import { usePlayer } from "@/store/player";

import "./ActiveGenerations.css";

const STEP_KEYS = [
  "start", "lyrics", "enriching_music", "music",
  "submitting", "queued", "generating", "submitting_wav", "converting_wav",
] as const;

const TYPE_KEYS = [
  "song", "instrumental", "sound_effect", "cover", "cover_song",
  "occasion", "cover_art", "lyrics", "extend", "wav_convert",
] as const;

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

function useLabels() {
  const { t } = useTranslation();
  const typeLabel = (k: string) =>
    TYPE_KEYS.includes(k as (typeof TYPE_KEYS)[number]) ? t(`activeGen.types.${k}`) : k;
  const stepLabel = (k: string | null | undefined) => {
    if (!k) return t("activeGen.waiting");
    return STEP_KEYS.includes(k as (typeof STEP_KEYS)[number]) ? t(`activeGen.steps.${k}`) : k;
  };
  return { t, typeLabel, stepLabel };
}

function CompletedActions({ gen, onOpenPreview }: CardActionsProps) {
  const { t, typeLabel } = useLabels();
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
  // Радио-публикация поддерживается только для основных музыкальных
  // модулей (sfx, wav, обложки не публикуем). Все треки из этого
  // сайдбара — это свежие генерации текущего пользователя, поэтому
  // isOwn=true и canRadio определяется только по типу.
  const canRadio =
    gen.type === "song" ||
    gen.type === "instrumental" ||
    gen.type === "cover" ||
    gen.type === "cover_song" ||
    gen.type === "occasion";

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
      title: track.title || gen.title || t("activeGen.fallbackTrackTitle"),
      url: track.audio_url,
      cover: track.image_url,
      meta: typeLabel(gen.type),
      isMusicType,
      isOwn: true,
      canRadio,
      audioId: track.audio_id || undefined,
    });
  }

  if (tracks.length === 0 && !previewImage) {
    return <p className="active-gen__done">{t("activeGen.done")}</p>;
  }

  return (
    <div className="active-gen__actions" role="group" aria-label={t("activeGen.actionsAria")}>
      {tracks.map((trk, i) => {
        const playerKey = playerIdFor(i);
        const isCurrent = playerCurrent?.id === playerKey;
        const isThisPlaying = isCurrent && isPlaying;
        const label = tracks.length > 1 ? `V${i + 1}` : t("activeGen.listen");
        return (
          <button
            key={playerKey}
            type="button"
            className={`active-gen__action active-gen__action--play${isCurrent ? " active-gen__action--current" : ""}`}
            onClick={() => handlePlay(trk, i)}
            aria-label={`${isThisPlaying ? t("activeGen.pause") : t("activeGen.play")} ${label}`}
            aria-pressed={isCurrent}
            title={trk.title || label}
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
          onClick={() => onOpenPreview(previewImage, gen.title || t("activeGen.previewFallback"))}
          aria-label={t("activeGen.openCoverAria")}
          title={t("activeGen.openCover")}
        >
          <span aria-hidden="true">🖼</span>
          <span>{t("activeGen.coverLabel")}</span>
        </button>
      ) : null}
    </div>
  );
}

function FailedActions({ gen }: { gen: ActiveGeneration }) {
  const { t } = useTranslation();
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
      <p className="active-gen__error">{gen.error ?? t("activeGen.errorFallback")}</p>
      <button
        type="button"
        className="active-gen__retry"
        onClick={handleRetry}
        disabled={retrying}
        title={t("activeGen.retryTitle")}
      >
        {retrying ? t("activeGen.retrying") : t("activeGen.retry")}
      </button>
    </div>
  );
}

function CardBody({ gen, onOpenPreview }: CardActionsProps) {
  const { stepLabel } = useLabels();
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
      <p className="active-gen__step">{stepLabel(gen.step)}</p>
    </>
  );
}

export function CollapsedGenerationProgress() {
  const { t, typeLabel, stepLabel } = useLabels();
  const active = useGenerationStore((s) => s.active);
  const entries = useMemo(
    () =>
      Object.values(active).filter((gen) => gen.status === "queued" || gen.status === "processing"),
    [active],
  );
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.body.classList.toggle("has-collapsed-progress", entries.length > 0);
    return () => document.body.classList.remove("has-collapsed-progress");
  }, [entries.length]);

  // Замеряем реальную высоту прогресс-бара и публикуем её через CSS-переменную,
  // чтобы плеер сдвигался ровно на нужное количество пикселей.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || entries.length === 0) {
      document.body.style.removeProperty("--gen-progress-height");
      return;
    }
    const update = () => {
      const h = el.getBoundingClientRect().height;
      document.body.style.setProperty("--gen-progress-height", `${Math.ceil(h)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.body.style.removeProperty("--gen-progress-height");
    };
  }, [entries.length]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <aside ref={containerRef} className="collapsed-gen-progress" aria-label={t("activeGen.progressAria")}>
      {entries.map((gen) => {
        const label = gen.title || typeLabel(gen.type) || t("activeGen.generationFallback");
        const step = gen.step ? stepLabel(gen.step) : t("activeGen.waitingShort");
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

// Завершённые карточки автоматически испаряются через этот таймаут, чтобы не
// засорять сайдбар после успешной генерации. Пользователь может закрыть
// раньше (×) или продолжить взаимодействие — отсчёт стартует от перехода в
// completed.
const AUTO_DISMISS_MS = 30_000;

export function ActiveGenerations() {
  const { t, typeLabel } = useLabels();
  const active = useGenerationStore((s) => s.active);
  const dismiss = useGenerationStore((s) => s.dismiss);
  const entries = Object.values(active);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  // Auto-dismiss: для каждой completed-карточки заводим setTimeout. Если
  // пользователь закроет вручную раньше — gen исчезнет из active, useEffect
  // перезапустится, и таймер будет очищен через возвращаемый cleanup.
  useEffect(() => {
    const timers: number[] = [];
    for (const gen of entries) {
      if (gen.status === "completed") {
        const t = window.setTimeout(() => dismiss(gen.id), AUTO_DISMISS_MS);
        timers.push(t);
      }
    }
    return () => { for (const t of timers) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.map((g) => `${g.id}:${g.status}`).join(",")]);

  function openPreview(url: string, title: string) {
    setPreview({ url, title });
  }

  return (
    <section className="active-gen-panel" aria-label={t("activeGen.panelLabel")}>
      {entries.length > 0 && (
        <header className="active-gen-panel__head">
          <span>{t("activeGen.panelTitle")}</span>
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
                <strong className="active-gen__title">{gen.title || t("activeGen.genericTitle")}</strong>
                <span className="active-gen__type">
                  {typeLabel(gen.type)}
                </span>
              </div>
              <button
                type="button"
                className="active-gen__close"
                onClick={() => dismiss(gen.id)}
                aria-label={t("activeGen.hideCardAria")}
                title={t("activeGen.hideCard")}
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
            aria-label={t("activeGen.closeAria")}
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
