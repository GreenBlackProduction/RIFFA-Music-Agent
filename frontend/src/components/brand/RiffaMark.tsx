interface RiffaMarkProps {
  size?: number;
  /** "light" = mark on dark bg (orange play, paper circle), "dark" = mark on light bg (ink bg), "inverted" = white version */
  variant?: "light" | "dark" | "inverted" | "on-white";
  className?: string;
  style?: React.CSSProperties;
}

export function RiffaMark({ size = 32, variant = "dark", className, style }: RiffaMarkProps) {
  const srcMap: Record<string, string> = {
    "light": "/brand/01-mark/riffa-mark-on-dark.svg",
    "dark": "/brand/01-mark/riffa-mark.svg",
    "inverted": "/brand/01-mark/riffa-mark-inverted.svg",
    "on-white": "/brand/01-mark/riffa-mark-on-white.svg",
  };
  const src = srcMap[variant] ?? srcMap["dark"];
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="RIFFA"
      className={className}
      style={style}
      draggable={false}
    />
  );
}
