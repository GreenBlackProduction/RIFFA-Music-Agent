import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ActiveGenerations } from "@/components/layout/ActiveGenerations";
import { RiffaMark } from "@/components/brand/RiffaMark";
import { useAuth } from "@/lib/auth";

import "./Sidebar.css";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

/* ── Icons ─────────────────────────────────────────────────────────
   All 16×16, stroke-based, no emoji, no icon libraries.
   ─────────────────────────────────────────────────────────────── */

const IconAgent = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="5" width="12" height="8" rx="1" />
    <circle cx="5.5" cy="9" r="1" />
    <circle cx="10.5" cy="9" r="1" />
    <path d="M6 12.5h4" />
    <path d="M8 5V3" />
    <path d="M6 3h4" />
  </svg>
);

const IconStudio = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="4" y1="2" x2="4" y2="14" />
    <line x1="8" y1="2" x2="8" y2="14" />
    <line x1="12" y1="2" x2="12" y2="14" />
    <rect x="2.5" y="9.5" width="3" height="2" rx="0.5" />
    <rect x="6.5" y="5" width="3" height="2" rx="0.5" />
    <rect x="10.5" y="7" width="3" height="2" rx="0.5" />
  </svg>
);

const IconRadio = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="9" r="2" />
    <path d="M4.5 5.5a5 5 0 0 0 0 7" />
    <path d="M11.5 5.5a5 5 0 0 1 0 7" />
    <path d="M8 9V4" />
    <path d="M6 2l2 2 2-2" />
  </svg>
);

const IconLibrary = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z" />
    <line x1="5" y1="9" x2="11" y2="9" />
    <line x1="5" y1="11" x2="8.5" y2="11" />
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
    <line x1="5" y1="6" x2="11" y2="6" />
    <line x1="5" y1="8.5" x2="9" y2="8.5" />
    <line x1="5" y1="11" x2="11" y2="11" />
  </svg>
);

const IconGuide = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3C5 3 3 4 3 4v9s2-1 5-1 5 1 5 1V4s-2-1-5-1z" />
    <line x1="8" y1="3" x2="8" y2="12" />
  </svg>
);

const IconSignOut = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3" />
    <path d="M10 5l3 3-3 3" />
    <line x1="13" y1="8" x2="6" y2="8" />
  </svg>
);

/* ── Component ─────────────────────────────────────────────────── */

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.resolvedLanguage || i18n.language || "ru").startsWith("en") ? "en" : "ru";
  const switchLang = (lng: "ru" | "en") => {
    if (lng !== currentLang) void i18n.changeLanguage(lng);
  };

  const handleSignOut = async () => {
    await signOut();
    onClose();
    navigate("/login");
  };

  const mainNav = [
    { to: "/agent",   icon: <IconAgent />,   label: currentLang === "en" ? "AI Agent"   : "ИИ агент"    },
    { to: "/studio",  icon: <IconStudio />,  label: currentLang === "en" ? "Studio"     : "Студия"      },
    { to: "/radio",   icon: <IconRadio />,   label: currentLang === "en" ? "Radio"      : "Радио"       },
    { to: "/library", icon: <IconLibrary />, label: currentLang === "en" ? "Library"    : "Библиотека"  },
    { to: "/profile", icon: <IconProfile />, label: currentLang === "en" ? "Profile"    : "Профиль", showBalance: true },
  ];

  return (
    <aside className={`sidebar${open ? " sidebar--open" : ""}`}>

      {/* Brand */}
      <div className="sidebar-brand">
        <NavLink to="/studio" className="brand" onClick={onClose}>
          <RiffaMark size={24} />
          <span className="brand-wordmark">RIFFA <span className="brand-sub">studio</span></span>
        </NavLink>
        <div className="sidebar-lang" role="group" aria-label={t("sidebar.language")}>
          <button
            type="button"
            className={`lang-btn${currentLang === "ru" ? " lang-btn--on" : ""}`}
            onClick={() => switchLang("ru")}
          >RU</button>
          <button
            type="button"
            className={`lang-btn${currentLang === "en" ? " lang-btn--on" : ""}`}
            onClick={() => switchLang("en")}
          >EN</button>
        </div>
      </div>

      {/* Main nav */}
      <nav className="nav">
        {mainNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? " nav-item--active" : ""}`}
            onClick={onClose}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {item.showBalance && !isLoading && user && (
              <span className="nav-balance">{user.balance_tokens}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Active generations */}
      <ActiveGenerations />

      {/* Bottom nav */}
      <nav className="nav nav--bottom">
        {user?.is_admin && (
          <NavLink
            to="/admin"
            className={({ isActive }) => `nav-item${isActive ? " nav-item--active" : ""}`}
            onClick={onClose}
          >
            <span className="nav-icon"><IconAdmin /></span>
            <span className="nav-label">{currentLang === "en" ? "Admin" : "Админ"}</span>
          </NavLink>
        )}
        <NavLink
          to="/guide"
          className={({ isActive }) => `nav-item${isActive ? " nav-item--active" : ""}`}
          onClick={onClose}
        >
          <span className="nav-icon"><IconGuide /></span>
          <span className="nav-label">{currentLang === "en" ? "Guide" : "Гайд"}</span>
        </NavLink>
        {user ? (
          <button type="button" className="nav-item nav-item--signout" onClick={handleSignOut}>
            <span className="nav-icon"><IconSignOut /></span>
            <span className="nav-label">{currentLang === "en" ? "Sign out" : "Выйти"}</span>
          </button>
        ) : (
          <NavLink
            to="/login"
            className={({ isActive }) => `nav-item${isActive ? " nav-item--active" : ""}`}
            onClick={onClose}
          >
            <span className="nav-icon" style={{ transform: "scaleX(-1)" }}><IconSignOut /></span>
            <span className="nav-label">{currentLang === "en" ? "Sign in" : "Войти"}</span>
          </NavLink>
        )}
      </nav>

    </aside>
  );
}
