import "./Coin.css";

interface CoinProps {
  size?: number | string;
  className?: string;
  title?: string;
}

export function Coin({ size = "1em", className, title }: CoinProps) {
  return (
    <img
      src="/token.gif"
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      className={`riffa-coin${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
    />
  );
}
