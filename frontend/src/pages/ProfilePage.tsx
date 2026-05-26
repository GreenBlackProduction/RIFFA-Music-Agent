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

  const uniqueGenreCount = useMemo(() => {
    return new Set(libraryItems.map((f) => f.genre).filter(Boolean)).size;
  }, [libraryItems]);

  return (
    <div className="profile">
      {/* top-meta */}
      <div className="top-meta">
        <div className="breadcrumb">
          <span>raw</span><span>/</span><b>{isEN ? "profile" : "профиль"}</b>
        </div>
        <div>{joinDate}</div>
      </div>

      <h1 className="h-page">{isEN ? <>Profile and <em>tokens</em>.</> : <>Профиль и <em>токены</em>.</>}</h1>

      {/* ── profile-grid: avatar | stats + name ── */}
      <div className="profile-grid">
        <div className="avatar-block">
          <button
            type="button"
            className={`avatar-big${avatarUploading ? " avatar-big--loading" : ""}`}
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            title={t("profile.avatarAria")}
          >
            {user?.avatar_url && !avatarFailed
              ? <img src={user.avatar_url} alt="" onError={() => setAvatarFailed(true)} />
              : userInitial}
          </button>
          <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={handleAvatarChange} />
          {avatarError && <span className="profile-avatar-error">{avatarError}</span>}

          <div className="name">
            {editingName ? (
              <div className="name-edit-row">
                <input ref={nameInputRef} type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} disabled={nameSaving} maxLength={64} onKeyDown={(e) => e.key === "Escape" && setEditingName(false)} />
                <button type="button" className="btn btn-ink btn-sm" onClick={handleSaveName} disabled={nameSaving}>✓</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditingName(false); setNameInput(displayName); }}>✕</button>
              </div>
            ) : (
              <span className="name-inline" onClick={() => { setNameInput(displayName); setEditingName(true); }}>
                {displayName} <span className="name-inline__edit">✏</span>
              </span>
            )}
          </div>
          <div className="email">{userEmail || (isEN ? "not logged in" : "не авторизован")}</div>
          <button type="button" className="btn btn-soft btn-sm" style={{ marginTop: 14 }} onClick={() => avatarInputRef.current?.click()}>
            {isEN ? "change avatar" : "сменить аватар"}
          </button>
          <div className="since">{joinDate}</div>

          {user?.email && (
            <div style={{ marginTop: 16, width: "100%" }}>
              <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => { setShowPw((v) => !v); setPwError(null); }}>
                🔑 {showPw ? t("profile.pwHide") : t("profile.pwToggle")}
              </button>
              {showPw && (
                <form onSubmit={handleChangePassword} style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <input type="password" placeholder={t("profile.pwCurrentPlaceholder")} value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} disabled={pwStatus === "saving"} required autoComplete="current-password" style={{ padding: "10px 12px", border: "1px solid var(--rule)", borderRadius: 10, font: "inherit", fontSize: 13, background: "var(--paper)", outline: "none" }} />
                  <input type="password" placeholder={t("profile.pwNewPlaceholder")} value={pwNew} onChange={(e) => setPwNew(e.target.value)} disabled={pwStatus === "saving"} required autoComplete="new-password" style={{ padding: "10px 12px", border: "1px solid var(--rule)", borderRadius: 10, font: "inherit", fontSize: 13, background: "var(--paper)", outline: "none" }} />
                  <input type="password" placeholder={t("profile.pwConfirmPlaceholder")} value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} disabled={pwStatus === "saving"} required autoComplete="new-password" style={{ padding: "10px 12px", border: "1px solid var(--rule)", borderRadius: 10, font: "inherit", fontSize: 13, background: "var(--paper)", outline: "none" }} />
                  {pwError && <p style={{ color: "var(--hi)", fontSize: 12, margin: 0 }}>{pwError}</p>}
                  {pwStatus === "ok" && <p style={{ color: "var(--emr)", fontSize: 12, margin: 0 }}>{t("profile.pwChanged")}</p>}
                  <button type="submit" className="btn btn-ink btn-sm btn-block" disabled={pwStatus === "saving" || !pwCurrent || !pwNew || !pwConfirm}>
                    {pwStatus === "saving" ? t("profile.pwSaving") : t("profile.pwSave")}
                  </button>
                </form>
              )}
            </div>
          )}
          <div style={{ marginTop: 12, width: "100%" }}>
            <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => setTrashOpen(true)}>
              {t("profile.trashOpenBtn")}
            </button>
          </div>
        </div>

        <div>
          {/* 4 stat tiles */}
          <div className="stats" style={{ marginBottom: 24 }}>
            <div className="stat">
              <div className="label">{isEN ? "balance" : "баланс"}</div>
              <div className="val">{userBalance}<small>ⓡ</small></div>
              <div className="delta">{isEN ? "available" : "доступно"}</div>
            </div>
            <div className="stat">
              <div className="label">{isEN ? "total created" : "всего создано"}</div>
              <div className="val">{totalGens}<small>{isEN ? "tr." : "трек."}</small></div>
              <div className="delta">{joinDate || (isEN ? "since registration" : "с регистрации")}</div>
            </div>
            <div className="stat">
              <div className="label">{isEN ? "genres" : "жанров"}</div>
              <div className="val">{uniqueGenreCount}</div>
              <div className="delta">{isEN ? "unique" : "уникальных"}</div>
            </div>
            <div className="stat">
              <div className="label">{isEN ? "invited" : "приглашено"}</div>
              <div className="val">0<small>{isEN ? "fr." : "др."}</small></div>
              <div className="delta">+0 ⓡ {isEN ? "bonus" : "бонус"}</div>
            </div>
          </div>

          {/* display name field */}
          <div className="field">
            <label>{isEN ? "display name" : "имя для отображения"}</label>
            {editingName ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} disabled={nameSaving} maxLength={64} onKeyDown={(e) => e.key === "Escape" && setEditingName(false)} autoFocus />
                <button type="button" className="btn btn-ink btn-sm" onClick={handleSaveName} disabled={nameSaving}>✓</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditingName(false); setNameInput(displayName); }}>✕</button>
              </div>
            ) : (
              <input type="text" value={displayName} readOnly onClick={() => { setNameInput(displayName); setEditingName(true); }} />
            )}
          </div>
        </div>
      </div>

      {/* ── 01 · купить токены ── */}
      <div className="h-section">
        <div className="tag"><span className="num">01</span> · {isEN ? "top up" : "пополнить"}</div>
        <h2>{isEN ? "buy tokens" : "купить токены"}</h2>
        <div className="right">{isEN ? "from ₽100 · card / stars" : "от 100 ₽ · картой / stars"}</div>
      </div>

      <div className="pricing">
        {localPackages.map((p) => {
          const isFeatured = p.id === "basic";
          const perks = isEN
            ? [`${p.tokens} ⓡ to balance`, `${Math.floor(p.tokens / 2)} songs`, `WAV export`, `priority queue`]
            : [`${p.tokens} ⓡ на баланс`, `${Math.floor(p.tokens / 2)} песен с вокалом`, `экспорт в WAV`, `приоритет очереди`];
          return (
            <div key={p.id} className={`price-tile${isFeatured ? " is-featured" : ""}${selectedPack === p.id ? " is-selected" : ""}`} onClick={() => setSelectedPack(p.id)}>
              <div className="tier">{p.name}{isFeatured ? ` · ${isEN ? "popular" : "популярный"}` : ""}</div>
              <div className="price">{p.priceRub}<small>₽</small></div>
              <div className="tokens-meta">{p.tokens} {isEN ? "tokens" : "токенов"} · ~{Math.floor(p.tokens / 2)} {isEN ? "tracks" : "треков"}</div>
              {p.discount !== undefined && (
                <div className="discount">{isEN ? `save ${p.discount}%` : `выгода ${p.discount}%`}</div>
              )}
              <ul className="perks">
                {perks.map((pk, j) => <li key={j}>{pk}</li>)}
              </ul>
              <button
                type="button"
                className={`btn ${isFeatured ? "btn-primary" : "btn-ghost"} btn-block`}
                onClick={(e) => { e.stopPropagation(); setSelectedPack(p.id); handleBuyPack(); }}
                disabled={payStatus === "loading"}
              >
                {payStatus === "loading" && selectedPack === p.id ? "..." : (isEN ? "buy →" : "купить →")}
              </button>
            </div>
          );
        })}
      </div>

      <div className="pill-row" style={{ margin: "20px 0 0" }}>
        <button className={`pill${payMethod === "card" ? " on-hi" : ""}`} onClick={() => setPayMethod("card")}>
          {isEN ? "Card RF · Robokassa · instant" : "Карта РФ · Robokassa · мгновенно"}
        </button>
        <button className={`pill${payMethod === "stars" ? " on" : ""}`} onClick={() => setPayMethod("stars")}>
          {isEN ? "Telegram Stars · no fee" : "Telegram Stars · без комиссии"}
        </button>
        <button className="pill" style={{ opacity: 0.6 }} disabled>
          {isEN ? "Crypto · USDT · soon" : "Крипта · USDT TRC-20 · скоро"}
        </button>
      </div>
      {payError && <p style={{ color: "var(--hi)", fontSize: 13, margin: "8px 0 0" }}>{payError}</p>}

      {/* ── 02 · промокод ── */}
      <div className="h-section">
        <div className="tag"><span className="num">02</span> · {isEN ? "promo" : "промокод"}</div>
        <h2>{isEN ? "have a promo code?" : "есть промокод?"}</h2>
        <div className="right">{isEN ? "bonus tokens" : "бонусные токены"}</div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <input
          type="text"
          className="studio-quick__input"
          placeholder={t("profile.promoInputPlaceholder")}
          value={promoCode}
          onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); if (promoStatus !== "idle") { setPromoStatus("idle"); setPromoMessage(null); } }}
          maxLength={32}
          spellCheck={false}
          autoCapitalize="characters"
          disabled={promoStatus === "saving"}
        />
        <button type="button" className="btn btn-emr" onClick={handleRedeemPromo} disabled={promoStatus === "saving" || !promoCode.trim()}>
          {promoStatus === "saving" ? "..." : (isEN ? "activate" : "активировать")}
        </button>
      </div>
      {promoMessage && (
        <p style={{ color: promoStatus === "ok" ? "var(--emr)" : "var(--hi)", fontSize: 13, margin: "8px 0 0" }}>
          {promoMessage}
        </p>
      )}

      {/* ── 03 · реферальная программа ── */}
      <div className="h-section">
        <div className="tag"><span className="num">03</span> · {isEN ? "referral" : "реферальная программа"}</div>
        <h2>{isEN ? "invite friends" : "приглашай друзей"}</h2>
        <div className="right">{isEN ? "10 ⓡ you + 4 ⓡ friend" : "10 ⓡ тебе + 4 ⓡ другу"}</div>
      </div>

      <div className="p-panel">
        <div className="stats" style={{ border: "none", background: "transparent" }}>
          <div className="stat" style={{ background: "var(--paper-3)" }}>
            <div className="label">{isEN ? "invited" : "приглашено"}</div>
            <div className="val">0<small>{isEN ? "fr." : "др."}</small></div>
          </div>
          <div className="stat" style={{ background: "var(--paper-3)" }}>
            <div className="label">{isEN ? "bonus tokens" : "бонусных на баланс"}</div>
            <div className="val">0<small>ⓡ</small></div>
          </div>
          <div className="stat" style={{ background: "var(--paper-3)" }}>
            <div className="label">{isEN ? "from refs" : "от оплат рефералов"}</div>
            <div className="val">0<small>ⓡ</small></div>
          </div>
          <div className="stat" style={{ background: "var(--paper-3)" }}>
            <div className="label">{isEN ? "total earned" : "всего заработано"}</div>
            <div className="val">0<small>ⓡ</small></div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, alignItems: "center" }}>
          <div style={{ flex: 1, padding: "12px 16px", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 999, fontFamily: "var(--font-mono)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {referralLink}
          </div>
          <button type="button" className="btn btn-ink" onClick={copyReferral}>
            {copied ? t("common.copied") : (isEN ? "copy →" : "скопировать →")}
          </button>
        </div>
      </div>

      {/* ── 04 · документы ── */}
      <div className="h-section">
        <div className="tag"><span className="num">04</span> · {isEN ? "documents" : "документы"}</div>
        <h2>{isEN ? "legal information" : "правовая информация"}</h2>
        <div className="right">{isEN ? "for reference" : "для справки"}</div>
      </div>

      <div className="doc-list">
        {localLegalDocs.map((d) => (
          <a key={d.id} href={d.href} className="doc-row" target="_blank" rel="noopener noreferrer">
            <div className="icon">📄</div>
            <div>
              <div className="title">{d.title}</div>
              <div className="hint">{d.hint}</div>
            </div>
            <span className="chevron">→</span>
          </a>
        ))}
      </div>

      {/* ── 05 · мои файлы ── */}
      <div className="h-section">
        <div className="tag"><span className="num">05</span> · {isEN ? "files" : "мои файлы"}</div>
        <h2>{t("profile.myFiles")}</h2>
        <div className="right">{filteredFiles.length} / {libraryItems.length}</div>
      </div>

      <div className="pill-row" style={{ marginBottom: 16 }}>
        {(["all", "song", "instrumental", "cover", "sfx", "cover_art"] as Array<"all" | LibraryItemType>).map((ft) => (
          <button key={ft} type="button" className={`pill${filterType === ft ? " on" : ""}`} onClick={() => setFilterType(ft)}>
            {ft === "all" ? t("profile.filesAll") : typeLabel(ft)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterSelect options={moodOptions} value={filterMood} onChange={setFilterMood} />
        <FilterSelect options={genreOptions} value={filterGenre} onChange={setFilterGenre} />
        <FilterSelect options={sortOptions} value={filterSort} onChange={(v) => setFilterSort(v as "newest" | "oldest")} />
      </div>

      <div className="generations-list">
        {filesAuthError ? (
          <div className="empty-state"><div className="empty-state__icon">🔒</div><div className="empty-state__text">{t("profile.filesNeedAuth")}</div></div>
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
            <div className="empty-state__text">{libraryItems.length === 0 ? t("profile.filesEmptyFirst") : t("profile.filesNoMatch")}</div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredFiles.map((f) => {
              const isActive = currentId === f.id;
              const canRadio = RADIO_TYPES.has(f.type) && f.isOwn;
              const canBolt = MUSIC_TYPES.has(f.type);
              const radioPending = radioMutation.isPending && radioMutation.variables?.itemId === f.id;
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
                    <span className="file-item__icon file-item__icon--cover" aria-hidden onClick={(e) => { e.stopPropagation(); setViewerImage({ url: f.coverUrl!, title: f.title }); }} style={{ cursor: "zoom-in" }}>
                      <img src={f.coverUrl} alt="" loading="lazy" />
                    </span>
                  ) : (
                    <span className="file-item__icon" aria-hidden>{TYPE_ICONS[f.type]}</span>
                  )}
                  <div className="file-item__info">
                    <span className="file-item__title">{f.title}</span>
                    <span className="file-item__meta">{typeLabel(f.type)} · {f.genre} · {f.mood} · {f.duration}</span>
                  </div>
                  <FileActions
                    audioUrl={f.audioUrl}
                    downloadUrl={f.trackIndex !== null ? trackDownloadUrl(f.generationId, f.trackIndex) : undefined}
                    title={f.title}
                    isMusicType={canBolt}
                    canRadio={canRadio}
                    fileId={f.id}
                    isPublic={f.isPublic}
                    generationId={f.generationId}
                    audioId={f.audioId}
                    onToggleRadio={canRadio ? (next) => radioMutation.mutateAsync({ itemId: f.id, generationId: f.generationId, trackIndex: f.trackIndex, isPublic: next }) : undefined}
                    radioPending={radioPending}
                    isActive={isActive}
                    isPlaying={isPlaying}
                    onPlayPause={f.audioUrl ? () => handlePlayItem(f) : undefined}
                    onDelete={(rect) => { showFileGhost(f, rect); deleteFileMutation.mutate(f.generationId); }}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Trash modal */}
      {trashOpen &&
        createPortal(
          <div className="trash-modal-backdrop" onClick={() => setTrashOpen(false)}>
            <div className="trash-modal" role="dialog" aria-modal={true} onClick={(e) => e.stopPropagation()}>
              <header className="trash-modal__head">
                <div>
                  <h3>{t("profile.trashTitle")}</h3>
                  <p className="muted">{t("profile.trashDesc")}</p>
                </div>
                <button type="button" className="trash-modal__close" onClick={() => setTrashOpen(false)} aria-label={t("profile.trashCloseAria")}>✕</button>
              </header>
              <div className="trash-modal__list">
                {trashQuery.isLoading && <p className="muted">{t("profile.trashLoading")}</p>}
                {!trashQuery.isLoading && (trashQuery.data?.items ?? []).length === 0 && <p className="muted">{t("profile.trashEmptyMsg")}</p>}
                {(trashQuery.data?.items ?? []).map((it) => {
                  const restoring = restoreFileMutation.isPending && restoreFileMutation.variables === it.id;
                  return (
                    <div key={it.id} className="trash-modal__item">
                      <div>
                        <strong>{it.title || it.type}</strong>
                        <span className="muted">{it.type}{it.deleted_at ? ` · ${new Date(it.deleted_at).toLocaleDateString(isEN ? "en-US" : "ru-RU")}` : ""}</span>
                      </div>
                      <button type="button" className="filter-chip" onClick={() => restoreFileMutation.mutate(it.id)} disabled={restoring}>
                        {restoring ? "…" : t("profile.trashRestoreBtn")}
                      </button>
                    </div>
                  );
                })}
              </div>
              <footer className="trash-modal__foot">
                <button type="button" className="filter-chip filter-chip--danger" disabled={purgeTrashMutation.isPending || (trashQuery.data?.items ?? []).length === 0} onClick={() => purgeTrashMutation.mutate()}>
                  {purgeTrashMutation.isPending ? t("profile.trashPurging") : t("profile.trashPurge")}
                </button>
                <span className="muted">{t("profile.trashAutoClear")}</span>
              </footer>
            </div>
          </div>,
          document.body,
        )}

      <FileGhostsOverlay ghosts={fileGhosts} />
      {viewerImage && (
        <ImageViewer imageUrl={viewerImage.url} title={viewerImage.title} onClose={() => setViewerImage(null)} />
      )}
    </div>
  );
}
