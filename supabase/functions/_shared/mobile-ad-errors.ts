// Strukturierte Auswertung der Mobile.de-Fehlerobjekte.
// EINZIGE Quelle der Wahrheit für die Zuordnung Feldpfad → Eingabefeld,
// gemeinsam gepflegt mit der Pflichtfeldliste (mobile-ad-required.ts).
// Keine Importe außer der Pflichtfeldliste, damit die Datei in Deno UND im
// Browser läuft.

import { REQUIRED_AD_FIELDS, type AdFieldSection } from "./mobile-ad-required.ts";

export interface AdFieldRef {
  /** Feldname im Formularzustand des Assistenten */
  form: string;
  /** Deutsche Beschriftung, exakt wie im Formular */
  label: string;
  /** Abschnitt in Schritt 3 bzw. "fotos" */
  section: AdFieldSection;
}

/** Zusätzliche (nicht pflichtige) Felder — Pflichtfelder kommen aus REQUIRED_AD_FIELDS. */
const OPTIONAL_FIELD_MAP: Record<string, AdFieldRef> = {
  trimLine: { form: "trimLine", label: "Ausstattungslinie", section: "basis" },
  modelRange: { form: "modelRange", label: "Modellreihe", section: "basis" },
  constructionYear: { form: "constructionYear", label: "Baujahr", section: "basis" },
  internalNumber: { form: "internalNumber", label: "Interne Nummer", section: "basis" },
  vin: { form: "vin", label: "Fahrzeug-Identifikationsnummer", section: "basis" },
  doors: { form: "doors", label: "Türen", section: "technik" },
  seats: { form: "seats", label: "Sitzplätze", section: "technik" },
  cylinder: { form: "cylinders", label: "Zylinder", section: "technik" },
  fuelCapacity: { form: "fuelCapacity", label: "Tankinhalt", section: "technik" },
  driveType: { form: "driveType", label: "Antriebsart", section: "technik" },
  exteriorColor: { form: "exteriorColor", label: "Außenfarbe", section: "technik" },
  manufacturerColorName: { form: "manufacturerColorName", label: "Farbbezeichnung des Herstellers", section: "technik" },
  metallic: { form: "metallic", label: "Metallic-Lackierung", section: "technik" },
  matteColor: { form: "matt", label: "Matt-Lackierung", section: "technik" },
  climatisation: { form: "climatisation", label: "Klimatisierung", section: "ausstattung" },
  parkingAssistants: { form: "parkingAssistants", label: "Parkassistenten", section: "ausstattung" },
  emissionClass: { form: "emissionClass", label: "Schadstoffklasse", section: "technik" },
  emissionSticker: { form: "emissionSticker", label: "Feinstaubplakette", section: "technik" },
  generalInspection: { form: "hsnYear", label: "Hauptuntersuchung", section: "technik" },
  numberOfPreviousOwners: { form: "numberOfPreviousOwners", label: "Anzahl Vorbesitzer", section: "basis" },
  co2EmissionsCombined: { form: "co2EmissionsCombined", label: "CO₂-Ausstoß (kombiniert)", section: "technik" },
  consumptionCombined: { form: "consumptionCombined", label: "Verbrauch (kombiniert)", section: "technik" },
  description: { form: "description", label: "Beschreibung", section: "preis" },
  images: { form: "fotos", label: "Fotos", section: "fotos" },
  currency: { form: "consumerPriceGross", label: "Währung", section: "preis" },
  type: { form: "consumerPriceGross", label: "Preistyp", section: "preis" },
};

/** Pfad normalisieren: "ad.vehicle.model-description" → "modelDescription". */
export function normalizeFieldPath(raw: string): string {
  let p = String(raw ?? "").trim();
  p = p.replace(/\[\d+\]/g, "");
  p = p.replace(/^ad\./, "").replace(/^vehicle\./, "");
  const parts = p.split(".").filter(Boolean);
  // price.consumerPriceGross bleibt zweiteilig, alles andere auf das letzte Glied
  const last = parts[parts.length - 1] ?? p;
  const kebabToCamel = (s: string) =>
    s.replace(/[-_](\w)/g, (_m, c: string) => c.toUpperCase());
  if (parts[0] === "price" && parts.length > 1) return `price.${kebabToCamel(last)}`;
  return kebabToCamel(last);
}

/** Eingabefeld zu einem Mobile.de-Feldpfad. */
export function fieldRefForPath(rawPath: string): AdFieldRef | null {
  const path = normalizeFieldPath(rawPath);
  const required = REQUIRED_AD_FIELDS.find(
    (f) => f.api && (f.api === path || normalizeFieldPath(f.api) === path),
  );
  if (required) {
    return { form: required.form, label: required.label, section: required.section };
  }
  const bare = path.includes(".") ? path.split(".").pop()! : path;
  return OPTIONAL_FIELD_MAP[path] ?? OPTIONAL_FIELD_MAP[bare] ?? null;
}

/* ── Fehlertexte ──────────────────────────────────────────────────────────
 * Die deutschen Texte kommen vorrangig aus den Referenzdaten von Mobile.de
 * (kind "error-messages"). Diese Liste ist nur die Rückfallebene und wird
 * zusammen mit einem Protokolleintrag benutzt, wenn ein Schlüssel fehlt. */
export const FALLBACK_ERROR_TEXTS: Record<string, string> = {
  "missing-field": "Pflichtangabe für Mobile.de.",
  "missing-mandatory-field": "Pflichtangabe für Mobile.de.",
  "field-required": "Pflichtangabe für Mobile.de.",
  "invalid-reference-data-value": "'{value}' ist kein zulässiger Wert. Bitte aus der Liste wählen.",
  "invalid-value": "'{value}' ist kein zulässiger Wert.",
  "not-a-number": "'{value}' ist keine gültige Zahl.",
  "value-out-of-range": "'{value}' liegt außerhalb des zulässigen Bereichs.",
  "field-too-long": "Der Text ist zu lang.",
  "field-too-short": "Der Text ist zu kurz.",
  "first-registration-in-future": "Das Datum liegt in der Zukunft.",
  "date-in-future": "Das Datum liegt in der Zukunft.",
  "invalid-date": "Das Datum ist ungültig.",
  "invalid-vin": "Die Fahrzeug-Identifikationsnummer ist ungültig.",
  "consumer-price-not-in-range": "Der Preis liegt außerhalb des zulässigen Bereichs.",
  "invalid-price": "Der Preis ist ungültig.",
  "duplicate-ad": "Für dieses Fahrzeug besteht bereits ein Inserat.",
  "invalid-model-for-make": "Das Modell passt nicht zur gewählten Marke.",
  "unauthorized": "Die Zugangsdaten für dieses Mobile.de-Konto werden nicht akzeptiert.",
};

export interface AdIssue {
  /** Mobile.de-Fehlerschlüssel, z. B. "invalid-reference-data-value" */
  key: string;
  /** Feldpfad aus der Antwort, z. B. "ad.vehicle.gearbox" */
  path: string | null;
  /** Beanstandeter Wert */
  value: string | null;
  /** Zugeordnetes Eingabefeld (null = kein Feld im Assistenten) */
  field: AdFieldRef | null;
  /** Fertiger deutscher Satz für die Anzeige */
  message: string;
  /** Kurze Kennung, steht auch im Protokoll */
  code: string;
  /** true, wenn der Schlüssel weder in den Referenzdaten noch im Wörterbuch stand */
  unknownKey: boolean;
}

/** Kurze, stabile Kennung aus Schlüssel + Pfad, z. B. "MD-7K3Q". */
export function issueCode(key: string, path?: string | null): string {
  const src = `${key}|${path ?? ""}`;
  let h = 0;
  for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) >>> 0;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  let n = h;
  for (let i = 0; i < 4; i++) {
    out += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return `MD-${out}`;
}

/** Kennung für eine gesamte Meldung (Kontext + Text). */
export function messageCode(context: string, text: string): string {
  return issueCode(context, text.slice(0, 60));
}

function readArg(args: unknown, name: string): string | null {
  if (!Array.isArray(args)) {
    if (args && typeof args === "object") {
      const v = (args as Record<string, unknown>)[name];
      return v === undefined || v === null ? null : String(v);
    }
    return null;
  }
  for (const a of args) {
    if (a && typeof a === "object") {
      const o = a as Record<string, unknown>;
      if (String(o.key ?? o.name ?? "") === name) {
        return o.value === undefined || o.value === null ? null : String(o.value);
      }
    }
  }
  return null;
}

/**
 * Wertet das Fehlerobjekt der Seller-API aus.
 * `texts` sind die lokalisierten Texte aus den Referenzdaten (Schlüssel → Satz).
 * `onUnknownKey` wird für jeden Schlüssel ohne Übersetzung gerufen (Protokoll).
 */
export function parseMobileErrors(
  body: unknown,
  opts?: {
    texts?: Record<string, string>;
    onUnknownKey?: (key: string) => void;
  },
): AdIssue[] {
  const texts = opts?.texts ?? {};
  let parsed: unknown = body;
  if (typeof body === "string") {
    try { parsed = JSON.parse(body); } catch { parsed = null; }
  }
  const root = (parsed ?? {}) as Record<string, unknown>;
  const rawList: unknown[] = Array.isArray(root.errors)
    ? root.errors
    : Array.isArray(root.warnings)
      ? root.warnings
      : Array.isArray(parsed) ? (parsed as unknown[]) : [];

  const issues: AdIssue[] = [];
  for (const raw of rawList) {
    const e = (raw ?? {}) as Record<string, unknown>;
    const key = String(e.key ?? e.code ?? e.type ?? "unknown-error");
    const path = readArg(e.args, "path") ?? (e.path ? String(e.path) : null);
    const value =
      readArg(e.args, "value") ??
      readArg(e.args, "rejectedValue") ??
      (e.value === undefined || e.value === null ? null : String(e.value));
    const field = path ? fieldRefForPath(path) : null;

    const template = texts[key] ?? FALLBACK_ERROR_TEXTS[key];
    const unknownKey = !template;
    if (unknownKey) opts?.onUnknownKey?.(key);

    const rawText =
      (typeof e.message === "string" && e.message.trim()) ||
      (typeof e.description === "string" && e.description.trim()) ||
      "";
    const sentence = template
      ? template.replace(/\{value\}/g, value ?? "—")
      : rawText || `Mobile.de meldet: ${key}`;

    const label = field?.label ?? (path ? normalizeFieldPath(path) : null);
    const message = label ? `${label}: ${sentence}` : sentence;

    issues.push({
      key, path, value, field, message,
      code: issueCode(key, path),
      unknownKey,
    });
  }
  return issues;
}

/** Ein Satz, der mehrere Fehler zusammenfasst. */
export function summarizeIssues(issues: AdIssue[]): string {
  if (issues.length === 0) return "Mobile.de hat das Inserat abgelehnt.";
  if (issues.length === 1) return issues[0].message;
  return `${issues.length} Angaben müssen korrigiert werden.`;
}
