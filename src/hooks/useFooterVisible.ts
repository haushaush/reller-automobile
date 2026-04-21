import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Returns true when the page <footer> is in (or near) the viewport, so
 * sticky bottom bars can slide out of the way and never cover the footer.
 *
 * Uses a scroll-position check (rAF-throttled) for maximum reliability
 * across SPA route changes. Re-runs the check whenever the pathname
 * changes so a freshly-mounted footer is always picked up.
 *
 * `barHeight` (default 96px) is the buffer kept between the bottom of the
 * viewport and the top of the footer before the bar starts hiding.
 */
export function useFooterVisible(barHeight: number = 96): boolean {
  const [visible, setVisible] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    let rafId: number | null = null;
    let cancelled = false;

    const findFooter = (): HTMLElement | null =>
      (document.querySelector("footer") as HTMLElement | null) ||
      (document.querySelector('[role="contentinfo"]') as HTMLElement | null) ||
      (document.querySelector("#footer") as HTMLElement | null);

    const check = () => {
      rafId = null;
      if (cancelled) return;

      const footer = findFooter();
      if (!footer) {
        // No footer found yet (still mounting). Keep the bar visible
        // until we can actually measure something.
        setVisible(false);
        return;
      }

      const rect = footer.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const triggerPoint = viewportH - barHeight;
      // Bar hides when the footer's top edge crosses the trigger line.
      setVisible(rect.top < triggerPoint);
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(check);
    };

    // Defer initial check so the new route's DOM (incl. footer) is mounted
    const initialTimer = window.setTimeout(check, 80);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [barHeight, pathname]);

  return visible;
}
