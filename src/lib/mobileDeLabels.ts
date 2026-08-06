/**
 * Mappings von Mobile.de Enums zu lesbaren deutschen Bezeichnungen.
 * Quelle: https://services.mobile.de/docs/ad-api.html
 *
 * Hinweis: Die DB-Werte selbst bleiben unverändert (Raw-Enums), damit die
 * Mobile.de-Synchronisation und Filter-Logik (exakter Match) weiter funktionieren.
 * Das Mapping passiert ausschließlich zur Anzeigezeit im UI/E-Mail/PDF.
 */

const BODY_TYPE_LABELS: Record<string, string> = {
  // PKW
  EstateCar: "Kombi",
  Cabrio: "Cabrio",
  Convertible: "Cabrio",
  Coupe: "Coupé",
  SmallCar: "Kleinwagen",
  Limousine: "Limousine",
  Saloon: "Limousine",
  SportsCar: "Sportwagen",
  Van: "Van",
  // SUV / Geländewagen
  OffRoad: "SUV / Geländewagen",
  OffRoader: "SUV / Geländewagen",
  SUV: "SUV",
  // Nutzfahrzeuge
  BoxTypeDeliveryVan: "Kastenwagen",
  BoxVan: "Kastenwagen",
  PassengerVan: "Kleinbus",
  CrewCab: "Doppelkabine",
  SingleCab: "Einzelkabine",
  Pickup: "Pickup",
  Transporter: "Transporter",
  Truck: "LKW",
  Tractor: "Traktor",
  Trailer: "Anhänger",
  SemiTrailerTruck: "Sattelzugmaschine",
  Tipper: "Kipper",
  // Sonstige
  OtherCar: "Sonstige",
  Other: "Sonstige",
  // Motorrad
  Chopper: "Chopper",
  Enduro: "Enduro",
  Naked: "Naked Bike",
  Roadster: "Roadster",
  Scooter: "Roller",
  Supermoto: "Supermoto",
  Touring: "Tourer",
};

const FUEL_LABELS: Record<string, string> = {
  Petrol: "Benzin",
  Diesel: "Diesel",
  Electric: "Elektro",
  Electricity: "Elektro",
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
};

const GEARBOX_LABELS: Record<string, string> = {
  Automatic: "Automatik",
  AutomaticGear: "Automatik",
  Manual: "Schaltgetriebe",
  ManualGear: "Schaltgetriebe",
  SemiAutomatic: "Halbautomatik",
  SemiautomaticGear: "Halbautomatik",
};

const CLIMATISATION_LABELS: Record<string, string> = {
  NoClimatisation: "Keine",
  ManualClimatisation: "Klimaanlage",
  AutomaticClimatisation: "Klimaautomatik",
  AutomaticClimatisation2Zones: "2-Zonen-Klimaautomatik",
  AutomaticClimatisation3Zones: "3-Zonen-Klimaautomatik",
  AutomaticClimatisation4Zones: "4-Zonen-Klimaautomatik",
};

const CONDITION_LABELS: Record<string, string> = {
  New: "Neufahrzeug",
  Used: "Gebrauchtfahrzeug",
  Demonstration: "Vorführwagen",
  EmployeesCar: "Mitarbeiterfahrzeug",
  PreRegistration: "Tageszulassung",
};

const INTERIOR_TYPE_LABELS: Record<string, string> = {
  Cloth: "Stoff",
  PartLeather: "Teilleder",
  FullLeather: "Leder",
  Velour: "Velours",
  Alcantara: "Alcantara",
  Other: "Sonstige",
};

const COLOR_LABELS: Record<string, string> = {
  BLACK: "Schwarz",
  WHITE: "Weiß",
  SILVER: "Silber",
  GREY: "Grau",
  GRAY: "Grau",
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
};

const DOOR_LABELS: Record<string, string> = {
  TwoOrThree: "2/3 Türen",
  FourOrFive: "4/5 Türen",
  SixOrSeven: "6/7 Türen",
};

const EMISSION_CLASS_LABELS: Record<string, string> = {
  Euro1: "Euro 1",
  Euro2: "Euro 2",
  Euro3: "Euro 3",
  Euro4: "Euro 4",
  Euro5: "Euro 5",
  Euro6: "Euro 6",
  Euro6c: "Euro 6c",
  Euro6d: "Euro 6d",
  Euro6dTemp: "Euro 6d-TEMP",
  Euro6e: "Euro 6e",
};

const EMISSION_STICKER_LABELS: Record<string, string> = {
  None: "Keine",
  Green: "Grün (4)",
  Yellow: "Gelb (3)",
  Red: "Rot (2)",
};

/** Bereits gemeldete unbekannte Schlüssel — verhindert Log-Spam. */
const reportedMissing = new Set<string>();

/** "AUTOMATIC_GEAR" / "automatic-gear" / "AutomaticGear" → "automaticgear" */
function normalizeKey(value: string): string {
  return value.replace(/[\s_-]+/g, "").toLowerCase();
}

/** Unbekannten Rohwert lesbar machen: "AUTOMATIC_GEAR" → "Automatic Gear" */
export function formatRawKey(value: string): string {
  const words = value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/);
  return words
    .map((w) => (w === w.toUpperCase() && w.length <= 3 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

function lookup(
  map: Record<string, string>,
  value: string | null | undefined,
  fallback = "–",
  fieldName = "unbekannt",
): string {
  if (!value || !String(value).trim()) return fallback;
  const raw = String(value).trim();
  if (map[raw]) return map[raw];

  const norm = normalizeKey(raw);
  for (const [key, label] of Object.entries(map)) {
    if (normalizeKey(key) === norm) return label;
  }
  // Bereits deutscher Klartext? Dann unverändert zurückgeben.
  for (const label of Object.values(map)) {
    if (normalizeKey(label) === norm) return label;
  }

  const marker = `${fieldName}:${raw}`;
  if (!reportedMissing.has(marker)) {
    reportedMissing.add(marker);
    console.warn(`[mobileDeLabels] Fehlende Übersetzung für ${fieldName}: "${raw}"`);
  }
  return formatRawKey(raw);
}

/** Alle bislang aufgetretenen, nicht übersetzten Schlüssel. */
export function getMissingLabelKeys(): string[] {
  return Array.from(reportedMissing);
}

export function getBodyTypeLabel(value: string | null | undefined): string {
  return lookup(BODY_TYPE_LABELS, value, "–", "body_type");
}
export function getFuelLabel(value: string | null | undefined): string {
  return lookup(FUEL_LABELS, value, "–", "fuel");
}
export function getGearboxLabel(value: string | null | undefined): string {
  return lookup(GEARBOX_LABELS, value, "–", "gearbox");
}
export function getClimatisationLabel(value: string | null | undefined): string {
  return lookup(CLIMATISATION_LABELS, value, "–", "climatisation");
}
export function getConditionLabel(value: string | null | undefined): string {
  return lookup(CONDITION_LABELS, value, "–", "condition");
}
export function getInteriorTypeLabel(value: string | null | undefined): string {
  return lookup(INTERIOR_TYPE_LABELS, value, "–", "interior_type");
}
export function getColorLabel(value: string | null | undefined): string {
  return lookup(COLOR_LABELS, value, "–", "color");
}
export function getDoorsLabel(value: string | null | undefined): string {
  return lookup(DOOR_LABELS, value, "–", "doors");
}
export function getEmissionClassLabel(value: string | null | undefined): string {
  return lookup(EMISSION_CLASS_LABELS, value, "–", "emission_class");
}
export function getEmissionStickerLabel(value: string | null | undefined): string {
  return lookup(EMISSION_STICKER_LABELS, value, "–", "emission_sticker");
}

export type LabelField =
  | "body_type" | "fuel" | "gearbox" | "climatisation" | "condition"
  | "usage_type" | "interior_type" | "exterior_color" | "interior_color"
  | "doors" | "emission_class" | "emission_sticker";

/**
 * Gemeinsame Übersetzung für alle Anzeigeorte.
 * Unbekannte Schlüssel werden lesbar formatiert und protokolliert.
 */
export function getVehicleLabel(field: LabelField, value: string | null | undefined): string {
  switch (field) {
    case "body_type": return getBodyTypeLabel(value);
    case "fuel": return getFuelLabel(value);
    case "gearbox": return getGearboxLabel(value);
    case "climatisation": return getClimatisationLabel(value);
    case "condition":
    case "usage_type": return getConditionLabel(value);
    case "interior_type": return getInteriorTypeLabel(value);
    case "exterior_color":
    case "interior_color": return getColorLabel(value);
    case "doors": return getDoorsLabel(value);
    case "emission_class": return getEmissionClassLabel(value);
    case "emission_sticker": return getEmissionStickerLabel(value);
    default: return value ? formatRawKey(String(value)) : "–";
  }
}


/**
 * Wandelt eine Liste von Raw-Werten in `{ raw, label }`-Optionen um.
 * Sortiert nach Label (de-DE). Praktisch für Filter-Dropdowns:
 * Der `value` bleibt der Raw-String (für die Filter-Logik), angezeigt wird `label`.
 */
export function toLabelOptions(
  values: Array<string | null | undefined>,
  getLabel: (v: string | null | undefined) => string
): Array<{ raw: string; label: string }> {
  const seen = new Set<string>();
  const result: Array<{ raw: string; label: string }> = [];
  values.forEach((v) => {
    if (v && !seen.has(v)) {
      seen.add(v);
      result.push({ raw: v, label: getLabel(v) });
    }
  });
  return result.sort((a, b) => a.label.localeCompare(b.label, "de"));
}
