import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  changePassword,
  createRobokassaLink,
  createStarsInvoice,
  fetchTrash,
  purgeTrash,
  redeemPromo,
  restoreGeneration,
  updateDisplayName,
  uploadAvatar,
  type PackageCode,
} from "@/lib/api/client";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/lib/auth";
import {
  HISTORY_QUERY_KEY,
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
    return new Set(libraryItems.map((f) => f.genre).filter(Boolean)).size;
  }, [libraryItems]);

  const topGenres = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of libraryItems) {
      if (it.genre) counts[it.genre] = (counts[it.genre] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [libraryItems]);

  const topMoods = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of libraryItems) {
      if (it.mood) counts[it.mood] = (counts[it.mood] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [libraryItems]);

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
              <div className="val">{userBalance}<Coin size={16} style={{ marginLeft: 3 }} /></div>
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
              <div className="delta">+0 <Coin size={11} /> {isEN ? "bonus" : "бонус"}</div>
            </div>
          </div>

          {/* display name field */}
          <div className="field">
            <label>{isEN ? "display name" : "имя для отображения"}</label>
            {editingName ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} disabled={nameSaving} maxLength={64} onKeyDown={(e) => e.key === "Escape" && setEditingName(false)} autoFocus />
                <button type="button" className="btn btn-ink btn-sm" onClick={handleSaveName} disabled={nameSaving} aria-label="save"><IconCheck /></button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditingName(false); setNameInput(displayName); }} aria-label="cancel"><IconClose /></button>
              </div>
            ) : (
              <input type="text" value={displayName} readOnly onClick={() => { setNameInput(displayName); setEditingName(true); }} />
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
                  {topGenres.slice(0, 4).map(([genre, count]) => (
                    <span key={genre} className="gen-stats-pill">
                      {genre}&nbsp;<strong>{count}</strong>
                    </span>
                  ))}
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

      {/* Token icon explainer */}
      <div className="token-explainer">
        <span className="token-explainer__icon"><Coin size={28} /></span>
        <div className="token-explainer__text">
          <strong>{isEN ? "What is a token?" : "Что такое токен?"}</strong>
          <span>
            {isEN
              ? <>This icon <Coin size={11} /> means a RIFFA token — the universal currency of the studio. The number next to it shows how many tokens you have. Generations consume tokens.</>
              : <>Эта иконка <Coin size={11} /> — токен RIFFA, универсальная валюта студии. Цифра рядом показывает их количество. Генерации списывают токены.</>}
          </span>
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
          const isFeatured = p.id === "premium";
          const tokensLine = isEN
            ? <>{p.tokens} <Coin size={12} /> to balance</>
            : <><Coin size={12} /> {p.tokens} на баланс</>;
          const perks = isEN
            ? [tokensLine, `${Math.floor(p.tokens / 2)} songs`, `WAV export`, `priority queue`]
            : [tokensLine, `${Math.floor(p.tokens / 2)} песен с вокалом`, `экспорт в WAV`, `приоритет очереди`];
          return (
            <div key={p.id} className={`price-tile${isFeatured ? " is-featured" : ""}${selectedPack === p.id ? " is-selected" : ""}`} onClick={() => setSelectedPack(p.id)}>
              <div className="tier">{p.name}{isFeatured ? ` · ${isEN ? "best value" : "лучшее"}` : ""}</div>
              <div className="price">{p.priceRub}<small>₽</small></div>
              {p.starsPrice !== undefined && (
                <div className="price-stars">{isEN ? `or ${p.starsPrice} ★` : `или ${p.starsPrice} ★`}</div>
              )}
              <div className="tokens-meta">{p.tokens} <Coin size={11} /> · ~{Math.floor(p.tokens / 2)} {isEN ? "tracks" : "треков"}</div>
              {p.discount !== undefined && (
                <div className="discount">{isEN ? `save ${p.discount}%` : `выгода ${p.discount}%`}</div>
              )}
              <ul className="perks">
                {perks.map((pk, j) => <li key={j}>{pk}</li>)}
              </ul>
              <button
                type="button"
                className="btn btn-emr btn-block"
                onClick={(e) => { e.stopPropagation(); setSelectedPack(p.id); handleBuyPack(); }}
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

      <div className="referral-docs-grid">
        {/* ── 03 · реферальная программа ── */}
        <div>
          <div className="h-section">
            <div className="tag"><span className="num">03</span> · {isEN ? "referral" : "реф. программа"}</div>
            <h2>{isEN ? "invite friends" : "приглашай друзей"}</h2>
          </div>
          <div className="p-panel">
            <div className="stats" style={{ border: "none", background: "transparent", marginBottom: 16 }}>
              <div className="stat" style={{ background: "var(--paper-3)" }}>
                <div className="label">{isEN ? "invited" : "приглашено"}</div>
                <div className="val">0<small>{isEN ? "fr." : "др."}</small></div>
              </div>
              <div className="stat" style={{ background: "var(--paper-3)" }}>
                <div className="label">{isEN ? "bonus tokens" : "бонусных токенов"}</div>
                <div className="val">0<Coin size={13} style={{ marginLeft: 2 }} /></div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
