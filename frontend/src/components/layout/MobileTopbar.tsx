import { NavLink } from "react-router-dom";

import "./MobileTopbar.css";

interface MobileTopbarProps {
  onMenuClick: () => void;
}

export function MobileTopbar({ onMenuClick }: MobileTopbarProps) {
  return (
    <div className="mobile-topbar">
      <button type="button" className="mobile-menu-button" onClick={onMenuClick} aria-label="Меню">
        ☰
      </button>
      <NavLink to="/studio" className="mobile-brand">
        <img src="/riffa-logo.png" alt="" className="mobile-brand__logo" />
        <strong className="brand-name">RIFFA<span className="brand-name__sub">Studio</span></strong>
      </NavLink>
    </div>
  );
}
