import type { Vehicle } from "@/hooks/useVehicles";

/** Lowercase + strip whitespace, hyphens, underscores, dots, slashes, diacritics. */
const normalize = (s: string | null | undefined): string =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s\-_/.]+/g, "");

/**
 * Smart tokenizer — splits on whitespace AND between letters/digits.
 * "SL190" → ["sl", "190"], "190SL" → ["190", "sl"], "SL 190" → ["sl", "190"]
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

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m: number[][] = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        m[i][j] = m[i - 1][j - 1];
      } else {
        m[i][j] = Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
      }
    }
  }
  return m[b.length][a.length];
}

/**
 * Returns a relevance score for a vehicle against a search query.
 * Higher = more relevant. Returns 0 if there is no meaningful match.
 *
 * Robust against glued letter+digit combos: "SL190", "190SL", "SL 190"
 * all score the same against "Mercedes-Benz 190 SL".
 */
export function calculateRelevanceScore(vehicle: Vehicle, query: string): number {
  const trimmed = query.trim();
  if (!trimmed) return 0;

  const nQuery = normalize(trimmed);
  if (nQuery.length === 0) return 0;

  const title = (vehicle.title || "").toLowerCase();
  const model = (vehicle.model || "").toLowerCase();
  const modelDesc = (vehicle.model_description || "").toLowerCase();
  const brand = (vehicle.brand || "").toLowerCase();

  const nTitle = normalize(title);
  const nModel = normalize(model);
  const nModelDesc = normalize(modelDesc);
  const nBrand = normalize(brand);

  const queryTokens = tokenize(trimmed);
  const textTokens = tokenize(
    [vehicle.title, vehicle.brand, vehicle.model, vehicle.model_description]
      .filter(Boolean)
      .join(" ")
  );

  let score = 0;

  // 1. Exact normalized model match
  if (nModel && nModel === nQuery) score += 1000;

  // 2. Model starts with query
  if (nModel && nModel.startsWith(nQuery)) score += 500;

  // 3. Model description starts with query
  if (nModelDesc && nModelDesc.startsWith(nQuery)) score += 400;

  // 4. Title starts with query
  if (nTitle && nTitle.startsWith(nQuery)) score += 300;

  // 5. Query as contiguous substring in model
  if (nModel && nModel.includes(nQuery)) score += 200;

  // 6. Query as contiguous substring in title
  if (nTitle && nTitle.includes(nQuery)) score += 150;

  // 7. Token-AND match — every query token appears in some text token.
  //    Makes "SL190" find "Mercedes-Benz 190 SL".
  if (queryTokens.length > 0) {
    const allTokensFound = queryTokens.every((qTok) =>
      textTokens.some((tTok) => tTok.includes(qTok) || qTok.includes(tTok))
    );
    if (allTokensFound) {
      score += 200;
      const exactTokenMatches = queryTokens.every((qTok) => textTokens.includes(qTok));
      if (exactTokenMatches) score += 150;
    }
  }

  // 8. All query words individually found in the haystack
  const haystack = nTitle + " " + nModel + " " + nModelDesc + " " + nBrand;
  const queryWords = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const allWordsFound = queryWords.every((w) => haystack.includes(normalize(w)));
  if (allWordsFound) score += 50;

  // 9. Bonus: earlier position in title = stronger signal
  const pos = nTitle.indexOf(nQuery);
  if (pos >= 0) score += Math.max(0, 100 - pos);

  // 10. Fuzzy fallback (typos) only when nothing else matched
  if (score === 0 && nModel) {
    const distance = levenshtein(nQuery, nModel);
    const maxLen = Math.max(nQuery.length, nModel.length);
    const similarity = maxLen > 0 ? 1 - distance / maxLen : 0;
    if (similarity > 0.7) score += Math.floor(similarity * 30);
  }

  return score;
}
