interface RiffaWordmarkProps {
  height?: number;
  withStudio?: boolean;
  /** "dark" = wordmark on light bg, "light" = wordmark on dark bg */
  variant?: "dark" | "light";
  className?: string;
  style?: React.CSSProperties;
}

export function RiffaWordmark({
  height = 40,
  withStudio = false,
  variant = "dark",
  className,
  style,
}: RiffaWordmarkProps) {
  let src: string;
  if (withStudio) {
    src = variant === "light"
      ? "/brand/02-wordmark/riffa-wordmark-studio-on-dark.svg"
      : "/brand/02-wordmark/riffa-wordmark-studio.svg";
  } else {
    src = variant === "light"
      ? "/brand/02-wordmark/riffa-wordmark-on-dark.svg"
      : "/brand/02-wordmark/riffa-wordmark.svg";
  }
  return (
    <img
      src={src}
      height={height}
      alt={withStudio ? "RIFFA Studio" : "RIFFA"}
      className={className}
      style={style}
      draggable={false}
    />
  );
}
