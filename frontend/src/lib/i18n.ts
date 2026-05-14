/**
 * Минимальный i18n: словари RU/EN + хук useT(), без зависимостей.
 * Язык хранится в localStorage.riffa_locale; по умолчанию определяется из navigator.
 */

import { useSyncExternalStore } from "react";

export type Locale = "ru" | "en";

const STORAGE_KEY = "riffa_locale";
const FALLBACK: Locale = "ru";

const subscribers = new Set<() => void>();

function detectInitial(): Locale {
  if (typeof window === "undefined") return FALLBACK;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "ru" || saved === "en") return saved;
  const nav = window.navigator.language?.toLowerCase() ?? "";
  if (nav.startsWith("ru")) return "ru";
  if (nav.startsWith("en")) return "en";
  return FALLBACK;
}

let current: Locale = detectInitial();

export function getLocale(): Locale {
  return current;
}

export function setLocale(value: Locale): void {
  if (current === value) return;
  current = value;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, value);
    document.documentElement.lang = value;
  }
  subscribers.forEach((cb) => cb());
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function useLocale(): [Locale, (value: Locale) => void] {
  const value = useSyncExternalStore(subscribe, getLocale, () => FALLBACK);
  return [value, setLocale];
}

interface Dict {
  brand: { title: string; subtitle: string };
  hero: {
    badge: string;
    title: string;
    bullets: string[];
  };
  hero_lead: string;
  features: { title: string; descr: string }[];
  telegram: {
    section: string;
    perk: string;
    explainer: string;
    miniHint: string;
    badge: string;
  };
  email: {
    section: string;
    perk: string;
    loginTab: string;
    registerTab: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    confirmPlaceholder: string;
    loginSubmit: string;
    loginSubmitting: string;
    registerSubmit: string;
    registerSubmitting: string;
    weakPassword: string;
    passwordMismatch: string;
    emailTaken: string;
  };
  divider: string;
  demo: string;
  legal: {
    note: string;
    terms: string;
    privacy: string;
  };
  faq: {
    title: string;
    items: { q: string; a: string }[];
  };
  errors: {
    generic: string;
  };
}

const dicts: Record<Locale, Dict> = {
  ru: {
    brand: {
      title: "RIFFA Music Studio",
      subtitle: "Войди — и сразу создавай песни, тексты, обложки и звуковые эффекты.",
    },
    hero: {
      badge: "",
      title: "RIFFA Music Studio",
      bullets: [],
    },
    hero_lead: "AI сервис для создания музыки на любой вкус и под любую задачу.",
    features: [
      { title: "Песни с вокалом",       descr: "Конструктор жанра, тембра, темпа и текста. Suno V5.5 + AI-лирика." },
      { title: "Инструментал",          descr: "Музыка без слов под видео, кафе, медитацию или фон." },
      { title: "Кавер-версия",          descr: "Перепой существующего трека в новом стиле и под нужный вокал." },
      { title: "Звуковой эффект",       descr: "SFX, импакты, ambient-сцены и текстуры — точечно по prompt." },
      { title: "Обложка",               descr: "Изображения 1:1 для треков и плейлистов через AI-агента." },
      { title: "Экспорт в WAV",          descr: "Конвертируй результат в WAV-формат для лучшего качества." },
      { title: "Продление треков",      descr: "Продлевай свои лучшие композиции без потери стиля и вокала." },
    ],
    telegram: {
      section: "Через Telegram",
      perk: "1 клик · профиль и баланс автоматически",
      explainer:
        "Самый быстрый путь. Если у тебя уже есть бот — кошелёк подтянется. Виджет работает на боевом домене; на localhost он показывает ‘Bot domain invalid’ — это норма для разработки.",
      miniHint:
        "Если страница открыта в Telegram Mini App — вход произойдёт автоматически.",
      badge: "Рекомендуем",
    },
    email: {
      section: "По e-mail",
      perk: "Логин и пароль",
      loginTab: "Войти",
      registerTab: "Регистрация",
      emailPlaceholder: "you@example.com",
      passwordPlaceholder: "Пароль",
      confirmPlaceholder: "Повторите пароль",
      loginSubmit: "Войти",
      loginSubmitting: "Входим…",
      registerSubmit: "Создать аккаунт",
      registerSubmitting: "Создаём…",
      weakPassword: "Пароль должен быть не менее 6 символов",
      passwordMismatch: "Пароли не совпадают",
      emailTaken: "Этот email уже зарегистрирован. Войдите или используйте другой адрес.",
    },
    divider: "или",
    demo: "Посмотреть демо без входа",
    legal: {
      note: "Входя, ты соглашаешься с",
      terms: "условиями",
      privacy: "политикой конфиденциальности",
    },
    faq: {
      title: "Частые вопросы",
      items: [
        {
          q: "Что произойдёт после входа?",
          a: "Откроется студия с балансом и историей. Доступ ко всем модулям: песни, тексты, обложки, SFX.",
        },
        {
          q: "Что безопаснее — Telegram или email?",
          a: "Оба варианта одинаково безопасны: пароль не передаётся, сессия привязана к httpOnly-cookie. Telegram быстрее, e-mail универсальнее.",
        },
        {
          q: "Можно объединить аккаунты бота и сайта?",
          a: "Да — войди через Telegram и баланс/история бота будут видны и здесь.",
        },
      ],
    },
    errors: {
      generic: "Что-то пошло не так. Попробуй ещё раз.",
    },
  },
  en: {
    brand: {
      title: "RIFFA Music Studio",
      subtitle: "Sign in to start crafting songs, lyrics, covers and SFX.",
    },
    hero: {
      badge: "",
      title: "RIFFA Music Studio",
      bullets: [],
    },
    hero_lead: "AI service for creating music for any taste and any purpose.",
    features: [
      { title: "Songs with vocals", descr: "Genre, timbre, tempo and lyrics builder. Suno V5.5 + AI lyrics." },
      { title: "Instrumental",      descr: "Music without vocals for video, café, meditation or background." },
      { title: "Cover version",     descr: "Re-record an existing track in a new style and with a different voice." },
      { title: "Sound effect",      descr: "SFX, impacts, ambient scenes and textures — prompt-driven." },
      { title: "Cover art",         descr: "1:1 images for tracks and playlists through an AI agent." },
      { title: "WAV export",        descr: "Convert the result to WAV for the highest possible quality." },
      { title: "Track extension",   descr: "Extend your best compositions while preserving style and vocals." },
    ],
    telegram: {
      section: "With Telegram",
      perk: "1 click · profile and balance pulled automatically",
      explainer:
        "Fastest option. If you already have the bot — your wallet shows up here. The widget works on the production domain; on localhost it shows ‘Bot domain invalid’, which is normal in dev.",
      miniHint: "If you opened the page inside the Telegram Mini App — sign-in happens automatically.",
      badge: "Recommended",
    },
    email: {
      section: "With e-mail",
      perk: "Login and password",
      loginTab: "Sign in",
      registerTab: "Register",
      emailPlaceholder: "you@example.com",
      passwordPlaceholder: "Password",
      confirmPlaceholder: "Confirm password",
      loginSubmit: "Sign in",
      loginSubmitting: "Signing in…",
      registerSubmit: "Create account",
      registerSubmitting: "Creating…",
      weakPassword: "Password must be at least 6 characters",
      passwordMismatch: "Passwords do not match",
      emailTaken: "This email is already registered. Sign in or use another address.",
    },
    divider: "or",
    demo: "Browse the demo without signing in",
    legal: {
      note: "By signing in you agree to our",
      terms: "terms",
      privacy: "privacy policy",
    },
    faq: {
      title: "FAQ",
      items: [
        {
          q: "What happens after sign-in?",
          a: "You land in the studio with your balance and history. All modules unlocked: songs, lyrics, covers, SFX.",
        },
        {
          q: "Telegram or e-mail — which is safer?",
          a: "Both are equally safe: no password is transmitted, the session lives in an httpOnly cookie. Telegram is faster, e-mail is more universal.",
        },
        {
          q: "Can I merge bot and website accounts?",
          a: "Yes — sign in with Telegram and your bot wallet/history are available here.",
        },
      ],
    },
    errors: {
      generic: "Something went wrong. Try again.",
    },
  },
};

export function useT(): Dict {
  const [locale] = useLocale();
  return dicts[locale];
}
