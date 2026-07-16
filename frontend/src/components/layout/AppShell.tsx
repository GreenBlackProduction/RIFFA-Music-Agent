import { useEffect, useState, type ReactNode } from "react";

import { ScrollToTop } from "@/components/ui/ScrollToTop";
import { useGenerationStore } from "@/store/generation";

import { Sidebar } from "./Sidebar";
import { MobileTopbar } from "./MobileTopbar";
import { NoticeBanner } from "./NoticeBanner";
import { TermsAcceptanceModal } from "./TermsAcceptanceModal";
import { CollapsedGenerationProgress } from "./ActiveGenerations";
import "./AppShell.css";

// Mirrors the CSS breakpoint where the sidebar collapses into a drawer
// (Sidebar.css / AppShell.css). On wider screens the sidebar is always
// visible, so a new generation card shows up on its own — no drawer to open.
const DRAWER_MEDIA = "(max-width: 1180px), (pointer: coarse) and (max-width: 1400px)";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reconnectAll = useGenerationStore((s) => s.reconnectAll);
  const syncFromServer = useGenerationStore((s) => s.syncFromServer);
  const launchNotice = useGenerationStore((s) => s.launchNotice);

  // Reconnect WebSockets for any in-flight generations that survived a page reload AND
  // sync with server to pick up generations started from other devices/sessions.
  useEffect(() => {
    reconnectAll();
    syncFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A fresh generation just launched → if the sidebar is a collapsed drawer
  // (mobile/tablet), slide it open so the new card is visible. `launchNotice`
  // is bumped ONLY by user launches, never by startup sync/reconnect, so this
  // won't pop the drawer on page load. On desktop the sidebar is always
  // visible, so we leave the drawer state (and its overlay) untouched.
  useEffect(() => {
    if (!launchNotice) return;
    if (window.matchMedia(DRAWER_MEDIA).matches) {
      setDrawerOpen(true);
    }
  }, [launchNotice?.ts]);

  return (
    <div className="app-shell">
      <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      {drawerOpen ? <div className="overlay" onClick={() => setDrawerOpen(false)} /> : null}

      <main className="main">
        <MobileTopbar onMenuClick={() => setDrawerOpen(true)} />
        <NoticeBanner />
        {children}
      </main>

      <CollapsedGenerationProgress />
      <ScrollToTop />
      <TermsAcceptanceModal />
    </div>
  );
}
