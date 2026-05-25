import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ActiveGenerations } from "@/components/layout/ActiveGenerations";
import { Coin } from "@/components/ui/Coin";
import { RiffaMark } from "@/components/brand/RiffaMark";
import { useAuth } from "@/lib/auth";

import "./Sidebar.css";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const TELEGRAM_BOT_URL = "https://t.me/The_Riffa_bot";

const IconStudio = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M5 7l3 2 3-2M5 10l3 2 3-2" />
  </svg>
);
const IconRadio = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="8" r="2" />
    <path d="M4.5 4.5a5 5 0 0 0 0 7M11.5 4.5a5 5 0 0 1 0 7M2 2a8 8 0 0 0 0 12M14 2a8 8 0 0 1 0 12" />
  </svg>
);
const IconProfile = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="5.5" r="2.5" />
    <path d="M3 13c0-2.8 2.2-5 5-5s5 2.2 5 5" />
  </svg>
);
const IconAdmin = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <path d="M5 6h6M5 8h4M5 10h6" />
  </svg>
);

function TelegramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="tg-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#37bbfe" />
          <stop offset="1" stopColor="#007dbb" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="12" fill="url(#tg-grad)" />
      <path
        d="M5.4 11.7l12.1-4.7c.6-.2 1.1.1.9.8l-2 9.6c-.1.6-.5.8-1.1.5l-3.3-2.4-1.6 1.5c-.2.2-.3.3-.6.3l.2-3 5.5-5c.2-.2 0-.3-.3-.1l-6.8 4.3-2.9-.9c-.6-.2-.6-.6.2-.9z"
        fill="#fff"
      />
    </svg>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.resolvedLanguage || i18n.language || "ru").startsWith("en") ? "en" : "ru";
  const switchLang = (lng: "ru" | "en") => {
    if (lng !== currentLang) void i18n.changeLanguage(lng);
  };

  const navItems = [
    { to: "/studio",  icon: <IconStudio />,  label: t("sidebar.studio") },
    { to: "/radio",   icon: <IconRadio />,   label: t("sidebar.radio") },
    { to: "/profile", icon: <IconProfile />, label: t("sidebar.profile") },
  ];

  const handleSignOut = async () => {
    await signOut();
    onClose();
    navigate("/login");
  };

  return (
    <aside className={`sidebar${open ? " sidebar--open" : ""}`}>
      <NavLink to="/studio" className="brand" onClick={onClose}>
        <RiffaMark size={26} />
        <strong className="brand-name">RIFFA</strong>
        <span className="brand-name__sub">studio</span>
      </NavLink>

      <div className="nav-section">секции</div>
      <nav className="nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? " nav-item--active" : ""}`}
            onClick={onClose}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        {user?.is_admin && (
          <NavLink
            to="/admin"
            className={({ isActive }) => `nav-item${isActive ? " nav-item--active" : ""}`}
            onClick={onClose}
          >
            <span className="nav-icon"><IconAdmin /></span>
            {t("sidebar.admin")}
          </NavLink>
        )}
      </nav>

      <ActiveGenerations />

      <div className="sidebar-card">
        {isLoading ? (
          <>
            <span>{t("sidebar.balance")}</span>
            <strong>…</strong>
            <small>{t("common.loading")}</small>
          </>
        ) : user ? (
          <>
            <div className="sidebar-user">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.display_name}
                  className="sidebar-avatar"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.style.display = "none";
                    const placeholder = img.parentElement?.querySelector<HTMLElement>(
                      ".sidebar-avatar--placeholder-fallback",
                    );
                    if (placeholder) placeholder.style.display = "flex";
                  }}
                />
              ) : null}
              <div
                className="sidebar-avatar sidebar-avatar--placeholder sidebar-avatar--placeholder-fallback"
                style={{ display: user.avatar_url ? "none" : "flex" }}
              >
                {user.display_name.slice(0, 1).toUpperCase()}
              </div>
              <div className="sidebar-user__info">
                <strong>{user.display_name}</strong>
              </div>
              <div
                className="sidebar-lang-switch sidebar-lang-switch--inline"
                role="group"
                aria-label={t("sidebar.language")}
              >
                <button
                  type="button"
                  className={`sidebar-lang-btn${currentLang === "ru" ? " sidebar-lang-btn--on" : ""}`}
                  onClick={() => switchLang("ru")}
                  aria-pressed={currentLang === "ru"}
                >
                  RU
                </button>
                <button
                  type="button"
                  className={`sidebar-lang-btn${currentLang === "en" ? " sidebar-lang-btn--on" : ""}`}
                  onClick={() => switchLang("en")}
                  aria-pressed={currentLang === "en"}
                >
                  EN
                </button>
              </div>
            </div>
            <div className="sidebar-card__balance-row">
              <span>{t("sidebar.balance")}</span>
              <strong className="sidebar-balance">
                {user.balance_tokens}
                <Coin size={20} className="riffa-coin--after" title="RIFFA" />
              </strong>
            </div>
            <div className="sidebar-actions">
              <button
                type="button"
                className="sidebar-link"
                onClick={handleSignOut}
              >
                {t("sidebar.logout")}
              </button>
              <a
                className="sidebar-tg"
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noreferrer"
                title={t("sidebar.openTelegram")}
                aria-label={t("sidebar.openTelegram")}
              >
                <TelegramIcon />
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="sidebar-user">
              <div className="sidebar-user__info">
                <strong>{t("sidebar.guest")}</strong>
              </div>
              <div
                className="sidebar-lang-switch sidebar-lang-switch--inline"
                role="group"
                aria-label={t("sidebar.language")}
              >
                <button
                  type="button"
                  className={`sidebar-lang-btn${currentLang === "ru" ? " sidebar-lang-btn--on" : ""}`}
                  onClick={() => switchLang("ru")}
                  aria-pressed={currentLang === "ru"}
                >
                  RU
                </button>
                <button
                  type="button"
                  className={`sidebar-lang-btn${currentLang === "en" ? " sidebar-lang-btn--on" : ""}`}
                  onClick={() => switchLang("en")}
                  aria-pressed={currentLang === "en"}
                >
                  EN
                </button>
              </div>
            </div>
            <strong className="sidebar-balance">
              —
              <Coin size={20} className="riffa-coin--after" title="RIFFA" />
            </strong>
            <div className="sidebar-actions">
              <NavLink to="/login" className="sidebar-cta" onClick={onClose}>
                {t("sidebar.login")}
              </NavLink>
              <a
                className="sidebar-tg"
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noreferrer"
                title={t("sidebar.openTelegram")}
                aria-label={t("sidebar.openTelegram")}
              >
                <TelegramIcon />
              </a>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
