import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { RequireAdmin } from "@/components/RequireAdmin";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { CookieConsent } from "@/components/CookieConsent";
import { GlobalPlayer } from "@/components/player/GlobalPlayer";

const AdminPage         = lazy(() => import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const AgentPage         = lazy(() => import("@/pages/AgentPage").then((m) => ({ default: m.AgentPage })));
const GuidePage         = lazy(() => import("@/pages/GuidePage").then((m) => ({ default: m.GuidePage })));
const EmailCallbackPage       = lazy(() => import("@/pages/EmailCallbackPage").then((m) => ({ default: m.EmailCallbackPage })));
const TelegramAuthCallbackPage = lazy(() => import("@/pages/TelegramAuthCallbackPage").then((m) => ({ default: m.TelegramAuthCallbackPage })));
const LibraryPage       = lazy(() => import("@/pages/LibraryPage").then((m) => ({ default: m.LibraryPage })));
const LoginPage         = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const ProfilePage       = lazy(() => import("@/pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const RadioPage         = lazy(() => import("@/pages/RadioPage").then((m) => ({ default: m.RadioPage })));
const SharePage         = lazy(() => import("@/pages/SharePage").then((m) => ({ default: m.SharePage })));
const StudioPage        = lazy(() => import("@/pages/StudioPage").then((m) => ({ default: m.StudioPage })));

const STANDALONE_PATHS = new Set<string>(["/login", "/auth/email-callback", "/tg-auth"]);

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const standalone = STANDALONE_PATHS.has(location.pathname);

  // Telegram Mini App deep link from a notification: startapp=gen_<uuid> opens that
  // generation in the studio (StudioPage handles ?gen_id). Runs once on mount.
  useEffect(() => {
    const tg = (window as unknown as {
      Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } };
    }).Telegram?.WebApp;
    const sp = tg?.initDataUnsafe?.start_param;
    if (sp && sp.startsWith("gen_")) {
      const genId = sp.slice(4);
      if (genId) navigate(`/studio?gen_id=${genId}`, { replace: true });
    }
  }, [navigate]);

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
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/radio" element={<RadioPage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route
            path="/library"
            element={
              <RequireAuth>
                <LibraryPage />
              </RequireAuth>
            }
          />
          <Route path="/profile" element={<ProfilePage />} />
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
