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

function lookup(map: Record<string, string>, value: string | null | undefined, fallback = "–"): string {
  if (!value) return fallback;
  if (map[value]) return map[value];
  // Case-insensitive Fallback
  const match = Object.entries(map).find(([key]) => key.toLowerCase() === value.toLowerCase());
  if (match) return match[1];
  // Letzter Fallback: CamelCase aufbrechen ("SomeUnknownType" → "Some Unknown Type")
  return value.replace(/([A-Z])/g, " $1").trim();
}

export function getBodyTypeLabel(value: string | null | undefined): string {
  return lookup(BODY_TYPE_LABELS, value);
}
export function getFuelLabel(value: string | null | undefined): string {
  return lookup(FUEL_LABELS, value);
}
export function getGearboxLabel(value: string | null | undefined): string {
  return lookup(GEARBOX_LABELS, value);
}
export function getClimatisationLabel(value: string | null | undefined): string {
  return lookup(CLIMATISATION_LABELS, value);
}
export function getConditionLabel(value: string | null | undefined): string {
  return lookup(CONDITION_LABELS, value);
}
export function getInteriorTypeLabel(value: string | null | undefined): string {
  return lookup(INTERIOR_TYPE_LABELS, value);
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
