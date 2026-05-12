/**
 * UserMenu — выпадающее меню, которое открывается по клику на блок пользователя
 * в сайдбаре. Содержит ссылки на профиль, на админ-панель (только для админов)
 * и кнопку выхода.
 *
 * Логика админа: пункт «Админ-меню» рендерится **только** если ``user.is_admin``.
 * Бэкенд тоже проверяет права на каждом /admin/* эндпоинте — фронт лишь скрывает
 * UI, источник правды — сервер.
 */

import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import type { CurrentUser } from "@/lib/api/client";

import "./UserMenu.css";

interface UserMenuProps {
  user: CurrentUser;
  onSignOut: () => void;
  /** Closes the parent (sidebar) drawer on mobile when an item is picked. */
  onItemPicked?: () => void;
}

export function UserMenu({ user, onSignOut, onItemPicked }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (ev: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = () => {
    setOpen(false);
    onItemPicked?.();
  };

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className={`user-menu__trigger${open ? " user-menu__trigger--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user.avatar_url ? (
          <img src={user.avatar_url} alt={user.display_name} className="user-menu__avatar" />
        ) : (
          <div className="user-menu__avatar user-menu__avatar--placeholder">
            {user.display_name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="user-menu__info">
          <strong>{user.display_name}</strong>
          {user.telegram_username ? (
            <small>@{user.telegram_username}</small>
          ) : user.email ? (
            <small>{user.email}</small>
          ) : null}
        </div>
        <svg
          className="user-menu__chev"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          aria-hidden
          fill="none"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="user-menu__popover" role="menu">
          <NavLink to="/profile" className="user-menu__item" onClick={pick} role="menuitem">
            <span className="user-menu__item-icon" aria-hidden>👤</span>
            <span className="user-menu__item-label">Профиль</span>
          </NavLink>

          {user.is_admin && (
            <NavLink
              to="/admin"
              className="user-menu__item user-menu__item--admin"
              onClick={pick}
              role="menuitem"
            >
              <span className="user-menu__item-icon" aria-hidden>🛡</span>
              <span className="user-menu__item-label">Админ-меню</span>
            </NavLink>
          )}

          <button
            type="button"
            className="user-menu__item user-menu__item--danger"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            role="menuitem"
          >
            <span className="user-menu__item-icon" aria-hidden>🚪</span>
            <span className="user-menu__item-label">Выйти</span>
          </button>
        </div>
      )}
    </div>
  );
}
