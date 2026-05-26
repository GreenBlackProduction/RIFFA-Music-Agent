import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { RiffaMark } from "@/components/brand/RiffaMark";
import {
  loginWithEmail,
  loginWithTelegramInitData,
  loginWithTelegramWidget,
  pollBotLinkLogin,
  registerWithEmail,
  startBotLinkLogin,
} from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { getTelegramInitData } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import "./LoginPage.css";

const TG_BOT = (import.meta.env.VITE_TG_BOT_USERNAME as string | undefined) ?? "The_Riffa_bot";

/** First login → /guide, subsequent logins → /studio. Marker stored locally. */
function firstVisitDest(): string {
  try {
    if (!localStorage.getItem("riffa_visited")) {
      localStorage.setItem("riffa_visited", "1");
      return "/guide";
    }
  } catch { /* localStorage unavailable */ }
  return "/studio";
}

// Telegram Login Widget auth data shape (comes from data-onauth callback or redirect params)
interface TgWidgetData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    _riffa_tg_auth?: (data: TgWidgetData) => void;
  }
}

export function LoginPage() {
  const t = useT();
  const { user, isLoading, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [emailMode, setEmailMode] = useState<"login" | "register">("login");
  const [emailValue, setEmailValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [confirmValue, setConfirmValue] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "error">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [tgLoading, setTgLoading] = useState(false);
  const [tgBtnError, setTgBtnError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const tgLoadingRef = useRef(false);

  // ── Bot-link auth: state for the magic-link via bot flow ──────────────────
  const [botLinkStatus, setBotLinkStatus] = useState<
    "idle" | "waiting" | "approved" | "expired" | "error"
  >("idle");
  const botLinkPollRef = useRef<number | null>(null);
  const botLinkAbortRef = useRef<boolean>(false);

  // Errors passed back via redirect fallback from /tg-auth
  const tgError = searchParams.get("tg_error")
    ? t.tgError
    : null;
  const botNotStarted = searchParams.get("bot_not_started")
    ? searchParams.get("bot_url")
    : null;

  // ── Telegram widget: data-onauth callback ─────────────────────────────────
  // We expose a global function that the Telegram widget script calls after
  // the user authorises. This avoids the redirect round-trip (/tg-auth) which
  // loses params in some mobile browsers / Telegram WebView configurations.
  useEffect(() => {
    window._riffa_tg_auth = async (data: TgWidgetData) => {
      if (tgLoadingRef.current) return;
      tgLoadingRef.current = true;
      setTgLoading(true);
      setTgBtnError(null);
      try {
        await loginWithTelegramWidget({
          id: data.id,
          auth_date: data.auth_date,
          hash: data.hash,
          first_name: data.first_name,
          last_name: data.last_name,
          username: data.username,
          photo_url: data.photo_url,
        });
        await refresh();
        navigate(firstVisitDest(), { replace: true });
      } catch (err: unknown) {
        const detail = (err as { detail?: { code?: string; bot_url?: string } } | null)?.detail;
        if (detail?.code === "bot_not_started" && detail?.bot_url) {
          navigate(`/login?bot_not_started=1&bot_url=${encodeURIComponent(detail.bot_url)}`, { replace: true });
        } else {
          setTgBtnError(t.tgBtnError);
        }
      } finally {
        tgLoadingRef.current = false;
        setTgLoading(false);
      }
    };
    return () => { window._riffa_tg_auth = undefined; };
  }, [navigate, refresh]);

  // ── Inject Telegram widget script ─────────────────────────────────────────
  useEffect(() => {
    const container = document.getElementById("tg-widget-host");
    if (!container) return;
    container.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", TG_BOT);
    script.setAttribute("data-size", "large");
    // data-onauth: popup mode — auth data passed directly to JS callback (no redirect)
    script.setAttribute("data-onauth", "window._riffa_tg_auth(user)");
    // data-auth-url: fallback redirect mode if popup is blocked
    script.setAttribute("data-auth-url", "https://riffastudio.site/tg-auth");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);
    return () => { container.innerHTML = ""; };
  }, []);

  async function handleTelegramLogin() {
    setTgBtnError(null);

    // Telegram Mini App — use initData (silent, no widget needed).
    const initData = getTelegramInitData();
    if (initData) {
      setTgLoading(true);
      try {
        await loginWithTelegramInitData(initData);
        await refresh();
      } catch {
        setTgBtnError(t.errors.generic);
      } finally {
        setTgLoading(false);
      }
    }
  }

  // ── Bot-link auth: kick off the magic-link via bot flow ────────────────────
  // 1. Backend creates a nonce, returns a deep-link to the bot
  // 2. We open the bot, then poll the backend until the user confirms
  // 3. On approved=true, backend sets the session cookie automatically
  useEffect(() => {
    return () => {
      botLinkAbortRef.current = true;
      if (botLinkPollRef.current) {
        window.clearTimeout(botLinkPollRef.current);
        botLinkPollRef.current = null;
      }
    };
  }, []);

  async function handleBotLinkLogin() {
    if (botLinkStatus === "waiting") return;
    setTgBtnError(null);
    setBotLinkStatus("waiting");
    botLinkAbortRef.current = false;
    try {
      const { nonce, bot_url } = await startBotLinkLogin();
      // Open the bot — Telegram Mini App uses native opener, browser opens new tab
      const tg = (window as { Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void } } }).Telegram;
      if (tg?.WebApp?.openTelegramLink) {
        tg.WebApp.openTelegramLink(bot_url);
      } else {
        window.open(bot_url, "_blank", "noopener,noreferrer");
      }
      // Poll the backend every 2s up to 5 min (matches Redis TTL)
      const startedAt = Date.now();
      const tick = async () => {
        if (botLinkAbortRef.current) return;
        if (Date.now() - startedAt > 5 * 60 * 1000) {
          setBotLinkStatus("expired");
          return;
        }
        try {
          const r = await pollBotLinkLogin(nonce);
          if (r.approved) {
            setBotLinkStatus("approved");
            await refresh();
            navigate("/studio", { replace: true });
            return;
          }
        } catch (err: unknown) {
          const status = (err as { status?: number } | null)?.status;
          if (status === 410) {
            setBotLinkStatus("expired");
            return;
          }
          // Network blip — keep polling
        }
        botLinkPollRef.current = window.setTimeout(tick, 2000);
      };
      botLinkPollRef.current = window.setTimeout(tick, 2000);
    } catch (err) {
      setBotLinkStatus("error");
      setTgBtnError(t.tgBtnError);
    }
  }

  if (isLoading) {
    return (
      <div className="login-loading">
        <Panel title="…">
          <p className="muted">…</p>
        </Panel>
      </div>
    );
  }

  if (user) {
    const next = (location.state as { from?: string } | null)?.from ?? firstVisitDest();
    return <Navigate to={next} replace />;
  }

  return (
    <div className="login-page">
      <header className="login-topbar">
        <div className="login-topbar__brand">
          <RiffaMark size={22} />
          <strong className="brand-name">RIFFA</strong>
          <span className="brand-name__sub">studio</span>
        </div>
        <LoginLangSwitch />
      </header>

      <main className="login-grid">
        <section className="login-hero">
          <div className="login-hero__inner">
            <div className="login-hero__wordmark" aria-hidden="true">
              <img
                src="/brand/03-lockup/riffa-lockup-horizontal-on-dark.svg"
                alt="RIFFA Studio"
                style={{ height: 52, width: "auto" }}
              />
            </div>
            <h1>{t.hero.title}</h1>
            <p className="login-hero__lead">{t.hero_lead}</p>
            <ul className="login-hero__features">
              {t.features.map((feature) => (
                <li key={feature.title}>
                  <span className="login-bullet" aria-hidden="true" />
                  <div className="login-hero__feature">
                    <strong>{feature.title}</strong>
                    <span>{feature.descr}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="login-hero__glow" aria-hidden="true" />
        </section>

        <section className="login-card">
          <header className="login-card__header">
            <h2>{t.brand.title}</h2>
            <p className="muted">{t.brand.subtitle}</p>
          </header>

          <section className="login-block login-block--telegram">
            <span className="login-block__badge login-block__badge--corner">{t.telegram.badge}</span>
            <div className="login-block__head">
              <span className="login-block__icon" aria-hidden="true">
                <TelegramIcon />
              </span>
              <div className="login-block__heading">
                <h3>{t.telegram.section}</h3>
                <p className="login-block__perk">{t.telegram.perk}</p>
              </div>
            </div>
            <p className="muted">{t.telegram.explainer}</p>

            {/* Главная кнопка: вход через бот (deep-link). Работает всегда —
                не требует настройки доменa в @BotFather как Login Widget. */}
            {!getTelegramInitData() && (
              <button
                type="button"
                className="tg-login-btn"
                onClick={() => { void handleBotLinkLogin(); }}
                disabled={botLinkStatus === "waiting" || botLinkStatus === "approved"}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
                  <path d="M21.8 3.1L2.3 10.7c-1.3.5-1.3 1.3-.2 1.6l5 1.6 11.4-7.2c.5-.3 1 0 .6.4L9 16.5v3.1c0 .9 1.2 1.3 1.8.6l2.6-2.5 5.1 3.8c.9.5 1.6.2 1.8-.8l3.3-16.2c.4-1.4-.5-2-1.8-1.4z" fill="#fff"/>
                </svg>
                {botLinkStatus === "waiting"
                  ? t.telegram.btnWaiting
                  : botLinkStatus === "approved"
                  ? t.telegram.btnApproved
                  : t.telegram.btnText}
              </button>
            )}

            {botLinkStatus === "waiting" && (
              <p className="muted login-hint">{t.telegram.waitingHint}</p>
            )}
            {botLinkStatus === "expired" && (
              <p className="muted login-hint" style={{ color: "var(--accent)" }}>
                {t.telegram.expiredHint}
              </p>
            )}

            {/* Альтернативный вариант: официальный Telegram Login Widget */}
            <div id="tg-widget-host" className="tg-widget-host" />

            {/* Кнопка для Telegram Mini App — используется initData */}
            {getTelegramInitData() && (
              <button
                type="button"
                className="tg-login-btn"
                onClick={() => { void handleTelegramLogin(); }}
                disabled={tgLoading}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
                  <path d="M21.8 3.1L2.3 10.7c-1.3.5-1.3 1.3-.2 1.6l5 1.6 11.4-7.2c.5-.3 1 0 .6.4L9 16.5v3.1c0 .9 1.2 1.3 1.8.6l2.6-2.5 5.1 3.8c.9.5 1.6.2 1.8-.8l3.3-16.2c.4-1.4-.5-2-1.8-1.4z" fill="#fff"/>
                </svg>
                {tgLoading ? t.telegram.loadingShort : t.telegram.btnText}
              </button>
            )}

            {tgLoading && !getTelegramInitData() && (
              <p className="muted login-hint">{t.telegram.loadingHint}</p>
            )}
            {tgBtnError && <p className="muted login-hint" style={{ color: "var(--accent)" }}>{tgBtnError}</p>}
            {botNotStarted && (
              <div className="login-bot-gate">
                <p className="login-bot-gate__text">{t.telegram.botNotStartedText}</p>
                <a
                  href={botNotStarted}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="login-bot-gate__btn"
                >
                  {t.telegram.botNotStartedBtn.replace("{{bot}}", TG_BOT)}
                </a>
              </div>
            )}
            {tgError && <div className="login-error">{tgError}</div>}
            <p className="muted login-hint">{t.telegram.miniHint}</p>
          </section>

          <div className="login-divider"><span>{t.divider}</span></div>

          <section className="login-block">
            <div className="login-block__head">
              <span className="login-block__icon" aria-hidden="true">
                <EnvelopeIcon />
              </span>
              <div className="login-block__heading">
                <h3>{t.email.section}</h3>
                <p className="login-block__perk">{t.email.perk}</p>
              </div>
            </div>

            <div className="login-tabs">
              <button
                type="button"
                className={`login-tab${emailMode === "login" ? " is-active" : ""}`}
                onClick={() => { setEmailMode("login"); setEmailError(null); }}
              >
                {t.email.loginTab}
              </button>
              <button
                type="button"
                className={`login-tab${emailMode === "register" ? " is-active" : ""}`}
                onClick={() => { setEmailMode("register"); setEmailError(null); }}
              >
                {t.email.registerTab}
              </button>
            </div>

            {emailMode === "login" ? (
              <form
                className="login-form--stacked"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setEmailError(null);
                  setEmailStatus("sending");
                  try {
                    await loginWithEmail(emailValue, passwordValue);
                    await refresh();
                  } catch (err) {
                    setEmailStatus("error");
                    setEmailError(toMessage(err) || t.errors.generic);
                  } finally {
                    setEmailStatus("idle");
                  }
                }}
              >
                <input
                  type="email"
                  required
                  placeholder={t.email.emailPlaceholder}
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  disabled={emailStatus === "sending"}
                />
                <input
                  type="password"
                  required
                  placeholder={t.email.passwordPlaceholder}
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  disabled={emailStatus === "sending"}
                />
                <Button type="submit" disabled={emailStatus === "sending"}>
                  {emailStatus === "sending" ? t.email.loginSubmitting : t.email.loginSubmit}
                </Button>
              </form>
            ) : (
              <form
                className="login-form--stacked"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setEmailError(null);
                  if (passwordValue.length < 6) {
                    setEmailError(t.email.weakPassword);
                    return;
                  }
                  if (passwordValue !== confirmValue) {
                    setEmailError(t.email.passwordMismatch);
                    return;
                  }
                  setEmailStatus("sending");
                  try {
                    await registerWithEmail(emailValue, passwordValue);
                    await refresh();
                  } catch (err) {
                    setEmailStatus("error");
                    const msg = toMessage(err);
                    setEmailError(
                      msg.includes("409") || msg.toLowerCase().includes("зарегистрирован")
                        ? t.email.emailTaken
                        : msg || t.errors.generic,
                    );
                  } finally {
                    setEmailStatus("idle");
                  }
                }}
              >
                <input
                  type="email"
                  required
                  placeholder={t.email.emailPlaceholder}
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  disabled={emailStatus === "sending"}
                />
                <input
                  type="password"
                  required
                  placeholder={t.email.passwordPlaceholder}
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  disabled={emailStatus === "sending"}
                />
                <input
                  type="password"
                  required
                  placeholder={t.email.confirmPlaceholder}
                  value={confirmValue}
                  onChange={(e) => setConfirmValue(e.target.value)}
                  disabled={emailStatus === "sending"}
                />
                <Button type="submit" disabled={emailStatus === "sending"}>
                  {emailStatus === "sending" ? t.email.registerSubmitting : t.email.registerSubmit}
                </Button>
              </form>
            )}

            {emailStatus === "error" && emailError && <div className="login-error">{emailError}</div>}
          </section>

          <footer className="login-footer">
            <p className="muted login-legal">
              {t.legal.note} <a href="#terms">{t.legal.terms}</a> · <a href="#privacy">{t.legal.privacy}</a>.
            </p>
            <button
              type="button"
              className="link"
              onClick={() => navigate("/studio")}
            >
              {t.demo}
            </button>
          </footer>
        </section>
      </main>

      <section className="login-faq">
        <h3>{t.faq.title}</h3>
        <div className="login-faq__list">
          {t.faq.items.map((item, index) => {
            const isOpen = openFaq === index;
            return (
              <div key={item.q} className={`login-faq__item${isOpen ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="login-faq__q"
                  aria-expanded={isOpen}
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                >
                  <span>{item.q}</span>
                  <span className="login-faq__chev">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && <p className="login-faq__a">{item.a}</p>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
      <defs>
        <linearGradient id="tg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7cff1f" />
          <stop offset="100%" stopColor="#0F5D47" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="url(#tg-grad)" opacity="0.16" />
      <path
        d="M7.4 15.3 L23.7 8.6 C24.5 8.3 25.2 8.8 24.9 10 L22.2 22.5 C22 23.4 21.4 23.6 20.7 23.2 L17 20.5 L15.2 22.2 C15 22.4 14.8 22.6 14.4 22.6 L14.7 18.8 L21.7 12.4 C22 12.1 21.7 12 21.2 12.2 L12.6 17.6 L9 16.5 C8.2 16.2 8.2 15.7 9 15.4 Z"
        fill="#7cff1f"
      />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
      <defs>
        <linearGradient id="env-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff5a00" />
          <stop offset="100%" stopColor="#0F5D47" />
        </linearGradient>
      </defs>
      <rect x="4" y="8" width="24" height="16" rx="3" fill="rgba(246,244,255,0.06)" stroke="rgba(246,244,255,0.4)" strokeWidth="1.5" />
      <path d="M5 10 L16 18 L27 10" stroke="url(#env-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function toMessage(err: unknown): string {
  if (err && typeof err === "object" && "detail" in err && typeof (err as { detail: unknown }).detail === "string") {
    return (err as { detail: string }).detail;
  }
  if (err instanceof Error) return err.message;
  return "";
}

// Минимальный RU/EN переключатель в шапке Login (сайдбара нет до входа)
import { useTranslation } from "react-i18next";

function LoginLangSwitch() {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || "ru").startsWith("en") ? "en" : "ru";
  const set = (l: "ru" | "en") => { if (l !== current) void i18n.changeLanguage(l); };
  return (
    <div style={{ display: "inline-flex", gap: 4, background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, padding: 2 }}>
      <button type="button" onClick={() => set("ru")}
        style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 999,
                 border: "none", cursor: "pointer",
                 background: current === "ru" ? "rgba(124,255,31,0.16)" : "transparent",
                 color: current === "ru" ? "#cfff9a" : "#9b95b6" }}>RU</button>
      <button type="button" onClick={() => set("en")}
        style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 999,
                 border: "none", cursor: "pointer",
                 background: current === "en" ? "rgba(124,255,31,0.16)" : "transparent",
                 color: current === "en" ? "#cfff9a" : "#9b95b6" }}>EN</button>
    </div>
  );
}
