import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import { formatBpm } from "@/lib/tempo";

import {
  deleteGeneration,
  renameGeneration,
  generateSimilar,
  updateGenerationTags,
  fetchTrash,
  purgeTrash,
  restoreGeneration,
  toggleHistoryRadio,
  trackDownloadUrl,
  type GenerationOut,
  type HistoryPage,
} from "@/lib/api/client";
import {
  HISTORY_QUERY_KEY,
  type LibraryItem,
  type LibraryItemType,
  MUSIC_TYPES,
  primaryGenre,
  RADIO_TYPES,
  useLibraryItems,
} from "@/lib/library";
import { TypeIcon } from "@/components/ui/TypeIcon";
import { usePlayer } from "@/store/player";
import { FileActions } from "./FileActions";
import { FileGhostsOverlay, useFileGhosts } from "./FileGhost";
import { ImageViewer } from "@/components/ui/ImageViewer";
import "./LibraryCard.css";

type FilterType = "all" | LibraryItemType | "trash";

export function LibraryCard() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterType>("all");
  const [genreFilter, setGenreFilter] = useState<string>("");
  const [moodFilter, setMoodFilter] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const typeLabel = (k: LibraryItemType) => t(`library.types.${k}`);
  const [failedCovers, setFailedCovers] = useState<Set<string>>(new Set());
  const { ghosts, showGhost } = useFileGhosts();
  const queryClient = useQueryClient();
  const [viewerImage, setViewerImage] = useState<{ url: string; title: string } | null>(null);

  const { playOrToggle, currentId, isPlaying, setRadioState } = usePlayer(
    useShallow((s) => ({
      playOrToggle: s.playOrToggle,
      currentId: s.current?.id ?? null,
      isPlaying: s.isPlaying,
      setRadioState: s.setRadioState,
    })),
  );

  const { items, isLoading, authError } = useLibraryItems();

  // Unique genres and moods extracted from actual items (non-empty, sorted).
  // Genre is reduced to its PRIMARY style and de-duplicated case-insensitively
  // so the dropdown isn't polluted by multi-genre strings or "Pop"/"pop" twins.
  const uniqueGenres = useMemo(() => {
    const byKey = new Map<string, string>(); // lowercase key → display label
    for (const it of items) {
      const g = primaryGenre(it.genre);
      if (!g) continue;
      const key = g.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, g);
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const uniqueMoods = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.mood && it.mood.trim()) set.add(it.mood.trim());
    }
    return Array.from(set).sort();
  }, [items]);

  const visibleItems = useMemo(() => {
    if (filter === "trash") return [];
    let list = filter === "all" ? items : items.filter((i) => i.type === filter);
    if (genreFilter) list = list.filter((i) => primaryGenre(i.genre).toLowerCase() === genreFilter.toLowerCase());
    if (moodFilter)  list = list.filter((i) => i.mood  === moodFilter);
    if (sortOrder === "oldest") list = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return list;
  }, [items, filter, genreFilter, moodFilter, sortOrder]);

  // Reset secondary filters when type filter changes
  useEffect(() => {
    setGenreFilter("");
    setMoodFilter("");
  }, [filter]);

  const { data: trashData } = useQuery({
    queryKey: ["history", "trash"],
    queryFn: () => fetchTrash(),
    enabled: filter === "trash",
    retry: false,
  });

  const purgeMutation = useMutation({
    mutationFn: purgeTrash,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["history", "trash"] });
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (generationId: string) => restoreGeneration(generationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["history", "trash"] });
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    },
  });

  useEffect(() => {
    for (const it of items) {
      setRadioState(it.id, it.isPublic);
    }
  }, [items, setRadioState]);

  const deleteMutation = useMutation({
    mutationFn: ({ generationId, trackIndex }: { generationId: string; trackIndex: number | null }) =>
      deleteGeneration(generationId, trackIndex),
    onMutate: async ({ generationId, trackIndex }) => {
      await queryClient.cancelQueries({ queryKey: HISTORY_QUERY_KEY });
      const snapshots = queryClient.getQueriesData<HistoryPage>({ queryKey: HISTORY_QUERY_KEY });
      queryClient.setQueriesData<HistoryPage>({ queryKey: HISTORY_QUERY_KEY }, (old) => {
        if (!old?.items) return old;
        if (trackIndex !== null) {
          return {
            ...old,
            items: old.items.map((g: GenerationOut) => {
              if (g.id !== generationId) return g;
              const tracks = g.tracks.filter((_: unknown, i: number) => i !== trackIndex);
              return { ...g, tracks };
            }).filter((g: GenerationOut) => g.tracks.length > 0),
          };
        }
        return {
          ...old,
          items: old.items.filter((g: GenerationOut) => g.id !== generationId),
          total: Math.max(0, (old.total ?? 0) - 1),
        };
      });
      return { snapshots };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshots) {
        for (const [key, data] of ctx.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["history", "trash"] });
      await queryClient.invalidateQueries({ queryKey: ["radio"] });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({
      generationId,
      trackIndex,
      title,
    }: {
      generationId: string;
      trackIndex: number | null;
      title: string;
    }) => renameGeneration(generationId, title, trackIndex),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["radio"] });
    },
  });

  const similarMutation = useMutation({
    mutationFn: (generationId: string) => generateSimilar(generationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    },
  });

  const tagsMutation = useMutation({
    mutationFn: ({ generationId, tags }: { generationId: string; tags: { genre: string; mood: string; tempo: string } }) =>
      updateGenerationTags(generationId, tags),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    },
  });

  const radioMutation = useMutation({
    mutationFn: ({
      generationId,
      trackIndex,
      isPublic,
    }: {
      itemId: string;
      generationId: string;
      trackIndex: number | null;
      isPublic: boolean;
    }) => toggleHistoryRadio(generationId, isPublic, trackIndex),
    onSuccess: async (_, vars) => {
      setRadioState(vars.itemId, vars.isPublic);
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["radio"] });
    },
  });

  const handleClick = (item: LibraryItem) => {
    if (!item.audioUrl) return;
    const queue = visibleItems
      .filter((i) => !!i.audioUrl)
      .map((i) => ({
        id: i.id,
        title: i.title,
        url: i.audioUrl,
        cover: i.coverUrl ?? undefined,
        meta: [typeLabel(i.type), i.genre, i.mood, formatBpm(i.tempo)].filter(Boolean).join(" · "),
        isOwn: i.isOwn !== false,
        canRadio: RADIO_TYPES.has(i.type) && i.isOwn !== false,
        isMusicType: MUSIC_TYPES.has(i.type),
        isPublic: i.isPublic,
        audioId: i.audioId,
        source: "library" as const,
      }));
    const track = {
      id: item.id,
      title: item.title,
      url: item.audioUrl,
      cover: item.coverUrl ?? undefined,
      meta: [typeLabel(item.type), item.genre, item.mood, formatBpm(item.tempo)].filter(Boolean).join(" · "),
      isOwn: item.isOwn !== false,
      canRadio: RADIO_TYPES.has(item.type) && item.isOwn !== false,
      isMusicType: MUSIC_TYPES.has(item.type),
      isPublic: item.isPublic,
      audioId: item.audioId,
      source: "library" as const,
    };
    playOrToggle(track, queue);
  };

  return (
    <section className="library-card">
      <header className="library-card__head">
        <div>
          <h2 className="library-card__title">
            <span className="library-card__icon" aria-hidden>📁</span>
            {t("library.recentTitle")}
          </h2>
          <p className="library-card__hint">
            {t("library.recentSubtitle")}
          </p>
        </div>

        {/* Тип файла */}
        <div className="library-card__filters">
          {(["all", "song", "instrumental", "cover", "sfx", "wav", "cover_art"] as Exclude<FilterType, "trash">[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`filter-chip${filter === f ? " filter-chip--active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? t("library.filterAll") : typeLabel(f).toLowerCase()}
            </button>
          ))}
          <button
            type="button"
            className={`filter-chip filter-chip--trash${filter === "trash" ? " filter-chip--active" : ""}`}
            onClick={() => setFilter(filter === "trash" ? "all" : "trash")}
            title={t("library.trash")}
            aria-label={t("library.trash")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      </header>

      {/* Фильтры — дропдауны */}
      {filter !== "trash" && (
        <div className="library-filters-bar">
          {uniqueMoods.length > 0 && (
            <select
              className="library-select"
              value={moodFilter}
              onChange={(e) => setMoodFilter(e.target.value)}
            >
              <option value="">{t("library.moodAll", { defaultValue: "Любое настроение" })}</option>
              {uniqueMoods.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {uniqueGenres.length > 0 && (
            <select
              className="library-select"
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
            >
              <option value="">{t("library.genreAll", { defaultValue: "Любой жанр" })}</option>
              {uniqueGenres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          <select
            className="library-select library-select--sort"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
          >
            <option value="newest">{t("library.sortNewest", { defaultValue: "Сначала новые" })}</option>
            <option value="oldest">{t("library.sortOldest", { defaultValue: "Сначала старые" })}</option>
          </select>
        </div>
      )}

      {isLoading && (
        <p className="library-card__hint library-card__hint--loading">
          {t("library.loadingFiles")}
        </p>
      )}
      {!isLoading && authError && (
        <p className="library-card__hint" style={{ color: "var(--ink-3)" }}>
          {t("library.signInPrompt")}
        </p>
      )}
      {!isLoading && !authError && visibleItems.length === 0 && filter !== "trash" && (
        <p className="library-card__hint" style={{ color: "var(--ink-3)" }}>
          {t("library.emptyStart")}
        </p>
      )}
      {!isLoading && filter === "trash" && visibleItems.length === 0 && (
        <p className="library-card__hint" style={{ color: "var(--ink-3)" }}>
          {t("library.trashEmpty")}
        </p>
      )}

      <div className="library-card__grid">
        {visibleItems.map((it) => {
          const isActive = currentId === it.id;
          const canRadio = RADIO_TYPES.has(it.type) && it.isOwn !== false;
          const canBolt  = MUSIC_TYPES.has(it.type);
          const radioPending =
            radioMutation.isPending &&
            radioMutation.variables?.itemId === it.id;
          return (
            <div
              key={it.id}
              role="button"
              tabIndex={0}
              className={`file-item${isActive ? " file-item--active" : ""}`}
              onClick={() => handleClick(it)}
              onKeyDown={(e) => e.key === "Enter" && handleClick(it)}
            >
              {it.coverUrl && !failedCovers.has(it.id) ? (
                <span
                  className="file-item__icon file-item__icon--cover"
                  aria-hidden
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewerImage({ url: it.coverUrl!, title: it.title });
                  }}
                  style={{ cursor: "zoom-in" }}
                  title={t("library.openFullscreen")}
                >
                  <img
                    src={it.coverUrl}
                    alt=""
                    loading="lazy"
                    onError={() => setFailedCovers((s) => new Set(s).add(it.id))}
                  />
                </span>
              ) : (
                <span className="file-item__icon" aria-hidden><TypeIcon type={it.type} size={20} /></span>
              )}

              <div className="file-item__info">
                <strong className="file-item__title">{it.title}</strong>
                <span className="file-item__meta">
                  {[typeLabel(it.type), it.genre, it.mood, formatBpm(it.tempo), it.duration].filter(Boolean).join(" · ")}
                </span>
              </div>

              <FileActions
                audioUrl={it.audioUrl}
                downloadUrl={
                  it.trackIndex !== null
                    ? trackDownloadUrl(it.generationId, it.trackIndex)
                    : it.type === "cover_art" && it.coverUrl
                      ? it.coverUrl
                      : undefined
                }
                title={it.title}
                isMusicType={canBolt}
                isImageType={it.type === "cover_art"}
                imageUrl={it.type === "cover_art" ? it.coverUrl ?? undefined : undefined}
                canRadio={canRadio}
                fileId={it.id}
                isPublic={it.isPublic}
                generationId={it.generationId}
                audioId={it.audioId}
                trackIndex={it.trackIndex}
                onToggleRadio={
                  canRadio
                    ? (next) =>
                        radioMutation.mutateAsync({
                          itemId: it.id,
                          generationId: it.generationId,
                          trackIndex: it.trackIndex,
                          isPublic: next,
                        })
                    : undefined
                }
                radioPending={radioPending}
                isActive={isActive}
                isPlaying={isPlaying}
                onPlayPause={it.audioUrl ? () => handleClick(it) : undefined}
                onDelete={(rect) => {
                  showGhost(it, rect);
                  deleteMutation.mutate({ generationId: it.generationId, trackIndex: it.trackIndex });
                }}
                onRename={(next) =>
                  renameMutation.mutateAsync({
                    generationId: it.generationId,
                    trackIndex: it.trackIndex,
                    title: next,
                  })
                }
                onSimilar={
                  it.generationId
                    ? () => similarMutation.mutate(it.generationId)
                    : undefined
                }
                onEditTags={
                  it.generationId
                    ? (tags) => tagsMutation.mutateAsync({ generationId: it.generationId, tags })
                    : undefined
                }
                currentGenre={it.genre}
                currentMood={it.mood}
                currentTempo={it.tempo}
              />
            </div>
          );
        })}
      </div>
      <FileGhostsOverlay ghosts={ghosts} />

      {/* ── Trash section ── */}
      {filter === "trash" && (
        <div className="library-trash">
          {(trashData?.items ?? []).length > 0 && (
            <div className="library-trash__head">
              <span className="muted">
                {t("library.trashRetention")}
              </span>
              <button
                type="button"
                className="filter-chip filter-chip--danger"
                onClick={() => purgeMutation.mutate()}
                disabled={purgeMutation.isPending}
              >
                {purgeMutation.isPending ? t("library.purging") : t("library.purge")}
              </button>
            </div>
          )}
          <div className="library-trash__list">
            {(trashData?.items ?? []).map((gen) => {
              const restoring =
                restoreMutation.isPending && restoreMutation.variables === gen.id;
              return (
                <div key={gen.id} className="trash-item">
                  <div className="trash-item__info">
                    <strong className="trash-item__title">{gen.title || gen.type}</strong>
                    <span className="trash-item__meta">
                      {gen.type} · {gen.deleted_at ? new Date(gen.deleted_at).toLocaleDateString("ru") : "—"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="filter-chip"
                    title={t("library.restore")}
                    onClick={() => restoreMutation.mutate(gen.id)}
                    disabled={restoring}
                  >
                    {restoring ? "…" : t("library.restoreCta")}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {viewerImage && (
        <ImageViewer
          imageUrl={viewerImage.url}
          title={viewerImage.title}
          onClose={() => setViewerImage(null)}
        />
      )}
    </section>
  );
}
