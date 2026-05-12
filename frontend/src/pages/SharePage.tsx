/**
 * Public share page — /s/:shareId
 * No authentication required.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { Panel } from "@/components/ui/Panel";
import { type PublicGenerationOut, fetchSharedGeneration } from "@/lib/api/client";
import "./SharePage.css";

export function SharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [gen, setGen] = useState<PublicGenerationOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) return;
    fetchSharedGeneration(shareId)
      .then(setGen)
      .catch(() => setError("Ссылка недействительна или трек был скрыт"));
  }, [shareId]);

  if (error) {
    return (
      <div className="share-page">
        <div className="share-error">
          <h2>Не найдено</h2>
          <p className="muted">{error}</p>
          <a href="/" className="share-home-link">← На главную</a>
        </div>
      </div>
    );
  }

  if (!gen) {
    return (
      <div className="share-page">
        <div className="share-loading">
          <div className="share-loading__spinner" aria-label="Загрузка" />
        </div>
      </div>
    );
  }

  return (
    <div className="share-page">
      <header className="share-header">
        <a href="/" className="share-brand">
          <img src="/riffa-logo.png" alt="RIFFA" className="share-brand__logo" />
          <strong>RIFFA</strong>
        </a>
      </header>

      <main className="share-main">
        <Panel className="share-card" title="">
          <div className="share-meta">
            <span className="share-type-badge">{gen.type}</span>
            {gen.genre && <span className="share-genre">{gen.genre}</span>}
            {gen.mood && <span className="share-mood">{gen.mood}</span>}
          </div>

          <h1 className="share-title">{gen.title || "Трек без названия"}</h1>

          <p className="share-views muted">{gen.share_views} просмотров</p>

          <div className="share-tracks">
            {gen.tracks.map((track, idx) => (
              <div key={track.audio_id} className="share-track">
                {track.image_url && (
                  <img
                    src={track.image_url}
                    alt="Обложка"
                    className="share-track__cover"
                  />
                )}
                <div className="share-track__info">
                  <p className="share-track__name">{track.title || `Вариант ${idx + 1}`}</p>
                  {track.duration > 0 && (
                    <span className="share-track__dur muted">
                      {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, "0")}
                    </span>
                  )}
                </div>
                <audio
                  controls
                  src={track.audio_url}
                  className="share-track__audio"
                >
                  <track kind="captions" />
                </audio>
              </div>
            ))}
          </div>

          {gen.lyrics && (
            <details className="share-lyrics">
              <summary>Текст песни</summary>
              <pre>{gen.lyrics}</pre>
            </details>
          )}

          <div className="share-actions">
            <a href="/login" className="share-cta-btn">
              Создать свою музыку в RIFFA →
            </a>
          </div>
        </Panel>
      </main>
    </div>
  );
}
