import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

import "./MobileTopbar.css";

interface MobileTopbarProps {
  onMenuClick: () => void;
}

export function MobileTopbar({ onMenuClick }: MobileTopbarProps) {
  const { t } = useTranslation();
  return (
    <div className="mobile-topbar">
      <button type="button" className="mobile-menu-button" onClick={onMenuClick} aria-label={t("sidebar.menu")}>
        ☰
      </button>
      <NavLink to="/studio" className="mobile-brand">
        <img src="/riffa-mark.svg" alt="" className="mobile-brand__logo" />
        <strong className="brand-name">RIFFA<span className="brand-name__sub">Studio</span></strong>
      </NavLink>
    </div>
  );
}
