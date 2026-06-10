import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTranslation } from "react-i18next";

import { ImageViewer } from "@/components/ui/ImageViewer";
import {
  type RadioPeriod,
  type RadioTrackOut,
  adminClassifyRadioTrack,
  adminUnpublishRadioTrack,
  fetchMyRadioCollection,
  fetchRadio,
  fetchRadioStats,
  fetchRadioMoodCounts,
  fetchSharedGeneration,
  recordRadioPlay,
  voteRadioTrack,
} from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { usePlayer } from "@/store/player";

import "./RadioPage.css";


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
  // Word-coded tempo → numeric BPM range; numeric tempos normalised; else as-is.
  const formatBpm = (tempo?: string | null): string => {
    if (!tempo) return "";
    const t = tempo.trim().toLowerCase();
    const map: Record<string, string> = {
      very_slow: "60–80 BPM", slow: "80–100 BPM", medium: "100–120 BPM",
      mid: "100–120 BPM", fast: "120–140 BPM", very_fast: "140–180 BPM",
    };
    if (map[t]) return map[t];
    const num = t.replace(/bpm/g, "").trim();
    if (/^\d+\s*[-–]\s*\d+$/.test(num)) return num.replace(/\s*-\s*/, "–") + " BPM";
    if (/^\d+$/.test(num)) return num + " BPM";
    return tempo;
  };
  const moodTranslated = (key: string) => {
    const v = t(`radio.moods.${key}`, { defaultValue: "" });
    return typeof v === "string" && v ? v : key;
  };
  const [mood, setMood] = useState<Mood>("all");
  const [activeGenre] = useState<string | null>(null);
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

  const { playOrToggle, playDirect, setPlaying, currentId } = usePlayer(
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
          source: "radio",
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
    const meta = [track.genre, moodLabel, formatBpm(track.tempo)].filter(Boolean).join(" · ");
    // Composite id so V1/V2 of the same generation are distinct in the queue.
    return {
      id: `${track.id}#${track.track_index}`,
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
      source: "radio" as const,
    };
  }

  // ── Stats (hero) ─────────────────────────────────────────
  const statsQuery = useQuery({
    queryKey: [...RADIO_QUERY_KEY, "stats"],
    queryFn: fetchRadioStats,
  });

  // ── Mood counts for chip badges ─────────────────────────
  const moodCountsQuery = useQuery({
    queryKey: [...RADIO_QUERY_KEY, "mood-counts"],
    queryFn: fetchRadioMoodCounts,
    staleTime: 30_000,
  });
  const moodCounts = moodCountsQuery.data;


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
    mutationFn: ({ id, trackIndex, rating }: {
      id: string; trackIndex: number; rating: "like" | "dislike" | "remove";
    }) => voteRadioTrack(id, rating, trackIndex),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RADIO_QUERY_KEY });
    },
  });

  const playMutation = useMutation({
    mutationFn: ({ id, trackIndex }: { id: string; trackIndex: number }) =>
      recordRadioPlay(id, trackIndex),
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
    if (wasNew) playMutation.mutate({ id: track.id, trackIndex: track.track_index });
  }

  function toggleVote(track: RadioTrackOut, next: "like" | "dislike") {
    const current = track.my_vote;
    const rating = current === next ? "remove" : next;
    voteMutation.mutate({ id: track.id, trackIndex: track.track_index, rating });
  }

  const authError =
    isCollection &&
    collectionQuery.error !== null &&
    typeof collectionQuery.error === "object" &&
    collectionQuery.error !== undefined &&
    "status" in collectionQuery.error &&
    (collectionQuery.error as { status: number }).status === 401;

  const coverColor = (id: string) => {
    const COLORS = ["c-emr", "c-hi", "c-ink", "c-paper", "c-blue", "c-rose"] as const;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return COLORS[h % COLORS.length];
  };

  return (
    <div className="radio">
      <div className="top-meta">
        <div className="breadcrumb"><b>{isEN ? "radio" : "радио"}</b></div>
        <div>{isEN ? `on air: ${stats?.total_tracks ?? "—"} tracks` : `в эфире сейчас: ${stats?.total_tracks ?? "—"} треков`}</div>
      </div>

      {/* ── Hero ── */}
      <section className="radio-hero">
        <div>
          <span className="live-pill">{isEN ? "on air" : "в эфире"}</span>
          <h2>{isEN ? "Community broadcast" : "Эфир сообщества"}</h2>
          <p>{isEN ? "Best tracks from RIFFA Studio users. Listen, vote, get into charts." : "Лучшие треки от пользователей RIFFA Studio. Слушай, голосуй, попадай в чарты."}</p>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { if (playlistTracks[0]) play(playlistTracks[0], playlistTracks); }}
            >
              {isEN ? "listen stream →" : "слушать поток →"}
            </button>
            <button
              type="button"
              className="btn radio-btn-ghost"
              onClick={() => setMood("collection")}
            >
              {isEN ? "my tracks on radio" : "мои треки в радио"}
            </button>
          </div>
        </div>
        <div className="radio-stats">
          <div className="row"><span>{isEN ? "plays today" : "прослуш. сегодня"}</span><b>{(stats?.today_plays ?? 0).toLocaleString()}</b></div>
          <div className="row"><span>{isEN ? "likes total" : "лайков всего"}</span><b>{stats?.total_likes ?? "—"}</b></div>
          <div className="row"><span>{isEN ? "new tracks" : "новых треков"}</span><b>+{stats?.today_tracks ?? 0}</b></div>
          <div className="row"><span>{isEN ? "total on air" : "треков в эфире"}</span><b>{stats?.total_tracks ?? "—"}</b></div>
        </div>
      </section>

      {/* ── 01 · mood filters ── */}
      <div className="h-section">
        <div className="tag"><span className="num">01</span> · {isEN ? "filters" : "фильтры"}</div>
        <h2>{isEN ? "by mood" : "по настроению"}</h2>
        <div className="right">{MOODS.length} {isEN ? "presets" : "пресетов"}</div>
      </div>
      <div className="pill-row" style={{ marginBottom: 28 }}>
        {MOODS.map((m) => {
          const count = !moodCounts ? null
            : m.key === "all" ? moodCounts.total
            : m.key === "vocal" ? moodCounts.vocal
            : moodCounts.counts[m.key] ?? 0;
          return (
            <button key={m.key} type="button"
              className={`pill${mood === m.key ? " on" : ""}`}
              onClick={() => setMood(m.key)}
            >
              {moodTranslated(m.key)}
              {count !== null && <span className="pill__count">{count}</span>}
            </button>
          );
        })}
        <button type="button"
          className={`pill${mood === "collection" ? " on" : ""}`}
          onClick={() => setMood("collection")}
        >
          {t("radio.filterCollection")}
          {collectionQuery.data && (
            <span className="pill__count">{collectionQuery.data.total}</span>
          )}
        </button>
      </div>

      {/* ── 02 · stream (mood-filtered playlist) — ПЕРВЫМ ── */}
      <div className="h-section">
        <div className="tag"><span className="num">02</span> · {isEN ? "stream" : "эфир"}</div>
        <h2>{moodTranslated(mood)}{!playlistLoading ? ` · ${playlistTracks.length} ${isEN ? "tracks" : "треков"}` : ""}</h2>
      </div>
      <div className="chart-list chart-list--scrollable" style={{ marginBottom: 40 }}>
        {playlistLoading && <p className="chart-empty">{t("radio.loadingTracks")}</p>}
        {!playlistLoading && authError && <p className="chart-empty">{t("errors.unauthorized")}</p>}
        {!playlistLoading && !authError && playlistError && <p className="chart-empty">{t("errors.generic")}</p>}
        {!playlistLoading && !authError && !playlistError && playlistTracks.map((track, i) => {
          const rowId = `${track.id}#${track.track_index}`;
          const isActive = currentId === rowId;
          const cc = coverColor(track.id);
          return (
            <div key={rowId}
              className={`chart-row${isActive ? " chart-row--active" : ""}`}
              onClick={() => play(track, playlistTracks)}
            >
              <span className="rank">{String(i + 1).padStart(2, "0")}</span>
              <div className={`cover-mini ${cc}`}>
                {track.image_url && !failedCovers.has(track.id) && (
                  <img src={track.image_url} alt="" loading="lazy" onError={() => markCoverFailed(track.id)}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                )}
              </div>
              <div className="meta-mini">
                <div className="title-mini">{track.author} - {track.title}</div>
                <div className="artist-mini">{[track.genre, moodTranslated(track.mood ?? ""), formatBpm(track.tempo)].filter(Boolean).join(" · ") || "—"}</div>
                {isAdmin && (
                  <div className="admin-row" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="admin-chip" onClick={() => setAdminClassifyFor(adminClassifyFor === track.id ? null : track.id)}>✏️</button>
                    <button type="button" className="admin-chip" onClick={() => void adminRemoveTrack(track)}>🗑</button>
                  </div>
                )}
                {isAdmin && adminClassifyFor === track.id && (
                  <AdminClassifyPanel currentMood={track.mood ?? null}
                    onPick={(m, v) => void adminReclassify(track.id, { mood: m, has_vocals: v })}
                    onClose={() => setAdminClassifyFor(null)} />
                )}
              </div>
              <div className="duration-mini">{track.duration ? fmtTime(track.duration) : "—"}</div>
              <div className="plays-mini">{track.play_count.toLocaleString()} ▶</div>
              <div
                className={`likes-mini${track.my_vote === "like" ? " liked" : ""}`}
                onClick={(e) => { e.stopPropagation(); toggleVote(track, "like"); }}
              >
                ♥ {track.like_count}
              </div>
            </div>
          );
        })}
        {!playlistLoading && !authError && !playlistError && playlistTracks.length === 0 && (
          <p className="chart-empty">{mood === "collection" ? t("radio.collectionEmpty") : t("radio.empty")}</p>
        )}
      </div>

      {/* ── 03 · charts — ВТОРЫМ ── */}
      <div className="h-section">
        <div className="tag"><span className="num">03</span> · {isEN ? "charts" : "чарты"}</div>
        <h2>{isEN ? "charts by period" : "топы по периодам"}</h2>
        <div className="right">{isEN ? "updated hourly" : "обновляется каждый час"}</div>
      </div>
      <div className="pill-row" style={{ marginBottom: 16 }}>
        {CHART_PERIODS.map((value) => {
          const label = value === "today" ? (isEN ? "Today" : "Чарт дня")
                      : value === "week"  ? (isEN ? "This week" : "Топ недели")
                      : value === "month" ? (isEN ? "This month" : "Топ месяца")
                      :                    (isEN ? "All time" : "За всё время");
          return (
            <button key={value} type="button"
              className={`pill${range === value ? " on-hi" : ""}`}
              onClick={() => setRange(value)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="chart-list">
        {chartQuery.isLoading && <p className="chart-empty">{t("radio.loadingChart")}</p>}
        {chartTracks.map((ct, i) => {
          const ctRowId = `${ct.id}#${ct.track_index}`;
          const isActive = currentId === ctRowId;
          const cc = coverColor(ct.id);
          return (
            <div key={ctRowId}
              className={`chart-row${isActive ? " chart-row--active" : ""}`}
              onClick={() => play(ct, chartTracks)}
            >
              <span className={`rank${i < 3 ? " top" : ""}`}>{String(i + 1).padStart(2, "0")}</span>
              <div className={`cover-mini ${cc}`}>
                {ct.image_url && !failedCovers.has(ct.id) && (
                  <img src={ct.image_url} alt="" loading="lazy" onError={() => markCoverFailed(ct.id)}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                )}
              </div>
              <div className="meta-mini">
                <div className="title-mini">{ct.author} - {ct.title}</div>
                <div className="artist-mini">{[ct.genre, moodTranslated(ct.mood ?? ""), formatBpm(ct.tempo)].filter(Boolean).join(" · ") || "—"}</div>
                {isAdmin && (
                  <div className="admin-row" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="admin-chip" onClick={() => setAdminClassifyFor(adminClassifyFor === ct.id ? null : ct.id)}>✏️</button>
                    <button type="button" className="admin-chip" onClick={() => void adminRemoveTrack(ct)}>🗑</button>
                  </div>
                )}
                {isAdmin && adminClassifyFor === ct.id && (
                  <AdminClassifyPanel currentMood={ct.mood ?? null}
                    onPick={(m, v) => void adminReclassify(ct.id, { mood: m, has_vocals: v })}
                    onClose={() => setAdminClassifyFor(null)} />
                )}
              </div>
              <div className="duration-mini">{ct.duration ? fmtTime(ct.duration) : "—"}</div>
              <div className="plays-mini">{ct.play_count.toLocaleString()} ▶</div>
              <div
                className={`likes-mini${ct.my_vote === "like" ? " liked" : ""}`}
                onClick={(e) => { e.stopPropagation(); toggleVote(ct, "like"); }}
              >
                ♥ {ct.like_count}
              </div>
            </div>
          );
        })}
        {!chartQuery.isLoading && chartTracks.length === 0 && (
          <p className="chart-empty">{t("radio.empty")}</p>
        )}
      </div>

      {viewerImage && (
        <ImageViewer imageUrl={viewerImage.url} title={viewerImage.title} onClose={() => setViewerImage(null)} />
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
