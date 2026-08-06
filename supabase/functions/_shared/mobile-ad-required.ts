// Gemeinsame Pflichtfeldliste für Mobile.de-Inserate.
// EINZIGE Quelle der Wahrheit — wird sowohl vom Assistenten im Frontend
// (src/lib/mobileAdForm.ts) als auch von der Edge Function publish-mobile-ad
// benutzt. Keine Importe hier, damit die Datei in Deno UND im Browser läuft.

export type AdFieldSection = "fotos" | "basis" | "technik" | "ausstattung" | "preis";

export interface RequiredAdField {
  /** Schlüssel im Mobile.de-Payload. null = reines Portalfeld. */
  api: string | null;
  /** Feldname im Formularzustand (FormState). */
  form: string;
  /** Deutsche Beschriftung, exakt wie im Formular. */
  label: string;
  /** Abschnitt im Assistenten (Schritt 3) bzw. "fotos". */
  section: AdFieldSection;
  /** Art der Prüfung. */
  kind: "text" | "number" | "boolean" | "yyyymm" | "amount";
}

export const REQUIRED_AD_FIELDS: RequiredAdField[] = [
  { api: "make", form: "make", label: "Marke", section: "basis", kind: "text" },
  { api: "model", form: "model", label: "Modell", section: "basis", kind: "text" },
  { api: "modelDescription", form: "modelDescription", label: "Modellbezeichnung", section: "basis", kind: "text" },
  { api: "category", form: "category", label: "Karosserieform (Mobile.de)", section: "basis", kind: "text" },
  { api: null, form: "portalCategory", label: "Fahrzeugart", section: "basis", kind: "text" },
  { api: "mileage", form: "mileage", label: "Kilometerstand", section: "basis", kind: "number" },
  { api: "firstRegistration", form: "regYear", label: "Erstzulassung", section: "basis", kind: "yyyymm" },
  { api: "condition", form: "condition", label: "Zustand", section: "basis", kind: "text" },
  { api: "damageUnrepaired", form: "damageUnrepaired", label: "Unfallschaden", section: "basis", kind: "boolean" },
  { api: "fuel", form: "fuel", label: "Kraftstoff", section: "technik", kind: "text" },
  { api: "gearbox", form: "gearbox", label: "Getriebe", section: "technik", kind: "text" },
  { api: "power", form: "power", label: "Leistung (kW)", section: "technik", kind: "number" },
  { api: "cubicCapacity", form: "cubicCapacity", label: "Hubraum (ccm)", section: "technik", kind: "number" },
  { api: "price.consumerPriceGross", form: "consumerPriceGross", label: "Preis (Brutto, EUR)", section: "preis", kind: "amount" },
  { api: "price.vatRate", form: "vatRate", label: "Mehrwertsteuer", section: "preis", kind: "text" },
];

/** Deutsche Beschriftung zu einem Mobile.de-Feldnamen (für Fehlermeldungen). */
export function labelForApiField(api: string): string {
  const bare = api.replace(/\s*\(.*\)$/, "").trim();
  const hit = REQUIRED_AD_FIELDS.find((f) => f.api === bare);
  return hit ? hit.label : api;
}

export function fieldForApi(api: string): RequiredAdField | undefined {
  const bare = api.replace(/\s*\(.*\)$/, "").trim();
  return REQUIRED_AD_FIELDS.find((f) => f.api === bare);
}

function filled(kind: RequiredAdField["kind"], value: unknown): boolean {
  switch (kind) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return value !== undefined && value !== null && value !== "" && !Number.isNaN(Number(value));
    case "yyyymm":
      return /^\d{6}$/.test(String(value ?? ""));
    case "amount": {
      const clean = String(value ?? "").replace(/[^0-9]/g, "");
      return Boolean(clean) && clean !== "0";
    }
    default:
      return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null && value !== "";
  }
}

/**
 * Prüft die Pflichtfelder. `values` wird über den API-Schlüssel ODER den
 * Formularnamen gelesen — je nachdem, welche Seite prüft.
 */
export function checkRequiredAdFields(
  values: Record<string, unknown>,
  opts?: { by?: "api" | "form"; skipPortalOnly?: boolean },
): RequiredAdField[] {
  const by = opts?.by ?? "api";
  return REQUIRED_AD_FIELDS.filter((f) => {
    if (by === "api") {
      if (!f.api) return false; // Portalfeld — nicht Teil des Mobile.de-Payloads
      return !filled(f.kind, values[f.api]);
    }
    if (opts?.skipPortalOnly && !f.api) return false;
    return !filled(f.kind, values[f.form]);
  });
}

/** Portal-Fahrzeugart (vehicles.vehicle_category) — genau diese fünf Werte. */
export const PORTAL_VEHICLE_CATEGORIES: { key: string; label: string }[] = [
  { key: "used", label: "Gebrauchtwagen" },
  { key: "accident", label: "Unfallfahrzeug" },
  { key: "oldtimer", label: "Oldtimer" },
  { key: "youngtimer", label: "Youngtimer" },
  { key: "commercial", label: "Nutzfahrzeug" },
];

export const PORTAL_VEHICLE_CATEGORY_KEYS = PORTAL_VEHICLE_CATEGORIES.map((c) => c.key);
