import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { Panel } from "@/components/ui/Panel";
import { FileActions } from "@/components/studio/FileActions";
import { ImageViewer } from "@/components/ui/ImageViewer";
import {
  type RadioPeriod,
  type RadioTrackOut,
  fetchMyRadioCollection,
  fetchRadio,
  fetchRadioMoodCounts,
  fetchRadioStats,
  recordRadioPlay,
  voteRadioTrack,
} from "@/lib/api/client";
import { usePlayer } from "@/store/player";

import "./RadioPage.css";

// Прозрачный 1×1 GIF — используется как заглушка когда вкладка скрыта,
// чтобы браузер не декодировал анимацию в фоне.
const BLANK_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// Хук паузы: возвращает false когда вкладка скрыта (Page Visibility API).
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  );
  useEffect(() => {
    const handler = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  return visible;
}

const MOODS: ReadonlyArray<{
  key: string;
  emoji: string;
  label: string;
  hex: string;
  descr: string;
  icon?: string;
}> = [
  { key: "all",        emoji: "🎶", label: "Все треки",      hex: "#7cff1f", descr: "Полный эфир RIFFA",             icon: "/radio/mood-all.gif"        },
  { key: "vocal",      emoji: "🎤", label: "С текстом",      hex: "#ffffff", descr: "Все песни с вокалом",           icon: "/radio/mood-vocal.gif"      },
  { key: "happy",      emoji: "😊", label: "Радостное",      hex: "#ffd54a", descr: "Светлые, уплифтные, мажорные",  icon: "/radio/mood-happy.gif"      },
  { key: "calm",       emoji: "😌", label: "Спокойное",      hex: "#8fb3ff", descr: "Расслабляющие, уютные, тёплые", icon: "/radio/mood-calm.gif"       },
  { key: "sad",        emoji: "😢", label: "Грустное",       hex: "#6b8cff", descr: "Меланхоличные, эмоциональные",  icon: "/radio/mood-sad.gif"        },
  { key: "energetic",  emoji: "😤", label: "Энергичное",     hex: "#ff5a00", descr: "Мощные, динамичные, бодрые",    icon: "/radio/mood-energetic.gif"  },
  { key: "confident",  emoji: "😎", label: "Уверенное",      hex: "#c4ff4a", descr: "Боевые, bold, стильные",        icon: "/radio/mood-confident.gif"  },
  { key: "dreamy",     emoji: "🌙", label: "Мечтательное",   hex: "#d6a8ff", descr: "Атмосферные, воздушные",        icon: "/radio/mood-dreamy.gif"     },
  { key: "aggressive", emoji: "🔥", label: "Агрессивное",    hex: "#ff3b5a", descr: "Тяжёлые, интенсивные",          icon: "/radio/mood-aggressive.gif" },
  { key: "inspiring",  emoji: "🌅", label: "Вдохновляющее",  hex: "#ffbf7f", descr: "Мотивирующие, уплифтные",       icon: "/radio/mood-inspiring.gif"  },
  { key: "anxious",    emoji: "😰", label: "Тревожное",      hex: "#a48aff", descr: "Тягучие, тревожные, саспенс",   icon: "/radio/mood-anxious.gif"    },
  { key: "dramatic",   emoji: "🎭", label: "Драматичное",    hex: "#ff7ac6", descr: "Эпик, кинематик, масштаб",      icon: "/radio/mood-dramatic.gif"   },
];

type Mood = typeof MOODS[number]["key"] | "collection";

function MoodIcon({ moodKey, size = 18 }: { moodKey: string; size?: number }) {
  const visible = usePageVisible();
  const mood = MOODS.find((m) => m.key === moodKey);
  if (!mood) return null;
  if (mood.icon)
    return <img src={visible ? mood.icon : BLANK_GIF} alt="" className="mood-inline-icon" style={{ width: size, height: size }} loading="lazy" decoding="async" aria-hidden />;
  return <span aria-hidden>{mood.emoji}</span>;
}

const CHART_RANGES: ReadonlyArray<[RadioPeriod, string]> = [
  ["today", "Чарт дня"],
  ["week",  "Топ недели"],
  ["month", "Топ месяца"],
];

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

const RADIO_QUERY_KEY = ["radio"] as const;

export function RadioPage() {
  const [mood, setMood] = useState<Mood>("all");
  const [range, setRange] = useState<RadioPeriod>("today");
  const queryClient = useQueryClient();
  const [viewerImage, setViewerImage] = useState<{ url: string; title: string } | null>(null);

  const { playOrToggle, currentId, isPlaying } = usePlayer(
    useShallow((s) => ({
      playOrToggle: s.playOrToggle,
      currentId: s.current?.id ?? null,
      isPlaying: s.isPlaying,
    })),
  );

  /** Convert a RadioTrackOut to the PlayerTrack shape. */
  function toPlayerTrack(track: RadioTrackOut) {
    const moodLabel = MOODS.find((m) => m.key === track.mood)?.label ?? track.mood ?? "";
    const meta = [track.genre, moodLabel, track.tempo].filter(Boolean).join(" · ");
    return {
      id: track.id,
      title: track.title,
      url: track.audio_url ?? "",
      author: track.author,
      meta,
      cover: track.image_url ?? undefined,
      likes: track.like_count,
      dislikes: track.dislike_count,
      isOwn: track.is_own,
      canRadio: track.is_own,
      isMusicType: true,
      isPublic: true,
    };
  }

  // ── Stats (hero) ─────────────────────────────────────────
  const statsQuery = useQuery({
    queryKey: [...RADIO_QUERY_KEY, "stats"],
    queryFn: fetchRadioStats,
  });

  // ── Mood counts (mood grid right-side numbers) ───────────
  const moodCountsQuery = useQuery({
    queryKey: [...RADIO_QUERY_KEY, "mood-counts"],
    queryFn: fetchRadioMoodCounts,
  });

  // ── Playlist (filtered by current mood) ──────────────────
  const isCollection = mood === "collection";
  const isVocalFilter = mood === "vocal";
  const moodFilter = isCollection || isVocalFilter || mood === "all" ? undefined : mood;

  const playlistQuery = useQuery({
    queryKey: [...RADIO_QUERY_KEY, "playlist", { mood: moodFilter ?? null, vocal: isVocalFilter }],
    queryFn: () =>
      fetchRadio({
        mood: moodFilter,
        vocal: isVocalFilter ? "vocal" : undefined,
        sort: "recent",
        limit: 100,
      }),
    enabled: !isCollection,
  });

  const collectionQuery = useQuery({
    queryKey: [...RADIO_QUERY_KEY, "collection"],
    queryFn: () => fetchMyRadioCollection({ limit: 100 }),
    retry: false,
    staleTime: 60_000, // fetch on page load; count badge shows immediately
  });

  // ── Charts (period filter, sort by score) ────────────────
  const chartQuery = useQuery({
    queryKey: [...RADIO_QUERY_KEY, "chart", range],
    queryFn: () => fetchRadio({ period: range, sort: "score", limit: 10 }),
  });

  // ── Mutations ────────────────────────────────────────────
  const voteMutation = useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: "like" | "dislike" | "remove" }) =>
      voteRadioTrack(id, rating),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RADIO_QUERY_KEY });
    },
  });

  const playMutation = useMutation({
    mutationFn: (id: string) => recordRadioPlay(id),
    onSuccess: async () => {
      // Increment is reflected in stats/playlist on next refetch; do it lazily.
      await queryClient.invalidateQueries({
        queryKey: [...RADIO_QUERY_KEY, "stats"],
      });
    },
  });

  const playlistData = isCollection ? collectionQuery.data : playlistQuery.data;
  const playlistError = isCollection ? collectionQuery.error : playlistQuery.error;
  const playlistLoading = isCollection ? collectionQuery.isLoading : playlistQuery.isLoading;
  const playlistTracks: RadioTrackOut[] = useMemo(
    () => playlistData?.items ?? [],
    [playlistData],
  );
  const chartTracks: RadioTrackOut[] = useMemo(
    () => chartQuery.data?.items ?? [],
    [chartQuery.data],
  );

  const stats = statsQuery.data;
  const moodCounts = moodCountsQuery.data;
  const collectionCount = collectionQuery.data?.total ?? 0;

  /** Play a track and set the queue from the source list it belongs to.
   *  sourceList = playlistTracks when playing from the playlist panel,
   *  chartTracks when playing from the chart panel.
   *
   *  Re-clicking the currently-active row toggles play/pause instead of
   *  restarting playback — same behaviour as Profile/LibraryCard, so all
   *  file lists across the app respond identically. */
  function play(track: RadioTrackOut, sourceList: RadioTrackOut[]) {
    if (!track.audio_url) return;
    const wasNew = String(currentId) !== String(track.id);
    const queue = sourceList
      .filter((t) => !!t.audio_url)
      .map(toPlayerTrack);
    playOrToggle(toPlayerTrack(track), queue);
    // Only count a fresh play — toggling pause should not increment plays.
    if (wasNew) playMutation.mutate(track.id);
  }

  function toggleVote(track: RadioTrackOut, next: "like" | "dislike") {
    const current = track.my_vote;
    const rating = current === next ? "remove" : next;
    voteMutation.mutate({ id: track.id, rating });
  }

  const authError =
    isCollection &&
    collectionQuery.error !== null &&
    typeof collectionQuery.error === "object" &&
    collectionQuery.error !== undefined &&
    "status" in collectionQuery.error &&
    (collectionQuery.error as { status: number }).status === 401;

  return (
    <div className="radio">
      {/* ── Hero ── */}
      <section className="radio-hero radio-hero--compact">
        <div className="radio-hero__body">
          <div className="radio-hero__head">
            <span className="radio-hero__badge">RIFFA Radio</span>
            <h1>Эфир сообщества</h1>
          </div>
          <div className="radio-stats">
            <div><strong>{stats?.total_tracks ?? "—"}</strong><span>в эфире</span></div>
            <div><strong>{(stats?.total_plays ?? 0).toLocaleString("ru")}</strong><span>прослуш.</span></div>
            <div><strong>{(stats?.today_plays ?? 0).toLocaleString("ru")}</strong><span>прослуш. сегодня</span></div>
            <div><strong>{stats?.total_likes ?? 0}</strong><span>лайков</span></div>
            <div><strong>{stats?.today_tracks ?? 0}</strong><span>новых сегодня</span></div>
          </div>
        </div>
      </section>

      {/* ── Mood grid ── */}
      <Panel className="radio-panel radio-panel--compact">
        <header className="radio-section-head radio-section-head--compact">
          <h3 className="radio-section-head__title">По настроению</h3>
        </header>
        <div className="mood-grid mood-grid--compact">

          {/* «Моя коллекция» */}
          <button
            type="button"
            className={`mood-card mood-card--collection${mood === "collection" ? " mood-card--active" : ""}`}
            onClick={() => setMood("collection")}
            aria-pressed={mood === "collection"}
            title="Моя коллекция — только лайкнутые треки"
          >
            <img src="/radio/mood-collection.gif" alt="" className="mood-card__icon" loading="lazy" decoding="async" aria-hidden />
            <span className="mood-card__body">
              <span className="mood-card__label">Моя коллекция</span>
              <span className="mood-card__meta">Только лайкнутые</span>
            </span>
            <span className="mood-card__count mood-card__count--collection">{collectionCount}</span>
          </button>

          {MOODS.map((m) => {
            const count =
              m.key === "all"
                ? moodCounts?.total ?? 0
                : m.key === "vocal"
                ? moodCounts?.vocal ?? 0
                : moodCounts?.counts[m.key] ?? 0;
            const active = mood === m.key;
            return (
              <button
                key={m.key}
                type="button"
                className={`mood-card${active ? " mood-card--active" : ""}`}
                style={{ '--mood-color': m.hex, borderColor: active ? m.hex : undefined } as React.CSSProperties}
                onClick={() => setMood(m.key)}
                aria-pressed={active}
                title={`${m.emoji} ${m.label} — ${m.descr}`}
              >
                {m.icon
                  ? <img src={m.icon} alt="" className="mood-card__icon" loading="lazy" decoding="async" aria-hidden />
                  : <span className="mood-card__emoji" aria-hidden>{m.emoji}</span>
                }
                <span className="mood-card__dot mood-card__dot--hidden" style={{ background: m.hex }} />
                <span className="mood-card__body">
                  <span className="mood-card__label">{m.label}</span>
                  <span className="mood-card__meta" title={m.descr}>{m.descr}</span>
                </span>
                <span
                  className="mood-card__count"
                  aria-label={`${count} треков`}
                  style={{ color: active ? m.hex : undefined, borderColor: active ? m.hex : undefined }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* ── Playlist + Charts ── */}
      <div className="radio-columns">

        {/* Плейлист */}
        <Panel className="radio-panel radio-panel--half">
          <header className="radio-section-head">
            <h2 className="radio-playlist-title">
              Плейлист «{mood === "collection" ? (
                <><img src="/radio/mood-collection.gif" alt="" className="mood-inline-icon" style={{ width: 20, height: 20 }} loading="lazy" decoding="async" aria-hidden /> Моя коллекция</>
              ) : (
                <><MoodIcon moodKey={mood} size={20} /> {MOODS.find((m) => m.key === mood)?.label ?? mood}</>
              )}»
            </h2>
            <p className="muted">Лайки и дизлайки двигают треки в чартах. Нажми ▶ чтобы послушать.</p>
          </header>
          <ol className="playlist">
            {playlistLoading && (
              <li className="playlist-empty">Загружаем эфир…</li>
            )}
            {!playlistLoading && authError && (
              <li className="playlist-empty">
                Войди в аккаунт, чтобы видеть свою коллекцию.
              </li>
            )}
            {!playlistLoading && !authError && playlistError && (
              <li className="playlist-empty">Не удалось загрузить треки.</li>
            )}
            {!playlistLoading &&
              !authError &&
              !playlistError &&
              playlistTracks.map((track) => {
                const isActive = currentId === track.id;
                const moodLabel =
                  MOODS.find((m) => m.key === track.mood)?.label ?? track.mood ?? "—";
                return (
                  <li
                    key={track.id}
                    role="button"
                    tabIndex={0}
                    className={`file-item${isActive ? " file-item--active" : ""}`}
                    onClick={() => play(track, playlistTracks)}
                    onKeyDown={(e) => e.key === "Enter" && play(track, playlistTracks)}
                    aria-label={`Слушать: ${track.title}`}
                  >
                    {/* col 1: обложка (если есть) или иконка */}
                    {track.image_url ? (
                      <span
                        className="file-item__icon file-item__icon--cover"
                        aria-hidden
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewerImage({ url: track.image_url!, title: track.title });
                        }}
                        style={{ cursor: "zoom-in" }}
                        title="Открыть в полноэкранном режиме"
                      >
                        <img src={track.image_url} alt="" loading="lazy" />
                      </span>
                    ) : (
                      <span className="file-item__icon" aria-hidden>🎵</span>
                    )}

                    {/* col 2: название + мета */}
                    <div className="file-item__info">
                      <span className="file-item__title">{track.title}</span>
                      <span className="file-item__meta">
                        {track.author} · {track.genre ?? "—"} · {moodLabel}
                        {track.duration ? ` · ${fmtTime(track.duration)}` : ""}
                      </span>
                    </div>

                    {/* col 3: dl + bolt */}
                    <FileActions
                      audioUrl={track.audio_url}
                      title={track.title}
                      isMusicType={true}
                      canRadio={false}
                      fileId={track.id}
                    />

                    {/* col 4: лайки + индикатор ▶/❚❚ */}
                    <div
                      className="file-item__right"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={`rate-btn rate-btn--like${track.my_vote === "like" ? " rate-btn--on" : ""}`}
                        onClick={() => toggleVote(track, "like")}
                        aria-label="Лайк"
                      >
                        👍 {track.like_count}
                      </button>
                      <button
                        type="button"
                        className={`rate-btn rate-btn--dislike${track.my_vote === "dislike" ? " rate-btn--on" : ""}`}
                        onClick={() => toggleVote(track, "dislike")}
                        aria-label="Дизлайк"
                      >
                        👎 {track.dislike_count}
                      </button>
                      <span className="file-item__indicator" aria-hidden>
                        {isActive && isPlaying ? "❚❚" : "▶"}
                      </span>
                    </div>
                  </li>
                );
              })}
            {!playlistLoading &&
              !authError &&
              !playlistError &&
              playlistTracks.length === 0 && (
                <li className="playlist-empty">
                  {mood === "collection"
                    ? "Коллекция пуста — поставь лайк трекам, и они появятся здесь."
                    : "Пока треков в этом настроении нет."}
                </li>
              )}
          </ol>
        </Panel>

        {/* Чарты */}
        <Panel className="radio-panel radio-panel--half">
          <header className="radio-section-head radio-section-head--row">
            <div>
              <h2>Чарты</h2>
              <p className="muted">Рассчитано по лайкам минус дизлайки за период.</p>
            </div>
            <div className="chip-row chart-ranges">
              {CHART_RANGES.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`filter-chip${range === value ? " filter-chip--active" : ""}`}
                  onClick={() => setRange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>
          <ol className="playlist playlist--chart">
            {chartTracks.map((t, i) => {
              const isActive = currentId === t.id;
              const moodLabel = MOODS.find((m) => m.key === t.mood)?.label ?? t.mood ?? "—";
              return (
                <li
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  className={`file-item file-item--chart${isActive ? " file-item--active" : ""}`}
                  onClick={() => play(t, chartTracks)}
                  onKeyDown={(e) => e.key === "Enter" && play(t, chartTracks)}
                  aria-label={`Слушать: ${t.title}`}
                >
                  <span className="file-item__chart-pos" aria-hidden>{i + 1}</span>

                  {t.image_url ? (
                    <span
                      className="file-item__icon file-item__icon--cover"
                      aria-hidden
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewerImage({ url: t.image_url!, title: t.title });
                      }}
                      style={{ cursor: "zoom-in" }}
                      title="Открыть в полноэкранном режиме"
                    >
                      <img src={t.image_url} alt="" loading="lazy" />
                    </span>
                  ) : (
                    <span className="file-item__icon" aria-hidden>🎵</span>
                  )}

                  <div className="file-item__info">
                    <span className="file-item__title">{t.title}</span>
                    <span className="file-item__meta">
                      {t.author} · {t.genre ?? "—"} · {moodLabel}
                      {t.duration ? ` · ${fmtTime(t.duration)}` : ""}
                    </span>
                  </div>

                  <FileActions
                    audioUrl={t.audio_url}
                    title={t.title}
                    isMusicType={true}
                    canRadio={false}
                    fileId={t.id}
                  />

                  <div
                    className="file-item__right"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={`rate-btn rate-btn--like${t.my_vote === "like" ? " rate-btn--on" : ""}`}
                      onClick={() => toggleVote(t, "like")}
                      aria-label="Лайк"
                    >
                      👍 {t.like_count}
                    </button>
                    <button
                      type="button"
                      className={`rate-btn rate-btn--dislike${t.my_vote === "dislike" ? " rate-btn--on" : ""}`}
                      onClick={() => toggleVote(t, "dislike")}
                      aria-label="Дизлайк"
                    >
                      👎 {t.dislike_count}
                    </button>
                    <span className="file-item__chart-score" aria-label={`Очки: ${t.score}`}>
                      {t.score >= 0 ? "+" : ""}{t.score}
                    </span>
                    <span className="file-item__indicator" aria-hidden>
                      {isActive && isPlaying ? "❚❚" : "▶"}
                    </span>
                  </div>
                </li>
              );
            })}
            {chartQuery.isLoading && (
              <li className="playlist-empty">Загружаем чарт…</li>
            )}
            {!chartQuery.isLoading && chartTracks.length === 0 && (
              <li className="playlist-empty">За этот период треки ещё не выбились в топ.</li>
            )}
          </ol>
        </Panel>

      </div>
      {viewerImage && (
        <ImageViewer
          imageUrl={viewerImage.url}
          title={viewerImage.title}
          onClose={() => setViewerImage(null)}
        />
      )}
    </div>
  );
}
