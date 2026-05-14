import { useEffect, useState } from "react";

import "./ScrollToTop.css";

interface ScrollToTopProps {
  /** Pixels of scroll Y before the button appears. Defaults to 400. */
  threshold?: number;
}

/**
 * На десктопе скроллится `<main class="main">` (у `html/body` overflow: hidden).
 * На мобилках layout меняется на body-scroll. Поэтому слушаем оба контейнера
 * и берём max их scrollTop для решения о видимости.
 */
function getScrollTop(): number {
  const main = document.querySelector<HTMLElement>(".main");
  const mainTop = main ? main.scrollTop : 0;
  const winTop = window.scrollY || document.documentElement.scrollTop || 0;
  return Math.max(mainTop, winTop);
}

function scrollBothToTop() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
  const main = document.querySelector<HTMLElement>(".main");
  if (main && main.scrollTop > 0) {
    main.scrollTo({ top: 0, behavior });
  }
  if ((window.scrollY || document.documentElement.scrollTop || 0) > 0) {
    window.scrollTo({ top: 0, behavior });
  }
}

/**
 * Floating "scroll to top" FAB. Appears on any long page after the user has
 * scrolled past `threshold` px. Rendered once at the layout level, so every
 * page gets it automatically.
 */
export function ScrollToTop({ threshold = 400 }: ScrollToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(getScrollTop() > threshold);
    }
    onScroll();
    const main = document.querySelector<HTMLElement>(".main");
    main?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, [threshold]);

  function toTop() {
    scrollBothToTop();
  }

  return (
    <button
      type="button"
      className={`scroll-to-top${visible ? " scroll-to-top--visible" : ""}`}
      aria-label="Наверх"
      title="Наверх"
      onClick={toTop}
      tabIndex={visible ? 0 : -1}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <path
          d="M12 5l-7 7h4v7h6v-7h4z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
