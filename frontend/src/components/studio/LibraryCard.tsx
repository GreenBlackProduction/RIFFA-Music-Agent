import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  deleteGeneration,
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
  RADIO_TYPES,
  TYPE_ICONS,
  TYPE_LABELS,
  useLibraryItems,
} from "@/lib/library";
import { usePlayer } from "@/store/player";
import { FileActions } from "./FileActions";
import { FileGhostsOverlay, useFileGhosts } from "./FileGhost";
import { ImageViewer } from "@/components/ui/ImageViewer";
import "./LibraryCard.css";

type FilterType = "all" | LibraryItemType | "trash";

export function LibraryCard() {
  const [filter, setFilter] = useState<FilterType>("all");
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

  const visibleItems = useMemo(() => {
    if (filter === "trash") return [];
    return filter === "all" ? items : items.filter((i) => i.type === filter);
  }, [items, filter]);

  // Trash tab — fetch deleted items separately.
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

  // Restore a single item from trash → moves back to library.
  const restoreMutation = useMutation({
    mutationFn: (generationId: string) => restoreGeneration(generationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["history", "trash"] });
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    },
  });

  // Sync the global player's "В эфире" state with backend whenever items change.
  // Keyed by item id (`gen.id#index` for multi-variant) so V1/V2 are independent.
  useEffect(() => {
    for (const it of items) {
      setRadioState(it.id, it.isPublic);
    }
  }, [items, setRadioState]);

  // Delete with OPTIMISTIC cache update — file disappears from the list
  // immediately. If the API call fails, we rollback.
  const deleteMutation = useMutation({
    mutationFn: (generationId: string) => deleteGeneration(generationId),
    onMutate: async (generationId) => {
      // Cancel any in-flight refetches so they don't overwrite our optimistic update.
      await queryClient.cancelQueries({ queryKey: HISTORY_QUERY_KEY });
      // Snapshot all current history caches so we can roll back on error.
      const snapshots = queryClient.getQueriesData<HistoryPage>({
        queryKey: HISTORY_QUERY_KEY,
      });
      // Filter the deleted generation out of every cached page.
      queryClient.setQueriesData<HistoryPage>({ queryKey: HISTORY_QUERY_KEY }, (old) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.filter((g: GenerationOut) => g.id !== generationId),
          total: Math.max(0, (old.total ?? 0) - 1),
        };
      });
      return { snapshots };
    },
    onError: (_err, _id, ctx) => {
      // Restore previous state on failure so the user sees the item come back.
      if (ctx?.snapshots) {
        for (const [key, data] of ctx.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: async () => {
      // Sync with server state regardless of outcome.
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["history", "trash"] });
      // Soft-delete also un-publishes the track from the public Radio
      // (handled server-side); refresh radio caches so the playlist/chart
      // reflect the change immediately.
      await queryClient.invalidateQueries({ queryKey: ["radio"] });
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
    // Build the full playable queue from visible items so prev/next work.
    const queue = visibleItems
      .filter((i) => !!i.audioUrl)
      .map((i) => ({
        id: i.id,
        title: i.title,
        url: i.audioUrl,
        cover: i.coverUrl ?? undefined,
        meta: `${TYPE_LABELS[i.type]} · ${i.genre} · ${i.mood}`,
        isOwn: i.isOwn !== false,
        canRadio: RADIO_TYPES.has(i.type) && i.isOwn !== false,
        isMusicType: MUSIC_TYPES.has(i.type),
        isPublic: i.isPublic,
        audioId: i.audioId,
      }));
    const track = {
      id: item.id,
      title: item.title,
      url: item.audioUrl,
      cover: item.coverUrl ?? undefined,
      meta: `${TYPE_LABELS[item.type]} · ${item.genre} · ${item.mood}`,
      isOwn: item.isOwn !== false,
      canRadio: RADIO_TYPES.has(item.type) && item.isOwn !== false,
      isMusicType: MUSIC_TYPES.has(item.type),
      isPublic: item.isPublic,
      audioId: item.audioId,
    };
    // Unified play/pause logic: re-clicking the active row pauses/resumes;
    // any other row starts a new playback with the freshly-built queue.
    playOrToggle(track, queue);
  };

  return (
    <section className="library-card">
      <header className="library-card__head">
        <div>
          <h2 className="library-card__title">
            <span className="library-card__icon" aria-hidden>📁</span>
            Недавние генерации
          </h2>
          <p className="library-card__hint">
            Последние файлы. Клик — воспроизведение в общем плеере сайта.
          </p>
        </div>
        <div className="library-card__filters">
          {(["all", "song", "instrumental", "cover", "sfx", "wav", "cover_art"] as Exclude<FilterType, "trash">[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`filter-chip${filter === t ? " filter-chip--active" : ""}`}
              onClick={() => setFilter(t)}
            >
              {t === "all" ? "все" : TYPE_LABELS[t].toLowerCase()}
            </button>
          ))}
          <button
            type="button"
            className={`filter-chip filter-chip--trash${filter === "trash" ? " filter-chip--active" : ""}`}
            onClick={() => setFilter(filter === "trash" ? "all" : "trash")}
            title="Корзина"
          >
            🗑
          </button>
        </div>
      </header>

      {!isLoading && authError && (
        <p className="library-card__hint" style={{ color: "var(--muted)" }}>
          Войди в аккаунт — и здесь появятся твои генерации.
        </p>
      )}
      {!isLoading && !authError && visibleItems.length === 0 && filter !== "trash" && (
        <p className="library-card__hint" style={{ color: "var(--muted)" }}>
          Пока пусто — запусти первую генерацию в плитках модулей выше.
        </p>
      )}
      {!isLoading && filter === "trash" && visibleItems.length === 0 && (
        <p className="library-card__hint" style={{ color: "var(--muted)" }}>
          Корзина пуста. Удалённые файлы хранятся 7 дней, потом удаляются навсегда.
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
              {it.coverUrl ? (
                <span
                  className="file-item__icon file-item__icon--cover"
                  aria-hidden
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewerImage({ url: it.coverUrl!, title: it.title });
                  }}
                  style={{ cursor: "zoom-in" }}
                  title="Открыть в полноэкранном режиме"
                >
                  <img src={it.coverUrl} alt="" loading="lazy" />
                </span>
              ) : (
                <span className="file-item__icon" aria-hidden>{TYPE_ICONS[it.type]}</span>
              )}

              <div className="file-item__info">
                <strong className="file-item__title">{it.title}</strong>
                <span className="file-item__meta">
                  {TYPE_LABELS[it.type]} · {it.genre} · {it.mood} · {it.duration}
                </span>
              </div>

              <FileActions
                audioUrl={it.audioUrl}
                downloadUrl={
                  it.trackIndex !== null
                    ? trackDownloadUrl(it.generationId, it.trackIndex)
                    : undefined
                }
                title={it.title}
                isMusicType={canBolt}
                canRadio={canRadio}
                fileId={it.id}
                isPublic={it.isPublic}
                generationId={it.generationId}
                audioId={it.audioId}
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
                  deleteMutation.mutate(it.generationId);
                }}
              />
            </div>
          );
        })}
      </div>
      <FileGhostsOverlay ghosts={ghosts} />

      {/* ── Trash section ─────────────────────────────────────────── */}
      {filter === "trash" && (
        <div className="library-trash">
          {(trashData?.items ?? []).length > 0 && (
            <div className="library-trash__head">
              <span className="muted">
                Файлы в корзине хранятся 7 дней, затем удаляются навсегда.
              </span>
              <button
                type="button"
                className="filter-chip filter-chip--danger"
                onClick={() => purgeMutation.mutate()}
                disabled={purgeMutation.isPending}
              >
                {purgeMutation.isPending ? "Очищаю…" : "Очистить корзину"}
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
                    title="Восстановить"
                    onClick={() => restoreMutation.mutate(gen.id)}
                    disabled={restoring}
                  >
                    {restoring ? "…" : "↩ Восстановить"}
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
