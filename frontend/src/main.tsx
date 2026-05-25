import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import App from "./App";
import "./styles/global.css";
import "./lib/i18n"; // bootstrap i18n before App renders

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime:    300_000,
      refetchOnWindowFocus: false,
    },
  },
});

// Register Service Worker so the browser keeps the page alive in background
// and doesn't kill audio playback when the screen locks on mobile.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}

document.addEventListener("visibilitychange", () => {
  const hidden = document.hidden;
  document.body.classList.toggle("page-hidden", hidden);
  document.getElementById("root")?.classList.toggle("page-hidden", hidden);
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
