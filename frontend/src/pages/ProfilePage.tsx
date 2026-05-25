import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  changePassword,
  createRobokassaLink,
  createStarsInvoice,
  deleteGeneration,
  fetchTrash,
  purgeTrash,
  redeemPromo,
  restoreGeneration,
  updateDisplayName,
  uploadAvatar,
  type GenerationOut,
  type HistoryPage,
  type PackageCode,
} from "@/lib/api/client";
import { useShallow } from "zustand/react/shallow";
import { useTranslation } from "react-i18next";

import { Coin } from "@/components/ui/Coin";
import { useAuth } from "@/lib/auth";
import { FileActions } from "@/components/studio/FileActions";
import { FileGhostsOverlay, useFileGhosts } from "@/components/studio/FileGhost";
import { ImageViewer } from "@/components/ui/ImageViewer";
import { toggleHistoryRadio, trackDownloadUrl } from "@/lib/api/client";
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

import "./ProfilePage.css";

// ─────────── Токен-пакеты и способы оплаты ────────────

interface TokenPackage {
  id: string;
  name: string;
  tokens: number;
  gens: number;
  priceRub: number;
  /** Процент выгоды по сравнению со стартовым пакетом. */
  discount?: number;
}

const TOKEN_PACKAGES: readonly TokenPackage[] = [
  { id: "starter", name: "Стартовый",    tokens: 10,  gens: 5,  priceRub: 100 },
  { id: "basic",   name: "Базовый",       tokens: 25,  gens: 12, priceRub: 200, discount: 20 },
  { id: "pro",     name: "Продвинутый",  tokens: 60,  gens: 30, priceRub: 400, discount: 33 },
  { id: "premium", name: "Премиум",      tokens: 150, gens: 75, priceRub: 900, discount: 40 },
];

const PAYMENT_METHODS: readonly { id: string; label: string; hint: string }[] = [
  { id: "card", label: "Карта РФ", hint: "Robokassa · мгновенно" },
  { id: "stars", label: "Telegram Stars", hint: "Без комиссии · в боте" },
  { id: "crypto", label: "Крипта", hint: "USDT TRC-20 · скоро" },
];

interface GenStats {
  type: string;
  label: string;
  count: number;
  color: string;
}

const STAT_COLORS: Record<string, string> = {
  song: "var(--accent)",
  instrumental: "var(--accent-2)",
  cover: "var(--accent-3)",
  sfx: "#37bbfe",
  cover_art: "#ffd166",
  wav: "#c0c0c0",
};

// «Мои файлы» получает данные из того же источника, что и «Мои генерации» (StudioPage),
// через useLibraryItems(). Разные фильтры — один и тот же файл видимый в обоих
// местах одинаковым (обложка, название, «в эфире»).

interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: string;
}

const SEED_REVIEWS_RU: readonly Review[] = [
  {
    id: "r1",
    author: "Алексей",
    rating: 5,
    text: "Кавер моей старой песни в стиле synthwave — ровно то что нужно было. Без студии за 2 минуты.",
    date: "2026-04-20",
  },
  {
    id: "r2",
    author: "Мария",
    rating: 4,
    text: "Агент неплохо собирает промпт, но иногда теряется на настроении. Звук хороший.",
    date: "2026-04-15",
  },
];
const SEED_REVIEWS_EN: readonly Review[] = [
  {
    id: "r1",
    author: "Alex",
    rating: 5,
    text: "Cover of my old song in synthwave style — exactly what I needed. Done in 2 minutes without a studio.",
    date: "2026-04-20",
  },
  {
    id: "r2",
    author: "Maria",
    rating: 4,
    text: "The agent builds the prompt well, but occasionally gets confused on mood. The sound quality is good.",
    date: "2026-04-15",
  },
];

const PROFILE_DOCS: readonly { id: string; title: string; hint: string; href: string }[] = [
  { id: "offer", title: "Пользовательское соглашение", hint: "Публичная оферта", href: "/docs/offer.txt" },
  { id: "privacy", title: "Политика конфиденциальности", hint: "Как храним и обрабатываем данные", href: "/docs/privacy.txt" },
  { id: "copyright", title: "Лицензия на треки", hint: "Авторские права и использование", href: "/docs/copyright.txt" },
  { id: "refund", title: "Политика возврата", hint: "Условия возврата средств", href: "/docs/refund.txt" },
];

// ─────────── Кастомный брендированный дропдаун ────────────

interface SelectOption { value: string; label: string; }

function FilterSelect({
  options,
  value,
  onChange,
}: {
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const isDefault = value === options[0]?.value;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [open]);

  function toggle() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuH = Math.min(options.length * 40 + 8, 260);
      if (window.innerHeight - r.bottom >= menuH) {
        setPos({ top: r.bottom + 4, left: r.left, width: r.width });
      } else {
        setPos({ bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width });
      }
    }
    setOpen((v) => !v);
  }

  return (
    <div className="fsel">
      <button
        ref={btnRef}
        type="button"
        className={[
          "fsel__btn",
          open ? "fsel__btn--open" : "",
          !isDefault ? "fsel__btn--set" : "",
        ].filter(Boolean).join(" ")}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="fsel__label">{selected?.label ?? value}</span>
        <svg className="fsel__arrow" viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="fsel__menu"
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: pos.width }}
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`fsel__item${o.value === value ? " fsel__item--active" : ""}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                <span className="fsel__check">{o.value === value ? "✓" : ""}</span>
                {o.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ─────────── Вспомогательные иконки ────────────

function Icon({ name }: { name: string }) {
  return <span className="profile-card__icon" aria-hidden>{name}</span>;
}

// ─────────── ProfilePage ────────────

export function ProfilePage() {
  const { user, refresh: refreshAuth } = useAuth();
  const { t, i18n: i18nClient } = useTranslation();
  const i18nLang = i18nClient.resolvedLanguage || i18nClient.language || "ru";
  const isEN = i18nLang.startsWith("en");
  const [viewerImage, setViewerImage] = useState<{ url: string; title: string } | null>(null);
  // Если avatar_url битый — fallback на инициал, чтобы не показывать broken-image.
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => { setAvatarFailed(false); }, [user?.avatar_url]);

  const displayName = user?.display_name ?? t("sidebar.guest");
  const userEmail = user?.email ?? "";
  const userBalance = user?.balance_tokens ?? 0;
  const userInitial = displayName.slice(0, 1).toUpperCase();

  // Локализованные метки типов файлов
  const typeLabel = (type: string) =>
    t(`library.types.${type}`, { defaultValue: TYPE_LABELS[type as import("@/lib/library").LibraryItemType] ?? type });

  // Локализованные данные
  const localPackages = TOKEN_PACKAGES.map((p) => ({
    ...p,
    name: t(`profile.packages.${p.id}`, { defaultValue: p.name }),
  }));
  const localLegalDocs = PROFILE_DOCS.map((doc) => ({
    ...doc,
    title: t(`profile.legalDocs.${doc.id}.title`, { defaultValue: doc.title }),
    hint:  t(`profile.legalDocs.${doc.id}.hint`,  { defaultValue: doc.hint }),
  }));

  // ── Nickname editing ──
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [nameSaving, setNameSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleSaveName = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === displayName) { setEditingName(false); return; }
    setNameSaving(true);
    try {
      await updateDisplayName(trimmed);
      setEditingName(false);
      await refreshAuth();
    } catch { /* keep editing open */ }
    finally { setNameSaving(false); }
  };

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  // ── Password change ──
  const [showPw, setShowPw] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwStatus, setPwStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [pwError, setPwError] = useState<string | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (pwNew.length < 6) { setPwError(t("profile.pwError.short")); return; }
    if (pwNew !== pwConfirm) { setPwError(t("profile.pwError.mismatch")); return; }
    setPwStatus("saving");
    try {
      await changePassword(pwCurrent, pwNew);
      setPwStatus("ok");
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      setTimeout(() => { setPwStatus("idle"); setShowPw(false); }, 2000);
    } catch (err) {
      const msg = err && typeof err === "object" && "detail" in err
        ? (err as { detail: string }).detail
        : t("profile.pwError.failed");
      setPwError(msg);
      setPwStatus("error");
    }
  };

  // ── Tokens ──
  const [selectedPack, setSelectedPack] = useState<string>("basic");
  const [payMethod, setPayMethod] = useState<string>("card");
  const [payStatus, setPayStatus] = useState<"idle" | "loading" | "error">("idle");
  const [payError, setPayError] = useState<string | null>(null);

  const handleBuyPack = async () => {
    // Align frontend pack ids with backend ("pro" on frontend → "advanced" on backend)
    const packMap: Record<string, PackageCode> = {
      starter: "starter", basic: "basic", pro: "advanced", premium: "premium",
    };
    const backendPack: PackageCode = packMap[selectedPack] ?? "basic";
    setPayStatus("loading");
    setPayError(null);
    try {
      if (payMethod === "stars") {
        const res = await createStarsInvoice(backendPack);
        // Open bot deep link — works both in browser and Mini App
        if (window.Telegram?.WebApp?.openTelegramLink) {
          window.Telegram.WebApp.openTelegramLink(res.bot_url);
        } else {
          window.open(res.bot_url, "_blank");
        }
      } else if (payMethod === "card") {
        const res = await createRobokassaLink(backendPack);
        // In Mini App — open in external browser so Robokassa works
        if (window.Telegram?.WebApp?.openLink) {
          window.Telegram.WebApp.openLink(res.url, { try_instant_view: false });
        } else {
          window.open(res.url, "_blank");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { detail?: string })?.detail ?? t("common.error");
      setPayError(msg);
    } finally {
      setPayStatus("idle");
    }
  };

  // ── Promo code redeem ─────────────────────────────────────────────────
  const [promoCode, setPromoCode] = useState<string>("");
  const [promoStatus, setPromoStatus] = useState<
    "idle" | "saving" | "ok" | "error"
  >("idle");
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [, setPromoTokensGranted] = useState<number | null>(null);
  const handleRedeemPromo = async () => {
    const value = promoCode.trim().toUpperCase();
    if (!value) {
      setPromoStatus("error");
      setPromoMessage(t("profile.promoError"));
      return;
    }
    setPromoStatus("saving");
    setPromoMessage(null);
    try {
      const resp = await redeemPromo(value);
      setPromoTokensGranted(resp.tokens_granted);
      setPromoStatus("ok");
      setPromoMessage(t("profile.promoGranted", { count: resp.tokens_granted }));
      // Обновляем баланс везде, где он читается.
      await refreshAuth();
    } catch (err) {
      const detail =
        err && typeof err === "object" && "detail" in err
          ? (err as { detail: string }).detail
          : t("profile.errPromoActivate");
      setPromoStatus("error");
      setPromoMessage(detail);
    }
  };

  // ── Files (единый data source с LibraryCard на StudioPage) ──
  const [filterType, setFilterType] = useState<"all" | LibraryItemType>("all");
  const [filterMood, setFilterMood] = useState<string>("all");
  const [filterGenre, setFilterGenre] = useState<string>("all");
  const [filterSort, setFilterSort] = useState<"newest" | "oldest">("newest");

  const queryClient = useQueryClient();
  const { items: libraryItems, isLoading: filesLoading, authError: filesAuthError } =
    useLibraryItems();

  const { playOrToggle, currentId, isPlaying, setRadioState } = usePlayer(
    useShallow((s) => ({
      playOrToggle: s.playOrToggle,
      currentId: s.current?.id ?? null,
      isPlaying: s.isPlaying,
      setRadioState: s.setRadioState,
    })),
  );

  // Синхронизируем per-track radio state с плеером (key = item.id).
  useEffect(() => {
    for (const it of libraryItems) {
      setRadioState(it.id, it.isPublic);
    }
  }, [libraryItems, setRadioState]);

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

  // ── Soft-delete (move to trash) ──
  // The ghost is purely visual; actual list update is via OPTIMISTIC cache
  // mutation so the file disappears instantly and stays gone (or rolls back
  // on API failure) instead of flashing back when a timer expires.
  const { ghosts: fileGhosts, showGhost: showFileGhost } = useFileGhosts();
  const deleteFileMutation = useMutation({
    mutationFn: (generationId: string) => deleteGeneration(generationId),
    onMutate: async (generationId) => {
      await queryClient.cancelQueries({ queryKey: HISTORY_QUERY_KEY });
      const snapshots = queryClient.getQueriesData<HistoryPage>({
        queryKey: HISTORY_QUERY_KEY,
      });
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
      if (ctx?.snapshots) {
        for (const [key, data] of ctx.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["history", "trash"] });
      // Soft-delete also un-publishes the track from the public Radio
      // (handled server-side); refresh radio caches so the playlist/chart
      // reflect the change immediately.
      await queryClient.invalidateQueries({ queryKey: ["radio"] });
    },
  });

  // Restore from trash → moves item back to library.
  const restoreFileMutation = useMutation({
    mutationFn: (generationId: string) => restoreGeneration(generationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["history", "trash"] });
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    },
  });

  // ── Trash drawer (открывается из шапки профиля) ──
  const [trashOpen, setTrashOpen] = useState(false);
  const trashQuery = useQuery({
    queryKey: ["history", "trash"],
    queryFn: () => fetchTrash(),
    enabled: trashOpen,
    retry: false,
  });
  const purgeTrashMutation = useMutation({
    mutationFn: purgeTrash,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["history", "trash"] });
    },
  });

  // ── Avatar upload ──
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const refreshUser = refreshAuth;

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setAvatarError(t("profile.errAvatarSize"));
      return;
    }
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      await uploadAvatar(file);
      await refreshUser();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("profile.errAvatarUpload");
      setAvatarError(msg);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  const allMoods = useMemo(
    () =>
      Array.from(
        new Set(libraryItems.map((f) => f.mood).filter((m): m is string => Boolean(m))),
      ),
    [libraryItems],
  );
  const allGenres = useMemo(
    () =>
      Array.from(
        new Set(libraryItems.map((f) => f.genre).filter((g): g is string => Boolean(g))),
      ),
    [libraryItems],
  );

  const moodOptions = useMemo<SelectOption[]>(
    () => [{ value: "all", label: t("profile.filterMoodAny") }, ...allMoods.map((m) => ({ value: m, label: m }))],
    [allMoods, t],
  );
  const genreOptions = useMemo<SelectOption[]>(
    () => [{ value: "all", label: t("profile.filterGenreAny") }, ...allGenres.map((g) => ({ value: g, label: g }))],
    [allGenres, t],
  );
  const sortOptions: SelectOption[] = [
    { value: "newest", label: t("profile.sortNewest") },
    { value: "oldest", label: t("profile.sortOldest") },
  ];

  const filteredFiles = useMemo<LibraryItem[]>(() => {
    let list = libraryItems.slice();
    if (filterType !== "all") list = list.filter((f) => f.type === filterType);
    if (filterMood !== "all") list = list.filter((f) => f.mood === filterMood);
    if (filterGenre !== "all") list = list.filter((f) => f.genre === filterGenre);
    list.sort((a, b) => {
      const delta = a.createdAt.localeCompare(b.createdAt);
      return filterSort === "newest" ? -delta : delta;
    });
    return list;
  }, [libraryItems, filterType, filterMood, filterGenre, filterSort]);

  const handlePlayItem = (item: LibraryItem) => {
    if (!item.audioUrl) return;
    const toPlayerTrack = (f: LibraryItem) => ({
      id: f.id,
      title: f.title,
      url: f.audioUrl,
      cover: f.coverUrl ?? undefined,
      meta: `${typeLabel(f.type)} · ${f.genre} · ${f.mood}`,
      isOwn: f.isOwn,
      canRadio: RADIO_TYPES.has(f.type) && f.isOwn,
      isMusicType: MUSIC_TYPES.has(f.type),
      isPublic: f.isPublic,
    });
    // Build queue from the current filtered list so prev/next navigates
    // only through files the user is currently looking at. Re-clicking the
    // active row toggles play/pause via the shared store helper.
    const queue = filteredFiles.filter((f) => !!f.audioUrl).map(toPlayerTrack);
    playOrToggle(toPlayerTrack(item), queue);
  };

  // ── Reviews ──
  const [reviews, setReviews] = useState<Review[]>(() => [...(isEN ? SEED_REVIEWS_EN : SEED_REVIEWS_RU)]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");

  const submitReview = (e: React.FormEvent) => {
    e.preventDefault();
    const text = reviewText.trim();
    if (!text) return;
    const next: Review = {
      id: `local-${Date.now()}`,
      author: displayName,
      rating: reviewRating,
      text,
      date: new Date().toISOString().slice(0, 10),
    };
    setReviews((prev) => [next, ...prev]);
    setReviewText("");
    setReviewRating(5);
  };

  // ── Referral ──
  const referralCode = user?.referral_code ?? (user?.id ? `R${user.id}` : "RGUEST");
  const referralLink = `https://riffastudio.site/r/${referralCode}`;
  const [copied, setCopied] = useState(false);

  const copyReferral = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };

  // ── Join date from real user data ──
  const joinDate = useMemo(() => {
    if (!user?.created_at) return "";
    try {
      const d = new Date(user.created_at);
      const locale = isEN ? "en-US" : "ru-RU";
      const dateStr = d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
      return t("profile.memberSince", { date: dateStr });
    } catch {
      return "";
    }
  }, [user, isEN, t]);

  // ── Stats computed from real library items ──
  const genStats = useMemo<GenStats[]>(() => {
    const typeOrder = ["song", "instrumental", "cover", "sfx", "cover_art"];
    const counts: Record<string, number> = {};
    for (const it of libraryItems) {
      counts[it.type] = (counts[it.type] ?? 0) + 1;
    }
    return typeOrder
      .filter((t) => counts[t] > 0)
      .map((t) => ({
        type: t,
        label: typeLabel(t),
        count: counts[t],
        color: STAT_COLORS[t] ?? "var(--muted)",
      }));
  }, [libraryItems]);

  const totalGens = genStats.reduce((acc, s) => acc + s.count, 0);
  const maxStat = Math.max(...genStats.map((s) => s.count), 1);

  // ── Favourite genres / moods from real library items ──
  const favouriteGenres = useMemo<{ name: string; count: number }[]>(() => {
    const counts: Record<string, number> = {};
    for (const it of libraryItems) {
      if (it.genre) counts[it.genre] = (counts[it.genre] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [libraryItems]);

  const favouriteMoods = useMemo<{ name: string; count: number }[]>(() => {
    const counts: Record<string, number> = {};
    for (const it of libraryItems) {
      if (it.mood) counts[it.mood] = (counts[it.mood] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [libraryItems]);

  return (
    <div className="profile-container">
      {/* Hero-шапка пользователя */}
      <section className="profile-hero">
        <div className="user-info">
          <button
            type="button"
            className={`user-info__avatar user-info__avatar--btn${
              avatarUploading ? " user-info__avatar--loading" : ""
            }`}
            onClick={() => avatarInputRef.current?.click()}
            title={t("profile.avatarAria")}
            aria-label={t("profile.avatarAria")}
            disabled={avatarUploading}
          >
            {user?.avatar_url && !avatarFailed ? (
              <img src={user.avatar_url} alt="" onError={() => setAvatarFailed(true)} />
            ) : (
              <span className="user-info__avatar-initial">{userInitial}</span>
            )}
            <span className="user-info__avatar-overlay" aria-hidden>
              {avatarUploading ? "…" : "📷"}
            </span>
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            onChange={handleAvatarChange}
          />
          {avatarError && (
            <span className="user-info__avatar-error">{avatarError}</span>
          )}

          <div className="user-info__details">
            {/* Редактируемый никнейм */}
            {editingName ? (
              <form className="name-edit-form" onSubmit={handleSaveName}>
                <input
                  ref={nameInputRef}
                  className="name-edit-input"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  disabled={nameSaving}
                  maxLength={64}
                  onKeyDown={(e) => e.key === "Escape" && setEditingName(false)}
                />
                <button type="submit" className="name-edit-btn name-edit-btn--ok" disabled={nameSaving} aria-label={t("common.save")}>✓</button>
                <button type="button" className="name-edit-btn name-edit-btn--cancel" onClick={() => { setEditingName(false); setNameInput(displayName); }} aria-label={t("common.cancel")}>✕</button>
              </form>
            ) : (
              <h1 className="user-info__name user-info__name--editable" onClick={() => { setNameInput(displayName); setEditingName(true); }}>
                {displayName}
                <span className="name-edit-icon" aria-hidden>✏</span>
              </h1>
            )}
            <div className="user-info__meta">
              {userEmail} · {joinDate}
              {!user && <span className="profile-hero__demo">{t("profile.demoLabel")}</span>}
            </div>
          </div>

          {/* Действия в шапке: смена пароля и корзина */}
          <div className="user-info__actions">
            <button
              type="button"
              className={`pw-toggle pw-toggle--trash${trashOpen ? " pw-toggle--open" : ""}`}
              onClick={() => setTrashOpen(true)}
              title={t("profile.trashTitle")}
              aria-label={t("profile.trashOpenAria")}
            >
              {t("profile.trashOpenBtn")}
            </button>
          {user?.email && (
            <div className="user-info__pw-wrap">
              <button
                type="button"
                className={`pw-toggle${showPw ? " pw-toggle--open" : ""}`}
                onClick={() => { setShowPw((v) => !v); setPwError(null); }}
              >
                🔑 {showPw ? t("profile.pwHide") : t("profile.pwToggle")}
              </button>

              {showPw && (
                <form className="hero-pw-form" onSubmit={handleChangePassword}>
                  <input
                    type="password"
                    placeholder={t("profile.pwCurrentPlaceholder")}
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    disabled={pwStatus === "saving"}
                    required
                    autoComplete="current-password"
                  />
                  <input
                    type="password"
                    placeholder={t("profile.pwNewPlaceholder")}
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    disabled={pwStatus === "saving"}
                    required
                    autoComplete="new-password"
                  />
                  <input
                    type="password"
                    placeholder={t("profile.pwConfirmPlaceholder")}
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    disabled={pwStatus === "saving"}
                    required
                    autoComplete="new-password"
                  />
                  {pwError && <p className="hero-pw-form__msg hero-pw-form__msg--error">{pwError}</p>}
                  {pwStatus === "ok" && <p className="hero-pw-form__msg hero-pw-form__msg--ok">{t("profile.pwChanged")}</p>}
                  <button type="submit" className="btn btn--primary" disabled={pwStatus === "saving" || !pwCurrent || !pwNew || !pwConfirm}>
                    {pwStatus === "saving" ? t("profile.pwSaving") : t("profile.pwSave")}
                  </button>
                </form>
              )}
            </div>
          )}
          </div>
        </div>
      </section>

      {/* ── Trash drawer (всплывающее окно над страницей) ── */}
      {trashOpen &&
        createPortal(
          <div className="trash-modal-backdrop" onClick={() => setTrashOpen(false)}>
            <div
              className="trash-modal"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="trash-modal__head">
                <div>
                  <h3>{t("profile.trashTitle")}</h3>
                  <p className="muted">{t("profile.trashDesc")}</p>
                </div>
                <button
                  type="button"
                  className="trash-modal__close"
                  onClick={() => setTrashOpen(false)}
                  aria-label={t("profile.trashCloseAria")}
                >
                  ✕
                </button>
              </header>
              <div className="trash-modal__list">
                {trashQuery.isLoading && (
                  <p className="muted">{t("profile.trashLoading")}</p>
                )}
                {!trashQuery.isLoading && (trashQuery.data?.items ?? []).length === 0 && (
                  <p className="muted">{t("profile.trashEmptyMsg")}</p>
                )}
                {(trashQuery.data?.items ?? []).map((it) => {
                  const restoring =
                    restoreFileMutation.isPending &&
                    restoreFileMutation.variables === it.id;
                  return (
                    <div key={it.id} className="trash-modal__item">
                      <div>
                        <strong>{it.title || it.type}</strong>
                        <span className="muted">
                          {it.type}
                          {it.deleted_at
                            ? ` · ${new Date(it.deleted_at).toLocaleDateString(isEN ? "en-US" : "ru-RU")}`
                            : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="filter-chip"
                        title={t("profile.trashRestoreBtn")}
                        onClick={() => restoreFileMutation.mutate(it.id)}
                        disabled={restoring}
                      >
                        {restoring ? "…" : t("profile.trashRestoreBtn")}
                      </button>
                    </div>
                  );
                })}
              </div>
              <footer className="trash-modal__foot">
                <button
                  type="button"
                  className="filter-chip filter-chip--danger"
                  disabled={
                    purgeTrashMutation.isPending ||
                    (trashQuery.data?.items ?? []).length === 0
                  }
                  onClick={() => purgeTrashMutation.mutate()}
                >
                  {purgeTrashMutation.isPending ? t("profile.trashPurging") : t("profile.trashPurge")}
                </button>
                <span className="muted">{t("profile.trashAutoClear")}</span>
              </footer>
            </div>
          </div>,
          document.body,
        )}

      {/* Сетка виджетов */}
      <div className="profile-grid">

        {/* ─── Баланс и пакеты ─── */}
        <section className="profile-card profile-card--tokens">
          <div className="profile-card__header">
            <span className="profile-card__icon" aria-hidden>
              <Coin size={22} className="riffa-coin--lg" />
            </span>
            <h2 className="profile-card__title">{t("profile.balanceHeader")}</h2>
          </div>
          <div className="balance-display">
            <p className="balance-display__amount">
              {userBalance}
              <Coin size={32} className="riffa-coin--lg riffa-coin--after" />
            </p>
            <div className="balance-display__label">{t("profile.balanceAvail")}</div>
            <div className="balance-display__conversions">
              <span>≈ {Math.floor(userBalance / 2)} {isEN ? "songs" : "песен"}</span>
              <span>≈ {Math.floor(userBalance / 0.5)} SFX</span>
              <span>≈ {Math.floor(userBalance / 1)} {isEN ? "covers" : "обложек"}</span>

            </div>
          </div>

          <div className="token-packages">
            {localPackages.map((p) => {
              const packName = p.name;
              const packCounts = isEN
                ? `${Math.floor(p.tokens / 2)} songs · ${Math.floor(p.tokens / 0.5)} SFX · ${p.tokens} covers`
                : `${Math.floor(p.tokens / 2)} песен · ${Math.floor(p.tokens / 0.5)} SFX · ${p.tokens} обложек`;

              return (
                <button
                  key={p.id}
                  type="button"
                  className={`token-pack${selectedPack === p.id ? " token-pack--active" : ""}`}
                  onClick={() => setSelectedPack(p.id)}
                >
                  {p.discount !== undefined && (
                    <span className="token-pack__badge">{t("profile.packDiscountBadge", { percent: p.discount })}</span>
                  )}
                  <span className="token-pack__name">{packName}</span>
                  <strong className="token-pack__amount">
                    {p.tokens}
                    <Coin size={18} className="riffa-coin--after" />
                  </strong>
                  <span className="token-pack__gens">{packCounts}</span>
                  <div className="token-pack__price">
                    <span className="token-pack__price-label">{t("profile.packPriceLabel")}</span>
                    <span className="token-pack__price-value">{isEN ? `₽${p.priceRub}` : `${p.priceRub}₽`}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="payment-methods">
            <span className="payment-methods__label">{t("profile.paymentMethod")}</span>
            <div className="payment-methods__grid">
              {PAYMENT_METHODS.map((m) => {
                const label = m.id === "card" ? t("profile.paymentCard")
                            : m.id === "stars" ? t("profile.paymentStars")
                            : t("profile.paymentCrypto");
                const hint  = m.id === "card" ? t("profile.paymentCardHint")
                            : m.id === "stars" ? t("profile.paymentStarsHint")
                            : t("profile.paymentCryptoHint");
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`pay-method${payMethod === m.id ? " pay-method--active" : ""}`}
                    onClick={() => setPayMethod(m.id)}
                    disabled={m.id === "crypto"}
                  >
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className="btn btn--primary btn--wide"
            onClick={handleBuyPack}
            disabled={payStatus === "loading" || payMethod === "crypto"}
          >
            {payStatus === "loading" ? t("profile.paymentLoading") : t("profile.buyTokens")}
          </button>
          {payError && (
            <p style={{ color: "var(--error, #ff6b6b)", fontSize: 13, margin: "4px 0 0" }}>
              {payError}
            </p>
          )}

          {/* ─── Промокод ─── */}
          <div className="promo-redeem">
            <label className="promo-redeem__label" htmlFor="promo-input">
              {t("profile.promoHave")}
            </label>
            <input
              id="promo-input"
              type="text"
              className="promo-redeem__input"
              placeholder={t("profile.promoInputPlaceholder")}
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value.toUpperCase());
                if (promoStatus !== "idle") {
                  setPromoStatus("idle");
                  setPromoMessage(null);
                }
              }}
              maxLength={32}
              spellCheck={false}
              autoCapitalize="characters"
              disabled={promoStatus === "saving"}
            />
            <button
              type="button"
              className="btn btn--secondary btn--wide"
              onClick={handleRedeemPromo}
              disabled={promoStatus === "saving" || !promoCode.trim()}
            >
              {promoStatus === "saving" ? "..." : t("profile.promoActivate")}
            </button>
            {promoMessage && (
              <div
                className={`promo-redeem__msg promo-redeem__msg--${
                  promoStatus === "ok" ? "ok" : "err"
                }`}
                role={promoStatus === "ok" ? "status" : "alert"}
              >
                {promoMessage}
              </div>
            )}
          </div>
        </section>

        {/* ─── Файлы ─── */}
        <section className="profile-card profile-card--files">
          <div className="profile-card__header">
            <Icon name="📁" />
            <h2 className="profile-card__title">{t("profile.myFiles")}</h2>
            <span className="profile-card__meta">{filteredFiles.length} / {libraryItems.length}</span>
          </div>

          {/* Тип файла — чипы */}
          <div className="file-type-chips">
            {(["all", "song", "instrumental", "cover", "sfx", "cover_art"] as Array<"all" | LibraryItemType>).map((ft) => (
              <button
                key={ft}
                type="button"
                className={`filter-chip${filterType === ft ? " filter-chip--active" : ""}`}
                onClick={() => setFilterType(ft)}
              >
                {ft === "all" ? t("profile.filesAll") : typeLabel(ft)}
              </button>
            ))}
          </div>

          {/* Настроение / Жанр / Сортировка — кастомный брендированный дропдаун */}
          <div className="file-filters">
            <div className="file-filters__label">
              <span className="file-filters__label-text">{t("profile.filterMoodLabel")}</span>
              <FilterSelect options={moodOptions} value={filterMood} onChange={setFilterMood} />
            </div>
            <div className="file-filters__label">
              <span className="file-filters__label-text">{t("profile.filterGenreLabel")}</span>
              <FilterSelect options={genreOptions} value={filterGenre} onChange={setFilterGenre} />
            </div>
            <div className="file-filters__label">
              <span className="file-filters__label-text">{t("profile.filterSortLabel")}</span>
              <FilterSelect
                options={sortOptions}
                value={filterSort}
                onChange={(v) => setFilterSort(v as "newest" | "oldest")}
              />
            </div>
          </div>

          <div className="generations-list">
            {filesAuthError ? (
              <div className="empty-state">
                <div className="empty-state__icon">🔒</div>
                <div className="empty-state__text">{t("profile.filesNeedAuth")}</div>
              </div>
            ) : filesLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={`skel-${i}`} className="file-skeleton" aria-hidden="true">
                  <div className="file-skeleton__icon" />
                  <div className="file-skeleton__lines">
                    <div className="file-skeleton__line" style={{ width: `${60 + ((i * 17) % 40)}%` }} />
                    <div className="file-skeleton__line file-skeleton__line--short" />
                  </div>
                  <div className="file-skeleton__action" />
                </div>
              ))
            ) : filteredFiles.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon">📂</div>
                <div className="empty-state__text">
                  {libraryItems.length === 0
                    ? t("profile.filesEmptyFirst")
                    : t("profile.filesNoMatch")}
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filteredFiles.map((f) => {
                  const isActive = currentId === f.id;
                  const canRadio = RADIO_TYPES.has(f.type) && f.isOwn;
                  const canBolt = MUSIC_TYPES.has(f.type);
                  const radioPending =
                    radioMutation.isPending && radioMutation.variables?.itemId === f.id;
                  return (
                    <motion.div
                      key={f.id}
                      role="button"
                      tabIndex={0}
                      className={`file-item${isActive ? " file-item--active" : ""}`}
                      onClick={() => handlePlayItem(f)}
                      onKeyDown={(e) => e.key === "Enter" && handlePlayItem(f)}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                    >
                      {f.coverUrl ? (
                        <span
                          className="file-item__icon file-item__icon--cover"
                          aria-hidden
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewerImage({ url: f.coverUrl!, title: f.title });
                          }}
                          style={{ cursor: "zoom-in" }}
                          title={t("profile.openFullscreen")}
                        >
                          <img src={f.coverUrl} alt="" loading="lazy" />
                        </span>
                      ) : (
                        <span className="file-item__icon" aria-hidden>{TYPE_ICONS[f.type]}</span>
                      )}
                      <div className="file-item__info">
                        <span className="file-item__title">{f.title}</span>
                        <span className="file-item__meta">
                          {typeLabel(f.type)} · {f.genre} · {f.mood} · {f.duration}
                        </span>
                      </div>
                      <FileActions
                        audioUrl={f.audioUrl}
                        downloadUrl={
                          f.trackIndex !== null
                            ? trackDownloadUrl(f.generationId, f.trackIndex)
                            : undefined
                        }
                        title={f.title}
                        isMusicType={canBolt}
                        canRadio={canRadio}
                        fileId={f.id}
                        isPublic={f.isPublic}
                        generationId={f.generationId}
                        audioId={f.audioId}
                        onToggleRadio={
                          canRadio
                            ? (next) =>
                                radioMutation.mutateAsync({
                                  itemId: f.id,
                                  generationId: f.generationId,
                                  trackIndex: f.trackIndex,
                                  isPublic: next,
                                })
                            : undefined
                        }
                        radioPending={radioPending}
                        isActive={isActive}
                        isPlaying={isPlaying}
                        onPlayPause={f.audioUrl ? () => handlePlayItem(f) : undefined}
                        onDelete={(rect) => {
                          showFileGhost(f, rect);
                          deleteFileMutation.mutate(f.generationId);
                        }}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </section>

        {/* ─── Статистика + Любимые стили ─── */}
        <section className="profile-card profile-card--insights">
          <div className="insights-grid">
            <div>
              <div className="profile-card__header">
                <h2 className="profile-card__title">{t("profile.statsHeader")}</h2>
              </div>
              <div className="stat-summary">
                <strong>{totalGens}</strong>
                <span>{totalGens === 0 ? t("profile.statsNone") : totalGens === 1 ? t("profile.statsOne") : totalGens < 5 ? t("profile.statsFew") : t("profile.statsMany")}</span>
              </div>
              <div className="stat-bars">
                {genStats.map((s) => (
                  <div key={s.type} className="stat-bar">
                    <div className="stat-bar__head">
                      <span>{s.label}</span>
                      <strong>{s.count}</strong>
                    </div>
                    <div className="stat-bar__track">
                      <div
                        className="stat-bar__fill"
                        style={{ width: `${(s.count / maxStat) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {genStats.length === 0 && (
                  <p className="muted">{t("profile.statsEmpty")}</p>
                )}
              </div>
            </div>

            <div>
              <div className="profile-card__header">
                <h2 className="profile-card__title">{t("profile.tastesHeader")}</h2>
              </div>

              <div className="taste-group">
                <h3 className="taste-group__title">{t("profile.tastesGenres")}</h3>
                {favouriteGenres.length > 0 ? (
                  <div className="taste-chips">
                    {favouriteGenres.map((g) => (
                      <span key={g.name} className="taste-chip">
                        {g.name}
                        <small>{g.count}</small>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="muted">{t("profile.tastesNoGenres")}</p>
                )}
              </div>

              <div className="taste-group">
                <h3 className="taste-group__title">{t("profile.tastesMoods")}</h3>
                {favouriteMoods.length > 0 ? (
                  <div className="taste-chips">
                    {favouriteMoods.map((m) => (
                      <span key={m.name} className="taste-chip">
                        {m.name}
                        <small>{m.count}</small>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="muted">{t("profile.tastesNoMoods")}</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ─── Документы ─── */}
        <section className="profile-card profile-card--docs">
          <div className="profile-card__header">
            <Icon name="📄" />
            <h2 className="profile-card__title">{t("profile.docsHeader")}</h2>
          </div>
          <ul className="docs-list">
            {localLegalDocs.map((d) => (
              <li key={d.id}>
                <a href={d.href} className="doc-row" target="_blank" rel="noopener noreferrer">
                  <div>
                    <strong>{d.title}</strong>
                    <small>{d.hint}</small>
                  </div>
                  <span aria-hidden>→</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* ─── Отзывы ─── */}
        <section className="profile-card profile-card--reviews">
          <div className="profile-card__header">
            <Icon name="💬" />
            <h2 className="profile-card__title">{t("profile.reviewsHeader")}</h2>
            <span className="profile-card__meta">{reviews.length}</span>
          </div>

          <form className="review-form" onSubmit={submitReview}>
            <div className="review-form__stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  className={`star${n <= reviewRating ? " star--on" : ""}`}
                  onClick={() => setReviewRating(n)}
                  aria-label={t("profile.reviewStarsAria", { n })}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder={t("profile.reviewPlaceholder")}
            />
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!reviewText.trim()}
            >
              {t("profile.reviewSubmit")}
            </button>
          </form>

          <div className="review-list">
            {reviews.map((r) => (
              <article key={r.id} className="review-item">
                <header>
                  <strong>{r.author}</strong>
                  <span className="review-item__stars">
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)}
                  </span>
                  <small>{r.date}</small>
                </header>
                <p>{r.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ─── Реферальная программа ─── */}
        <section className="profile-card profile-card--referral">
          <div className="profile-card__header">
            <Icon name="🎁" />
            <h2 className="profile-card__title">{t("profile.referralHeader")}</h2>
          </div>

          <div className="referral-stats">
            <div className="referral-stat">
              <strong>0</strong>
              <span>{t("profile.referralInvited")}</span>
            </div>
            <div className="referral-stat">
              <strong className="referral-stat__amount">
                0
                <Coin size={18} className="riffa-coin--after" />
              </strong>
              <span>{t("profile.referralBonus")}</span>
            </div>
            <div className="referral-stat">
              <strong>—</strong>
              <span>{t("profile.referralFromRefs")}</span>
            </div>
          </div>

          <div className="referral-perks">
            <h3>{t("profile.referralHowTitle")}</h3>
            <ul>
              <li><strong>4 <Coin /></strong> {t("profile.referralFriendGets")}</li>
              <li><strong>10 <Coin /></strong> {t("profile.referralYouGet")}</li>
            </ul>
          </div>

          <div className="referral-link">
            <span className="referral-link__text">{referralLink}</span>
            <button type="button" className="referral-link__copy" onClick={copyReferral}>
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        </section>
      </div>

      {/* Floating ghosts that play the explosion animation while the grid
       *  magnetises remaining files upward. */}
      <FileGhostsOverlay ghosts={fileGhosts} />
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
