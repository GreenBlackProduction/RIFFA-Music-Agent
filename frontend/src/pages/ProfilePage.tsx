import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  changePassword,
  createRobokassaLink,
  createStarsInvoice,
  fetchReviews,
  postReview,
  type ReviewItem,
  fetchTrash,
  purgeTrash,
  redeemPromo,
  restoreGeneration,
  updateDisplayName,
  updateNotifications,
  uploadAvatar,
  type PackageCode,
} from "@/lib/api/client";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/lib/auth";
import {
  HISTORY_QUERY_KEY,
  primaryGenre,
  TYPE_LABELS,
  useLibraryItems,
} from "@/lib/library";

import { Coin } from "@/components/ui/Coin";
import "./ProfilePage.css";

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const IconPencil = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

// ─────────── Токен-пакеты и способы оплаты ────────────

interface TokenPackage {
  id: string;
  name: string;
  tokens: number;
  gens: number;
  priceRub: number;
  /** Цена в Telegram Stars (только для premium). */
  starsPrice?: number;
  /** Процент выгоды по сравнению со стартовым пакетом. */
  discount?: number;
}

const TOKEN_PACKAGES: readonly TokenPackage[] = [
  { id: "starter", name: "Стартовый",   tokens: 10,  gens: 5,  priceRub: 100 },
  { id: "basic",   name: "Базовый",      tokens: 25,  gens: 12, priceRub: 200, discount: 20 },
  { id: "pro",     name: "Продвинутый", tokens: 60,  gens: 30, priceRub: 400, discount: 33 },
  { id: "premium", name: "Премиум",     tokens: 150, gens: 75, priceRub: 999, starsPrice: 620, discount: 40 },
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

const PROFILE_DOCS: readonly { id: string; title: string; hint: string; href: string }[] = [
  { id: "offer", title: "Пользовательское соглашение", hint: "Публичная оферта", href: "/docs/offer.txt" },
  { id: "privacy", title: "Политика конфиденциальности", hint: "Как храним и обрабатываем данные", href: "/docs/privacy.txt" },
  { id: "copyright", title: "Лицензия на треки", hint: "Авторские права и использование", href: "/docs/copyright.txt" },
  { id: "refund", title: "Политика возврата", hint: "Условия возврата средств", href: "/docs/refund.txt" },
];

// ─────────── ProfilePage ────────────

export function ProfilePage() {
  const { user, refresh: refreshAuth } = useAuth();
  const { t, i18n: i18nClient } = useTranslation();
  const i18nLang = i18nClient.resolvedLanguage || i18nClient.language || "ru";
  const isEN = i18nLang.startsWith("en");
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

  // ── Reviews (at the very bottom of the profile) ──
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewText, setReviewText] = useState<string>("");
  const [reviewPending, setReviewPending] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSent, setReviewSent] = useState(false);
  useEffect(() => {
    fetchReviews(20).then(({ items }) => setReviews(items)).catch(() => undefined);
  }, []);
  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = reviewText.trim();
    if (!text || reviewPending) return;
    setReviewPending(true);
    setReviewError(null);
    try {
      const fresh = await postReview(reviewRating, text);
      setReviews((prev) => [fresh, ...prev]);
      setReviewText("");
      setReviewRating(5);
      setReviewSent(true);
      setTimeout(() => setReviewSent(false), 2500);
    } catch (err) {
      const msg = (err as { detail?: string })?.detail ?? t("common.error");
      setReviewError(msg);
    } finally {
      setReviewPending(false);
    }
  };

  // ── Tokens ──
  const [selectedPack, setSelectedPack] = useState<string>("basic");
  const [payMethod, setPayMethod] = useState<string>("card");
  const [payStatus, setPayStatus] = useState<"idle" | "loading" | "error">("idle");
  const [payError, setPayError] = useState<string | null>(null);

  // ── Generation-ready notifications toggle (site-controlled).
  // Morning broadcast lives in the bot — not toggled from here.
  const [notifyOn, setNotifyOn] = useState<boolean>(user?.generation_notifications_enabled ?? true);
  const [notifyPending, setNotifyPending] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  useEffect(() => {
    if (user) setNotifyOn(user.generation_notifications_enabled);
  }, [user?.generation_notifications_enabled]);

  const handleToggleNotifications = async (next: boolean) => {
    if (notifyPending) return;
    setNotifyPending(true);
    setNotifyError(null);
    const prev = notifyOn;
    setNotifyOn(next); // optimistic
    try {
      await updateNotifications(next);
      await refreshAuth();
    } catch {
      setNotifyOn(prev);
      setNotifyError(isEN ? "Failed to save. Try again." : "Не удалось сохранить. Попробуйте ещё раз.");
    } finally {
      setNotifyPending(false);
    }
  };

  const handleBuyPack = async (pickedId?: string) => {
    // Align frontend pack ids with backend ("pro" on frontend → "advanced" on backend)
    const packMap: Record<string, PackageCode> = {
      starter: "starter", basic: "basic", pro: "advanced", premium: "premium",
    };
    // Read the pack id from the click site directly. The button's onClick
    // calls setSelectedPack + handleBuyPack on the same tick — but setState
    // is async, so handleBuyPack would otherwise see the *previous*
    // selectedPack from its closure and ship the wrong package_code
    // (visible bug: tap "Premium 999₽" → Robokassa shows 200₽).
    const effective = pickedId ?? selectedPack;
    const backendPack: PackageCode = packMap[effective] ?? "basic";
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

  const queryClient = useQueryClient();
  const { items: libraryItems } = useLibraryItems();

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
    const keys = new Set<string>();
    for (const it of libraryItems) {
      const g = primaryGenre(it.genre);
      if (g) keys.add(g.toLowerCase());
    }
    return keys.size;
  }, [libraryItems]);

  // Aggregate by PRIMARY style (case-insensitive) so one chip = one real genre
  // the user generates in, with its track count — not a multi-genre permutation.
  const topGenres = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const it of libraryItems) {
      const g = primaryGenre(it.genre);
      if (!g) continue;
      const key = g.toLowerCase();
      const cur = counts.get(key);
      if (cur) cur.count += 1;
      else counts.set(key, { label: g, count: 1 });
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
      .map((e) => [e.label, e.count] as [string, number]);
  }, [libraryItems]);

  const topMoods = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of libraryItems) {
      if (it.mood) counts[it.mood] = (counts[it.mood] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [libraryItems]);

  // Genre chips collapse on mobile when they'd fill too much space. Show a
  // capped set by default + a toggle; desktop has room so the cap is higher
  // (CSS enlarges the field there). 5 collapsed is one tidy row on a phone.
  const [genresExpanded, setGenresExpanded] = useState(false);
  const GENRES_COLLAPSED = 5;
  const visibleGenres = genresExpanded ? topGenres : topGenres.slice(0, GENRES_COLLAPSED);
  const hiddenGenreCount = topGenres.length - visibleGenres.length;

  return (
    <div className="profile">
      {/* top-meta */}
      <div className="top-meta">
        <div className="breadcrumb">
          <b>{isEN ? "profile" : "профиль"}</b>
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
                <button type="button" className="btn btn-ink btn-sm" onClick={handleSaveName} disabled={nameSaving} aria-label="save"><IconCheck /></button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditingName(false); setNameInput(displayName); }} aria-label="cancel"><IconClose /></button>
              </div>
            ) : (
              <span className="name-inline" onClick={() => { setNameInput(displayName); setEditingName(true); }}>
                {displayName} <span className="name-inline__edit"><IconPencil /></span>
              </span>
            )}
          </div>
          <div className="email">{userEmail || (isEN ? "not logged in" : "не авторизован")}</div>
          <button type="button" className="btn btn-soft btn-sm" style={{ marginTop: 14 }} onClick={() => avatarInputRef.current?.click()}>
            {isEN ? "change avatar" : "сменить аватар"}
          </button>

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
              <div className="val">{userBalance}<Coin size={16} style={{ marginLeft: 3 }} /></div>
              <div className="delta">{isEN ? "available" : "доступно"}</div>
            </div>
            <div className="stat">
              <div className="label">{isEN ? "total created" : "всего создано"}</div>
              <div className="val">{totalGens}<small>{isEN ? "tr." : "трек."}</small></div>
              <div className="delta">{isEN ? "since registration" : "за всё время"}</div>
            </div>
            <div className="stat">
              <div className="label">{isEN ? "genres" : "жанров"}</div>
              <div className="val">{uniqueGenreCount}</div>
              <div className="delta">{isEN ? "unique" : "уникальных"}</div>
            </div>
            <div className="stat">
              <div className="label">{isEN ? "invited" : "приглашено"}</div>
              <div className="val">0<small>{isEN ? "fr." : "др."}</small></div>
              <div className="delta">+0 <Coin size={11} /> {isEN ? "bonus" : "бонус"}</div>
            </div>
          </div>

          {/* Display-name edit lives only in the avatar block on the left —
              the second field was a duplicate and confused users. */}

          {/* Notifications card — replaces the token-explainer here. The
              explainer was moved to the "buy tokens" section, which is a
              more logical home for it. */}
          <div className="notify-card">
            <div className="notify-card__head">
              <div className="notify-card__heading">
                <div className="notify-card__title">
                  {isEN ? "Generation pings" : "Уведомления о готовности"}
                </div>
                <div className={`notify-card__state${notifyOn ? " notify-card__state--on" : ""}`}>
                  {notifyOn
                    ? (isEN ? "ON" : "ВКЛ")
                    : (isEN ? "OFF" : "ВЫКЛ")}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notifyOn}
                aria-label={isEN ? "Toggle generation notifications" : "Переключить уведомления о готовности"}
                className={`notify-switch${notifyOn ? " notify-switch--on" : ""}`}
                disabled={notifyPending}
                onClick={() => void handleToggleNotifications(!notifyOn)}
              >
                <span className="notify-switch__track">
                  <span className="notify-switch__knob" />
                </span>
              </button>
            </div>
            <p className="notify-card__hint">
              {isEN
                ? "Generation-ready notification."
                : "Уведомление о готовности генерации."}
            </p>
            {notifyError && (
              <p className="notify-card__err">{notifyError}</p>
            )}
          </div>

          {/* Inline gen stats — в пустом пространстве справа */}
          {totalGens > 0 && (
            <div className="inline-gen-stats">
              <div className="inline-gen-stats__row">
                <span className="gen-stats-label">{isEN ? "by type" : "по типу"}</span>
                {genStats.map((s) => (
                  <span key={s.type} className="gen-stats-pill">
                    {s.label}&nbsp;<strong>{s.count}</strong>
                  </span>
                ))}
              </div>
              {topGenres.length > 0 && (
                <div className="inline-gen-stats__row">
                  <span className="gen-stats-label">{isEN ? "genres" : "жанры"}</span>
                  {visibleGenres.map(([genre, count]) => (
                    <span key={genre} className="gen-stats-pill">
                      {genre}&nbsp;<strong>{count}</strong>
                    </span>
                  ))}
                  {(hiddenGenreCount > 0 || genresExpanded) && topGenres.length > GENRES_COLLAPSED && (
                    <button
                      type="button"
                      className="gen-stats-pill gen-stats-pill--toggle"
                      onClick={() => setGenresExpanded((v) => !v)}
                      aria-expanded={genresExpanded}
                    >
                      {genresExpanded
                        ? (isEN ? "− less" : "− свернуть")
                        : `+${hiddenGenreCount}`}
                    </button>
                  )}
                </div>
              )}
              {topMoods.length > 0 && (
                <div className="inline-gen-stats__row">
                  <span className="gen-stats-label">{isEN ? "moods" : "настроения"}</span>
                  {topMoods.slice(0, 4).map(([mood, count]) => (
                    <span key={mood} className="gen-stats-pill">
                      {mood}&nbsp;<strong>{count}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 01 · купить токены ── */}
      <div className="h-section">
        <div className="tag"><span className="num">01</span> · {isEN ? "top up" : "пополнить"}</div>
        <h2>{isEN ? "buy tokens" : "купить токены"}</h2>
        <div className="right">{isEN ? "from ₽100 · card / stars" : "от 100 ₽ · картой / stars"}</div>
      </div>

      {/* Token explainer — moved here from the profile-grid since it
          belongs next to the purchase block. */}
      <div className="token-explainer">
        <span className="token-explainer__icon"><Coin size={20} /></span>
        <div className="token-explainer__text">
          <strong>{isEN ? "What is a token?" : "Что такое токен?"}</strong>
          <span>
            {isEN
              ? <>Internal RIFFA currency. <Coin size={11} /> next to a number = balance. Each generation costs tokens.</>
              : <>Внутренняя валюта RIFFA. <Coin size={11} /> рядом с цифрой = баланс. Каждая генерация списывает токены.</>}
          </span>
        </div>
      </div>

      <div className="pricing">
        {localPackages.map((p) => {
          const isFeatured = p.id === "premium";
          const tokensLine = isEN
            ? <>{p.tokens} <Coin size={14} /> to balance</>
            : <><Coin size={14} /> {p.tokens} на баланс</>;
          const songGens = Math.floor(p.tokens / 2);
          const sfxGens = p.tokens * 2;
          const coverGens = p.tokens;
          const perks = isEN
            ? [
                tokensLine,
                `${songGens} song / instr. / cover gens (${songGens * 2} tracks)`,
                `${sfxGens} sound effect gens`,
                `up to ${coverGens} cover art gens`,
              ]
            : [
                tokensLine,
                `${songGens} ген. песен / инстр. / каверов (${songGens * 2} треков)`,
                `${sfxGens} ген. звуковых эффектов`,
                `до ${coverGens} ген. обложек`,
              ];
          return (
            <div key={p.id} className={`price-tile${isFeatured ? " is-featured" : ""}${selectedPack === p.id ? " is-selected" : ""}`} onClick={() => setSelectedPack(p.id)}>
              <div className="tier">{p.name}{isFeatured ? ` · ${isEN ? "best value" : "лучшее"}` : ""}</div>
              <div className="price">{p.priceRub}<small>₽</small></div>
              {p.starsPrice !== undefined && (
                <div className="price-stars">{isEN ? `or ${p.starsPrice} ★` : `или ${p.starsPrice} ★`}</div>
              )}
              <div className="tokens-meta">{p.tokens} <Coin size={13} /> · ~{Math.floor(p.tokens / 2)} {isEN ? "gens" : "генераций"}</div>
              {p.discount !== undefined && (
                <div className="discount">{isEN ? `save ${p.discount}%` : `выгода ${p.discount}%`}</div>
              )}
              <ul className="perks">
                {perks.map((pk, j) => <li key={j}>{pk}</li>)}
              </ul>
              <button
                type="button"
                className="btn btn-emr btn-block"
                onClick={(e) => { e.stopPropagation(); setSelectedPack(p.id); handleBuyPack(p.id); }}
                disabled={payStatus === "loading"}
              >
                {payStatus === "loading" && selectedPack === p.id ? "..." : (isEN ? "buy →" : "купить →")}
              </button>
            </div>
          );
        })}
      </div>

      <div className="pay-method-row">
        <button className={`pay-method-btn${payMethod === "card" ? " pay-method-btn--active-hi" : ""}`} onClick={() => setPayMethod("card")}>
          <span className="pay-method-btn__label">{isEN ? "Card RF" : "Карта РФ"}</span>
          <span className="pay-method-btn__hint">Robokassa · {isEN ? "instant" : "мгновенно"}</span>
        </button>
        <button className={`pay-method-btn${payMethod === "stars" ? " pay-method-btn--active" : ""}`} onClick={() => setPayMethod("stars")}>
          <span className="pay-method-btn__label">Telegram Stars</span>
          <span className="pay-method-btn__hint">{isEN ? "no fee" : "без комиссии"}</span>
        </button>
        <button className="pay-method-btn pay-method-btn--disabled" disabled>
          <span className="pay-method-btn__label">{isEN ? "Crypto · USDT" : "Крипта · USDT"}</span>
          <span className="pay-method-btn__hint">{isEN ? "coming soon" : "скоро"}</span>
        </button>
      </div>
      {payError && <p style={{ color: "var(--hi)", fontSize: 13, margin: "8px 0 0" }}>{payError}</p>}

      {/* ── 02 · промокод ── */}
      <div className="h-section">
        <div className="tag"><span className="num">02</span> · {isEN ? "promo" : "промокод"}</div>
        <h2>{isEN ? "have a promo code?" : "есть промокод?"}</h2>
        <div className="right">{isEN ? "bonus tokens" : "бонусные токены"}</div>
      </div>

      <div className="promo-row">
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

      <div className="referral-docs-grid">
        {/* ── 03 · реферальная программа ── */}
        <div>
          <div className="h-section">
            <div className="tag"><span className="num">03</span> · {isEN ? "referral" : "реф. программа"}</div>
            <h2>{isEN ? "invite friends" : "приглашай друзей"}</h2>
          </div>
          <div className="p-panel">
            <p style={{ margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)" }}>
              {isEN ? (
                <>
                  Want free tokens for your generations? Invite friends and earn from their
                  purchases. When someone you invited signs up <strong>and buys any token
                  pack</strong>, you get <strong style={{ color: "var(--hi)" }}>+10 tokens</strong>.
                  Your friend gets 3 tokens just for signing up.
                </>
              ) : (
                <>
                  Хочешь бесплатные токены для своих генераций? Приглашай друзей и зарабатывай
                  на их покупках. Когда приглашённый зарегистрируется <strong>и купит любой
                  пакет токенов</strong>, ты получишь <strong style={{ color: "var(--hi)" }}>+10
                  токенов</strong>. Друг получает 3 токена просто за регистрацию.
                </>
              )}
            </p>
            <div className="stats" style={{ border: "none", background: "transparent", marginBottom: 16 }}>
              <div className="stat" style={{ background: "var(--paper-3)" }}>
                <div className="label">{isEN ? "invited" : "приглашено"}</div>
                <div className="val">0<small>{isEN ? "fr." : "др."}</small></div>
              </div>
              <div className="stat" style={{ background: "var(--paper-3)" }}>
                <div className="label">{isEN ? "bonus per purchase" : "бонус за покупку"}</div>
                <div className="val">10<Coin size={13} style={{ marginLeft: 2 }} /></div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0, padding: "10px 14px", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 999, fontFamily: "var(--font-mono)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {referralLink}
              </div>
              <button type="button" className="btn btn-ink btn-sm" onClick={copyReferral}>
                {copied ? t("common.copied") : (isEN ? "copy →" : "скопировать →")}
              </button>
            </div>
          </div>
        </div>

        {/* ── 04 · документы ── */}
        <div>
          <div className="h-section">
            <div className="tag"><span className="num">04</span> · {isEN ? "documents" : "документы"}</div>
            <h2>{isEN ? "legal" : "правовая информация"}</h2>
          </div>
          <div className="doc-list">
            {localLegalDocs.map((d) => (
              <a key={d.id} href={d.href} className="doc-row" target="_blank" rel="noopener noreferrer">
                <div className="icon" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <polyline points="14 3 14 9 20 9" />
                  </svg>
                </div>
                <div>
                  <div className="title">{d.title}</div>
                  <div className="hint">{d.hint}</div>
                </div>
                <span className="chevron">→</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── 05 · Отзывы ── */}
      <div className="h-section">
        <div className="tag"><span className="num">05</span> · {isEN ? "feedback" : "отзывы"}</div>
        <h2>{isEN ? "leave a review" : "оставить отзыв"}</h2>
        <div className="right">{reviews.length} {isEN ? "reviews" : "отзывов"}</div>
      </div>
      <div className="reviews-block">
        {user && (
          <form className="reviews-form" onSubmit={submitReview}>
            <div className="reviews-form__stars" role="radiogroup" aria-label={isEN ? "Rating" : "Оценка"}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  role="radio"
                  aria-checked={n === reviewRating}
                  className={`reviews-star${n <= reviewRating ? " reviews-star--on" : ""}`}
                  onClick={() => setReviewRating(n)}
                  disabled={reviewPending}
                  aria-label={`${n}`}
                >
                  ★
                </button>
              ))}
              <span className="reviews-form__rating-label">
                {reviewRating}/5
              </span>
            </div>
            <textarea
              className="reviews-form__text"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={isEN
                ? "Share your impression — what worked, what didn't"
                : "Поделись впечатлением — что понравилось, что можно улучшить"}
              disabled={reviewPending}
            />
            <div className="reviews-form__actions">
              <button
                type="submit"
                className="btn btn-ink btn-sm"
                disabled={reviewPending || !reviewText.trim()}
              >
                {reviewPending
                  ? (isEN ? "Sending…" : "Отправляю…")
                  : (isEN ? "Post review" : "Оставить отзыв")}
              </button>
              {reviewSent && (
                <span className="reviews-form__ok">
                  {isEN ? "Thanks — your review is published." : "Спасибо — отзыв опубликован."}
                </span>
              )}
              {reviewError && (
                <span className="reviews-form__err">{reviewError}</span>
              )}
            </div>
          </form>
        )}
        {!user && (
          <p className="muted reviews-block__login">
            {isEN
              ? "Sign in to leave a review."
              : "Войдите в аккаунт чтобы оставить отзыв."}
          </p>
        )}
        <div className="reviews-list">
          {reviews.length === 0 && (
            <p className="muted reviews-list__empty">
              {isEN ? "No reviews yet — be the first." : "Пока нет отзывов — стань первым."}
            </p>
          )}
          {reviews.map((r) => {
            const date = new Date(r.created_at);
            const dateLabel = isFinite(date.getTime())
              ? date.toLocaleDateString(isEN ? "en-US" : "ru-RU", { day: "numeric", month: "long", year: "numeric" })
              : "";
            return (
              <article key={r.id} className="reviews-item">
                <header className="reviews-item__head">
                  <strong className="reviews-item__author">{r.author}</strong>
                  <span className="reviews-item__rating" aria-label={`${r.rating}/5`}>
                    {"★".repeat(r.rating)}<span className="reviews-item__rating-dim">{"★".repeat(5 - r.rating)}</span>
                  </span>
                  <span className="reviews-item__date">{dateLabel}</span>
                </header>
                <p className="reviews-item__text">{r.text}</p>
              </article>
            );
          })}
        </div>
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
                <button type="button" className="trash-modal__close" onClick={() => setTrashOpen(false)} aria-label={t("profile.trashCloseAria")}><IconClose /></button>
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

    </div>
  );
}
