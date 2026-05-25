interface RiffaMarkProps {
  size?: number;
  variant?: "paper" | "ink" | "white";
  className?: string;
}

export function RiffaMark({ size = 32, variant = "paper", className }: RiffaMarkProps) {
  if (variant === "ink") {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-label="RIFFA">
        <circle cx="50" cy="50" r="48" stroke="#E9E5DA" strokeWidth="3" fill="none" />
        <polygon points="40,32 40,68 72,50" fill="#FF3B1F" />
      </svg>
    );
  }
  const inner = variant === "white" ? "#FAFAFA" : "#E9E5DA";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-label="RIFFA">
      <circle cx="50" cy="50" r="50" fill="#161413" />
      <circle cx="50" cy="50" r="38" fill={inner} />
      <polygon points="40,32 40,68 72,50" fill="#FF3B1F" />
    </svg>
  );
}
