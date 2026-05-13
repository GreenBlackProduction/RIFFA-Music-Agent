import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  changePassword,
  deleteGeneration,
  fetchTrash,
  purgeTrash,
  redeemPromo,
  restoreGeneration,
  updateDisplayName,
  uploadAvatar,
  type GenerationOut,
  type HistoryPage,
} from "@/lib/api/client";
import { useShallow } from "zustand/react/shallow";

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

// ─────────── Mock-данные для гостевого просмотра ────────────

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

const STAT_META: readonly { type: string; label: string; color: string }[] = [
  { type: "song", label: "Песни", color: "var(--accent)" },
  { type: "instrumental", label: "Инструменталы", color: "var(--accent-2)" },
  { type: "cover", label: "Каверы", color: "var(--accent-3)" },
  { type: "sfx", label: "Звук. эффекты", color: "#37bbfe" },
  { type: "cover_art", label: "Обложки", color: "#ffd166" },
];

function countBy<T>(items: readonly T[], key: (item: T) => string): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

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

const SEED_REVIEWS: readonly Review[] = [];

const MOCK_DOCS: readonly { id: string; title: string; hint: string; href: string }[] = [
  { id: "terms", title: "Пользовательское соглашение", hint: "Версия от 01.04.2026", href: "#" },
  { id: "privacy", title: "Политика конфиденциальности", hint: "Как храним данные", href: "#" },
  { id: "license", title: "Лицензия на треки", hint: "Коммерческое использование", href: "#" },
  { id: "offer", title: "Оферта", hint: "Для оплат по карте", href: "#" },
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
  const [viewerImage, setViewerImage] = useState<{ url: string; title: string } | null>(null);

  const displayName = user?.display_name ?? "Гость";
  const userEmail = user?.email ?? "demo@riffa.studio";
  const userBalance = user?.balance_tokens ?? 0;
  const userInitial = displayName.slice(0, 1).toUpperCase();
  const joinDate = "";

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
    if (pwNew.length < 6) { setPwError("Не менее 6 символов"); return; }
    if (pwNew !== pwConfirm) { setPwError("Пароли не совпадают"); return; }
    setPwStatus("saving");
    try {
      await changePassword(pwCurrent, pwNew);
      setPwStatus("ok");
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      setTimeout(() => { setPwStatus("idle"); setShowPw(false); }, 2000);
    } catch (err) {
      const msg = err && typeof err === "object" && "detail" in err
        ? (err as { detail: string }).detail
        : "Не удалось сменить пароль";
      setPwError(msg);
      setPwStatus("error");
    }
  };

  // ── Tokens ──
  const [selectedPack, setSelectedPack] = useState<string>("basic");
  const [payMethod, setPayMethod] = useState<string>("card");

  // ── Promo code redeem ─────────────────────────────────────────────────
  // Тестовый код пользователя — RIFFA2026. По умолчанию подставлен в инпут,
  // активируется один раз на пользователя (бэк хранит PromocodeUsage и не
  // даст повторно).
  const [promoCode, setPromoCode] = useState<string>("RIFFA2026");
  const [promoStatus, setPromoStatus] = useState<
    "idle" | "saving" | "ok" | "error"
  >("idle");
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoTokensGranted, setPromoTokensGranted] = useState<number | null>(
    null,
  );
  const handleRedeemPromo = async () => {
    const value = promoCode.trim().toUpperCase();
    if (!value) {
      setPromoStatus("error");
      setPromoMessage("Введите промокод");
      return;
    }
    setPromoStatus("saving");
    setPromoMessage(null);
    try {
      const resp = await redeemPromo(value);
      setPromoTokensGranted(resp.tokens_granted);
      setPromoStatus("ok");
      setPromoMessage(`+${resp.tokens_granted} ⓡ начислено`);
      // Обновляем баланс везде, где он читается.
      await refreshAuth();
    } catch (err) {
      const detail =
        err && typeof err === "object" && "detail" in err
          ? (err as { detail: string }).detail
          : "Не удалось активировать промокод";
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
      setAvatarError("Файл больше 4 МБ");
      return;
    }
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      await uploadAvatar(file);
      await refreshUser();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось загрузить аватар";
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
    () => [{ value: "all", label: "Любое" }, ...allMoods.map((m) => ({ value: m, label: m }))],
    [allMoods],
  );
  const genreOptions = useMemo<SelectOption[]>(
    () => [{ value: "all", label: "Любой" }, ...allGenres.map((g) => ({ value: g, label: g }))],
    [allGenres],
  );
  const sortOptions: SelectOption[] = [
    { value: "newest", label: "Сначала новые" },
    { value: "oldest", label: "Сначала старые" },
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
      meta: `${TYPE_LABELS[f.type]} · ${f.genre} · ${f.mood}`,
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
  const [reviews, setReviews] = useState<Review[]>([...SEED_REVIEWS]);
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
  const referralLink = `https://riffa.studio/r/${referralCode}`;
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

  // ── Stats (computed from real library data) ──
  const genStats: GenStats[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of libraryItems) counts.set(it.type, (counts.get(it.type) ?? 0) + 1);
    return STAT_META.map((m) => ({ ...m, count: counts.get(m.type) ?? 0 }));
  }, [libraryItems]);

  const genreStats = useMemo(() => countBy(libraryItems, (i) => i.genre), [libraryItems]);
  const moodStats = useMemo(() => countBy(libraryItems, (i) => i.mood), [libraryItems]);

  const totalGens = genStats.reduce((acc, s) => acc + s.count, 0);
  const maxStat = Math.max(1, ...genStats.map((s) => s.count));

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
            title="Загрузить аватар"
            aria-label="Загрузить аватар"
            disabled={avatarUploading}
          >
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" />
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
                <button type="submit" className="name-edit-btn name-edit-btn--ok" disabled={nameSaving} aria-label="Сохранить">✓</button>
                <button type="button" className="name-edit-btn name-edit-btn--cancel" onClick={() => { setEditingName(false); setNameInput(displayName); }} aria-label="Отмена">✕</button>
              </form>
            ) : (
              <h1 className="user-info__name user-info__name--editable" onClick={() => { setNameInput(displayName); setEditingName(true); }}>
                {displayName}
                <span className="name-edit-icon" aria-hidden>✏</span>
              </h1>
            )}
            <div className="user-info__meta">
              {userEmail} · {joinDate}
              {!user && <span className="profile-hero__demo"> · демо-данные</span>}
            </div>
          </div>

          {/* Действия в шапке: смена пароля и корзина */}
          <div className="user-info__actions">
            <button
              type="button"
              className={`pw-toggle pw-toggle--trash${trashOpen ? " pw-toggle--open" : ""}`}
              onClick={() => setTrashOpen(true)}
              title="Корзина"
              aria-label="Открыть корзину"
            >
              🗑 Корзина
            </button>
          {user?.email && (
            <div className="user-info__pw-wrap">
              <button
                type="button"
                className={`pw-toggle${showPw ? " pw-toggle--open" : ""}`}
                onClick={() => { setShowPw((v) => !v); setPwError(null); }}
              >
                🔑 {showPw ? "Скрыть" : "Сменить пароль"}
              </button>

              {showPw && (
                <form className="hero-pw-form" onSubmit={handleChangePassword}>
                  <input
                    type="password"
                    placeholder="Текущий пароль"
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    disabled={pwStatus === "saving"}
                    required
                    autoComplete="current-password"
                  />
                  <input
                    type="password"
                    placeholder="Новый пароль"
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    disabled={pwStatus === "saving"}
                    required
                    autoComplete="new-password"
                  />
                  <input
                    type="password"
                    placeholder="Повторите пароль"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    disabled={pwStatus === "saving"}
                    required
                    autoComplete="new-password"
                  />
                  {pwError && <p className="hero-pw-form__msg hero-pw-form__msg--error">{pwError}</p>}
                  {pwStatus === "ok" && <p className="hero-pw-form__msg hero-pw-form__msg--ok">✓ Пароль изменён</p>}
                  <button type="submit" className="btn btn--primary" disabled={pwStatus === "saving" || !pwCurrent || !pwNew || !pwConfirm}>
                    {pwStatus === "saving" ? "Сохраняем…" : "Сохранить"}
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
                  <h3>🗑 Корзина</h3>
                  <p className="muted">
                    Файлы хранятся 7 дней и автоматически очищаются раз в неделю.
                    Можно очистить корзину вручную.
                  </p>
                </div>
                <button
                  type="button"
                  className="trash-modal__close"
                  onClick={() => setTrashOpen(false)}
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </header>
              <div className="trash-modal__list">
                {trashQuery.isLoading && (
                  <p className="muted">Загружаем корзину…</p>
                )}
                {!trashQuery.isLoading && (trashQuery.data?.items ?? []).length === 0 && (
                  <p className="muted">
                    Корзина пуста — удалённые файлы появятся здесь.
                  </p>
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
                            ? ` · ${new Date(it.deleted_at).toLocaleDateString("ru")}`
                            : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="filter-chip"
                        title="Восстановить"
                        onClick={() => restoreFileMutation.mutate(it.id)}
                        disabled={restoring}
                      >
                        {restoring ? "…" : "↩ Восстановить"}
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
                  {purgeTrashMutation.isPending ? "Очищаю…" : "Очистить корзину"}
                </button>
                <span className="muted">
                  Авто-очистка: раз в 7 дней
                </span>
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
            <h2 className="profile-card__title">Баланс</h2>
          </div>
          <div className="balance-display">
            <p className="balance-display__amount">
              {userBalance}
              <Coin size={32} className="riffa-coin--lg riffa-coin--after" />
            </p>
            <div className="balance-display__label">доступно к использованию</div>
            <div className="balance-display__conversions">
              <span>≈ {Math.floor(userBalance / 2)} песен</span>
              <span>≈ {Math.floor(userBalance / 0.5)} SFX</span>
              <span>≈ {Math.floor(userBalance / 1)} обложек</span>
            </div>
          </div>

          <div className="token-packages">
            {TOKEN_PACKAGES.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`token-pack${selectedPack === p.id ? " token-pack--active" : ""}`}
                onClick={() => setSelectedPack(p.id)}
              >
                {p.discount !== undefined && (
                  <span className="token-pack__badge">Выгода {p.discount}%</span>
                )}
                <span className="token-pack__name">{p.name}</span>
                <strong className="token-pack__amount">
                  {p.tokens}
                  <Coin size={18} className="riffa-coin--after" />
                </strong>
                <span className="token-pack__gens">{Math.floor(p.tokens / 2)} песен · {Math.floor(p.tokens / 0.5)} SFX · {p.tokens} обложек</span>
                <div className="token-pack__price">
                  <span className="token-pack__price-label">Цена:</span>
                  <span className="token-pack__price-value">{p.priceRub}₽</span>
                </div>
              </button>
            ))}
          </div>

          <div className="payment-methods">
            <span className="payment-methods__label">Способ оплаты</span>
            <div className="payment-methods__grid">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`pay-method${payMethod === m.id ? " pay-method--active" : ""}`}
                  onClick={() => setPayMethod(m.id)}
                  disabled={m.id === "crypto"}
                >
                  <strong>{m.label}</strong>
                  <small>{m.hint}</small>
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="btn btn--primary btn--wide">
            Купить пакет
          </button>

          {/* ─── Промокод ─── */}
          <div className="promo-redeem">
            <label className="promo-redeem__label" htmlFor="promo-input">
              Есть промокод?
            </label>
            <div className="promo-redeem__row">
              <input
                id="promo-input"
                type="text"
                className="promo-redeem__input"
                placeholder="RIFFA2026"
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
                className="btn btn--secondary promo-redeem__btn"
                onClick={handleRedeemPromo}
                disabled={promoStatus === "saving" || !promoCode.trim()}
              >
                {promoStatus === "saving" ? "..." : "Активировать"}
              </button>
            </div>
            {promoMessage && (
              <div
                className={`promo-redeem__msg promo-redeem__msg--${
                  promoStatus === "ok" ? "ok" : "err"
                }`}
                role={promoStatus === "ok" ? "status" : "alert"}
              >
                {promoMessage}
                {promoStatus === "ok" && promoTokensGranted != null
                  ? ""
                  : null}
              </div>
            )}
          </div>
        </section>

        {/* ─── Файлы ─── */}
        <section className="profile-card profile-card--files">
          <div className="profile-card__header">
            <Icon name="📁" />
            <h2 className="profile-card__title">Мои файлы</h2>
            <span className="profile-card__meta">{filteredFiles.length} из {libraryItems.length}</span>
          </div>

          {/* Тип файла — чипы */}
          <div className="file-type-chips">
            {(["all", "song", "instrumental", "cover", "sfx", "cover_art"] as Array<"all" | LibraryItemType>).map((t) => (
              <button
                key={t}
                type="button"
                className={`filter-chip${filterType === t ? " filter-chip--active" : ""}`}
                onClick={() => setFilterType(t)}
              >
                {t === "all" ? "Все" : TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          {/* Настроение / Жанр / Сортировка — кастомный брендированный дропдаун */}
          <div className="file-filters">
            <div className="file-filters__label">
              <span className="file-filters__label-text">Настроение</span>
              <FilterSelect options={moodOptions} value={filterMood} onChange={setFilterMood} />
            </div>
            <div className="file-filters__label">
              <span className="file-filters__label-text">Жанр</span>
              <FilterSelect options={genreOptions} value={filterGenre} onChange={setFilterGenre} />
            </div>
            <div className="file-filters__label">
              <span className="file-filters__label-text">Сортировка</span>
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
                <div className="empty-state__text">Войди в аккаунт, чтобы увидеть свои файлы.</div>
              </div>
            ) : filesLoading ? (
              <div className="empty-state">
                <div className="empty-state__icon">⏳</div>
                <div className="empty-state__text">Загружаем библиотеку…</div>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon">📂</div>
                <div className="empty-state__text">
                  {libraryItems.length === 0
                    ? "Здесь появятся ваши генерации после первого запуска."
                    : "Под фильтр ничего не попало"}
                </div>
              </div>
            ) : (
              filteredFiles.map((f) => {
                const isActive = currentId === f.id;
                const canRadio = RADIO_TYPES.has(f.type) && f.isOwn;
                const canBolt = MUSIC_TYPES.has(f.type);
                const radioPending =
                  radioMutation.isPending && radioMutation.variables?.itemId === f.id;
                return (
                  <div
                    key={f.id}
                    role="button"
                    tabIndex={0}
                    className={`file-item${isActive ? " file-item--active" : ""}`}
                    onClick={() => handlePlayItem(f)}
                    onKeyDown={(e) => e.key === "Enter" && handlePlayItem(f)}
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
                        title="Открыть в полноэкранном режиме"
                      >
                        <img src={f.coverUrl} alt="" loading="lazy" />
                      </span>
                    ) : (
                      <span className="file-item__icon" aria-hidden>{TYPE_ICONS[f.type]}</span>
                    )}
                    <div className="file-item__info">
                      <span className="file-item__title">{f.title}</span>
                      <span className="file-item__meta">
                        {TYPE_LABELS[f.type]} · {f.genre} · {f.mood} · {f.duration}
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
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ─── Статистика + Любимые стили ─── */}
        <section className="profile-card profile-card--insights">
          <div className="insights-grid">
            <div>
              <div className="profile-card__header">
                <Icon name="📊" />
                <h2 className="profile-card__title">Статистика</h2>
              </div>
              <div className="stat-summary">
                <strong>{totalGens}</strong>
                <span>генераций всего</span>
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
                        style={{
                          width: `${(s.count / maxStat) * 100}%`,
                          background: s.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="profile-card__header">
                <Icon name="🎨" />
                <h2 className="profile-card__title">Любимые стили</h2>
              </div>

              <div className="taste-group">
                <h3 className="taste-group__title">Жанры</h3>
                <div className="taste-chips">
                  {genreStats.map((g) => (
                    <span key={g.name} className="taste-chip">
                      {g.name}
                      <small>{g.count}</small>
                    </span>
                  ))}
                </div>
              </div>

              <div className="taste-group">
                <h3 className="taste-group__title">Настроение</h3>
                <div className="taste-chips">
                  {moodStats.map((m) => (
                    <span key={m.name} className="taste-chip">
                      {m.name}
                      <small>{m.count}</small>
                    </span>
                  ))}
                </div>
              </div>


            </div>
          </div>
        </section>

        {/* ─── Документы ─── */}
        <section className="profile-card profile-card--docs">
          <div className="profile-card__header">
            <Icon name="📄" />
            <h2 className="profile-card__title">Документы</h2>
          </div>
          <ul className="docs-list">
            {MOCK_DOCS.map((d) => (
              <li key={d.id}>
                <a href={d.href} className="doc-row">
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
            <h2 className="profile-card__title">Отзывы</h2>
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
                  aria-label={`${n} звёзд`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Поделись впечатлением — что понравилось, что можно улучшить"
            />
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!reviewText.trim()}
            >
              Оставить отзыв
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
            <h2 className="profile-card__title">Реферальная программа</h2>
          </div>

          <div className="referral-stats">
            <div className="referral-stat">
              <strong>0</strong>
              <span>приглашено</span>
            </div>
            <div className="referral-stat">
              <strong className="referral-stat__amount">
                0
                <Coin size={18} className="riffa-coin--after" />
              </strong>
              <span>бонусных на баланс</span>
            </div>
            <div className="referral-stat">
              <strong>15%</strong>
              <span>от оплат рефералов</span>
            </div>
          </div>

          <div className="referral-perks">
            <h3>Как работает</h3>
            <ul>
              <li>60 <Coin /> другу — 60 <Coin /> тебе при первой его оплате.</li>
              <li>+15% от каждой его покупки пакета <Coin />.</li>
              <li>Если друг оформит подписку — 300 <Coin /> в подарок.</li>
            </ul>
          </div>

          <div className="referral-link">
            <span className="referral-link__text">{referralLink}</span>
            <button type="button" className="referral-link__copy" onClick={copyReferral}>
              {copied ? "Скопировано" : "Копировать"}
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
