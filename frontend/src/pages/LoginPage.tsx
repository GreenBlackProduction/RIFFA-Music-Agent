import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Panel } from "@/components/ui/Panel";
import {
  loginWithEmail,
  loginWithTelegramWidget,
  registerWithEmail,
  type TelegramWidgetPayload,
} from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import "./LoginPage.css";

const TG_BOT = (import.meta.env.VITE_TG_BOT_USERNAME as string | undefined) ?? "The_Riffa_bot";

export function LoginPage() {
  const t = useT();
  const { user, isLoading, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [emailMode, setEmailMode] = useState<"login" | "register">("login");
  const [emailValue, setEmailValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [confirmValue, setConfirmValue] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "error">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [tgError, setTgError] = useState<string | null>(null);
  const [botNotStarted, setBotNotStarted] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    // Listen for postMessage from the Telegram OAuth iframe.
    function handleMessage(event: MessageEvent) {
      if (event.origin !== "https://oauth.telegram.org") return;
      if (!event.data || typeof event.data !== "object") return;
      const payload = event.data as Record<string, unknown>;
      if (!payload.id || !payload.hash) return;
      void (async () => {
        try {
          await loginWithTelegramWidget(payload as unknown as TelegramWidgetPayload);
          await refresh();
        } catch (err) {
          const botUrl = extractBotUrl(err);
          if (botUrl) { setBotNotStarted(botUrl); } else { setTgError(toMessage(err)); }
        }
      })();
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [refresh]);

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
    const next = (location.state as { from?: string } | null)?.from ?? "/studio";
    return <Navigate to={next} replace />;
  }

  return (
    <div className="login-page">
      <header className="login-topbar">
        <div className="login-topbar__brand">
          <img src="/riffa-logo.png" alt="" className="login-brand__logo" />
          <strong className="brand-name">RIFFA<span className="brand-name__sub">Studio</span></strong>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="login-grid">
        <section className="login-hero">
          <div className="login-hero__inner">
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
            <iframe
              id="telegram-login-widget"
              src={`https://oauth.telegram.org/embed/${TG_BOT}?origin=${encodeURIComponent(window.location.origin)}&size=large&request_access=write`}
              style={{ border: "none", width: "100%", height: 56, overflow: "hidden", borderRadius: 8 }}
              title="Login with Telegram"
            />
            <a
              href={`https://t.me/${TG_BOT}?start=weblogin`}
              target="_blank"
              rel="noopener noreferrer"
              className="tg-fallback-btn"
            >
              Открыть @{TG_BOT} в Telegram
            </a>
            {botNotStarted && (
              <div className="login-bot-gate">
                <p className="login-bot-gate__text">
                  Чтобы войти через Telegram, сначала запустите бота — нажмите <strong>/start</strong>, затем вернитесь и войдите снова.
                </p>
                <a
                  href={botNotStarted}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="login-bot-gate__btn"
                  onClick={() => setBotNotStarted(null)}
                >
                  Открыть @{TG_BOT} в Telegram
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
          <stop offset="100%" stopColor="#d600ff" />
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
          <stop offset="100%" stopColor="#d600ff" />
        </linearGradient>
      </defs>
      <rect x="4" y="8" width="24" height="16" rx="3" fill="rgba(246,244,255,0.06)" stroke="rgba(246,244,255,0.4)" strokeWidth="1.5" />
      <path d="M5 10 L16 18 L27 10" stroke="url(#env-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function toMessage(err: unknown): string {
  if (err && typeof err === "object" && "detail" in err && typeof err.detail === "string") {
    return err.detail;
  }
  if (err instanceof Error) return err.message;
  return "";
}

function extractBotUrl(err: unknown): string | null {
  if (err && typeof err === "object" && "detail" in err) {
    const detail = (err as Record<string, unknown>).detail;
    if (detail && typeof detail === "object" && "code" in detail && (detail as Record<string, unknown>).code === "bot_not_started") {
      return (detail as Record<string, unknown>).bot_url as string ?? null;
    }
  }
  return null;
}
