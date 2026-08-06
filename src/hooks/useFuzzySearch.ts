import { useMemo } from "react";
import Fuse from "fuse.js";
import type { Vehicle } from "./useVehicles";

/**
 * Normalize a string for comparison: lowercase, strip spaces, hyphens
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
 */
export function tokenize(text: string | null | undefined): string[] {
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

/** Nur Ziffern? Dann ist es fast immer eine Modellnummer (190, 320, 911). */
export const isNumericQuery = (q: string): boolean => /^\d+$/.test(q.trim());

interface IndexedVehicle {
  vehicle: Vehicle;
  haystack: string;
  rawTitle: string;
  rawModelDesc: string;
  rawBrand: string;
  rawModel: string;
  tokens: string[];
  /** Tokens nur aus Titel, Modell und Modellbezeichnung — für Zahlensuche */
  modelTokens: string[];
  internalId: string;
}

/**
 * Fuzzy search over a list of vehicles.
 *
 * Regeln:
 * - Reine Ziffernsuche ("190") sucht NICHT unscharf. Treffer nur, wenn die
 *   Ziffernfolge als eigenständiges Wort in Titel, Modell oder
 *   Modellbezeichnung steht, oder wenn interne Nummer / VIN damit beginnen.
 * - Textsuche ist nur leicht fehlertolerant (enge Schwelle).
 * - Mehrere Wörter: ALLE müssen treffen.
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
          haystack:
            normalize(v.title) +
            " " +
            normalize(v.model_description) +
            " " +
            normalize(v.brand) +
            " " +
            normalize(v.model),
          rawTitle: (v.title || "").toLowerCase(),
          rawModelDesc: (v.model_description || "").toLowerCase(),
          rawBrand: (v.brand || "").toLowerCase(),
          rawModel: (v.model || "").toLowerCase(),
          tokens: tokenize(combined),
          modelTokens: tokenize([v.title, v.model, v.model_description].filter(Boolean).join(" ")),
          internalId: (
            (v.mobile_de_id || "") +
            " " +
            ((v as unknown as { vin?: string | null }).vin || "")
          )
            .toLowerCase()
            .trim(),
        };
      }),
    [vehicles]
  );

  // Enge Schwelle: nur echte Tippfehler, keine ähnlich klingenden Modelle.
  const fuse = useMemo(
    () =>
      new Fuse(indexed, {
        keys: ["rawTitle", "rawModelDesc", "rawBrand", "rawModel"],
        threshold: 0.2,
        distance: 60,
        ignoreLocation: true,
        includeScore: false,
        minMatchCharLength: 3,
      }),
    [indexed]
  );

  return useMemo(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return vehicles;

    // ---- Reine Zahlensuche: exakt, niemals unscharf ----
    if (isNumericQuery(trimmed)) {
      const num = trimmed;
      const hits = new Set(
        indexed
          .filter(
            (item) =>
              item.modelTokens.includes(num) ||
              item.internalId.split(/\s+/).some((id) => id && id.startsWith(num))
          )
          .map((item) => item.vehicle.id)
      );
      return vehicles.filter((v) => hits.has(v.id));
    }

    const queryTokens = tokenize(trimmed);
    const nQuery = normalize(trimmed);

    const tokenHits = new Set<string>();
    for (const item of indexed) {
      // Jedes Suchwort muss treffen — Zahl-Tokens exakt, Wörter als Präfix.
      const allTokensMatch = queryTokens.every((qTok) => {
        if (/^\d+$/.test(qTok)) return item.tokens.includes(qTok);
        return (
          item.tokens.some((tTok) => tTok.startsWith(qTok) || qTok.startsWith(tTok)) ||
          item.haystack.includes(qTok)
        );
      });
      if (allTokensMatch || item.haystack.includes(nQuery)) tokenHits.add(item.vehicle.id);
    }

    // Fuse fängt Tippfehler ab (z. B. "Terramr" → "Terramar"),
    // aber nur wenn die Suche keine Zahl enthält.
    const hasDigits = queryTokens.some((t) => /\d/.test(t));
    const fuseHits = hasDigits
      ? new Set<string>()
      : new Set(fuse.search(trimmed).map((r) => r.item.vehicle.id));

    const allHits = new Set<string>([...tokenHits, ...fuseHits]);
    if (allHits.size === 0) return [];
    return vehicles.filter((v) => allHits.has(v.id));
  }, [vehicles, indexed, fuse, query]);
}
