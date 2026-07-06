import { create } from "zustand";

export interface PlayerTrack {
  id: string | number;
  title: string;
  url: string;
  author?: string;
  meta?: string;
  cover?: string;
  likes?: number;
  dislikes?: number;
  isOwn?: boolean;
  canRadio?: boolean;
  isMusicType?: boolean;
  isPublic?: boolean;
  /** Suno audio_id — required for WAV conversion and extend from the player. */
  audioId?: string;
  /** Stored rating from the server (Generation.rating) — seeds the thumbs so
   *  a like set earlier doesn't visually vanish after reload. */
  rating?: "like" | "dislike" | null;
  /** Откуда трек: библиотека, радио, последние генерации, шаринг. */
  source?: "library" | "radio" | "studio" | "share";
}

type Rating = "like" | "dislike" | null;

interface PlayerState {
  current: PlayerTrack | null;
  queue: PlayerTrack[];      // ordered playlist for prev/next
  queueIndex: number;        // index of current in queue (-1 if none)
  shuffle: boolean;
  isPlaying: boolean;
  ratings: Record<string, Rating>;
  radioSet: Set<string>;

  play: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  /**
   * Unified click handler for any file row across the app: if the clicked
   * track is already current, toggle play/pause; otherwise start it (and
   * optionally replace the queue). All file lists (Profile, LibraryCard,
   * Radio playlist/chart) call this so play/pause behaves identically.
   */
  playOrToggle: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  playIndex: (index: number) => void;
  next: () => void;
  prev: () => void;
  toggle: () => void;
  stop: () => void;
  setPlaying: (v: boolean) => void;
  setShuffle: (v: boolean) => void;
  setRating: (id: string | number, value: Rating) => void;
  toggleRadio: (id: string | number) => void;
  setRadioState: (id: string | number, isPublic: boolean) => void;
  /** Replace the current queue without changing the playing track. */
  setQueue: (tracks: PlayerTrack[]) => void;
}

/** Синхронизируем radioSet с track.isPublic — чтобы GlobalPlayer мог
 *  читать состояние радио из единого источника (radioSet) и не зависеть
 *  от reference-стабильности current. */
function syncRadioSet(prev: Set<string>, track: PlayerTrack): Set<string> {
  if (track.isPublic === undefined) return prev;
  const key = String(track.id);
  const has = prev.has(key);
  if (track.isPublic && !has) {
    const next = new Set(prev);
    next.add(key);
    return next;
  }
  if (!track.isPublic && has) {
    const next = new Set(prev);
    next.delete(key);
    return next;
  }
  return prev;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  current: null,
  queue: [],
  queueIndex: -1,
  shuffle: false,
  isPlaying: false,
  ratings: {},
  radioSet: new Set(),

  play: (track, queue) => {
    const q = queue ?? get().queue;
    const idx = q.findIndex((t) => String(t.id) === String(track.id));
    set((s) => ({
      current: track,
      isPlaying: true,
      queue: q,
      queueIndex: idx,
      radioSet: syncRadioSet(s.radioSet, track),
    }));
  },

  playOrToggle: (track, queue) => {
    const state = get();
    if (state.current && String(state.current.id) === String(track.id)) {
      // Same track is already loaded — flip play/pause without rebuilding
      // the queue or resetting playback position. The audio element in
      // GlobalPlayer reacts to isPlaying via its useEffect.
      set({ isPlaying: !state.isPlaying });
      // If a fresh queue was provided (e.g. user changed the source list),
      // refresh it so prev/next still work correctly.
      if (queue) {
        const idx = queue.findIndex((t) => String(t.id) === String(track.id));
        set({ queue, queueIndex: idx });
      }
      return;
    }
    state.play(track, queue);
  },

  playIndex: (index) => {
    const { queue } = get();
    const track = queue[index];
    if (!track) return;
    set((s) => ({
      current: track,
      isPlaying: true,
      queueIndex: index,
      radioSet: syncRadioSet(s.radioSet, track),
    }));
  },

  next: () => {
    const { queue, queueIndex, shuffle } = get();
    if (queue.length === 0) return;
    let nextIdx: number;
    if (shuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = (queueIndex + 1) % queue.length;
    }
    const track = queue[nextIdx];
    if (!track) return;
    set((s) => ({
      current: track,
      isPlaying: true,
      queueIndex: nextIdx,
      radioSet: syncRadioSet(s.radioSet, track),
    }));
  },

  prev: () => {
    const { queue, queueIndex } = get();
    if (queue.length === 0) return;
    const prevIdx = queueIndex <= 0 ? queue.length - 1 : queueIndex - 1;
    const track = queue[prevIdx];
    if (!track) return;
    set((s) => ({
      current: track,
      isPlaying: true,
      queueIndex: prevIdx,
      radioSet: syncRadioSet(s.radioSet, track),
    }));
  },

  toggle: () => set((s) => ({ isPlaying: !s.isPlaying && !!s.current })),
  stop: () => set({ current: null, isPlaying: false, queueIndex: -1 }),
  setPlaying: (v) => set({ isPlaying: v }),
  setShuffle: (v) => set({ shuffle: v }),
  setQueue: (tracks) => {
    const { current } = get();
    const idx = current ? tracks.findIndex((t) => String(t.id) === String(current.id)) : -1;
    set({ queue: tracks, queueIndex: idx });
  },

  setRating: (id, value) =>
    set((s) => ({ ratings: { ...s.ratings, [String(id)]: value } })),
  toggleRadio: (id) =>
    set((s) => {
      const next = new Set(s.radioSet);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { radioSet: next };
    }),
  setRadioState: (id, isPublic) =>
    set((s) => {
      const key = String(id);
      const next = new Set(s.radioSet);
      if (isPublic) next.add(key);
      else next.delete(key);
      return { radioSet: next };
    }),
}));
