/**
 * Active generation tracker — one entry per in-flight or recently finished job.
 * State is persisted to sessionStorage so active cards survive a page refresh.
 * On rehydration, WebSockets are reconnected for any still-processing entries.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

function playCompletionChime() {
  try {
    const audio = new Audio("/sounds/notification.mp3");
    audio.volume = 0.75;
    void audio.play();
  } catch {
    // Audio not available — silent fallback
  }
}

import type { ProgressEvent } from "@/lib/api/client";
import { fetchActiveGenerations, openGenerationSocket, pollGenerationStatus } from "@/lib/api/client";

export type GenStatus = "queued" | "processing" | "completed" | "failed";

/** Minimal shape that the sidebar / preview buttons rely on. */
export interface CompletedTrackLike {
  audio_url?: string;
  audio_id?: string;
  image_url?: string;
  title?: string;
  duration?: number;
}

export interface CompletedGenerationResult {
  tracks?: CompletedTrackLike[];
  lyrics?: string;
  // Cover art ships an `image_url` at the top level.
  image_url?: string;
  [key: string]: unknown;
}

export interface ActiveGeneration {
  id: string;
  wsUrl: string;
  type: string;
  title: string;
  status: GenStatus;
  step: string | null;
  progress: number; // 0-100, estimated
  result: CompletedGenerationResult | null;
  error: string | null;
  ws: WebSocket | null;
}

interface GenerationStore {
  active: Record<string, ActiveGeneration>;
  /** Dismissed generation ids — чтобы sync с сервера не возвращал их в сайдбар. */
  dismissed: string[];
  /** Start tracking a new generation and open its WebSocket. */
  track: (id: string, wsUrl: string, type: string, title: string) => void;
  /** Remove a completed/failed generation from active state. */
  dismiss: (id: string) => void;
  _update: (id: string, patch: Partial<ActiveGeneration>) => void;
  /** Reconnect WebSockets for any processing entries after page reload. */
  reconnectAll: () => void;
  /** Fetch active/recent generations from server and populate the store.
   *  Called on app startup so the sidebar shows state from any device. */
  syncFromServer: () => Promise<void>;
}

function estimateProgress(event: ProgressEvent): number {
  if (event.status === "completed") return 100;
  if (event.status === "failed") return 0;
  const step = event.step ?? "";
  if (step === "submitting") return 5;
  if (step === "queued") return 10;
  if (step === "lyrics") return 20;
  if (step === "music" || step === "start") return 30;
  if (step === "generating") {
    const poll = event.poll ?? 0;
    return Math.min(30 + poll * 2, 90);
  }
  if (step === "submitting_wav") return 50;
  if (step === "converting_wav") return 60 + (event.poll ?? 0) * 2;
  return 40;
}

function handleProgressEvent(
  id: string,
  event: ProgressEvent,
  get: () => GenerationStore,
) {
  const progress = estimateProgress(event);
  if (event.status === "completed") {
    get()._update(id, {
      status: "completed",
      progress: 100,
      step: null,
      result: (event.result as CompletedGenerationResult) ?? null,
    });
    playCompletionChime();
  } else if (event.status === "failed") {
    get()._update(id, { status: "failed", progress: 0, error: event.error });
  } else {
    get()._update(id, { status: "processing", step: event.step ?? null, progress });
  }
}

function openWs(id: string, wsUrl: string, get: () => GenerationStore) {
  // Start polling fallback alongside WebSocket
  const poller = pollGenerationStatus(id, (event) => {
    const cur = get().active[id];
    if (cur && cur.status !== "completed" && cur.status !== "failed") {
      handleProgressEvent(id, event, get);
      if (event.status === "completed" || event.status === "failed") {
        poller.stop();
      }
    }
  }, 4000);

  return openGenerationSocket(
    wsUrl,
    (event) => {
      handleProgressEvent(id, event, get);
      if (event.status === "completed" || event.status === "failed") {
        poller.stop();
      }
    },
    () => {
      // WS closed — poller continues as fallback, don't mark as failed
      const cur = get().active[id];
      if (cur && cur.status !== "completed" && cur.status !== "failed") {
        get()._update(id, { step: "generating" });
      }
    },
  );
}

export const useGenerationStore = create<GenerationStore>()(
  persist(
    (set, get) => ({
      active: {},
      dismissed: [],

      track(id, wsUrl, type, title) {
        const gen: ActiveGeneration = {
          id,
          wsUrl,
          type,
          title,
          status: "queued",
          step: null,
          progress: 0,
          result: null,
          error: null,
          ws: null,
        };
        gen.ws = openWs(id, wsUrl, get);
        set((s) => ({ active: { ...s.active, [id]: gen } }));
      },

      dismiss(id) {
        const gen = get().active[id];
        if (gen?.ws) gen.ws.close();
        set((s) => {
          const next = { ...s.active };
          delete next[id];
          // Запоминаем последние ~50 dismissed id, чтобы sync с сервера их не возвращал.
          const dismissed = [id, ...s.dismissed.filter((d) => d !== id)].slice(0, 50);
          return { active: next, dismissed };
        });
      },

      _update(id, patch) {
        set((s) => ({
          active: { ...s.active, [id]: { ...s.active[id], ...patch } },
        }));
      },

      reconnectAll() {
        for (const gen of Object.values(get().active)) {
          if ((gen.status === "queued" || gen.status === "processing") && !gen.ws) {
            const ws = openWs(gen.id, gen.wsUrl, get);
            get()._update(gen.id, { ws });
          }
        }
      },

      async syncFromServer() {
        try {
          const list = await fetchActiveGenerations();
          const dismissedSet = new Set(get().dismissed);
          for (const item of list) {
            const existing = get().active[item.id];
            if (existing) continue;
            if (dismissedSet.has(item.id)) continue;
            const gen: ActiveGeneration = {
              id: item.id,
              wsUrl: "",
              type: item.type,
              title: item.title,
              status: item.status as GenStatus,
              step: item.step ?? null,
              progress: item.progress,
              result: (item.result as CompletedGenerationResult) ?? null,
              error: item.error,
              ws: null,
            };
            if (gen.status === "queued" || gen.status === "processing") {
              const poller = pollGenerationStatus(gen.id, (event) => {
                const cur = get().active[gen.id];
                if (cur && cur.status !== "completed" && cur.status !== "failed") {
                  handleProgressEvent(gen.id, event, get);
                  if (event.status === "completed" || event.status === "failed") {
                    poller.stop();
                  }
                }
              }, 4000);
              gen.ws = { close: () => poller.stop() } as unknown as WebSocket;
            }
            set((s) => ({ active: { ...s.active, [gen.id]: gen } }));
          }
        } catch {
          // Best-effort — network errors shouldn't break the app
        }
      },
    }),
    {
      name: "riffa-active-gens",
      storage: createJSONStorage(() => sessionStorage),
      // Exclude non-serializable ws field from storage
      partialize: (state) => ({
        active: Object.fromEntries(
          Object.entries(state.active).map(([id, gen]) => [id, { ...gen, ws: null }]),
        ),
        dismissed: state.dismissed,
      }) as GenerationStore,
      // На старте убираем completed/failed карточки из прошлой сессии —
      // их WebSocket уже нет, повторно показывать нет смысла.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const stale = Object.keys(state.active).filter(
          (id) => state.active[id].status === "completed" || state.active[id].status === "failed",
        );
        if (stale.length === 0) return;
        const next = { ...state.active };
        for (const id of stale) delete next[id];
        const dismissed = [...new Set([...stale, ...state.dismissed])].slice(0, 50);
        state.active = next;
        state.dismissed = dismissed;
      },
    },
  ),
);
