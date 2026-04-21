import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Returns true when the page <footer> is in (or near) the viewport, so
 * sticky bottom bars can slide out of the way and never cover the footer.
 *
 * Implementation notes:
 * - Uses a scroll-position check (rAF-throttled) instead of IntersectionObserver
 *   so it remains reliable when navigating between routes that mount/unmount
 *   the footer at different times.
 * - When the page has no <footer> at all, falls back to detecting the very
 *   bottom of the document so the bar still hides at the end of long pages.
 *
 * `barHeight` (default 96px) is the buffer kept between the bottom of the
 * viewport and the footer before we start hiding the bar.
 */
export function useFooterVisible(barHeight: number = 96): boolean {
  const [visible, setVisible] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    let rafId: number | null = null;

    const findFooter = (): HTMLElement | null =>
      (document.querySelector("footer") as HTMLElement | null) ||
      (document.querySelector('[role="contentinfo"]') as HTMLElement | null) ||
      (document.querySelector("#footer") as HTMLElement | null);

    const check = () => {
      rafId = null;
      const footer = findFooter();
      const viewportH = window.innerHeight;
      const threshold = viewportH - barHeight;

      if (footer) {
        const rect = footer.getBoundingClientRect();
        // Footer top has crossed into the bottom `barHeight` band of the viewport.
        setVisible(rect.top < threshold);
        return;
      }

      // No semantic footer on this page → hide bar near absolute bottom of doc.
      const scrollY = window.scrollY || window.pageYOffset;
      const docHeight = document.documentElement.scrollHeight;
      const distanceFromBottom = docHeight - (scrollY + viewportH);
      setVisible(distanceFromBottom < barHeight);
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(check);
    };

    // Initial check (defer so the new route's DOM is mounted)
    const initial = window.requestAnimationFrame(check);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.cancelAnimationFrame(initial);
    };
  }, [barHeight, pathname]);

  return visible;
}
