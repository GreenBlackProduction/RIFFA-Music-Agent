import type { HTMLAttributes, ReactNode } from "react";

import "./Panel.css";

interface PanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  variant?: "default" | "hero";
}

export function Panel({ children, variant = "default", className = "", ...rest }: PanelProps) {
  return (
    <section className={`panel panel--${variant} ${className}`.trim()} {...rest}>
      {children}
    </section>
  );
}
