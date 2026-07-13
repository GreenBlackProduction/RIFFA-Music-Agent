/**
 * Mobile-only launch confirmation toast.
 *
 * On mobile the sidebar (with the active-generation cards) is a drawer behind
 * the hamburger menu, so a freshly launched generation gives no visible signal
 * — the user taps «Сгенерировать» and, for 4-5s, nothing happens on screen.
 * This overlay fires the instant a generation is launched (store.launchNotice),
 * reassuring the user that the request went through and pointing them to the
 * sidebar. Hidden on desktop via CSS, where the sidebar card is always visible.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { useGenerationStore } from "@/store/generation";

import "./GenerationLaunchToast.css";

const VISIBLE_MS = 4500;

export function GenerationLaunchToast() {
  const { t } = useTranslation();
  const notice = useGenerationStore((s) => s.launchNotice);
  const [shownTs, setShownTs] = useState<number | null>(null);

  useEffect(() => {
    if (!notice) return;
    setShownTs(notice.ts);
    const timer = window.setTimeout(() => setShownTs(null), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [notice?.ts]);

  if (shownTs === null) return null;

  return createPortal(
    <div className="gen-launch-toast" role="status" aria-live="polite">
      <span className="gen-launch-toast__spinner" aria-hidden="true" />
      <span className="gen-launch-toast__text">
        <strong>{t("genLaunchToast.title", { defaultValue: "Генерация запущена" })}</strong>
        <span className="gen-launch-toast__hint">
          {t("genLaunchToast.hint", { defaultValue: "⬅️ следите за процессом в сайдбаре" })}
        </span>
      </span>
    </div>,
    document.body,
  );
}
