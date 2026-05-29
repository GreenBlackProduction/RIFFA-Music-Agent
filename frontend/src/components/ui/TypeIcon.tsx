import type { LibraryItemType } from "@/lib/library";

interface TypeIconProps {
  type: LibraryItemType | string;
  size?: number;
  className?: string;
}

/** Minimalist single-color icons for file types. Use currentColor for theming. */
export function TypeIcon({ type, size = 18, className }: TypeIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (type) {
    case "song":
      // Musical note
      return (
        <svg {...common}>
          <path d="M9 18V5l10-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="16" cy="16" r="3" />
        </svg>
      );
    case "instrumental":
      // Piano / sliders
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="1.5" />
          <path d="M8 5v8M12 5v8M16 5v8" />
          <path d="M3 13h18" />
        </svg>
      );
    case "cover":
      // Microphone
      return (
        <svg {...common}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3M9 21h6" />
        </svg>
      );
    case "sfx":
      // Speaker waves
      return (
        <svg {...common}>
          <path d="M11 5L7 9H4v6h3l4 4V5z" />
          <path d="M16 9a4 4 0 0 1 0 6" />
          <path d="M19 6a8 8 0 0 1 0 12" />
        </svg>
      );
    case "cover_art":
      // Image / photo frame
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    case "wav":
      // Waveform
      return (
        <svg {...common}>
          <path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2M21 12h.01" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}
