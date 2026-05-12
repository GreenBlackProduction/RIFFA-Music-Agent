import { NavLink, useNavigate } from "react-router-dom";

import { ActiveGenerations } from "@/components/layout/ActiveGenerations";
import { UserMenu } from "@/components/layout/UserMenu";
import { Coin } from "@/components/ui/Coin";
import { useAuth } from "@/lib/auth";

import "./Sidebar.css";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const NAV_ITEMS: ReadonlyArray<{ to: string; icon: string; label: string }> = [
  { to: "/studio", icon: "🎛️", label: "Студия" },
  { to: "/radio", icon: "📻", label: "Радио" },
  { to: "/profile", icon: "👤", label: "Профиль" },
];

const TELEGRAM_BOT_URL = "https://t.me/The_Riffa_bot";

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

  const handleSignOut = async () => {
    await signOut();
    onClose();
    navigate("/login");
  };

  return (
    <aside className={`sidebar${open ? " sidebar--open" : ""}`}>
      <NavLink to="/studio" className="brand" onClick={onClose}>
        <img src="/riffa-logo.png" alt="RIFFA" className="brand-mark" />
        <div>
          <strong className="brand-name">RIFFA<span className="brand-name__sub">Studio</span></strong>
        </div>
      </NavLink>

      <nav className="nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? " nav-item--active" : ""}`}
            onClick={onClose}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-text">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <ActiveGenerations />

      <div className="sidebar-card">
        {isLoading ? (
          <>
            <span>Баланс</span>
            <strong>…</strong>
            <small>Загружаем сессию</small>
          </>
        ) : user ? (
          <>
            <UserMenu user={user} onSignOut={handleSignOut} onItemPicked={onClose} />
            <div className="sidebar-card__balance-row">
              <span>Баланс</span>
              <strong className="sidebar-balance">
                {user.balance_tokens}
                <Coin size={20} className="riffa-coin--after" title="RIFFA" />
              </strong>
            </div>
            <div className="sidebar-actions">
              <a
                className="sidebar-tg sidebar-tg--wide"
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noreferrer"
                title="Открыть Telegram-версию"
                aria-label="Открыть Telegram-версию"
              >
                <TelegramIcon />
                <span className="sidebar-tg__label">Telegram-бот</span>
              </a>
            </div>
          </>
        ) : (
          <>
            <span>Гость</span>
            <strong className="sidebar-balance">
              —
              <Coin size={20} className="riffa-coin--after" title="RIFFA" />
            </strong>
            <div className="sidebar-actions">
              <NavLink to="/login" className="sidebar-cta" onClick={onClose}>
                Войти
              </NavLink>
              <a
                className="sidebar-tg"
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noreferrer"
                title="Открыть Telegram-версию"
                aria-label="Открыть Telegram-версию"
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
