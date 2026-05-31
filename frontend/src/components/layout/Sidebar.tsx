import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ActiveGenerations } from "@/components/layout/ActiveGenerations";
import { RiffaMark } from "@/components/brand/RiffaMark";
import { Coin } from "@/components/ui/Coin";
import { useAuth } from "@/lib/auth";

import "./Sidebar.css";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

/* ── Icons — filled, viewBox 0 0 24 24, currentColor ────────────── */

const IconAgent = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="m22.5,10h-.5v-1c0-2.757-2.243-5-5-5h-4v-2c0-.553-.448-1-1-1s-1,.447-1,1v2h-4c-2.757,0-5,2.243-5,5v1h-.5c-.827,0-1.5.673-1.5,1.5v3c0,.827.673,1.5,1.5,1.5h.5v1c0,2.757,2.243,5,5,5h10c2.757,0,5-2.243,5-5v-1h.5c.827,0,1.5-.673,1.5-1.5v-3c0-.827-.673-1.5-1.5-1.5Zm-2.5,7c0,1.654-1.346,3-3,3H7c-1.654,0-3-1.346-3-3v-8c0-1.654,1.346-3,3-3h10c1.654,0,3,1.346,3,3v8Zm-10-6.5c0,.828-.672,1.5-1.5,1.5s-1.5-.672-1.5-1.5.672-1.5,1.5-1.5,1.5.672,1.5,1.5Zm5.5,1.5c-.828,0-1.5-.672-1.5-1.5s.672-1.5,1.5-1.5,1.5.672,1.5,1.5-.672,1.5-1.5,1.5Zm-6.5,4c0,.553-.448,1-1,1h-1c-.552,0-1-.447-1-1s.448-1,1-1h1c.552,0,1,.447,1,1Zm5,0c0,.553-.447,1-1,1h-2c-.552,0-1-.447-1-1s.448-1,1-1h2c.553,0,1,.447,1,1Zm4,0c0,.553-.447,1-1,1h-1c-.553,0-1-.447-1-1s.447-1,1-1h1c.553,0,1,.447,1,1Z"/>
  </svg>
);

const IconStudio = () => (
  <span
    style={{
      display: "block",
      width: "22px",
      height: "22px",
      backgroundColor: "currentColor",
      WebkitMask: "url(/studio-icon.svg) no-repeat center / contain",
      mask: "url(/studio-icon.svg) no-repeat center / contain",
      flexShrink: 0,
    }}
    aria-hidden="true"
  />
);

const IconRadio = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21,7H8.067L21.379,1.926,20.667,.057,1.911,7.206l.002,.005c-1.117,.437-1.913,1.519-1.913,2.789v14H24V10c0-1.654-1.346-3-3-3Zm1,15H2V10c0-.552,.449-1,1-1H21c.551,0,1,.448,1,1v12ZM6,12h4v1.6h-2.4v1.801h2.4v1.6h-2.4v3h-1.6V12Zm11.492,1l.508,7h-1.604l-.319-4.402-1.577,3.468-1.577-3.468-.319,4.402h-1.604l.508-7c.044-1.163,1.413-1.353,1.829-.36l1.164,2.56,1.164-2.56c.416-.993,1.784-.803,1.829,.36Z"/>
  </svg>
);

const IconLibrary = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="m22.5,0h-1.5c-2.757,0-5,2.243-5,5v8.602c-.751-.385-1.6-.602-2.5-.602-3.032,0-5.5,2.467-5.5,5.5s2.468,5.5,5.5,5.5,5.5-2.467,5.5-5.5V5c0-1.103.897-2,2-2h1.5c.828,0,1.5-.671,1.5-1.5s-.672-1.5-1.5-1.5Zm-9,21c-1.379,0-2.5-1.122-2.5-2.5s1.121-2.5,2.5-2.5,2.5,1.122,2.5,2.5-1.121,2.5-2.5,2.5ZM0,1.5C0,.671.672,0,1.5,0h10c.828,0,1.5.671,1.5,1.5s-.672,1.5-1.5,1.5H1.5c-.828,0-1.5-.671-1.5-1.5Zm0,6c0-.829.672-1.5,1.5-1.5h10c.828,0,1.5.671,1.5,1.5s-.672,1.5-1.5,1.5H1.5c-.828,0-1.5-.671-1.5-1.5Zm8,6c0,.829-.672,1.5-1.5,1.5H1.5c-.828,0-1.5-.671-1.5-1.5s.672-1.5,1.5-1.5h5c.828,0,1.5.671,1.5,1.5Z"/>
  </svg>
);

const IconProfile = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12,12A6,6,0,1,0,6,6,6.006,6.006,0,0,0,12,12ZM12,2A4,4,0,1,1,8,6,4,4,0,0,1,12,2Z"/>
    <path d="M12,14a9.01,9.01,0,0,0-9,9,1,1,0,0,0,2,0,7,7,0,0,1,14,0,1,1,0,0,0,2,0A9.01,9.01,0,0,0,12,14Z"/>
  </svg>
);

const IconAdmin = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <line x1="5" y1="6" x2="11" y2="6" />
    <line x1="5" y1="8.5" x2="9" y2="8.5" />
    <line x1="5" y1="11" x2="11" y2="11" />
  </svg>
);

const IconGuide = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M22.2,2.163a4.992,4.992,0,0,0-4.1-1.081l-3.822.694A4,4,0,0,0,12,3.065,4,4,0,0,0,9.716,1.776L5.9,1.082A5,5,0,0,0,0,6V16.793a5,5,0,0,0,4.105,4.919l6.286,1.143a9,9,0,0,0,3.218,0L19.9,21.712A5,5,0,0,0,24,16.793V6A4.983,4.983,0,0,0,22.2,2.163ZM11,20.928c-.084-.012-.168-.026-.252-.041L4.463,19.745A3,3,0,0,1,2,16.793V6A3,3,0,0,1,5,3a3.081,3.081,0,0,1,.54.049l3.82.7A2,2,0,0,1,11,5.712Zm11-4.135a3,3,0,0,1-2.463,2.952l-6.285,1.142c-.084.015-.168.029-.252.041V5.712a2,2,0,0,1,1.642-1.968l3.821-.7A3,3,0,0,1,22,6Z"/>
  </svg>
);

const IconSignOut = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3" />
    <path d="M10 5l3 3-3 3" />
    <line x1="13" y1="8" x2="6" y2="8" />
  </svg>
);

const IconSupport = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
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
              <span className={`nav-balance${user.balance_tokens < 10 ? " nav-balance--low" : " nav-balance--ok"}`}>
                <Coin size={14} />{user.balance_tokens}
              </span>
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
          <span className="nav-label">{currentLang === "en" ? "Manual" : "Руководство"}</span>
        </NavLink>
        <a
          href="https://t.me/RIFFAsupport_bot"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-item"
          onClick={onClose}
        >
          <span className="nav-icon"><IconSupport /></span>
          <span className="nav-label">{currentLang === "en" ? "Support" : "Поддержка"}</span>
        </a>
        {user ? (
          <button type="button" className="nav-item nav-item--signout" onClick={handleSignOut}>
            <span className="nav-icon"><IconSignOut /></span>
            <span className="nav-label">{currentLang === "en" ? "Sign out" : "Выйти"}</span>
          </button>
        ) : (
          <NavLink
            to="/login"
            className={({ isActive }) => `nav-item nav-item--signin${isActive ? " nav-item--active" : ""}`}
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
