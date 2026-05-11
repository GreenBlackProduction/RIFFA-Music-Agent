/**
 * Ghost overlay that plays the explosion-evaporate animation at a captured
 * rect. Used by LibraryCard and ProfilePage's "Мои файлы" panel.
 *
 * Item disappearance is handled by optimistic cache updates in the parent's
 * delete mutation (React Query) — this hook is purely for the visual ghost.
 */

import { createPortal } from "react-dom";
import { useCallback, useState } from "react";

import { TYPE_ICONS, type LibraryItem } from "@/lib/library";

export interface FileGhost {
  id: string;
  item: LibraryItem;
  rect: DOMRect;
}

/** Remove duration matches CSS `file-item--deleting` keyframes. */
const GHOST_DURATION_MS = 1000;

export function useFileGhosts(): {
  ghosts: FileGhost[];
  /** Show a floating ghost at `rect`. The item is expected to already be
   *  removed from the underlying data (via optimistic cache update). */
  showGhost: (item: LibraryItem, rect: DOMRect | null) => void;
} {
  const [ghosts, setGhosts] = useState<FileGhost[]>([]);

  const showGhost = useCallback((item: LibraryItem, rect: DOMRect | null) => {
    if (!rect) return;
    setGhosts((prev) => [...prev, { id: item.id, item, rect }]);
    window.setTimeout(() => {
      setGhosts((prev) => prev.filter((g) => g.id !== item.id));
    }, GHOST_DURATION_MS);
  }, []);

  return { ghosts, showGhost };
}

/** Render the floating ghost overlays. Mount once, anywhere — usually next
 *  to the file grid. Uses a portal to position relative to the viewport. */
export function FileGhostsOverlay({ ghosts }: { ghosts: FileGhost[] }) {
  if (ghosts.length === 0) return null;
  return createPortal(
    <>
      {ghosts.map((g) => (
        <div
          key={g.id}
          className="file-item file-item--ghost file-item--deleting"
          style={{
            position: "fixed",
            top: g.rect.top,
            left: g.rect.left,
            width: g.rect.width,
            height: g.rect.height,
            zIndex: 600,
            pointerEvents: "none",
          }}
          aria-hidden
        >
          {g.item.coverUrl ? (
            <span className="file-item__icon file-item__icon--cover">
              <img src={g.item.coverUrl} alt="" />
            </span>
          ) : (
            <span className="file-item__icon">{TYPE_ICONS[g.item.type]}</span>
          )}
          <div className="file-item__info">
            <strong className="file-item__title">{g.item.title}</strong>
          </div>
          <span className="file-item__ghost-burst" />
        </div>
      ))}
    </>,
    document.body,
  );
}
