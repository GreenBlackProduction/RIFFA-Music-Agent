import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import "./CookieConsent.css";

// We key consent by user.id so a fresh signup on the same browser still sees
// the banner. Anonymous visitors fall back to a shared key.
const KEY_PREFIX = "riffa_cookie_consent:";
const ANON_KEY = "riffa_cookie_consent:anon";

export function CookieConsent() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  const key = user ? `${KEY_PREFIX}${user.id}` : ANON_KEY;

  useEffect(() => {
    if (localStorage.getItem(key) !== "1") {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [key]);

  if (!visible) return null;

  const accept = () => {
    localStorage.setItem(key, "1");
    setVisible(false);
  };

  return (
    <div className="cookie-banner" role="alert" aria-live="polite">
      <span className="cookie-banner__text">
        Мы используем файлы cookie, чтобы сайт работал. Продолжая использовать сайт, вы
        соглашаетесь с{" "}
        <a href="/privacy.html" target="_blank" rel="noopener">
          политикой конфиденциальности
        </a>
        .
      </span>
      <button className="cookie-banner__accept" onClick={accept} type="button">
        Понятно
      </button>
    </div>
  );
}
