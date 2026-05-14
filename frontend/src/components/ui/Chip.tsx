import type { ButtonHTMLAttributes, ReactNode } from "react";

import "./Chip.css";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  variant?: "default" | "muted";
  children: ReactNode;
}

export function Chip({ active = false, variant = "default", className = "", children, ...rest }: ChipProps) {
  const classes = ["chip", active ? "chip--active" : "", variant === "muted" ? "chip--muted" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={classes} aria-pressed={active} {...rest}>
      {children}
    </button>
  );
}
