interface RiffaWordmarkProps {
  size?: number;
  withStudio?: boolean;
  color?: string;
  triangleColor?: string;
  studioColor?: string;
  className?: string;
}

export function RiffaWordmark({
  size = 56,
  withStudio = false,
  color = "#161413",
  triangleColor = "#FF3B1F",
  studioColor = "#0F5D47",
  className,
}: RiffaWordmarkProps) {
  const triH = size * 0.65;
  const triW = size * 0.5;
  const baseline = size * 1.0;
  const wordW = size * 2.4;
  const triX = wordW + size * 0.18;
  const triY1 = baseline - triH;
  const totalW = triX + triW;
  const totalH = withStudio ? size * 1.5 : size * 1.15;

  return (
    <svg
      width={totalW}
      height={totalH}
      viewBox={`0 0 ${totalW} ${totalH}`}
      className={className}
      aria-label="RIFFA"
    >
      <text
        x="0"
        y={baseline}
        fontFamily="Archivo Black, Inter, sans-serif"
        fontWeight="900"
        fontSize={size}
        letterSpacing={`${-size * 0.05}px`}
        fill={color}
      >
        riffa
      </text>
      <polygon
        points={`${triX},${triY1} ${triX},${baseline} ${triX + triW},${(triY1 + baseline) / 2}`}
        fill={triangleColor}
      />
      {withStudio && (
        <text
          x={totalW / 2}
          y={baseline + size * 0.35}
          fontFamily="JetBrains Mono, monospace"
          fontWeight="500"
          fontSize={size * 0.18}
          letterSpacing={`${size * 0.12}px`}
          fill={studioColor}
          textAnchor="middle"
        >
          STUDIO
        </text>
      )}
    </svg>
  );
}
