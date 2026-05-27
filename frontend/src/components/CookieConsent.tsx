import { useEffect, useState } from "react";
import "./CookieConsent.css";

const STORAGE_KEY = "riffa_cookie_consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show on login page or when already accepted
    if (localStorage.getItem(STORAGE_KEY) !== "1") {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, "1");
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
