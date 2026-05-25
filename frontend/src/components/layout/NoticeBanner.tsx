/**
 * NoticeBanner — глобальный баннер с сообщением от админа (бан / предупреждение).
 *
 * - Показывается на всех страницах, если у текущего пользователя есть
 *   ``notice_message``.
 * - Закрывается крестиком. Состояние «закрыт» хранится в localStorage и
 *   привязано к **хэшу** (kind + message), так что если админ напишет новое
 *   сообщение — баннер снова всплывёт.
 * - Стиль зависит от kind: ``ban`` — красный, ``warning`` — жёлтый.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/lib/auth";

import "./NoticeBanner.css";

function fnv1aHash(s: string): string {
  // Простой хэш для localStorage-ключа. Криптостойкость не нужна.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const STORAGE_PREFIX = "riffa:notice-dismissed:";

export function NoticeBanner() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  const kind = user?.notice_kind ?? null;
  const message = user?.notice_message ?? null;
  const userId = user?.id ?? null;

  // Каждое сочетание (userId, kind, message) даёт свой хэш — новое сообщение
  // не считается «закрытым», даже если предыдущее было дисмисснуто.
  const noticeHash =
    userId != null && message ? fnv1aHash(`${userId}|${kind}|${message}`) : null;
  const storageKey = noticeHash ? `${STORAGE_PREFIX}${noticeHash}` : null;

  useEffect(() => {
    if (!storageKey) {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(window.localStorage.getItem(storageKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  if (!user || !message) return null;
  if (dismissed) return null;

  const isBan = kind === "ban";
  const title = isBan ? t("noticeBannerExt.bannedTitle") : t("noticeBannerExt.adminMessage");

  const handleClose = () => {
    setDismissed(true);
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        /* ignore quota / privacy mode */
      }
    }
  };

  return (
    <div
      className={`notice-banner notice-banner--${isBan ? "ban" : "warning"}`}
      role={isBan ? "alert" : "status"}
    >
      <div className="notice-banner__icon" aria-hidden>
        {isBan ? "⛔" : "⚠️"}
      </div>
      <div className="notice-banner__content">
        <div className="notice-banner__title">{title}</div>
        <div className="notice-banner__message">{message}</div>
      </div>
      <button
        type="button"
        className="notice-banner__close"
        onClick={handleClose}
        aria-label={t("common.close")}
        title={t("common.close")}
      >
        ×
      </button>
    </div>
  );
}
