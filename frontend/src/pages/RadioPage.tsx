import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTranslation } from "react-i18next";

import { Panel } from "@/components/ui/Panel";
import { FileActions } from "@/components/studio/FileActions";
import { ImageViewer } from "@/components/ui/ImageViewer";
import {
  type RadioPeriod,
  type RadioTrackOut,
  adminClassifyRadioTrack,
  adminUnpublishRadioTrack,
  fetchMyRadioCollection,
  fetchRadio,
  fetchRadioMoodCounts,
  fetchRadioStats,
  fetchSharedGeneration,
  recordRadioPlay,
  voteRadioTrack,
} from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
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
  hex: string;
  icon?: string;
}> = [
  { key: "all",        emoji: "🎶", hex: "#7cff1f", icon: "/radio/mood-all.webp"        },
  { key: "vocal",      emoji: "🎤", hex: "#ffffff", icon: "/radio/mood-vocal.webp"      },
  { key: "happy",      emoji: "😊", hex: "#ffd54a", icon: "/radio/mood-happy.webp"      },
  { key: "calm",       emoji: "😌", hex: "#8fb3ff", icon: "/radio/mood-calm.webp"       },
  { key: "sad",        emoji: "😢", hex: "#6b8cff", icon: "/radio/mood-sad.webp"        },
  { key: "energetic",  emoji: "😤", hex: "#ff5a00", icon: "/radio/mood-energetic.webp"  },
  { key: "confident",  emoji: "😎", hex: "#c4ff4a", icon: "/radio/mood-confident.webp"  },
  { key: "dreamy",     emoji: "🌙", hex: "#d6a8ff", icon: "/radio/mood-dreamy.webp"     },
  { key: "aggressive", emoji: "🔥", hex: "#ff3b5a", icon: "/radio/mood-aggressive.webp" },
  { key: "inspiring",  emoji: "🌅", hex: "#ffbf7f", icon: "/radio/mood-inspiring.webp"  },
  { key: "anxious",    emoji: "😰", hex: "#a48aff", icon: "/radio/mood-anxious.webp"    },
  { key: "dramatic",   emoji: "🎭", hex: "#ff7ac6", icon: "/radio/mood-dramatic.webp"   },
];

type Mood = typeof MOODS[number]["key"] | "collection";

const GENRES = [
  "Pop", "Rock", "Electronic", "Hip-Hop", "Jazz", "Classical",
  "Lofi", "Ambient", "R&B", "Country", "Metal", "Folk",
] as const;

function MoodIcon({ moodKey, size = 18 }: { moodKey: string; size?: number }) {
  const visible = usePageVisible();
  const mood = MOODS.find((m) => m.key === moodKey);
  if (!mood) return null;
  if (mood.icon)
    return <img src={visible ? mood.icon : BLANK_GIF} alt="" className="mood-inline-icon" style={{ width: size, height: size }} loading="lazy" decoding="async" aria-hidden />;
  return <span aria-hidden>{mood.emoji}</span>;
}

const CHART_PERIODS: ReadonlyArray<RadioPeriod> = ["today", "week", "month", "all"];

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

const RADIO_QUERY_KEY = ["radio"] as const;

export function RadioPage() {
  const { t, i18n: i18nClient } = useTranslation();
  const isEN = (i18nClient.resolvedLanguage || i18nClient.language || "ru").startsWith("en");
  const moodTranslated = (key: string) => {
    const v = t(`radio.moods.${key}`, { defaultValue: "" });
    return typeof v === "string" && v ? v : key;
  };
  const moodDescr = (key: string) => {
    const v = t(`radio.moodDescr.${key}`, { defaultValue: "" });
    return typeof v === "string" && v ? v : "";
  };
  const [mood, setMood] = useState<Mood>("all");
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [range, setRange] = useState<RadioPeriod>("today");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;

  // Admin moderation: confirm + unpublish + refresh list.
  const adminRemoveTrack = async (track: RadioTrackOut) => {
    if (!isAdmin) return;
    if (!window.confirm(t("radio.adminConfirmRemove", { title: track.title }))) return;
    try {
      await adminUnpublishRadioTrack(track.id);
      await queryClient.invalidateQueries({ queryKey: ["radio"] });
    } catch (err) {
      const msg = (err as { detail?: string })?.detail ?? t("errors.generic");
      window.alert(msg);
    }
  };

  // Admin: open quick reclassify popover anchored at a track.
  const [adminClassifyFor, setAdminClassifyFor] = useState<string | null>(null);
  const adminReclassify = async (
    trackId: string,
    body: { mood?: string | null; has_vocals?: boolean | null },
  ) => {
    if (!isAdmin) return;
    try {
      await adminClassifyRadioTrack(trackId, body);
      await queryClient.invalidateQueries({ queryKey: ["radio"] });
      setAdminClassifyFor(null);
    } catch (err) {
      const msg = (err as { detail?: string })?.detail ?? t("errors.generic");
      window.alert(msg);
    }
  };
  const [viewerImage, setViewerImage] = useState<{ url: string; title: string } | null>(null);
  // Обложки треков, чьи URL не загрузились (истёкшие CDN-токены Suno и пр.).
  // Для этих id рендерим эмодзи-плейсхолдер вместо <img>.
  const [failedCovers, setFailedCovers] = useState<Set<string>>(new Set());
  const markCoverFailed = (id: string) =>
    setFailedCovers((prev) => { const n = new Set(prev); n.add(id); return n; });

  // Telegram Mini App WKWebView may preserve horizontal scroll between navigations.
  // Force reset on mount so the Radio page always starts at x=0.
  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".main");
    if (main) {
      main.scrollLeft = 0;
      main.scrollTop = 0;
    }
    window.scrollTo(0, 0);
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  }, []);

  const { playOrToggle, playDirect, setPlaying, currentId, isPlaying } = usePlayer(
    useShallow((s) => ({
      playOrToggle: s.playOrToggle,
      playDirect: s.play,
      setPlaying: s.setPlaying,
      currentId: s.current?.id ?? null,
      isPlaying: s.isPlaying,
    })),
  );

  // Share deep-link: /radio?s=<share_id>&v=<variant> — открыли по
  // ссылке шеринга из FileActions. Резолвим share_id, играем трек
  // в общем плеере, чистим query чтобы не зациклиться.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get("s");
    if (!shareId) return;
    const variantRaw = params.get("v");
    const variant = variantRaw !== null && /^\d+$/.test(variantRaw) ? Number(variantRaw) : null;

    let cancelled = false;
    void (async () => {
      try {
        const gen = await fetchSharedGeneration(shareId, variant);
        if (cancelled) return;
        const track = gen.tracks[0];
        if (!track || !track.audio_url) return;
        const moodLabel = moodTranslated(gen.mood ?? "");
        const meta = [gen.genre, moodLabel].filter(Boolean).join(" · ");
        playDirect({
          id: shareId,
          title: track.title || gen.title || "Трек",
          url: track.audio_url,
          cover: track.image_url ?? undefined,
          author: "RIFFA Radio",
          meta,
          canRadio: false,
          isMusicType: true,
          isPublic: true,
        }, []);
        // Браузеры (особенно in-app webview Telegram, Safari, Chrome
        // Android) блокируют HTML5 audio autoplay без user gesture.
        // Поэтому грузим трек в плеер, но НЕ пытаемся play() — иначе
        // вызов отвалится молча, а юзер увидит «ничего не происходит».
        // Дашборд внизу появится с большой кнопкой ▶ — этого хватит.
        setPlaying(false);
      } catch {
        // битая ссылка — оставляем юзера на радио
      } finally {
        // убрать ?s= из URL, чтобы при ре-mount не подёргивалось снова
        const url = new URL(window.location.href);
        url.searchParams.delete("s");
        url.searchParams.delete("v");
        window.history.replaceState({}, "", url.toString());
      }
    })();
    return () => { cancelled = true; };
  }, [playDirect, setPlaying]);

  /** Convert a RadioTrackOut to the PlayerTrack shape. */
  function toPlayerTrack(track: RadioTrackOut) {
    const moodLabel = moodTranslated(track.mood ?? "");
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
      canRadio: false, /* Радио-треки уже в эфире — кнопку не показываем */
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
    queryKey: [...RADIO_QUERY_KEY, "playlist", { mood: moodFilter ?? null, vocal: isVocalFilter, genre: activeGenre }],
    queryFn: () =>
      fetchRadio({
        mood: moodFilter,
        vocal: isVocalFilter ? "vocal" : undefined,
        genre: activeGenre ?? undefined,
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
      <div className="top-meta">
        <div className="breadcrumb"><span>raw</span><span>/</span><b>{isEN ? "radio" : "радио"}</b></div>
        <div>{isEN ? `${stats?.total_tracks ?? "—"} on air` : `в эфире: ${stats?.total_tracks ?? "—"} треков`}</div>
      </div>

      {/* ── Hero ── */}
      <section className="radio-hero radio-hero--compact">
        <div className="radio-hero__body">
          <div className="radio-hero__head">
            <img src="/icons/radio.png" alt="Radio" className="radio-hero__icon" />
            <h1>{t("radio.title")}</h1>
          </div>
          <div className="radio-stats">
            <div><strong>{stats?.total_tracks ?? "—"}</strong><span>{t("radio.onAir")}</span></div>
            <div><strong>{(stats?.total_plays ?? 0).toLocaleString()}</strong><span>{t("radio.plays")}</span></div>
            <div><strong>{(stats?.today_plays ?? 0).toLocaleString()}</strong><span>{t("radio.playsToday")}</span></div>
            <div><strong>{stats?.total_likes ?? 0}</strong><span>{t("radio.likes")}</span></div>
            <div><strong>{stats?.today_tracks ?? 0}</strong><span>{t("radio.newToday")}</span></div>
          </div>
        </div>
      </section>

      {/* ── Mood grid ── */}
      <Panel className="radio-panel radio-panel--compact">
        <header className="radio-section-head radio-section-head--compact">
          <h3 className="radio-section-head__title">{t("radio.filterMood")}</h3>
        </header>
        <div className="mood-grid mood-grid--compact">

          {/* «Моя коллекция» */}
          <button
            type="button"
            className={`mood-card mood-card--collection${mood === "collection" ? " mood-card--active" : ""}`}
            onClick={() => setMood("collection")}
            aria-pressed={mood === "collection"}
            title={`${t("radio.filterCollection")} — ${t("radio.collectionDesc")}`}
          >
            <img src="/radio/mood-collection.webp" alt="" className="mood-card__icon" loading="lazy" decoding="async" aria-hidden />
            <span className="mood-card__body">
              <span className="mood-card__label">{t("radio.filterCollection")}</span>
              <span className="mood-card__meta">{t("radio.collectionDesc")}</span>
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
                title={`${m.emoji} ${moodTranslated(m.key)} — ${moodDescr(m.key)}`}
              >
                {m.icon
                  ? <img src={m.icon} alt="" className="mood-card__icon" loading="lazy" decoding="async" aria-hidden />
                  : <span className="mood-card__emoji" aria-hidden>{m.emoji}</span>
                }
                <span className="mood-card__dot mood-card__dot--hidden" style={{ background: m.hex }} />
                <span className="mood-card__body">
                  <span className="mood-card__label">{moodTranslated(m.key)}</span>
                  <span className="mood-card__meta" title={moodDescr(m.key)}>{moodDescr(m.key)}</span>
                </span>
                <span
                  className="mood-card__count"
                  aria-label={`${count}`}
                  style={{ color: active ? m.hex : undefined, borderColor: active ? m.hex : undefined }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* ── Genre playlists ── */}
      <Panel className="radio-panel radio-panel--compact">
        <header className="radio-section-head radio-section-head--compact">
          <h3 className="radio-section-head__title">{t("radio.filterGenre")}</h3>
        </header>
        <div className="genre-chips">
          <button
            type="button"
            className={`genre-chip${activeGenre === null ? " genre-chip--active" : ""}`}
            onClick={() => setActiveGenre(null)}
            aria-pressed={activeGenre === null}
          >
            {t("radio.allGenres")}
          </button>
          {GENRES.map((g) => (
            <button
              key={g}
              type="button"
              className={`genre-chip${activeGenre === g ? " genre-chip--active" : ""}`}
              onClick={() => setActiveGenre(activeGenre === g ? null : g)}
              aria-pressed={activeGenre === g}
            >
              {g}
            </button>
          ))}
        </div>
      </Panel>

      {/* ── Playlist + Charts ── */}
      <div className="radio-columns">

        {/* Плейлист */}
        <Panel className="radio-panel radio-panel--half">
          <header className="radio-section-head">
            <h2 className="radio-playlist-title">
              {t("radio.playlistTitle")} «{mood === "collection" ? (
                <><img src="/radio/mood-collection.webp" alt="" className="mood-inline-icon" style={{ width: 20, height: 20 }} loading="lazy" decoding="async" aria-hidden /> {t("radio.filterCollection")}</>
              ) : (
                <><MoodIcon moodKey={mood} size={20} /> {moodTranslated(mood)}</>
              )}»
            </h2>
            <p className="muted">{t("radio.playlistHint")}</p>
          </header>
          <ol className="playlist">
            {playlistLoading && (
              <li className="playlist-empty">{t("radio.loadingTracks")}</li>
            )}
            {!playlistLoading && authError && (
              <li className="playlist-empty">{t("errors.unauthorized")}</li>
            )}
            {!playlistLoading && !authError && playlistError && (
              <li className="playlist-empty">{t("errors.generic")}</li>
            )}
            {!playlistLoading &&
              !authError &&
              !playlistError &&
              playlistTracks.map((track) => {
                const isActive = currentId === track.id;
                const moodLabel =
                  moodTranslated(track.mood ?? "");
                return (
                  <li key={track.id} className="r-row">
                    <div
                      role="button"
                      tabIndex={0}
                      className={`r-track${isActive ? " r-track--active" : ""}`}
                      onClick={() => play(track, playlistTracks)}
                      onKeyDown={(e) => e.key === "Enter" && play(track, playlistTracks)}
                      aria-label={track.title}
                    >
                      <div
                        className="r-track__cover"
                        onClick={(e) => {
                          if (!track.image_url || failedCovers.has(track.id)) return;
                          e.stopPropagation();
                          setViewerImage({ url: track.image_url, title: track.title });
                        }}
                        style={track.image_url && !failedCovers.has(track.id) ? { cursor: "zoom-in" } : undefined}
                        aria-hidden
                      >
                        {track.image_url && !failedCovers.has(track.id)
                          ? <img
                              src={track.image_url}
                              alt=""
                              loading="lazy"
                              onError={() => markCoverFailed(track.id)}
                            />
                          : <span className="r-track__cover-fallback">🎵</span>
                        }
                      </div>
                      <div className="r-track__body">
                        <div className="r-track__title">{track.title}</div>
                        <div className="r-track__meta">
                          {track.author} · {track.genre ?? "—"} · {moodLabel}
                          {track.duration ? ` · ${fmtTime(track.duration)}` : ""}
                        </div>
                        <div className="r-track__actions" onClick={(e) => e.stopPropagation()}>
                          <FileActions
                            audioUrl={track.audio_url}
                            title={track.title}
                            isMusicType={true}
                            canRadio={false}
                            fileId={track.id}
                            generationId={track.id}
                            hideExtend
                            shareKind="radio"
                          >
                            <button
                              type="button"
                              className={`rate-btn rate-btn--like${track.my_vote === "like" ? " rate-btn--on" : ""}`}
                              onClick={(e) => { e.stopPropagation(); toggleVote(track, "like"); }}
                              aria-label={t("globalPlayer.likeAria")}
                            >
                              👍 {track.like_count}
                            </button>
                            <button
                              type="button"
                              className={`rate-btn rate-btn--dislike${track.my_vote === "dislike" ? " rate-btn--on" : ""}`}
                              onClick={(e) => { e.stopPropagation(); toggleVote(track, "dislike"); }}
                              aria-label={t("globalPlayer.dislikeAria")}
                            >
                              👎 {track.dislike_count}
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  type="button"
                                  className="rate-btn rate-btn--admin"
                                  onClick={(e) => { e.stopPropagation(); setAdminClassifyFor(adminClassifyFor === track.id ? null : track.id); }}
                                  title={t("radio.adminClassify")}
                                  aria-label={t("radio.adminClassify")}
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  className="rate-btn rate-btn--admin"
                                  onClick={(e) => { e.stopPropagation(); void adminRemoveTrack(track); }}
                                  title={t("radio.adminRemove")}
                                  aria-label={t("radio.adminRemove")}
                                >
                                  🗑
                                </button>
                              </>
                            )}
                            <span className="r-track__indicator" aria-hidden>
                              {isActive && isPlaying ? "❚❚" : "▶"}
                            </span>
                          </FileActions>
                          {isAdmin && adminClassifyFor === track.id && (
                            <AdminClassifyPanel
                              currentMood={track.mood ?? null}
                              onPick={(mood, has_vocals) => void adminReclassify(track.id, { mood, has_vocals })}
                              onClose={() => setAdminClassifyFor(null)}
                            />
                          )}
                        </div>
                      </div>
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
                    ? t("radio.collectionEmpty")
                    : t("radio.empty")}
                </li>
              )}
          </ol>
        </Panel>

        {/* Чарты */}
        <Panel className="radio-panel radio-panel--half">
          <header className="radio-section-head radio-section-head--row">
            <div>
              <h2>{t("radio.chartsTitle")}</h2>
              <p className="muted">{t("radio.chartsHint")}</p>
            </div>
            <div className="chip-row chart-ranges">
              {CHART_PERIODS.map((value) => {
                const labelKey = value === "today" ? "radio.chartDay"
                               : value === "week"  ? "radio.chartWeek"
                               : value === "month" ? "radio.chartMonth"
                               :                     "radio.chartAll";
                return (
                  <button
                    key={value}
                    type="button"
                    className={`filter-chip${range === value ? " filter-chip--active" : ""}`}
                    onClick={() => setRange(value)}
                  >
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
          </header>
          <ol className="playlist playlist--chart">
            {chartTracks.map((ct, i) => {
              const isActive = currentId === ct.id;
              const moodLabel = moodTranslated(ct.mood ?? "");
              return (
                <li key={ct.id} className="r-row">
                  <div
                    role="button"
                    tabIndex={0}
                    className={`r-track r-track--chart${isActive ? " r-track--active" : ""}`}
                    onClick={() => play(ct, chartTracks)}
                    onKeyDown={(e) => e.key === "Enter" && play(ct, chartTracks)}
                    aria-label={ct.title}
                  >
                    <div className="r-track__pos" aria-hidden>{i + 1}</div>
                    <div
                      className="r-track__cover"
                      onClick={(e) => {
                        if (!ct.image_url || failedCovers.has(ct.id)) return;
                        e.stopPropagation();
                        setViewerImage({ url: ct.image_url, title: ct.title });
                      }}
                      style={ct.image_url && !failedCovers.has(ct.id) ? { cursor: "zoom-in" } : undefined}
                      aria-hidden
                    >
                      {ct.image_url && !failedCovers.has(ct.id)
                        ? <img
                            src={ct.image_url}
                            alt=""
                            loading="lazy"
                            onError={() => markCoverFailed(ct.id)}
                          />
                        : <span className="r-track__cover-fallback">🎵</span>
                      }
                    </div>
                    <div className="r-track__body">
                      <div className="r-track__title">{ct.title}</div>
                      <div className="r-track__meta">
                        {ct.author} · {ct.genre ?? "—"} · {moodLabel}
                        {ct.duration ? ` · ${fmtTime(ct.duration)}` : ""}
                      </div>
                      <div className="r-track__actions" onClick={(e) => e.stopPropagation()}>
                        <FileActions
                          audioUrl={ct.audio_url}
                          title={ct.title}
                          isMusicType={true}
                          canRadio={false}
                          fileId={ct.id}
                          generationId={ct.id}
                          hideExtend
                          shareKind="radio"
                        >
                          <button
                            type="button"
                            className={`rate-btn rate-btn--like${ct.my_vote === "like" ? " rate-btn--on" : ""}`}
                            onClick={(e) => { e.stopPropagation(); toggleVote(ct, "like"); }}
                            aria-label={t("globalPlayer.likeAria")}
                          >
                            👍 {ct.like_count}
                          </button>
                          <button
                            type="button"
                            className={`rate-btn rate-btn--dislike${ct.my_vote === "dislike" ? " rate-btn--on" : ""}`}
                            onClick={(e) => { e.stopPropagation(); toggleVote(ct, "dislike"); }}
                            aria-label={t("globalPlayer.dislikeAria")}
                          >
                            👎 {ct.dislike_count}
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                className="rate-btn rate-btn--admin"
                                onClick={(e) => { e.stopPropagation(); setAdminClassifyFor(adminClassifyFor === ct.id ? null : ct.id); }}
                                title={t("radio.adminClassify")}
                                aria-label={t("radio.adminClassify")}
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                className="rate-btn rate-btn--admin"
                                onClick={(e) => { e.stopPropagation(); void adminRemoveTrack(ct); }}
                                title={t("radio.adminRemove")}
                                aria-label={t("radio.adminRemove")}
                              >
                                🗑
                              </button>
                            </>
                          )}
                          <span className="r-track__score">
                            {ct.score >= 0 ? "+" : ""}{ct.score}
                          </span>
                          <span className="r-track__indicator" aria-hidden>
                            {isActive && isPlaying ? "❚❚" : "▶"}
                          </span>
                        </FileActions>
                        {isAdmin && adminClassifyFor === ct.id && (
                          <AdminClassifyPanel
                            currentMood={ct.mood ?? null}
                            onPick={(mood, has_vocals) => void adminReclassify(ct.id, { mood, has_vocals })}
                            onClose={() => setAdminClassifyFor(null)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            {chartQuery.isLoading && (
              <li className="playlist-empty">{t("radio.loadingChart")}</li>
            )}
            {!chartQuery.isLoading && chartTracks.length === 0 && (
              <li className="playlist-empty">{t("radio.empty")}</li>
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

// ─── Admin classify popover ─────────────────────────────────────────
// Маленькая панель под треком: выбор настроения чипом + кнопки
// «отметить как с вокалом / без вокала». Только для админа.
function AdminClassifyPanel({
  currentMood,
  onPick,
  onClose,
}: {
  currentMood: string | null;
  onPick: (mood: string | null, has_vocals: boolean | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const moodChips = MOODS.filter((m) => m.key !== "all" && m.key !== "vocal" && m.key !== "collection");
  const translateMood = (key: string) => {
    const v = t(`radio.moods.${key}`, { defaultValue: "" });
    return typeof v === "string" && v ? v : key;
  };
  return (
    <div className="admin-classify" onClick={(e) => e.stopPropagation()}>
      <div className="admin-classify__row">
        <span className="admin-classify__label">{t("radio.adminClassifyMoodLabel")}</span>
        {moodChips.map((m) => {
          const label = translateMood(m.key);
          return (
            <button
              key={m.key}
              type="button"
              className={`admin-classify__chip${m.key === currentMood ? " admin-classify__chip--on" : ""}`}
              onClick={() => onPick(m.key, null)}
              title={label}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="admin-classify__row">
        <span className="admin-classify__label">{t("radio.adminClassifyVocalLabel")}</span>
        <button type="button" className="admin-classify__chip" onClick={() => onPick(null, true)}>
          {t("radio.adminClassifyVocalOn")}
        </button>
        <button type="button" className="admin-classify__chip" onClick={() => onPick(null, false)}>
          {t("radio.adminClassifyVocalOff")}
        </button>
        <button type="button" className="admin-classify__chip admin-classify__chip--close" onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  );
}
