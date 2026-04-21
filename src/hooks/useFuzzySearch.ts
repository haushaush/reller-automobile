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

/**
 * Smart tokenizer:
 * - Splits on whitespace, hyphens, punctuation
 * - Splits between letters and digits ("SL190" → ["sl", "190"], "190SL" → ["190", "sl"])
 * - Lowercases and removes empty tokens
 */
function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/([a-z])(\d)/gi, "$1 $2")
    .replace(/(\d)([a-z])/gi, "$1 $2")
    .split(/[\s\-_./,;:!?()'"`]+/)
    .filter((t) => t.length > 0);
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
  tokens: string[];
}

/**
 * Fuzzy search over a list of vehicles. Tolerates typos, ignores
 * whitespace/hyphens, ignores word order (each token must fuzzy-match
 * somewhere in the searchable fields). Also handles glued letter+digit
 * combos like "SL190" / "190SL".
 *
 * Returns the original list when query is empty/short.
 */
export function useFuzzySearch(vehicles: Vehicle[], query: string): Vehicle[] {
  const indexed = useMemo<IndexedVehicle[]>(
    () =>
      vehicles.map((v) => {
        const combined = [v.title, v.model, v.model_description, v.brand]
          .filter(Boolean)
          .join(" ");
        return {
          vehicle: v,
          normTitle: normalize(v.title),
          normModelDesc: normalize(v.model_description),
          normBrand: normalize(v.brand),
          normModel: normalize(v.model),
          rawTitle: (v.title || "").toLowerCase(),
          rawModelDesc: (v.model_description || "").toLowerCase(),
          rawBrand: (v.brand || "").toLowerCase(),
          rawModel: (v.model || "").toLowerCase(),
          tokens: tokenize(combined),
        };
      }),
    [vehicles]
  );

  // Fuse on the *raw* fields handles small typos; we layer the normalized
  // substring + token check on top to handle "190SL" vs "190 SL".
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

    const queryTokens = tokenize(trimmed);
    const nQuery = normalize(trimmed);

    const tokenHits = new Set<string>();
    if (queryTokens.length > 0) {
      for (const item of indexed) {
        const haystack =
          item.normTitle + " " + item.normModelDesc + " " + item.normBrand + " " + item.normModel;

        // Each query token must appear inside some indexed token,
        // OR be contained as substring in the normalized haystack.
        const allTokensMatch = queryTokens.every(
          (qTok) =>
            item.tokens.some((tTok) => tTok.includes(qTok) || qTok.includes(tTok)) ||
            haystack.includes(qTok)
        );

        const directSubstring = haystack.includes(nQuery);

        if (allTokensMatch || directSubstring) tokenHits.add(item.vehicle.id);
      }
    }

    // Fuse handles typos (e.g. "Terramr" -> "Terramar")
    const fuseResults = fuse.search(trimmed);
    const fuseHits = new Set(fuseResults.map((r) => r.item.vehicle.id));

    const allHits = new Set<string>([...tokenHits, ...fuseHits]);
    if (allHits.size === 0) return [];

    return vehicles.filter((v) => allHits.has(v.id));
  }, [vehicles, indexed, fuse, query]);
}
