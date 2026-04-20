import { useEffect, useState } from "react";

/**
 * Returns a page size that always fills complete grid rows for the
 * current viewport. Aligns with the breakpoints used by VehicleListGrid:
 *   - <640px      → 1 col  → 6 items
 *   - 640–1279px  → 2 cols → 8 items
 *   - 1280–1535px → 3 cols → 12 items
 *   - ≥1536px     → 4 cols → 16 items
 */
export function useItemsPerPage(): number {
  const compute = (): number => {
    if (typeof window === "undefined") return 12;
    const w = window.innerWidth;
    if (w < 640) return 6;
    if (w < 1280) return 8;
    if (w < 1536) return 12;
    return 16;
  };

  const [itemsPerPage, setItemsPerPage] = useState<number>(compute);

  useEffect(() => {
    const update = () => setItemsPerPage(compute());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return itemsPerPage;
}
