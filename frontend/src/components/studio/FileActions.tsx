import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import { convertToWav, shareGeneration, generateCoverArt } from "@/lib/api/client";
import { usePlayer } from "@/store/player";
import { useGenerationStore } from "@/store/generation";

const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 4.5v15a1 1 0 0 0 1.5.87l13-7.5a1 1 0 0 0 0-1.74l-13-7.5A1 1 0 0 0 6 4.5z" />
  </svg>
);
const IconPause = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="5" y="4" width="5" height="16" rx="1.5" />
    <rect x="14" y="4" width="5" height="16" rx="1.5" />
  </svg>
);

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
  generationId?: string;
  audioId?: string;
  /** Index of this variant within a multi-variant generation (Suno returns V1+V2).
   *  Used by share to link to just this specific version. null = whole generation. */
  trackIndex?: number | null;
  isActive?: boolean;
  isPlaying?: boolean;
  onPlayPause?: () => void;
  onDelete?: (rect: DOMRect | null) => void;
  isImageType?: boolean;
  imageUrl?: string;
  /** Where the share button should point. "library" (default) → /s/<share_id>;
   *  "radio" → /radio?s=<share_id> so the link opens the radio player and
   *  auto-plays this track. */
  shareKind?: "library" | "radio";
  /** Owner-only rename handler. When omitted the menu hides the option,
   *  which gives us the "disabled on radio" requirement for free —
   *  radio rows never wire this callback. */
  onRename?: (next: string) => void | Promise<unknown>;
  /** Extra elements rendered inside the file-actions div (e.g. Radio vote buttons). */
  children?: React.ReactNode;
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
  trackIndex,
  isActive,
  isPlaying,
  onPlayPause,
  onDelete,
  isImageType,
  shareKind = "library",
  onRename,
  children,
}: Props) {
  const dlHref = downloadUrl || audioUrl;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ bottom: number; right: number } | null>(null);
  const [wavPending, setWavPending] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [enhancePending, setEnhancePending] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renamePending, setRenamePending] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const boltBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

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

  // Auto-dismiss share toast
  useEffect(() => {
    if (!shareToast) return;
    const timer = setTimeout(() => setShareToast(null), 2500);
    return () => clearTimeout(timer);
  }, [shareToast]);

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
        `WAV: ${title || t("fileActions.fallbackTrack")}`,
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
      const variantQuery = trackIndex !== null && trackIndex !== undefined
        ? `v=${trackIndex}`
        : "";
      const shareUrl = shareKind === "radio"
        ? `${window.location.origin}/radio?s=${resp.share_id}${variantQuery ? `&${variantQuery}` : ""}`
        : `${window.location.origin}/s/${resp.share_id}${variantQuery ? `?${variantQuery}` : ""}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareToast(t("fileActions.linkCopied"));
      } catch {
        // Clipboard может быть заблокирован в Mini App / без HTTPS-контекста —
        // fallback: textarea select + execCommand
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
          setShareToast(t("fileActions.linkCopied"));
        } catch {
          setShareToast(t("fileActions.copyManually") + shareUrl);
        } finally {
          document.body.removeChild(ta);
        }
      }
      setMenuOpen(false);
    } catch {
      setShareToast(t("fileActions.shareError"));
    } finally {
      setSharePending(false);
    }
  }

  function openRename() {
    setMenuOpen(false);
    setRenameValue(title ?? "");
    setRenameOpen(true);
    // Wait one tick so the dialog mounts before focusing.
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!onRename) return;
    const next = renameValue.trim();
    if (!next || next === title) {
      setRenameOpen(false);
      return;
    }
    setRenamePending(true);
    try {
      await onRename(next);
      setRenameOpen(false);
    } catch {
      // Stays open so the user can retry / cancel manually.
    } finally {
      setRenamePending(false);
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
        title: `${title || t("fileActions.fallbackCover")} (HD)`,
      });
      trackGeneration(
        resp.generation_id,
        resp.ws_url,
        "cover_art",
        `HD: ${title || t("fileActions.fallbackCover")}`,
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
          title={t("fileActions.download")}
          aria-label={t("fileActions.download")}
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
            title={isImageType ? t("fileActions.imageActions") : t("fileActions.trackActions")}
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
          title={onRadio ? t("fileActions.removeFromRadio") : t("fileActions.addToRadio")}
          aria-pressed={onRadio}
        >
          {radioPending ? "…" : onRadio ? t("fileActions.onAir") : t("fileActions.radio")}
        </button>
      )}

      {onPlayPause && (
        <button
          type="button"
          className={`file-play-pill${isActive ? " file-play-pill--active" : ""}${
            isActive && isPlaying ? " file-play-pill--playing" : ""
          }`}
          onClick={() => onPlayPause()}
          title={isActive && isPlaying ? t("fileActions.pause") : t("fileActions.play")}
          aria-label={isActive && isPlaying ? t("fileActions.pause") : t("fileActions.play")}
          aria-pressed={isActive && isPlaying}
        >
          <span className="file-play-pill__icon" aria-hidden>
            {isActive && isPlaying ? <IconPause /> : <IconPlay />}
          </span>
        </button>
      )}

      {onDelete && (
        <button
          type="button"
          className="file-del"
          onClick={handleDeleteClick}
          title={t("fileActions.toTrash")}
          aria-label={t("fileActions.deleteToTrash")}
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

      {children}

      {shareToast &&
        createPortal(
          <div className="share-toast" role="status" aria-live="polite">
            {shareToast}
          </div>,
          document.body,
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
                  {enhancePending ? "⏳" : "✨"}&nbsp; {t("fileActions.enhancePro")}
                </button>
                {generationId && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleShare()}
                    disabled={sharePending}
                  >
                    {sharePending ? "⏳" : "🔗"}&nbsp; {t("fileActions.share")}
                  </button>
                )}
              </>
            ) : (
              <>
                {/* Extend disabled site-wide for now. */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleWavConvert()}
                  disabled={!canWav}
                  title={canWav ? undefined : t("fileActions.noAudioId")}
                >
                  💿&nbsp; {t("fileActions.convertToWav")}
                </button>
                {onRename && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openRename}
                  >
                    ✏️&nbsp; {t("fileActions.rename", { defaultValue: "Переименовать" })}
                  </button>
                )}
                {generationId && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleShare()}
                    disabled={sharePending}
                  >
                    {sharePending ? "⏳" : "🔗"}&nbsp; {t("fileActions.shareTrack")}
                  </button>
                )}
              </>
            )}
          </div>,
          document.body,
        )}

      {renameOpen &&
        createPortal(
          <div
            className="rename-modal-backdrop"
            onClick={() => !renamePending && setRenameOpen(false)}
          >
            <form
              className="rename-modal"
              onClick={(e) => e.stopPropagation()}
              onSubmit={submitRename}
            >
              <label className="rename-modal__label">
                {t("fileActions.renameLabel", { defaultValue: "Новое название" })}
              </label>
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                maxLength={80}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && !renamePending) setRenameOpen(false);
                }}
                disabled={renamePending}
                autoFocus
              />
              <div className="rename-modal__actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setRenameOpen(false)}
                  disabled={renamePending}
                >
                  {t("common.cancel", { defaultValue: "Отмена" })}
                </button>
                <button
                  type="submit"
                  className="btn btn-ink btn-sm"
                  disabled={renamePending || !renameValue.trim()}
                >
                  {renamePending
                    ? t("common.saving", { defaultValue: "Сохраняю…" })
                    : t("common.save", { defaultValue: "Сохранить" })}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
