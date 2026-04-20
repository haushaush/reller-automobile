import { useEffect, useState } from "react";

/**
 * Watches the page <footer> and reports whether it is currently in
 * (or about to enter) the viewport. Used by sticky bottom bars to
 * slide themselves out of the way so the footer is never covered.
 *
 * `barHeight` (default 96px) is added as a negative bottom rootMargin
 * so the bar starts hiding *just before* the footer becomes visible.
 */
export function useFooterVisible(barHeight: number = 96): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      {
        threshold: 0,
        rootMargin: `0px 0px -${barHeight}px 0px`,
      }
    );

    observer.observe(footer);
    return () => observer.disconnect();
  }, [barHeight]);

  return visible;
}
