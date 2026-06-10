/**
 * Shared "Library" data layer for "Мои генерации" (StudioPage) and
 * "Мои файлы" (ProfilePage).
 *
 * Both screens render the same per-track list with different filters/UI
 * affordances — so they MUST share a single fetch + transform pipeline.
 * Owning the conversion in one place guarantees:
 *   - The same coverUrl, duration, title resolution rules everywhere.
 *   - Per-variant Radio publish state (V1/V2) is computed once.
 *   - One react-query cache key — invalidating on either page refreshes both.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchHistory, type GenerationOut } from "@/lib/api/client";
import { useGenerationStore } from "@/store/generation";

export type LibraryItemType =
  | "song"
  | "instrumental"
  | "cover"
  | "sfx"
  | "cover_art"
  | "wav";

export interface LibraryItem {
  /** Unique key used by the player and React lists. For multi-variant
   *  generations this is ``gen.id#index``; otherwise just ``gen.id``. */
  id: string;
  /** Bare generation UUID (without variant suffix). */
  generationId: string;
  /** Index of this track within the generation (0 = V1, 1 = V2). ``null``
   *  when the generation has no playable tracks. */
  trackIndex: number | null;
  title: string;
  type: LibraryItemType;
  genre: string;
  mood: string;
  tempo: string;
  createdAt: string;
  duration: string;
  audioUrl: string;
  /** Suno-generated cover image, when available. Falls back to the type
   *  icon when ``null``. */
  coverUrl: string | null;
  /** Suno audio_id for the specific track — used by WAV conversion and extend. */
  audioId?: string;
  isOwn: boolean;
  /** Per-variant: ``true`` when *this specific* track index is currently
   *  published on the public Radio. */
  isPublic: boolean;
  /** ``true`` when you rated this generation "like" — drives the
   *  "Понравились вам" filter on the Library page. */
  liked: boolean;
}

/**
 * A track's ``genre`` field can hold several genres ("pop, rock, electronic")
 * when the user listed many as a reference. For the library filter dropdown and
 * the profile stats chips we want a single PRIMARY style — the first one — so
 * the list stays clean and doesn't fill up with multi-genre permutations.
 *
 * Splits only on real multi-value separators (comma / semicolon / slash / pipe
 * / middle-dot) so compound single genres like "Drum and Bass", "R&B",
 * "Hip-Hop" stay intact.
 */
export function primaryGenre(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.split(/[,;/|·]/)[0]?.trim() ?? "";
}

export const TYPE_ICONS: Record<LibraryItemType, string> = {
  song: "🎵",
  instrumental: "🎹",
  cover: "🎤",
  sfx: "⚡",
  cover_art: "🎨",
  wav: "💿",
};

export const TYPE_LABELS: Record<LibraryItemType, string> = {
  song: "Песня",
  instrumental: "Инструментал",
  cover: "Кавер",
  sfx: "SFX",
  cover_art: "Обложка",
  wav: "WAV",
};

export const RADIO_TYPES: ReadonlySet<LibraryItemType> = new Set([
  "song",
  "instrumental",
  "cover",
]);

export const MUSIC_TYPES: ReadonlySet<LibraryItemType> = new Set([
  "song",
  "instrumental",
  "cover",
]);

export const HISTORY_QUERY_KEY = ["history", "mine"] as const;

export function backendTypeToLibrary(t: string, gen?: GenerationOut): LibraryItemType | null {
  switch (t) {
    case "song":
    case "occasion":
      // Song with no lyrics in result = effectively instrumental
      if (gen && !gen.lyrics && !gen.vocal) return "instrumental";
      return "song";
    case "extend":
      // Extend inherits vocal presence from the original generation
      if (gen && !gen.vocal) return "instrumental";
      return "song";
    case "instrumental":
      return "instrumental";
    case "cover_song":
      // Cover with lyrics → "cover" (song-like), without → still "cover"
      return "cover";
    case "sound_effect":
      return "sfx";
    case "cover_art":
      return "cover_art";
    case "wav_convert":
      return "wav";
    default:
      return null;
  }
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function generationToItems(gen: GenerationOut): LibraryItem[] {
  const libType = backendTypeToLibrary(gen.type, gen);
  if (!libType) return [];
  if (gen.status !== "completed") return [];
  // Support both legacy (single index) and new (array of indices) radio publishing.
  const publishedIndices: number[] = Array.isArray(gen.published_track_indices)
    ? gen.published_track_indices
    : gen.published_track_index !== null && gen.published_track_index !== undefined
    ? [gen.published_track_index]
    : [];
  const liked = gen.rating === "like";
  // Cover art: image-only result — display image as cover, no audio.
  if (libType === "cover_art") {
    if (!gen.image_url) return [];
    return [
      {
        id: gen.id,
        generationId: gen.id,
        trackIndex: null,
        title: gen.title || "Обложка",
        type: "cover_art" as const,
        genre: "",
        mood: "",
        tempo: "",
        createdAt: gen.created_at,
        duration: "—",
        audioUrl: "",
        coverUrl: gen.image_url,
        audioId: undefined,
        isOwn: true,
        isPublic: false,
        liked,
      },
    ];
  }

  // WAV conversions store their result in wav_url, not in tracks.
  if (libType === "wav") {
    if (!gen.wav_url) return [];
    return [
      {
        id: gen.id,
        generationId: gen.id,
        trackIndex: null,
        title: gen.title || "WAV",
        type: "wav" as const,
        genre: gen.genre ?? "",
        mood: gen.mood ?? "",
        tempo: gen.tempo ?? "",
        createdAt: gen.created_at,
        duration: "—",
        audioUrl: gen.wav_url,
        coverUrl: null,
        audioId: undefined,
        isOwn: true,
        isPublic: false,
        liked,
      },
    ];
  }

  if (gen.tracks.length === 0) {
    return [
      {
        id: gen.id,
        generationId: gen.id,
        trackIndex: null,
        title: gen.title || "Без названия",
        type: libType,
        genre: gen.genre ?? "",
        mood: gen.mood ?? "",
        tempo: gen.tempo ?? "",
        createdAt: gen.created_at,
        duration: "—",
        audioUrl: "",
        coverUrl: null,
        audioId: undefined,
        isOwn: true,
        isPublic: false,
        liked,
      },
    ];
  }
  return gen.tracks.map((t, i) => ({
    id: gen.tracks.length > 1 ? `${gen.id}#${i}` : gen.id,
    generationId: gen.id,
    trackIndex: i,
    title: t.title || gen.title || "Без названия",
    type: libType,
    genre: gen.genre ?? "",
    mood: gen.mood ?? "",
    tempo: gen.tempo ?? "",
    createdAt: gen.created_at,
    duration: formatDuration(t.duration),
    audioUrl: t.audio_url,
    coverUrl: t.image_url ?? null,
    audioId: t.audio_id || undefined,
    isOwn: true,
    // Per-variant: check the indices array first (new), fall back to single index (legacy).
    isPublic: gen.is_public && publishedIndices.includes(i),
    liked,
  }));
}

interface UseLibraryItemsOptions {
  /** Override default page size (50). */
  limit?: number;
}

export interface UseLibraryItemsResult {
  items: LibraryItem[];
  isLoading: boolean;
  authError: boolean;
  /** Force a refetch (e.g. after a destructive mutation). */
  invalidate: () => Promise<void>;
}

/**
 * Single source of truth for per-track items rendered by both StudioPage's
 * LibraryCard and ProfilePage's "Мои файлы" panel.
 *
 * Re-runs whenever the global generation store reports a new ``completed``
 * generation, so both pages refresh together as soon as Suno finishes.
 */
export function useLibraryItems(opts: UseLibraryItemsOptions = {}): UseLibraryItemsResult {
  const limit = opts.limit ?? 50;
  const queryClient = useQueryClient();

  const completedCount = useGenerationStore((s) =>
    Object.values(s.active).filter((g) => g.status === "completed").length,
  );

  const { data, isLoading, error } = useQuery({
    queryKey: [...HISTORY_QUERY_KEY, completedCount, limit],
    queryFn: () => fetchHistory({ limit }),
    retry: false,
  });

  const authError =
    error !== null &&
    typeof error === "object" &&
    error !== undefined &&
    "status" in error &&
    (error as { status: number }).status === 401;

  const items = useMemo<LibraryItem[]>(() => {
    if (!data) return [];
    return data.items.flatMap(generationToItems);
  }, [data]);

  return {
    items,
    isLoading,
    authError,
    invalidate: async () => {
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    },
  };
}
