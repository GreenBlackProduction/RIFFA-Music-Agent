import { useEffect, useState, type ReactNode } from "react";

import { ScrollToTop } from "@/components/ui/ScrollToTop";
import { useGenerationStore } from "@/store/generation";

import { Sidebar } from "./Sidebar";
import { MobileTopbar } from "./MobileTopbar";
import { NoticeBanner } from "./NoticeBanner";
import { TermsAcceptanceModal } from "./TermsAcceptanceModal";
import { CollapsedGenerationProgress } from "./ActiveGenerations";
import "./AppShell.css";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reconnectAll = useGenerationStore((s) => s.reconnectAll);
  const syncFromServer = useGenerationStore((s) => s.syncFromServer);

  // Reconnect WebSockets for any in-flight generations that survived a page reload AND
  // sync with server to pick up generations started from other devices/sessions.
  useEffect(() => {
    reconnectAll();
    syncFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
