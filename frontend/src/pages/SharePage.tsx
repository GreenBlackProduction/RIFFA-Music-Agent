/**
 * Public share page — /s/:shareId?v=<idx>
 *
 * With ``?v=<idx>`` shows only that specific track variant (Suno returns V1+V2,
 * users typically want to share just one). Without — shows all variants.
 * No authentication required.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router-dom";

import { Panel } from "@/components/ui/Panel";
import { type PublicGenerationOut, fetchSharedGeneration } from "@/lib/api/client";
import "./SharePage.css";

function ShareCover({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !url) {
    return <div className="share-track__cover-fallback">♪</div>;
  }
  return (
    <img
      src={url}
      alt={alt}
      className="share-track__cover"
      onError={() => setFailed(true)}
    />
  );
}

export function SharePage() {
  const { t } = useTranslation();
  const { shareId } = useParams<{ shareId: string }>();
  const [searchParams] = useSearchParams();
  const variantParam = searchParams.get("v");
  const variant = variantParam !== null && /^\d+$/.test(variantParam)
    ? parseInt(variantParam, 10)
    : null;

  const [gen, setGen] = useState<PublicGenerationOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) return;
    setGen(null);
    setError(null);
    fetchSharedGeneration(shareId, variant)
      .then(setGen)
      .catch(() => setError(t("sharePage.invalidLink")));
  }, [shareId, variant, t]);

  // Browsers can fail to play <audio> with relative "/api/..." URLs in some
  // embedding contexts (Telegram Mini App webview). Absolute origin URL is
  // always playable.
  function resolveUrl(u: string): string {
    if (!u) return u;
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    return `${window.location.origin}${u.startsWith("/") ? u : "/" + u}`;
  }

  if (error) {
    return (
      <div className="share-page">
        <div className="share-error">
          <h2>{t("sharePage.notFound")}</h2>
          <p className="muted">{error}</p>
          <a href="/" className="share-home-link">{t("sharePage.homeLink")}</a>
        </div>
      </div>
    );
  }

  if (!gen) {
    return (
      <div className="share-page">
        <div className="share-loading">
          <div className="share-loading__spinner" aria-label={t("sharePage.loadingAria")} />
        </div>
      </div>
    );
  }

  return (
    <div className="share-page">
      <header className="share-header">
        <a href="/studio" className="share-brand">
          <img src="/riffa-logo.png" alt="RIFFA" className="share-brand__logo" />
          <strong className="brand-name">RIFFA<span className="brand-name__sub">Studio</span></strong>
        </a>
      </header>

      <main className="share-main">
        <Panel className="share-card" title="">
          <div className="share-meta">
            <span className="share-type-badge">{gen.type}</span>
            {gen.genre && <span className="share-genre">{gen.genre}</span>}
            {gen.mood && <span className="share-mood">{gen.mood}</span>}
          </div>

          <h1 className="share-title">{gen.title || t("sharePage.untitled")}</h1>

          <p className="share-views muted">{gen.share_views} {t("sharePage.views")}</p>

          <div className="share-tracks">
            {gen.tracks.map((track, idx) => (
              <div key={track.audio_id} className="share-track">
                {track.image_url && (
                  <ShareCover url={track.image_url} alt={t("sharePage.cover")} />
                )}
                <div className="share-track__info">
                  <p className="share-track__name">{track.title || `${t("sharePage.variant")} ${idx + 1}`}</p>
                  {track.duration > 0 && (
                    <span className="share-track__dur muted">
                      {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, "0")}
                    </span>
                  )}
                </div>
                <audio
                  controls
                  preload="metadata"
                  src={resolveUrl(track.audio_url)}
                  className="share-track__audio"
                >
                  <track kind="captions" />
                </audio>
              </div>
            ))}
          </div>

          {gen.lyrics && (
            <details className="share-lyrics">
              <summary>{t("sharePage.lyrics")}</summary>
              <pre>{gen.lyrics}</pre>
            </details>
          )}

          <div className="share-actions">
            <a href="/login" className="share-cta-btn">
              {t("sharePage.cta")}
            </a>
          </div>
        </Panel>
      </main>
    </div>
  );
}
