import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { RequireAdmin } from "@/components/RequireAdmin";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { CookieConsent } from "@/components/CookieConsent";
import { GlobalPlayer } from "@/components/player/GlobalPlayer";
import { usePlayer } from "@/store/player";

const FAVICON_DEFAULT = "/brand/04-applications/riffa-favicon-32.svg?v=2";
const FAVICON_PLAYING = "/brand/04-applications/riffa-favicon-playing.svg?v=2";

const AdminPage         = lazy(() => import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const AgentPage         = lazy(() => import("@/pages/AgentPage").then((m) => ({ default: m.AgentPage })));
const GuidePage         = lazy(() => import("@/pages/GuidePage").then((m) => ({ default: m.GuidePage })));
const EmailCallbackPage       = lazy(() => import("@/pages/EmailCallbackPage").then((m) => ({ default: m.EmailCallbackPage })));
const TelegramAuthCallbackPage = lazy(() => import("@/pages/TelegramAuthCallbackPage").then((m) => ({ default: m.TelegramAuthCallbackPage })));
const LibraryPage       = lazy(() => import("@/pages/LibraryPage").then((m) => ({ default: m.LibraryPage })));
const LandingPage       = lazy(() => import("@/pages/LandingPage").then((m) => ({ default: m.LandingPage })));
const BusinessPage      = lazy(() => import("@/pages/BusinessPage").then((m) => ({ default: m.BusinessPage })));
const GiftPage          = lazy(() => import("@/pages/GiftPage").then((m) => ({ default: m.GiftPage })));
const LoginPage         = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const ProfilePage       = lazy(() => import("@/pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const RadioPage         = lazy(() => import("@/pages/RadioPage").then((m) => ({ default: m.RadioPage })));
const SharePage         = lazy(() => import("@/pages/SharePage").then((m) => ({ default: m.SharePage })));
const StudioPage        = lazy(() => import("@/pages/StudioPage").then((m) => ({ default: m.StudioPage })));

const STANDALONE_PATHS = new Set<string>(["/", "/login", "/auth/email-callback", "/tg-auth", "/business", "/gift"]);

// Per-route <title> + meta so each page ranks for its own query (the SPA shipped
// one static title for everything). Googlebot/Yandex render JS and pick these up.
const ROUTE_SEO: Record<string, { title: string; description: string }> = {
  "/studio": {
    title: "RIFFA Studio — генерация музыки онлайн на основе Suno AI",
    description:
      "Генерация музыки и песен онлайн на русском: вокал, инструменталы, каверы, обложки. ИИ на движке Suno, ИИ-радио, оплата картой РФ и Telegram Stars.",
  },
  "/radio": {
    title: "ИИ-радио — слушать треки нейросети онлайн | RIFFA Studio",
    description:
      "ИИ-радио RIFFA: слушай лучшие треки, созданные нейросетью пользователями. Голосуй, попадай в чарты, открывай новую ИИ-музыку на русском.",
  },
  "/agent": {
    title: "ИИ-агент для создания музыки — соберёт бриф и стиль | RIFFA Studio",
    description:
      "Умный ИИ-агент RIFFA: опиши идею словами или дай референс — агент подберёт жанр, настроение и стиль и сгенерирует трек на Suno AI.",
  },
  "/guide": {
    title: "Как создать песню нейросетью — гайд | RIFFA Studio",
    description:
      "Пошаговый гайд RIFFA Studio: как сгенерировать песню с вокалом, инструментал, кавер и обложку с помощью ИИ. Suno на русском, простыми словами.",
  },
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export default function App() {
  const location = useLocation();
  const standalone = STANDALONE_PATHS.has(location.pathname);
  const isPlaying = usePlayer((s) => s.isPlaying && s.current !== null);

  // Swap the browser-tab favicon to a bare orange triangle while audio plays,
  // back to the default mark when paused/stopped. Only touches the SVG icon
  // link (the one modern browsers actually render).
  useEffect(() => {
    const link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
    if (!link) return;
    link.href = isPlaying ? FAVICON_PLAYING : FAVICON_DEFAULT;
  }, [isPlaying]);


  // Yandex.Metrika: трек переходов между страницами в SPA.
  // Initial page load счётчик ловит сам из index.html, а route changes
  // в React Router внутри SPA нужно отдавать руками через ym('hit', ...).
  useEffect(() => {
    const w = window as unknown as { ym?: (id: number, action: string, url: string, opts?: object) => void };
    if (typeof w.ym === "function") {
      w.ym(109298074, "hit", location.pathname + location.search, {
        referer: document.referrer,
      });
    }
  }, [location.pathname, location.search]);

  // Per-route SEO meta (title/description/OG/Twitter). "/" redirects to /studio,
  // so it resolves to the studio entry. Unlisted routes keep the index.html defaults.
  useEffect(() => {
    const seo = ROUTE_SEO[location.pathname];
    if (!seo) return;
    document.title = seo.title;
    upsertMeta("name", "description", seo.description);
    upsertMeta("property", "og:title", seo.title);
    upsertMeta("property", "og:description", seo.description);
    upsertMeta("name", "twitter:title", seo.title);
    upsertMeta("name", "twitter:description", seo.description);
    upsertMeta("property", "og:url", `https://riffastudio.site${location.pathname}`);
  }, [location.pathname]);

  // Detect Telegram Mini App context (initData is non-empty only inside Telegram,
  // window.Telegram.WebApp exists in ALL browsers since the SDK is always loaded).
  useEffect(() => {
    type TgWA = { initData?: string; platform?: string };
    const tgApp = (window as unknown as { Telegram?: { WebApp?: TgWA } }).Telegram?.WebApp;
    const isTgApp = !!tgApp?.initData || (!!tgApp?.platform && tgApp.platform !== "unknown" && tgApp.platform !== "");
    if (isTgApp) {
      document.documentElement.classList.add("tg-miniapp");

      // In Mini App WebView, programmatically block horizontal scroll at the
      // document level. Some WebView/WKWebView versions allow horizontal scroll
      // even with overflow-x: hidden on html/body. The scroll event fires after
      // the browser moves the viewport, so we snap back to x=0 immediately.
      const blockHScroll = () => {
        if (window.scrollX !== 0) {
          window.scrollTo(0, window.scrollY);
        }
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
      };
      window.addEventListener("scroll", blockHScroll, { passive: true });
      return () => window.removeEventListener("scroll", blockHScroll);
    } else {
      document.documentElement.classList.remove("tg-miniapp");
    }
  }, []);

  // Reset scroll (vertical + horizontal) on every route change so each page
  // opens at the top. На мобильной/планшетной разметке скроллится контейнер
  // .main; на десктопе сам window. Сбрасываем оба, плюс сам элемент main.
  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".main");
    if (main) {
      main.scrollLeft = 0;
      main.scrollTop = 0;
    }
    window.scrollTo(0, 0);
    document.documentElement.scrollLeft = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollLeft = 0;
    document.body.scrollTop = 0;
  }, [location.pathname]);

  if (location.pathname.startsWith("/s/")) {
    return (
      <Suspense>
        <Routes>
          <Route path="/s/:shareId" element={<SharePage />} />
        </Routes>
      </Suspense>
    );
  }

  if (standalone) {
    return (
      <Suspense>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/business" element={<BusinessPage />} />
          <Route path="/gift" element={<GiftPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/email-callback" element={<EmailCallbackPage />} />
          <Route path="/tg-auth" element={<TelegramAuthCallbackPage />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <AppShell>
      <Suspense>
        <Routes>
          <Route path="/" element={<Navigate to="/studio" replace />} />
          {/* App working pages are auth-only: anonymous visitors coming from
              the landings or search must land on /login, not an empty studio.
              /radio and /guide stay public on purpose (SEO + listening funnel). */}
          <Route
            path="/studio"
            element={
              <RequireAuth>
                <StudioPage />
              </RequireAuth>
            }
          />
          <Route path="/radio" element={<RadioPage />} />
          <Route
            path="/agent"
            element={
              <RequireAuth>
                <AgentPage />
              </RequireAuth>
            }
          />
          <Route path="/guide" element={<GuidePage />} />
          <Route
            path="/library"
            element={
              <RequireAuth>
                <LibraryPage />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            }
          />
          <Route path="*" element={<Navigate to="/studio" replace />} />
        </Routes>
      </Suspense>
      <GlobalPlayer />
      <CookieConsent />
    </AppShell>
  );
}
