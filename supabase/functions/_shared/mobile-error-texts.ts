// Lokalisierte Fehlertexte von Mobile.de (Referenzdaten), 24 Stunden gepuffert.
// Fällt auf das Wörterbuch in mobile-ad-errors.ts zurück und protokolliert
// jeden Schlüssel, für den es keinen Text gibt.

const REFDATA_BASE = "https://services.mobile.de/refdata";
const TTL_MS = 24 * 60 * 60 * 1000;

/** Refdata-Pfade, unter denen Mobile.de die Fehlertexte anbietet. */
const CANDIDATE_PATHS = ["/error-messages", "/errors", "/messages"];

let cache: { at: number; texts: Record<string, string> } | null = null;

function parseItems(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const itemRe = /<(?:[\w-]+:)?(item|value)\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?\1>/g;
  const keyRe = /\bkey="([^"]+)"/;
  const descRe = /<(?:[\w-]+:)?local-description\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?local-description>/g;
  const langRe = /\bxml-lang="([^"]+)"/;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const key = keyRe.exec(m[2])?.[1];
    if (!key) continue;
    let de: string | undefined;
    let any: string | undefined;
    let d: RegExpExecArray | null;
    descRe.lastIndex = 0;
    while ((d = descRe.exec(m[3])) !== null) {
      const text = d[2].trim();
      if (!text) continue;
      any ??= text;
      if (langRe.exec(d[1])?.[1] === "de") { de = text; break; }
    }
    const text = de ?? any;
    if (text) out[key] = text;
  }
  return out;
}

/**
 * Deutsche Fehlertexte laden. Schlägt der Abruf fehl, wird ein leeres Objekt
 * zurückgegeben — die Aufrufer greifen dann auf FALLBACK_ERROR_TEXTS zurück.
 */
export async function loadMobileErrorTexts(
  user: string,
  pass: string,
): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.texts;
  const auth = btoa(`${user}:${pass}`);
  for (const path of CANDIDATE_PATHS) {
    try {
      const res = await fetch(`${REFDATA_BASE}${path}?lang=de`, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/xml",
          "Accept-Language": "de-DE,de;q=0.9",
        },
      });
      if (!res.ok) {
        console.warn(`Fehlertexte ${res.status} für ${path}`);
        continue;
      }
      const texts = parseItems(await res.text());
      if (Object.keys(texts).length) {
        cache = { at: Date.now(), texts };
        return texts;
      }
    } catch (e) {
      console.warn(`Fehlertexte ${path} nicht abrufbar: ${(e as Error).message}`);
    }
  }
  cache = { at: Date.now(), texts: {} };
  return {};
}
