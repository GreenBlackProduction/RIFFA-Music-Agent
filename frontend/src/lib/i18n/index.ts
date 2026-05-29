/**
 * i18n setup — react-i18next + browser language detector + localStorage persistence.
 *
 * Использование в компонентах:
 *   import { useTranslation } from "react-i18next";
 *   const { t } = useTranslation();
 *   return <h1>{t("nav.studio")}</h1>;
 *
 * Переключить язык:
 *   import i18n from "@/lib/i18n";
 *   i18n.changeLanguage("en");  // или "ru"
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import { ru } from "./locales/ru";
import { en } from "./locales/en";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { ru: { translation: ru }, en: { translation: en } },
    fallbackLng: "ru",
    supportedLngs: ["ru", "en"],
    interpolation: { escapeValue: false }, // React сам экранирует
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "riffa_lang",
    },
    returnObjects: true,
  });

export default i18n;

// ─── Совместимый хук для старых компонентов (LoginPage и т.п.) ───────────
// Возвращает весь словарь «login» как структурированный объект, чтобы
// существующий код `t.hero.title` продолжал работать без переписывания.
import { useTranslation as _useTranslation } from "react-i18next";

// LoginPage Dict shape — соответствует структуре `login` в ru.ts
interface LoginDict {
  brandTitle: string;
  brandSubtitle: string;
  heroLead: string;
  brand: { title: string; subtitle: string };
  hero: { badge: string; title: string; bullets: string[] };
  hero_lead: string;
  features: { title: string; descr: string }[];
  telegram: {
    section: string; perk: string; explainer: string; miniHint: string; badge: string;
    btnText: string; btnWaiting: string; btnApproved: string;
    loadingShort: string; loadingHint: string;
    waitingHint: string; expiredHint: string;
    botNotStartedText: string; botNotStartedBtn: string;
    popupBlocked: string;
  };
  email: {
    section: string; perk: string; loginTab: string; registerTab: string;
    emailPlaceholder: string; passwordPlaceholder: string; confirmPlaceholder: string;
    loginSubmit: string; loginSubmitting: string;
    registerSubmit: string; registerSubmitting: string;
    weakPassword: string; passwordMismatch: string; emailTaken: string;
  };
  divider: string;
  demo: string;
  legal: { note: string; terms: string; privacy: string };
  faq: { title: string; items: { q: string; a: string }[] };
  tgError: string;
  tgBtnError: string;
  errors: { generic: string };
}

export function useT(): LoginDict {
  const { t } = _useTranslation();
  // i18next с returnObjects: true возвращает поддерево как объект
  const login = t("login", { returnObjects: true }) as Partial<LoginDict> & {
    brandTitle?: string; brandSubtitle?: string; heroLead?: string;
  };
  // Adapter для legacy-shape: даём и плоские поля, и .brand.title/.hero.title
  return {
    ...login,
    brand: { title: login.brandTitle ?? "", subtitle: login.brandSubtitle ?? "" },
    hero: { badge: "", title: login.brandTitle ?? "", bullets: [] },
    hero_lead: login.heroLead ?? "",
  } as LoginDict;
}
