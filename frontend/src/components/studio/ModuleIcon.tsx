import "./ModuleIcon.css";

type IconKind = "song" | "instrumental" | "sound_effect" | "cover" | "cover_art" | "generator";

interface Props { kind: IconKind; className?: string; }

const ICON_SOURCES: Partial<Record<IconKind, string>> = {
  song:         "/icons/song.png",
  instrumental: "/icons/instrumental.png",
  sound_effect: "/icons/sfx.png",
  cover:        "/icons/cover.png",
  cover_art:    "/icons/cover-art.png",
  generator:    "/icons/agent.gif",
};

export function ModuleIcon({ kind, className }: Props) {
  const cls = ["module-icon", `module-icon--${kind}`, className].filter(Boolean).join(" ");
  const iconSrc = ICON_SOURCES[kind];

  if (iconSrc) {
    return (
      <img
        src={iconSrc}
        alt={kind}
        className={`${cls} module-icon--image`}
        aria-hidden
      />
    );
  }

  // Fallback SVG for unknown kinds
  return <GeneratorIcon className={cls} />;
}

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-g`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stopColor="#7cff1f" />
        <stop offset="55%"  stopColor="#ff5a00" />
        <stop offset="100%" stopColor="#d600ff" />
      </linearGradient>
    </defs>
  );
}

/* ══════════════════════════════════════════
   GENERATOR (AI) — ChatGPT логотип (спираль)
══════════════════════════════════════════ */
function GeneratorIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <Defs id="gen" />
      {/* Spiral/swirl shape (simplified ChatGPT logo) */}
      <g className="gen-spiral">
        {/* Outer spiral */}
        <path
          d="M32 8 C 45 8 55 18 55 31 C 55 35 54 39 52 42 M32 8 C 19 8 9 18 9 31 C 9 40 14 48 22 52"
          stroke="url(#gen-g)"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
          className="gen-arc gen-arc--1"
        />
        {/* Middle spiral */}
        <path
          d="M32 16 C 40 16 47 23 47 32 C 47 35 46 38 44 40 M32 16 C 24 16 17 23 17 32 C 17 38 20 43 25 46"
          stroke="url(#gen-g)"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
          className="gen-arc gen-arc--2"
        />
        {/* Center dot */}
        <circle cx="32" cy="32" r="2.5" fill="url(#gen-g)" className="gen-dot" />
      </g>
    </svg>
  );
}
