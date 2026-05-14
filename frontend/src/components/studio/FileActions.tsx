import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { convertToWav, shareGeneration, generateCoverArt } from "@/lib/api/client";
import { usePlayer } from "@/store/player";
import { useGenerationStore } from "@/store/generation";

interface Props {
  audioUrl?: string;
  title?: string;
  isMusicType?: boolean;
  canRadio?: boolean;
  fileId?: string | number;
  isPublic?: boolean;
  onToggleRadio?: (next: boolean) => void | Promise<unknown>;
  radioPending?: boolean;
  downloadUrl?: string;
  /** Generation UUID — needed for WAV conversion and extend. */
  generationId?: string;
  /** Suno audio_id for this specific track — needed for WAV conversion. */
  audioId?: string;

  /** Whether this row is the currently playing track (for play/pause pill). */
  isActive?: boolean;
  /** Whether the global player is currently playing. */
  isPlaying?: boolean;
  /** Toggle play/pause for this row. If provided, render the oval pill button. */
  onPlayPause?: () => void;
  /** Soft-delete this file. If provided, render the red round delete button.
   *  Called IMMEDIATELY on click — the parent is responsible for capturing the
   *  rect (passed as the first argument), filtering the item out of its
   *  rendered list (so siblings magnetize up), and rendering a "ghost" at the
   *  captured rect that plays the explosion animation for ~1s. */
  onDelete?: (rect: DOMRect | null) => void;
  /** Whether this is an image (cover_art) file. */
  isImageType?: boolean;
  /** Image URL for cover_art files (for download/enhance). */
  imageUrl?: string;
}

export function FileActions({
  audioUrl,
  title,
  isMusicType,
  canRadio,
  fileId,
  isPublic,
  onToggleRadio,
  radioPending,
  downloadUrl,
  generationId,
  audioId,
  isActive,
  isPlaying,
  onPlayPause,
  onDelete,
  isImageType,
  imageUrl,
}: Props) {
  const dlHref = downloadUrl || audioUrl;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ bottom: number; right: number } | null>(null);
  const [wavPending, setWavPending] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [enhancePending, setEnhancePending] = useState(false);
  const boltBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { radioSet, toggleRadio } = usePlayer(
    useShallow((s) => ({ radioSet: s.radioSet, toggleRadio: s.toggleRadio })),
  );
  const trackGeneration = useGenerationStore((s) => s.track);

  const controlled = onToggleRadio !== undefined;
  const onRadio = controlled
    ? Boolean(isPublic)
    : fileId !== undefined && radioSet.has(String(fileId));

  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (boltBtnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    }
    document.addEventListener("click", onOutside, true);
    return () => document.removeEventListener("click", onOutside, true);
  }, [menuOpen]);

  function openMenu() {
    if (boltBtnRef.current) {
      const r = boltBtnRef.current.getBoundingClientRect();
      setMenuPos({ bottom: window.innerHeight - r.top + 6, right: window.innerWidth - r.right });
    }
    setMenuOpen((v) => !v);
  }

  async function handleWavConvert() {
    if (!generationId || !audioId || wavPending) return;
    setMenuOpen(false);
    setWavPending(true);
    try {
      const resp = await convertToWav({ generation_id: generationId, audio_id: audioId });
      trackGeneration(
        resp.generation_id,
        resp.ws_url,
        "wav_convert",
        `WAV: ${title || "Трек"}`,
      );
    } catch {
      // silently fail — the generation card will appear in the sidebar with an error if so
    } finally {
      setWavPending(false);
    }
  }

  async function handleShare() {
    if (!generationId || sharePending) return;
    setSharePending(true);
    try {
      const resp = await shareGeneration(generationId);
      const shareUrl = `${window.location.origin}/s/${resp.share_id}`;
      await navigator.clipboard.writeText(shareUrl);
      setMenuOpen(false);
    } catch {
      // silent
    } finally {
      setSharePending(false);
    }
  }

  async function handleEnhanceImage() {
    if (!generationId || enhancePending) return;
    setEnhancePending(true);
    setMenuOpen(false);
    try {
      const resp = await generateCoverArt({
        prompt: `enhance and upscale: ${title || "cover art"}`,
        model: "nano-banana-pro",
        title: `${title || "Обложка"} (HD)`,
      });
      trackGeneration(
        resp.generation_id,
        resp.ws_url,
        "cover_art",
        `HD: ${title || "Обложка"}`,
      );
    } catch {
      // silent
    } finally {
      setEnhancePending(false);
    }
  }

  function handleDeleteClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!onDelete) return;
    const parent = e.currentTarget.closest<HTMLElement>(".file-item");
    const rect = parent?.getBoundingClientRect() ?? null;
    onDelete(rect);
  }

  const canWav = Boolean(generationId && audioId);

  return (
    <div className="file-actions" onClick={(e) => e.stopPropagation()}>
      {dlHref && (
        <a
          href={dlHref}
          download={title ?? true}
          className="file-dl"
          title="Скачать"
          aria-label="Скачать"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
            <path
              d="M8 2v8M5 7l3 3 3-3M3 13h10"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      )}

      {(isMusicType || isImageType) && (
        <div className="file-bolt-wrap">
          <button
            ref={boltBtnRef}
            type="button"
            className={`file-bolt${menuOpen ? " file-bolt--open" : ""}${wavPending || enhancePending ? " file-bolt--pending" : ""}`}
            onClick={openMenu}
            title={isImageType ? "Действия с изображением" : "Действия с треком"}
            disabled={wavPending || enhancePending}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
              <path d="M9 2L4 9h4l-1 5 5-7H8l1-5z" fill="currentColor" />
            </svg>
          </button>
        </div>
      )}

      {canRadio && fileId !== undefined && (
        <button
          type="button"
          className={`file-radio${onRadio ? " file-radio--on" : ""}`}
          onClick={() => {
            if (controlled) void onToggleRadio?.(!onRadio);
            else toggleRadio(fileId);
          }}
          disabled={radioPending}
          title={onRadio ? "Убрать с радио" : "Добавить на радио"}
          aria-pressed={onRadio}
        >
          {radioPending ? "…" : onRadio ? "В эфире" : "Radio"}
        </button>
      )}

      {onPlayPause && (
        <button
          type="button"
          className={`file-play-pill${isActive ? " file-play-pill--active" : ""}${
            isActive && isPlaying ? " file-play-pill--playing" : ""
          }`}
          onClick={() => onPlayPause()}
          title={isActive && isPlaying ? "Пауза" : "Воспроизвести"}
          aria-label={isActive && isPlaying ? "Пауза" : "Воспроизвести"}
          aria-pressed={isActive && isPlaying}
        >
          <span className="file-play-pill__icon" aria-hidden>
            {isActive && isPlaying ? "❚❚" : "▶"}
          </span>
        </button>
      )}

      {onDelete && (
        <button
          type="button"
          className="file-del"
          onClick={handleDeleteClick}
          title="В корзину"
          aria-label="Удалить в корзину"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
            <path
              d="M3 4h10M6.5 4V2.5h3V4M5 4l.7 9h4.6L11 4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {menuOpen && menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="file-bolt-menu"
            style={{ bottom: menuPos.bottom, right: menuPos.right }}
          >
            {isImageType ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleEnhanceImage()}
                  disabled={enhancePending}
                >
                  {enhancePending ? "⏳" : "✨"}&nbsp; Улучшить качество (Pro)
                </button>
                {generationId && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleShare()}
                    disabled={sharePending}
                  >
                    {sharePending ? "⏳" : "🔗"}&nbsp; Поделиться
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" role="menuitem" onClick={() => setMenuOpen(false)}>
                  🔁&nbsp; Продлить трек
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleWavConvert()}
                  disabled={!canWav}
                  title={canWav ? undefined : "Нет audio_id для конвертации"}
                >
                  💿&nbsp; Конвертировать в WAV
                </button>
                {generationId && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleShare()}
                    disabled={sharePending}
                  >
                    {sharePending ? "⏳" : "🔗"}&nbsp; Поделиться треком
                  </button>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
