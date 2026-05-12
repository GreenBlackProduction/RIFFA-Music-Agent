import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { RequireAdmin } from "@/components/RequireAdmin";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { GlobalPlayer } from "@/components/player/GlobalPlayer";

const AdminPage         = lazy(() => import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const AgentPage         = lazy(() => import("@/pages/AgentPage").then((m) => ({ default: m.AgentPage })));
const EmailCallbackPage = lazy(() => import("@/pages/EmailCallbackPage").then((m) => ({ default: m.EmailCallbackPage })));
const LibraryPage       = lazy(() => import("@/pages/LibraryPage").then((m) => ({ default: m.LibraryPage })));
const LoginPage         = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const ProfilePage       = lazy(() => import("@/pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const RadioPage         = lazy(() => import("@/pages/RadioPage").then((m) => ({ default: m.RadioPage })));
const SharePage         = lazy(() => import("@/pages/SharePage").then((m) => ({ default: m.SharePage })));
const StudioPage        = lazy(() => import("@/pages/StudioPage").then((m) => ({ default: m.StudioPage })));

const STANDALONE_PATHS = new Set<string>(["/login", "/auth/email-callback"]);

export default function App() {
  const location = useLocation();
  const standalone = STANDALONE_PATHS.has(location.pathname);

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
    </AppShell>
  );
}
