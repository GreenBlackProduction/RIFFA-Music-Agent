/**
 * Cover image with automatic fallback when the remote URL fails to load.
 *
 * Suno track image URLs (musicfile.removeai.ai/...) and Telegram avatar URLs
 * (t.me/i/userpic/...) can become unavailable over time. We don't want broken
 * image icons in the UI — instead, show a graceful emoji/initial fallback.
 */

import { type CSSProperties, useState } from "react";

interface Props {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  fallback?: string;
  loading?: "eager" | "lazy";
  style?: CSSProperties;
  /** Treat the fallback as initials (uppercased single char) instead of emoji. */
  initials?: boolean;
  referrerPolicy?: "no-referrer" | "origin" | "unsafe-url";
}

export function CoverImage({
  src,
  alt = "",
  className,
  fallback = "🎵",
  loading = "lazy",
  style,
  initials,
  referrerPolicy,
}: Props) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className={className} style={style} aria-hidden={!alt}>
        {initials ? (fallback?.slice(0, 1).toUpperCase() ?? "?") : fallback}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      style={style}
      referrerPolicy={referrerPolicy}
      onError={() => setFailed(true)}
    />
  );
}
