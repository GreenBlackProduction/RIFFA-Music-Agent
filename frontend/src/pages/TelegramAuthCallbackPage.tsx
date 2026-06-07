/**
 * Frontend landing page for Telegram Login Widget redirect mode.
 *
 * Telegram redirects here after the user confirms login on oauth.telegram.org.
 * The auth data can arrive as:
 *   1. Query params:  /tg-auth?id=123&auth_date=...&hash=...
 *   2. Hash fragment: /tg-auth#id=123&auth_date=...&hash=...  (some mobile flows)
 *
 * We read both, call the backend widget endpoint, and redirect to /studio on success.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { loginWithTelegramWidget, pollBotLinkLogin } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";

function parseParams(search: string): Record<string, string> {
  const params: Record<string, string> = {};
  new URLSearchParams(search.replace(/^[?#]/, "")).forEach((v, k) => {
    params[k] = v;
  });
  return params;
}

export function TelegramAuthCallbackPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    void (async () => {
      // Merge query params + hash params (hash takes precedence when both present)
      const fromQuery = parseParams(window.location.search);
      const fromHash  = parseParams(window.location.hash);
      const p = { ...fromQuery, ...fromHash };

      // ── Bot-link return flow ──────────────────────────────────────────────
      // The bot's "Открыть RIFFA →" button sends the user here with a one-shot
      // nonce (return_url = /tg-auth?nonce=…). The bot already approved it, so
      // poll once to exchange the nonce for a session cookie, then continue.
      // Without this the page only understood the Login Widget (id/hash) and
      // bounced every bot-link login to /login?tg_error=1.
      const nonce = p["nonce"];
      if (nonce) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const r = await pollBotLinkLogin(nonce);
            if (r.approved) {
              await refresh();
              navigate("/studio", { replace: true });
              return;
            }
          } catch {
            break; // expired / network — show the error screen
          }
          await new Promise((res) => setTimeout(res, 800));
        }
        navigate("/login?tg_error=1", { replace: true });
        return;
      }

      const id       = p["id"]        ? Number(p["id"])        : undefined;
      const authDate = p["auth_date"] ? Number(p["auth_date"]) : undefined;
      const hash     = p["hash"];

      if (!id || !authDate || !hash) {
        // Nothing from Telegram — back to login with error
        navigate("/login?tg_error=1", { replace: true });
        return;
      }

      try {
        await loginWithTelegramWidget({
          id,
          auth_date: authDate,
          hash,
          first_name: p["first_name"],
          last_name:  p["last_name"],
          username:   p["username"],
          photo_url:  p["photo_url"],
        });
        await refresh();
        navigate("/studio", { replace: true });
      } catch {
        navigate("/login?tg_error=1", { replace: true });
      }
    })();
  }, [navigate, refresh]);

  return (
    <div style={{
      minHeight: "100dvh",
      display: "grid",
      placeItems: "center",
      background: "var(--bg)",
      color: "var(--text)",
      fontFamily: "var(--font-body)",
    }}>
      <p style={{ opacity: 0.6 }}>{t("login.telegram.loadingHint")}</p>
    </div>
  );
}
