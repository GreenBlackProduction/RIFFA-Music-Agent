/* ════════════════════════════════════════════════
   RIFFA · Landing brand primitives
   Verbatim from the Claude Design handoff (components.tsx),
   with <Button> adapted to react-router navigation for the SPA.
   ════════════════════════════════════════════════ */

import { CSSProperties, MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

/* ── <Mark> · знак (круг + play-треугольник) ───────────────── */
type MarkVariant = "light" | "dark" | "white" | "inverted";

export function Mark({
  size = 40,
  variant = "light",
  className,
  style,
}: {
  size?: number;
  variant?: MarkVariant;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-label="RIFFA">
      {variant === "dark" ? (
        <>
          <circle cx="50" cy="50" r="48" stroke="#E9E5DA" strokeWidth="3" fill="none" />
          <polygon points="40,32 40,68 72,50" fill="#FF3B1F" />
        </>
      ) : variant === "inverted" ? (
        <>
          <circle cx="50" cy="50" r="50" fill="#E9E5DA" />
          <circle cx="50" cy="50" r="38" fill="#161413" />
          <polygon points="40,32 40,68 72,50" fill="#FF3B1F" />
        </>
      ) : variant === "white" ? (
        <>
          <circle cx="50" cy="50" r="50" fill="#161413" />
          <circle cx="50" cy="50" r="38" fill="#FAFAFA" />
          <polygon points="40,32 40,68 72,50" fill="#FF3B1F" />
        </>
      ) : (
        <>
          <circle cx="50" cy="50" r="50" fill="#161413" />
          <circle cx="50" cy="50" r="38" fill="#E9E5DA" />
          <polygon points="40,32 40,68 72,50" fill="#FF3B1F" />
        </>
      )}
    </svg>
  );
}

/* ── <Wordmark> · «riffa ▶» ────────────────────────────────── */
export function Wordmark({
  height = 64,
  withStudio = false,
  variant = "ink",
  className,
  style,
}: {
  height?: number;
  withStudio?: boolean;
  variant?: "ink" | "paper";
  className?: string;
  style?: CSSProperties;
}) {
  const fill = variant === "ink" ? "#161413" : "#E9E5DA";
  if (withStudio) {
    const vbW = 1000, vbH = 500;
    return (
      <svg
        height={height * (vbH / 320)}
        width={height * (vbH / 320) * (vbW / vbH)}
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        className={className}
        style={style}
        aria-label="RIFFA Studio"
      >
        <text x="108" y="320" fontFamily="'Archivo Black', 'Inter', sans-serif" fontWeight="900" fontSize="260" letterSpacing="-13" fill={fill}>riffa</text>
        <polygon points="758,124 758,318 892,221" fill="#FF3B1F" />
        <line x1="408" y1="380" x2="592" y2="380" stroke="#0F5D47" strokeWidth="1" opacity="0.25" />
        <text x="512" y="430" fontFamily="'JetBrains Mono', ui-monospace, monospace" fontWeight="500" fontSize="40" letterSpacing="24" fill="#0F5D47" textAnchor="middle">STUDIO</text>
      </svg>
    );
  }
  const vbW = 1000, vbH = 320;
  return (
    <svg
      height={height}
      width={height * (vbW / vbH)}
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={style}
      aria-label="RIFFA"
    >
      <text x="108" y="280" fontFamily="'Archivo Black', 'Inter', sans-serif" fontWeight="900" fontSize="260" letterSpacing="-13" fill={fill}>riffa</text>
      <polygon points="758,84 758,278 892,181" fill="#FF3B1F" />
    </svg>
  );
}

/* ── <MetaRow> · линейка с тремя мета-полями ──────────────── */
export function MetaRow({ left, center, right }: { left: ReactNode; center?: ReactNode; right: ReactNode }) {
  return (
    <div className="r-meta-row">
      <span>{left}</span>
      {center && <span>{center}</span>}
      <span>{right}</span>
    </div>
  );
}

/* ── <SectionHead> · 240px метка + заголовок + правая мета ── */
export function SectionHead({
  num,
  label,
  title,
  right,
}: {
  num: string;
  label: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="r-section-head">
      <div className="r-eyebrow">
        <span className="num">{num}</span> · {label}
      </div>
      <h2>{title}</h2>
      <div className="r-eyebrow r-section-head__right">{right}</div>
    </div>
  );
}

/* ── <Stage> · рамка-стейдж с угловыми подписями ──────────── */
export function Stage({
  children,
  topLeft,
  bottomRight,
  dark,
  white,
  aspectRatio = 2.4,
  padding = 48,
  maxContentWidth,
  className,
}: {
  children: ReactNode;
  topLeft?: string;
  bottomRight?: string;
  dark?: boolean;
  white?: boolean;
  aspectRatio?: number;
  padding?: number;
  maxContentWidth?: number;
  className?: string;
}) {
  const stageClass = ["r-stage", dark ? "r-stage--dark" : "", white ? "r-stage--white" : "", className || ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={stageClass} style={{ aspectRatio: `${aspectRatio} / 1`, padding }}>
      {topLeft && <span className="r-stage__corner r-stage__corner--tl">{topLeft}</span>}
      {bottomRight && <span className="r-stage__corner r-stage__corner--br">{bottomRight}</span>}
      <div className="r-stage__content" style={maxContentWidth ? { maxWidth: maxContentWidth, width: "100%" } : undefined}>
        {children}
      </div>
    </div>
  );
}

/* ── <TwoCol> · 240px-метка + 1fr-контент ─────────────────── */
export function TwoCol({
  label,
  description,
  note,
  children,
}: {
  label: string;
  description?: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="r-two-col">
      <div className="r-two-col__label">
        <b>{label}</b>
        {description && <span className="r-two-col__desc">{description}</span>}
        {note && <span className="r-two-col__note">{note}</span>}
      </div>
      <div className="r-two-col__body">{children}</div>
    </div>
  );
}

/* ── <Button> · router-aware (internal hrefs → SPA navigate) ─ */
export function Button({
  children,
  variant = "default",
  size = "md",
  onClick,
  disabled,
  href,
  type = "button",
  className,
}: {
  children: ReactNode;
  variant?: "primary" | "default" | "ghost" | "emerald";
  size?: "sm" | "md" | "lg";
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  href?: string;
  type?: "button" | "submit" | "reset";
  className?: string;
}) {
  const navigate = useNavigate();
  const cls = ["r-btn", `r-btn--${variant}`, `r-btn--${size}`, className || ""].filter(Boolean).join(" ");
  if (href) {
    const external = /^https?:\/\//.test(href) || href.startsWith("#") || href.endsWith(".txt");
    return (
      <a
        className={cls}
        href={href}
        target={external && href.startsWith("http") ? "_blank" : undefined}
        rel={external && href.startsWith("http") ? "noopener noreferrer" : undefined}
        onClick={(e) => {
          onClick?.(e);
          if (!external && href.startsWith("/")) {
            e.preventDefault();
            navigate(href);
          }
        }}
      >
        {children}
      </a>
    );
  }
  return (
    <button className={cls} type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/* ── <Pill> · мелкая пилюля статуса ───────────────────────── */
export function Pill({ children, variant = "emerald" }: { children: ReactNode; variant?: "emerald" | "ink" | "hi" }) {
  return <span className={`r-pill r-pill--${variant}`}>{children}</span>;
}

/* ── <PageShell> · корневая обёртка ───────────────────────── */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="r-app">
      <div className="r-page">{children}</div>
    </div>
  );
}
