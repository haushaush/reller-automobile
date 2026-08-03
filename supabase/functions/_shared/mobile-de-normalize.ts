/**
 * Gemeinsame Normalisierungs- und Qualitaets-Helfer fuer die Mobile.de-Syncs.
 *
 * Ziel: body_type, fuel, gearbox, condition, usage_type, climatisation,
 * interior_type und exterior_color liegen in der DB immer als stabiler
 * englischer Mobile.de-Key (<feld>_key) UND als deutscher Anzeigetext
 * (<feld>_label) vor. Die bestehende Spalte bleibt befuellt (mit dem Label),
 * damit bestehende Frontend-Filter nicht brechen.
 */

export type NormField =
  | "body_type"
  | "fuel"
  | "gearbox"
  | "condition"
  | "usage_type"
  | "climatisation"
  | "interior_type"
  | "exterior_color";

/** field -> key -> deutsches Label. Reihenfolge = Prioritaet beim Label->Key-Reverse-Lookup. */
export const MOBILE_DE_LABELS: Record<NormField, Record<string, string>> = {
  body_type: {
    EstateCar: "Kombi",
    Cabrio: "Cabrio",
    Convertible: "Cabrio",
    Coupe: "Coupé",
    SmallCar: "Kleinwagen",
    Limousine: "Limousine",
    Saloon: "Limousine",
    SportsCar: "Sportwagen",
    Van: "Van",
    OffRoad: "SUV / Geländewagen",
    OffRoader: "SUV / Geländewagen",
    SUV: "SUV",
    BoxTypeDeliveryVan: "Kastenwagen",
    BoxVan: "Kastenwagen",
    PassengerVan: "Kleinbus",
    CrewCab: "Doppelkabine",
    SingleCab: "Einzelkabine",
    Pickup: "Pickup",
    Transporter: "Transporter",
    Truck: "LKW",
    TruckOver7500: "LKW über 7,5 t",
    TruckUpTo7500: "LKW bis 7,5 t",
    Tractor: "Traktor",
    Trailer: "Anhänger",
    SemiTrailer: "Auflieger",
    SemiTrailerTruck: "Sattelzugmaschine",
    Tipper: "Kipper",
    RefrigeratorBox: "Kühlkoffer",
    Bus: "Bus",
    ConstructionMachine: "Baumaschine",
    AgriculturalVehicle: "Landwirtschaftliches Fahrzeug",
    ForkliftTruck: "Gabelstapler",
    MunicipalVehicle: "Kommunalfahrzeug",
    OtherCar: "Sonstige",
    Other: "Sonstige",
    Chopper: "Chopper",
    Enduro: "Enduro",
    Naked: "Naked Bike",
    Roadster: "Roadster",
    Scooter: "Roller",
    Supermoto: "Supermoto",
    Touring: "Tourer",
  },
  fuel: {
    Petrol: "Benzin",
    Diesel: "Diesel",
    Electricity: "Elektro",
    Electric: "Elektro",
    Hybrid: "Hybrid",
    HybridPetrol: "Hybrid (Benzin)",
    HybridDiesel: "Hybrid (Diesel)",
    PluginHybrid: "Plug-in-Hybrid",
    PluginHybridPetrol: "Plug-in-Hybrid (Benzin)",
    PluginHybridDiesel: "Plug-in-Hybrid (Diesel)",
    LPG: "Autogas (LPG)",
    CNG: "Erdgas (CNG)",
    Hydrogen: "Wasserstoff",
    Ethanol: "Ethanol",
    Other: "Sonstige",
  },
  gearbox: {
    AutomaticGear: "Automatik",
    Automatic: "Automatik",
    ManualGear: "Schaltgetriebe",
    Manual: "Schaltgetriebe",
    SemiautomaticGear: "Halbautomatik",
    SemiAutomatic: "Halbautomatik",
  },
  condition: {
    New: "Neufahrzeug",
    Used: "Gebrauchtfahrzeug",
    Demonstration: "Vorführwagen",
    EmployeesCar: "Mitarbeiterfahrzeug",
    PreRegistration: "Tageszulassung",
    Accident: "Unfallfahrzeug",
    AccidentDamaged: "Unfallfahrzeug",
    Damaged: "Beschädigtes Fahrzeug",
    Defective: "Defektes Fahrzeug",
    Salvage: "Restwertfahrzeug",
  },
  usage_type: {
    New: "Neufahrzeug",
    Used: "Gebrauchtfahrzeug",
    Demonstration: "Vorführwagen",
    EmployeesCar: "Mitarbeiterfahrzeug",
    PreRegistration: "Tageszulassung",
    Oldtimer: "Oldtimer",
    Accident: "Unfallfahrzeug",
    AccidentDamaged: "Unfallfahrzeug",
    Damaged: "Beschädigtes Fahrzeug",
    Defective: "Defektes Fahrzeug",
    Salvage: "Restwertfahrzeug",
  },
  climatisation: {
    NoClimatisation: "Keine",
    ManualClimatisation: "Klimaanlage",
    AutomaticClimatisation: "Klimaautomatik",
    AutomaticClimatisation2Zones: "2-Zonen-Klimaautomatik",
    AutomaticClimatisation3Zones: "3-Zonen-Klimaautomatik",
    AutomaticClimatisation4Zones: "4-Zonen-Klimaautomatik",
  },
  interior_type: {
    Cloth: "Stoff",
    PartLeather: "Teilleder",
    FullLeather: "Leder",
    Velour: "Velours",
    Alcantara: "Alcantara",
    Other: "Sonstige",
  },
  exterior_color: {
    BLACK: "Schwarz",
    WHITE: "Weiß",
    SILVER: "Silber",
    GREY: "Grau",
    BLUE: "Blau",
    RED: "Rot",
    GREEN: "Grün",
    YELLOW: "Gelb",
    ORANGE: "Orange",
    BROWN: "Braun",
    BEIGE: "Beige",
    GOLD: "Gold",
    PURPLE: "Violett",
    BRONZE: "Bronze",
  },
};

const REVERSE_CACHE: Partial<Record<NormField, Map<string, string>>> = {};

function reverseMap(field: NormField): Map<string, string> {
  let m = REVERSE_CACHE[field];
  if (m) return m;
  m = new Map<string, string>();
  for (const [key, label] of Object.entries(MOBILE_DE_LABELS[field])) {
    const lk = label.toLowerCase();
    if (!m.has(lk)) m.set(lk, key); // erste Definition gewinnt (Prioritaet)
  }
  REVERSE_CACHE[field] = m;
  return m;
}

function camelToWords(value: string): string {
  return value.replace(/([A-Z])/g, " $1").trim();
}

/**
 * Nimmt einen Rohwert (Mobile.de-Key ODER deutsche local-description) und
 * liefert immer {key, label}. Fehlt eine Zuordnung, wird der Rohwert
 * durchgereicht (key = Rohwert falls er wie ein Key aussieht).
 */
export function normalizeField(
  field: NormField,
  rawKey: string | null | undefined,
  rawLabel?: string | null,
): { key: string | null; label: string | null } {
  const labels = MOBILE_DE_LABELS[field];
  const rev = reverseMap(field);

  const candidates = [rawKey, rawLabel].filter((v): v is string => !!v && v.trim() !== "");
  if (candidates.length === 0) return { key: null, label: null };

  let key: string | null = null;
  let label: string | null = null;

  for (const c of candidates) {
    const trimmed = c.trim();
    // 1) exakter Key-Treffer
    if (labels[trimmed]) {
      key = trimmed;
      label = labels[trimmed];
      break;
    }
    // 2) case-insensitiver Key-Treffer
    const ciKey = Object.keys(labels).find((k) => k.toLowerCase() === trimmed.toLowerCase());
    if (ciKey) {
      key = ciKey;
      label = labels[ciKey];
      break;
    }
    // 3) Label-Treffer (deutscher Klartext aus local-description)
    const revKey = rev.get(trimmed.toLowerCase());
    if (revKey) {
      key = revKey;
      label = labels[revKey];
      break;
    }
  }

  if (!key) {
    // Unbekannter Wert: Key = Rohkey falls vorhanden, Label = lesbarer Fallback
    key = (rawKey && rawKey.trim()) || null;
    const raw = (rawLabel && rawLabel.trim()) || (rawKey && rawKey.trim()) || null;
    label = raw ? (/^[A-Za-z]+$/.test(raw) ? camelToWords(raw) : raw) : null;
  }

  return { key, label };
}

/** Alle relevanten Nutzfahrzeug-Keys der Mobile.de-Search-API. */
export const COMMERCIAL_BODY_TYPES = new Set<string>([
  "BoxTypeDeliveryVan",
  "BoxVan",
  "Transporter",
  "PassengerVan",
  "CrewCab",
  "SingleCab",
  "DoubleCab",
  "Pickup",
  "Tipper",
  "Truck",
  "TruckOver7500",
  "TruckUpTo7500",
  "SemiTrailerTruck",
  "SemiTrailer",
  "Trailer",
  "Tractor",
  "RefrigeratorBox",
  "Bus",
  "ConstructionMachine",
  "AgriculturalVehicle",
  "ForkliftTruck",
  "MunicipalVehicle",
  "SwapBody",
  "Chassis",
  "Platform",
  "Container",
  "Skip",
  "Silo",
  "TankTruck",
  "CarTransporter",
  "TowTruck",
  "ConcreteMixer",
]);

/** Keys / Klartexte, die auf einen Unfall- bzw. Schadenwagen hindeuten. */
const ACCIDENT_KEYS = new Set<string>([
  "Accident",
  "AccidentDamaged",
  "Damaged",
  "Defective",
  "Salvage",
]);

function looksLikeAccident(value: string | null | undefined): boolean {
  if (!value) return false;
  if (ACCIDENT_KEYS.has(value)) return true;
  const v = value.toLowerCase();
  return v.includes("unfall") || v.includes("beschädigt") || v.includes("beschaedigt") ||
    v.includes("defekt") || v.includes("restwert") || v.includes("accident") || v.includes("salvage");
}

export interface DeriveCategoryInput {
  bodyTypeKey: string | null;
  conditionKey: string | null;
  conditionLabel: string | null;
  usageTypeKey: string | null;
  usageTypeLabel: string | null;
  damageUnrepaired: boolean | null;
  year: string | null;
  isAccidentSync: boolean;
}

export function deriveCategory(input: DeriveCategoryInput): string {
  if (input.isAccidentSync) return "accident";
  if (input.damageUnrepaired === true) return "accident";
  if (
    looksLikeAccident(input.conditionKey) ||
    looksLikeAccident(input.conditionLabel) ||
    looksLikeAccident(input.usageTypeKey) ||
    looksLikeAccident(input.usageTypeLabel)
  ) {
    return "accident";
  }
  if (input.bodyTypeKey && COMMERCIAL_BODY_TYPES.has(input.bodyTypeKey)) return "commercial";
  if (input.year && /^\d{4}/.test(input.year)) {
    const y = parseInt(input.year.substring(0, 4), 10);
    const now = new Date().getFullYear();
    if (y <= now - 30) return "oldtimer";
    if (y <= now - 20) return "youngtimer";
  }
  return "used";
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ------------------------------------------------------------------ */
/* Manuelle Overrides                                                  */
/* ------------------------------------------------------------------ */

/**
 * Entfernt alle Felder aus der Upsert-Zeile, die in manual_overrides
 * hinterlegt sind. manual_overrides ist ein jsonb-Objekt der Form
 * { "vehicle_category": true, "title": true, ... } oder ein Array von Feldnamen.
 */
export function stripManualOverrides<T extends Record<string, unknown>>(
  row: T,
  overrides: unknown,
): T {
  const fields = overrideFieldList(overrides);
  if (fields.length === 0) return row;
  const clone = { ...row } as Record<string, unknown>;
  for (const f of fields) {
    if (f === "mobile_de_id" || f === "synced_at") continue; // niemals sperren
    delete clone[f];
  }
  return clone as T;
}

export function overrideFieldList(overrides: unknown): string[] {
  if (!overrides) return [];
  if (Array.isArray(overrides)) return overrides.filter((v): v is string => typeof v === "string");
  if (typeof overrides === "object") {
    return Object.entries(overrides as Record<string, unknown>)
      .filter(([, v]) => v !== false && v !== null && v !== undefined)
      .map(([k]) => k);
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Datenqualitaets-Pruefung                                            */
/* ------------------------------------------------------------------ */

export type Severity = "error" | "warning" | "info";

export interface QualityIssue {
  vehicle_id: string;
  issue_type: string;
  severity: Severity;
  detail: string;
}

interface QualityVehicle {
  id: string;
  title: string | null;
  price: number | null;
  year: string | null;
  mileage: number | null;
  description: string | null;
  image_urls: string[] | null;
  detail_page_url: string | null;
}

export function detectIssues(v: QualityVehicle): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const push = (issue_type: string, severity: Severity, detail: string) =>
    issues.push({ vehicle_id: v.id, issue_type, severity, detail });

  const imgCount = v.image_urls?.length ?? 0;
  if (imgCount === 0) push("no_images", "error", "Keine Bilder vorhanden");
  else if (imgCount < 3) push("few_images", "warning", `Nur ${imgCount} Bild(er) vorhanden`);

  if (v.price == null) push("no_price", "error", "Kein Preis hinterlegt");
  else if (v.price < 500) push("price_too_low", "warning", `Preis ungewöhnlich niedrig: ${v.price} €`);

  const currentYear = new Date().getFullYear();
  if (!v.year) {
    push("no_first_registration", "warning", "Keine Erstzulassung hinterlegt");
  } else {
    const y = parseInt(String(v.year).substring(0, 4), 10);
    if (!Number.isFinite(y) || y < 1900 || y > currentYear + 1) {
      push("invalid_first_registration", "warning", `Erstzulassung außerhalb 1900–${currentYear + 1}: ${v.year}`);
    }
  }

  if (v.mileage == null) push("no_mileage", "warning", "Kein Kilometerstand hinterlegt");
  else if (v.mileage > 1_000_000) push("mileage_implausible", "warning", `Kilometerstand unplausibel: ${v.mileage} km`);

  const descLen = (v.description ?? "").trim().length;
  if (descLen === 0) push("no_description", "warning", "Keine Beschreibung vorhanden");
  else if (descLen < 100) push("short_description", "info", `Beschreibung nur ${descLen} Zeichen lang`);

  if ((v.title ?? "").includes("Unbekanntes Fahrzeug")) {
    push("unknown_title", "error", "Titel enthält „Unbekanntes Fahrzeug“");
  }

  if (!v.detail_page_url) push("no_detail_page_url", "warning", "Keine Mobile.de-Detailseite hinterlegt");

  return issues;
}

interface MinimalClient {
  from: (table: string) => any;
}

/**
 * Prueft alle aktiven Fahrzeuge, legt neue Issues an, setzt resolved_at fuer
 * behobene Issues und liefert die Anzahl offener Issues zurueck.
 */
export async function runQualityScan(supabase: MinimalClient): Promise<number> {
  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select("id, title, price, year, mileage, description, image_urls, detail_page_url")
    .eq("is_sold", false);

  if (error || !vehicles) {
    console.error("quality-scan: konnte Fahrzeuge nicht laden", error);
    return 0;
  }

  const detected = new Map<string, QualityIssue>();
  for (const v of vehicles as QualityVehicle[]) {
    for (const issue of detectIssues(v)) {
      detected.set(`${issue.vehicle_id}::${issue.issue_type}`, issue);
    }
  }

  const { data: openIssues } = await supabase
    .from("vehicle_quality_issues")
    .select("id, vehicle_id, issue_type")
    .is("resolved_at", null);

  const openMap = new Map<string, string>();
  for (const o of (openIssues ?? []) as Array<{ id: string; vehicle_id: string; issue_type: string }>) {
    openMap.set(`${o.vehicle_id}::${o.issue_type}`, o.id);
  }

  const toInsert: QualityIssue[] = [];
  for (const [k, issue] of detected) {
    if (!openMap.has(k)) toInsert.push(issue);
  }
  const toResolve: string[] = [];
  for (const [k, id] of openMap) {
    if (!detected.has(k)) toResolve.push(id);
  }

  for (const batch of chunk(toInsert, 200)) {
    const { error: insErr } = await supabase.from("vehicle_quality_issues").insert(batch);
    if (insErr) console.error("quality-scan insert failed:", insErr);
  }
  const nowIso = new Date().toISOString();
  for (const batch of chunk(toResolve, 200)) {
    const { error: resErr } = await supabase
      .from("vehicle_quality_issues")
      .update({ resolved_at: nowIso })
      .in("id", batch);
    if (resErr) console.error("quality-scan resolve failed:", resErr);
  }

  console.log(
    `quality-scan: ${vehicles.length} Fahrzeuge geprüft, ${toInsert.length} neue Issues, ` +
    `${toResolve.length} behoben, ${detected.size} offen`,
  );
  return detected.size;
}
