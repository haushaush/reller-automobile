import { useMemo } from "react";
import Fuse from "fuse.js";
import type { Vehicle } from "./useVehicles";

/**
 * Normalize a string for fuzzy comparison: lowercase, strip spaces, hyphens
 * and most punctuation. So "190SL", "190 SL", "190-SL" all collapse to "190sl".
 */
function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[\s\-_/.,;:!?()'"`]+/g, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

interface IndexedVehicle {
  vehicle: Vehicle;
  normTitle: string;
  normModelDesc: string;
  normBrand: string;
  normModel: string;
  rawTitle: string;
  rawModelDesc: string;
  rawBrand: string;
  rawModel: string;
}

/**
 * Fuzzy search over a list of vehicles. Tolerates typos, ignores
 * whitespace/hyphens, ignores word order (each token must fuzzy-match
 * somewhere in the searchable fields).
 *
 * Returns the original list when query is empty/short.
 */
export function useFuzzySearch(vehicles: Vehicle[], query: string): Vehicle[] {
  const indexed = useMemo<IndexedVehicle[]>(
    () =>
      vehicles.map((v) => ({
        vehicle: v,
        normTitle: normalize(v.title),
        normModelDesc: normalize(v.model_description),
        normBrand: normalize(v.brand),
        normModel: normalize(v.model),
        rawTitle: (v.title || "").toLowerCase(),
        rawModelDesc: (v.model_description || "").toLowerCase(),
        rawBrand: (v.brand || "").toLowerCase(),
        rawModel: (v.model || "").toLowerCase(),
      })),
    [vehicles]
  );

  // Fuse on the *raw* fields handles small typos; we layer the normalized
  // substring check on top to handle "190SL" vs "190 SL".
  const fuse = useMemo(
    () =>
      new Fuse(indexed, {
        keys: ["rawTitle", "rawModelDesc", "rawBrand", "rawModel"],
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: false,
        minMatchCharLength: 2,
      }),
    [indexed]
  );

  return useMemo(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return vehicles;

    // Token-based AND search on normalized strings.
    const tokens = trimmed
      .split(/\s+/)
      .map((t) => normalize(t))
      .filter((t) => t.length >= 1);

    const normalizedHits = new Set<string>();
    if (tokens.length > 0) {
      for (const item of indexed) {
        const haystack =
          item.normTitle + " " + item.normModelDesc + " " + item.normBrand + " " + item.normModel;
        const allMatch = tokens.every((tok) => haystack.includes(tok));
        if (allMatch) normalizedHits.add(item.vehicle.id);
      }
    }

    // Fuse handles typos (e.g. "Terramr" -> "Terramar")
    const fuseResults = fuse.search(trimmed);
    const fuseHits = new Set(fuseResults.map((r) => r.item.vehicle.id));

    const allHits = new Set<string>([...normalizedHits, ...fuseHits]);
    if (allHits.size === 0) return [];

    return vehicles.filter((v) => allHits.has(v.id));
  }, [vehicles, indexed, fuse, query]);
}
