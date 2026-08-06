// Gemeinsame Logik für das Mobile.de-Fahrzeugformular (Assistent + Inserats-Editor).
import { supabase } from "@/integrations/supabase/client";
import {
  REQUIRED_AD_FIELDS,
  checkRequiredAdFields,
  labelForApiField,
  fieldForApi,
  PORTAL_VEHICLE_CATEGORIES,
  type AdFieldSection,
} from "../../supabase/functions/_shared/mobile-ad-required";

export {
  REQUIRED_AD_FIELDS, labelForApiField, fieldForApi, PORTAL_VEHICLE_CATEGORIES,
};
export type { AdFieldSection };

export type RefItem = { key: string; name: string };


export const FUEL_LABELS: Record<string, string> = {
  PETROL: "Benzin",
  DIESEL: "Diesel",
  LPG: "Autogas (LPG)",
  CNG: "Erdgas (CNG)",
  ELECTRICITY: "Elektro",
  HYBRID: "Hybrid (Benzin/Elektro)",
  HYBRID_DIESEL: "Hybrid (Diesel/Elektro)",
  HYDROGENIUM: "Wasserstoff",
  ETHANOL: "Ethanol (E85)",
  OTHER: "Andere",
};

export const GEARBOX_LABELS: Record<string, string> = {
  MANUAL_GEAR: "Schaltgetriebe",
  SEMIAUTOMATIC_GEAR: "Halbautomatik",
  AUTOMATIC_GEAR: "Automatik",
};

export const CATEGORY_LABELS: Record<string, string> = {
  Cabrio: "Cabrio/Roadster",
  SmallCar: "Kleinwagen",
  EstateCar: "Kombi",
  Limousine: "Limousine",
  SportsCar: "Sportwagen/Coupé",
  Van: "Van/Kleinbus",
  OffRoad: "SUV/Geländewagen",
  OtherCar: "Andere",
};

export const DOORS_OPTIONS: { key: string; label: string }[] = [
  { key: "TWO_OR_THREE", label: "2/3" },
  { key: "FOUR_OR_FIVE", label: "4/5" },
];

// Fallbacks (only used when refdata returns empty / fails)
export const EXTERIOR_COLOR_FALLBACK: RefItem[] = [
  { key: "BLACK", name: "Schwarz" }, { key: "WHITE", name: "Weiß" },
  { key: "SILVER", name: "Silber" }, { key: "GREY", name: "Grau" },
  { key: "BLUE", name: "Blau" }, { key: "RED", name: "Rot" },
  { key: "GREEN", name: "Grün" }, { key: "BROWN", name: "Braun" },
  { key: "BEIGE", name: "Beige" }, { key: "YELLOW", name: "Gelb" },
  { key: "ORANGE", name: "Orange" }, { key: "GOLD", name: "Gold" },
  { key: "VIOLET", name: "Violett" },
];

// Boolean equipment checkboxes grouped per UI section.
// Keys MUST match Mobile.de Seller-API feature names.
export const COMFORT_FEATURES: { key: string; label: string }[] = [
  { key: "tintedWindows", label: "Abgedunkelte Scheiben" },
  { key: "ambientLighting", label: "Ambiente-Beleuchtung" },
  { key: "electricWindows", label: "Elektr. Fensterheber" },
  { key: "electricExteriorMirrors", label: "Elektr. Außenspiegel" },
  { key: "electricAdjustableSeats", label: "Elektr. Sitze" },
  { key: "electricHeatedSeats", label: "Sitzheizung" },
  { key: "centralLocking", label: "Zentralverriegelung" },
  { key: "hillStartAssist", label: "Berganfahrassistent" },
  { key: "onBoardComputer", label: "Bordcomputer" },
  { key: "powerSteering", label: "Servolenkung" },
  { key: "androidAuto", label: "Android Auto" },
  { key: "carplay", label: "Apple CarPlay" },
  { key: "bluetooth", label: "Bluetooth" },
  { key: "handsFreePhoneSystem", label: "Freisprecheinrichtung" },
  { key: "navigationSystem", label: "Navigationssystem" },
  { key: "touchscreen", label: "Touchscreen" },
  { key: "usb", label: "USB" },
  { key: "alloyWheels", label: "Leichtmetallfelgen" },
  { key: "roofRack", label: "Dachreling" },
  { key: "winterPackage", label: "Winterpaket" },
  { key: "soundSystem", label: "Soundsystem" },
  { key: "multifunctionalSteeringWheel", label: "Multifunktionslenkrad" },
  { key: "panoramicGlassRoof", label: "Panoramadach" },
  { key: "sunroof", label: "Schiebedach" },
  { key: "daytimeRunningLamps", label: "Tagfahrlicht" },
  { key: "summerTires", label: "Sommerreifen" },
  { key: "winterTires", label: "Winterreifen" },
  { key: "allSeasonTires", label: "Allwetterreifen" },
];

export const SAFETY_FEATURES: { key: string; label: string }[] = [
  { key: "abs", label: "ABS" },
  { key: "esp", label: "ESP" },
  { key: "isofix", label: "Isofix" },
  { key: "immobilizer", label: "Elektr. Wegfahrsperre" },
  { key: "highBeamAssistant", label: "Fernlichtassistent" },
  { key: "fatigueWarningSystem", label: "Müdigkeitswarner" },
  { key: "emergencyBrakeAssistant", label: "Notbremsassistent" },
  { key: "emergencyCallSystem", label: "Notrufsystem" },
  { key: "rainSensor", label: "Regensensor" },
  { key: "tirePressureMonitoring", label: "Reifendruckkontrolle" },
  { key: "laneDepartureWarning", label: "Spurhalteassistent" },
  { key: "startStopSystem", label: "Start/Stopp-Automatik" },
  { key: "trafficSignRecognition", label: "Verkehrszeichenerkennung" },
];

export const ALL_FEATURES = [...COMFORT_FEATURES, ...SAFETY_FEATURES];

// Uncertain enums — UI shown disabled with TODO until refdata is wired up.
// Do NOT send these to Mobile.de yet (would risk invalid-reference-data-value).
export const TODO_ENUM_FIELDS: { key: string; label: string }[] = [
  { key: "speedControl", label: "Geschwindigkeitsregelung (Tempomat)" },
  { key: "headlightType", label: "Hauptscheinwerfer" },
  { key: "trailerCouplingType", label: "Anhängerkupplung" },
  { key: "airbag", label: "Airbags" },
  { key: "breakdownService", label: "Pannenhilfe" },
  { key: "corneringLight", label: "Kurvenlicht" },
];

export const labelFor = (map: Record<string, string>, key: string, fallback: string) =>
  map[key] ?? fallback ?? key;

export interface FormState {
  // Basis
  make: string;
  model: string;
  modelDescription: string;
  trimLine: string;
  category: string;
  /** Portal-Fahrzeugart (vehicles.vehicle_category) — NICHT der Mobile.de-Schlüssel */
  portalCategory: string;
  mileage: string;
  regYear: string;
  regMonth: string;
  doors: string;
  seats: string;
  // Motor / Technik
  fuel: string;
  gearbox: string;
  power: string;
  cubicCapacity: string;
  cylinders: string;
  fuelCapacity: string;
  driveType: string;
  // Farbe
  exteriorColor: string;
  manufacturerColorName: string;
  metallic: boolean;
  matt: boolean;
  // Historie / Zustand
  condition: string;
  accidentDamaged: "" | "true" | "false";
  damageUnrepaired: "false" | "true";
  roadworthy: "" | "true" | "false";
  numberOfPreviousOwners: string;
  warranty: boolean;
  nonSmokerVehicle: boolean;
  fullServiceHistory: boolean;
  // Umwelt / Untersuchungen
  particulateFilter: boolean;
  emissionClass: string;
  emissionSticker: string;
  hsnYear: string;
  hsnMonth: string;
  huNew: boolean;
  inspectionNew: boolean;
  co2EmissionsCombined: string;
  consumptionCombined: string;
  consumptionInner: string;
  consumptionOuter: string;
  consumptionUrban: string;
  consumptionExtraUrban: string;
  // Komfort / Ausstattung
  climatisation: string;
  parkingAssistants: string[];
  features: Record<string, boolean>;
  // Nummern
  internalNumber: string;
  vin: string;
  // Beschreibung & Preis
  description: string;
  consumerPriceGross: string;
  vatRate: string;
}

export const EMPTY: FormState = {
  make: "", model: "", modelDescription: "", trimLine: "",
  category: "", portalCategory: "", mileage: "", regYear: "", regMonth: "",
  doors: "", seats: "",
  fuel: "", gearbox: "", power: "", cubicCapacity: "",
  cylinders: "", fuelCapacity: "", driveType: "",
  exteriorColor: "", manufacturerColorName: "", metallic: false, matt: false,
  condition: "USED", accidentDamaged: "", damageUnrepaired: "false",
  roadworthy: "", numberOfPreviousOwners: "",
  warranty: false, nonSmokerVehicle: false, fullServiceHistory: false,
  particulateFilter: false, emissionClass: "", emissionSticker: "",
  hsnYear: "", hsnMonth: "", huNew: false, inspectionNew: false,
  co2EmissionsCombined: "", consumptionCombined: "",
  consumptionInner: "", consumptionOuter: "",
  consumptionUrban: "", consumptionExtraUrban: "",
  climatisation: "", parkingAssistants: [], features: {},
  internalNumber: "", vin: "",
  description: "", consumerPriceGross: "", vatRate: "",
};

export async function loadRef(kind: string, make?: string): Promise<RefItem[]> {
  const { data, error } = await supabase.functions.invoke("mobile-refdata", {
    body: { kind, make },
  });
  if (error) throw error;
  return (data as { items: RefItem[] })?.items ?? [];
}

export function payloadToForm(payload: Record<string, unknown> | null | undefined): FormState {
  if (!payload) return EMPTY;
  const get = (obj: unknown, path: string[]): unknown => {
    let cur: unknown = obj;
    for (const k of path) {
      if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[k];
      } else return undefined;
    }
    return cur;
  };
  const asStr = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  const splitYM = (v: unknown): [string, string] => {
    const s = asStr(v);
    return /^\d{6}$/.test(s) ? [s.slice(0, 4), s.slice(4, 6)] : ["", ""];
  };
  const [regYear, regMonth] = splitYM(get(payload, ["vehicle", "first-registration"]));
  const [hsnYear, hsnMonth] = splitYM(get(payload, ["vehicle", "generalInspection"]));

  const features: Record<string, boolean> = {};
  for (const f of ALL_FEATURES) {
    if (get(payload, ["vehicle", f.key]) === true) features[f.key] = true;
  }
  const pa = get(payload, ["vehicle", "parkingAssistants"]);
  const parkingAssistants: string[] = Array.isArray(pa)
    ? (pa as unknown[])
        .map((x) =>
          x && typeof x === "object" && "key" in (x as Record<string, unknown>)
            ? String((x as { key: unknown }).key)
            : typeof x === "string" ? x : "",
        )
        .filter(Boolean)
    : [];
  const triBool = (v: unknown): "" | "true" | "false" =>
    v === true ? "true" : v === false ? "false" : "";

  return {
    make: asStr(get(payload, ["vehicle", "make", "key"])),
    model: asStr(get(payload, ["vehicle", "model", "key"])),
    modelDescription: asStr(get(payload, ["vehicle", "model-description"])),
    trimLine: asStr(get(payload, ["vehicle", "trimLine"])),
    category: asStr(get(payload, ["vehicle", "category", "key"])),
    portalCategory: asStr(get(payload, ["_portalCategory"])),
    mileage: asStr(get(payload, ["vehicle", "mileage"])),
    regYear, regMonth,
    doors: asStr(get(payload, ["vehicle", "doors", "key"])),
    seats: asStr(get(payload, ["vehicle", "seats"])),
    fuel: asStr(get(payload, ["vehicle", "fuel", "key"])),
    gearbox: asStr(get(payload, ["vehicle", "gearbox", "key"])),
    power: asStr(get(payload, ["vehicle", "power"])),
    cubicCapacity: asStr(get(payload, ["vehicle", "cubic-capacity"])),
    cylinders: asStr(get(payload, ["vehicle", "cylinder"]) ?? get(payload, ["vehicle", "cylinders"])),
    fuelCapacity: asStr(get(payload, ["vehicle", "fuelCapacity"])),
    driveType: asStr(get(payload, ["vehicle", "driveType", "key"])),
    exteriorColor: asStr(get(payload, ["vehicle", "exteriorColor", "key"])),
    manufacturerColorName: asStr(get(payload, ["vehicle", "manufacturerColorName"])),
    metallic: get(payload, ["vehicle", "metallic"]) === true,
    matt: get(payload, ["vehicle", "matteColor"]) === true || get(payload, ["vehicle", "matt"]) === true,
    condition: asStr(get(payload, ["vehicle", "condition"])) || "USED",
    accidentDamaged: triBool(get(payload, ["vehicle", "accidentDamaged"])),
    damageUnrepaired: get(payload, ["vehicle", "damage-unrepaired"]) === true ? "true" : "false",
    roadworthy: triBool(get(payload, ["vehicle", "roadworthy"])),
    numberOfPreviousOwners: asStr(get(payload, ["vehicle", "numberOfPreviousOwners"])),
    warranty: get(payload, ["vehicle", "warranty"]) === true,
    nonSmokerVehicle: get(payload, ["vehicle", "nonSmokerVehicle"]) === true,
    fullServiceHistory: get(payload, ["vehicle", "fullServiceHistory"]) === true,
    particulateFilter: get(payload, ["vehicle", "particulateFilter"]) === true,
    emissionClass: asStr(get(payload, ["vehicle", "emissionClass", "key"])),
    emissionSticker: asStr(get(payload, ["vehicle", "emissionSticker", "key"])),
    hsnYear, hsnMonth,
    huNew: get(payload, ["vehicle", "huNew"]) === true,
    inspectionNew: get(payload, ["vehicle", "inspectionNew"]) === true,
    co2EmissionsCombined: asStr(get(payload, ["vehicle", "co2EmissionsCombined"])),
    consumptionCombined: asStr(get(payload, ["vehicle", "consumptionCombined"])),
    consumptionInner: asStr(get(payload, ["vehicle", "consumptionInner"])),
    consumptionOuter: asStr(get(payload, ["vehicle", "consumptionOuter"])),
    consumptionUrban: asStr(get(payload, ["vehicle", "consumptionUrban"])),
    consumptionExtraUrban: asStr(get(payload, ["vehicle", "consumptionExtraUrban"])),
    climatisation: asStr(get(payload, ["vehicle", "climatisation", "key"])),
    parkingAssistants,
    features,
    internalNumber: asStr(get(payload, ["vehicle", "internalNumber"])),
    vin: asStr(get(payload, ["vehicle", "vin"])),
    description: asStr(get(payload, ["description"])),
    consumerPriceGross: asStr(
      get(payload, ["price", "consumerPriceGross"]) ?? get(payload, ["price", "consumer-price-gross"]),
    ),
    vatRate: asStr(get(payload, ["price", "vatRate"]) ?? get(payload, ["price", "vat-rate"])) || "",
  };
}

// Map a live Mobile.de ad (flat seller-api shape) plus an optional persisted
// draft payload into the same FormState the create/draft-edit UI uses.
// Live keys (e.g. make="VW", category="SmallCar") are kept as-is; the rich
// dropdowns display them with their German labels.
export function mobileAdToFormFlat(
  mobileAd: Record<string, unknown> | null | undefined,
  draftPayload: Record<string, unknown> | null | undefined,
): FormState {
  const m = (mobileAd ?? {}) as Record<string, unknown>;
  const d = (draftPayload ?? {}) as Record<string, unknown>;
  const veh = (d.vehicle && typeof d.vehicle === "object" ? d.vehicle : {}) as Record<string, unknown>;
  const priceM = (m.price && typeof m.price === "object" ? m.price : {}) as Record<string, unknown>;
  const priceD = (d.price && typeof d.price === "object" ? d.price : {}) as Record<string, unknown>;

  const pick = (...c: unknown[]): unknown => {
    for (const x of c) if (x !== undefined && x !== null && x !== "") return x;
    return undefined;
  };
  const asKey = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && typeof (v as { key?: unknown }).key === "string") {
      return (v as { key: string }).key;
    }
    return "";
  };
  const asStr = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  const splitYM = (v: unknown): [string, string] => {
    const s = asStr(v);
    return /^\d{6}$/.test(s) ? [s.slice(0, 4), s.slice(4, 6)] : ["", ""];
  };
  const [regYear, regMonth] = splitYM(
    pick(m.firstRegistration, veh["first-registration"], veh.firstRegistration),
  );
  const [hsnYear, hsnMonth] = splitYM(
    pick(m.generalInspection, veh.generalInspection),
  );

  const featObj = (m.features && typeof m.features === "object") ? (m.features as Record<string, unknown>) : {};
  const features: Record<string, boolean> = {};
  for (const f of ALL_FEATURES) {
    if (m[f.key] === true || featObj[f.key] === true || veh[f.key] === true) features[f.key] = true;
  }
  // Server-seitige Alias-Felder zurück mappen, damit Checkboxen aktiv erscheinen.
  const aliasBack: Record<string, string> = {
    powerAssistedSteering: "powerSteering",
    roofRails: "roofRack",
    multifunctionalWheel: "multifunctionalSteeringWheel",
    collisionAvoidance: "emergencyBrakeAssistant",
    automaticRainSensor: "rainSensor",
    highBeamAssist: "highBeamAssistant",
  };
  for (const [apiKey, uiKey] of Object.entries(aliasBack)) {
    if (m[apiKey] === true || featObj[apiKey] === true) features[uiKey] = true;
  }

  const pa = pick(m.parkingAssistants, veh.parkingAssistants);
  const parkingAssistants: string[] = Array.isArray(pa)
    ? (pa as unknown[])
        .map((x) => asKey(x))
        .filter(Boolean)
    : [];

  const triBool = (v: unknown): "" | "true" | "false" =>
    v === true ? "true" : v === false ? "false" : "";

  // Preis: Zahl, String oder verschachtelt – auf Ganzzahl-EUR-String reduzieren.
  const priceRaw = pick(
    priceM.consumerPriceGross,
    (priceM as Record<string, unknown>).consumerValue,
    priceD.consumerPriceGross,
    priceD["consumer-price-gross"],
  );
  const priceStr = (() => {
    if (priceRaw === undefined || priceRaw === null) return "";
    if (typeof priceRaw === "number") return Number.isFinite(priceRaw) ? String(Math.round(priceRaw)) : "";
    if (typeof priceRaw === "object") {
      const o = priceRaw as Record<string, unknown>;
      const v = o.amount ?? o.value ?? o.gross ?? o.consumerValue ?? o.net;
      return typeof v === "number" ? String(Math.round(v)) : typeof v === "string" ? v.replace(/[^0-9]/g, "") : "";
    }
    return String(priceRaw).replace(/[^0-9]/g, "");
  })();

  return {
    make: asKey(pick(m.make, veh.make)),
    model: asKey(pick(m.model, veh.model)),
    modelDescription: asStr(pick(m.modelDescription, veh["model-description"], veh.modelDescription)),
    trimLine: asStr(pick(m.trimLine, veh.trimLine)),
    category: asKey(pick(m.category, veh.category)),
    portalCategory: asStr(pick(d._portalCategory, "")),
    mileage: asStr(pick(m.mileage, veh.mileage)),
    regYear, regMonth,
    doors: asKey(pick(m.doors, veh.doors)),
    seats: asStr(pick(m.seats, veh.seats)),
    fuel: asKey(pick(m.fuel, veh.fuel)),
    gearbox: asKey(pick(m.gearbox, veh.gearbox)),
    power: asStr(pick(m.power, veh.power)),
    cubicCapacity: asStr(pick(m.cubicCapacity, veh["cubic-capacity"], veh.cubicCapacity)),
    cylinders: asStr(pick(m.cylinder, m.cylinders, veh.cylinder, veh.cylinders)),
    fuelCapacity: asStr(pick(m.fuelCapacity, veh.fuelCapacity)),
    driveType: asKey(pick(m.driveType, veh.driveType)),
    exteriorColor: asKey(pick(m.exteriorColor, veh.exteriorColor)),
    manufacturerColorName: asStr(pick(m.manufacturerColorName, veh.manufacturerColorName)),
    metallic: pick(m.metallic, veh.metallic) === true,
    matt: pick(m.matteColor, veh.matteColor, veh.matt) === true,
    condition: asStr(pick(m.condition, veh.condition)) || "USED",
    accidentDamaged: triBool(pick(m.accidentDamaged, veh.accidentDamaged)),
    damageUnrepaired: pick(m.damageUnrepaired, veh["damage-unrepaired"]) === true ? "true" : "false",
    roadworthy: triBool(pick(m.roadworthy, veh.roadworthy)),
    numberOfPreviousOwners: asStr(pick(m.numberOfPreviousOwners, veh.numberOfPreviousOwners)),
    warranty: pick(m.warranty, veh.warranty) === true,
    nonSmokerVehicle: pick(m.nonSmokerVehicle, veh.nonSmokerVehicle) === true,
    fullServiceHistory: pick(m.fullServiceHistory, veh.fullServiceHistory) === true,
    particulateFilter: pick(m.particulateFilter, m.particulateFilterDiesel, veh.particulateFilter) === true,
    emissionClass: asKey(pick(m.emissionClass, veh.emissionClass)),
    emissionSticker: asKey(pick(m.emissionSticker, veh.emissionSticker)),
    hsnYear, hsnMonth,
    huNew: pick(m.huNew, m.newHuAu, veh.huNew) === true,
    inspectionNew: pick(m.inspectionNew, m.newService, veh.inspectionNew) === true,
    co2EmissionsCombined: asStr(pick(m.co2EmissionsCombined, veh.co2EmissionsCombined)),
    consumptionCombined: asStr(pick(m.consumptionCombined, veh.consumptionCombined)),
    consumptionInner: asStr(pick(m.consumptionInner, veh.consumptionInner)),
    consumptionOuter: asStr(pick(m.consumptionOuter, veh.consumptionOuter)),
    consumptionUrban: asStr(pick(m.consumptionUrban, veh.consumptionUrban)),
    consumptionExtraUrban: asStr(pick(m.consumptionExtraUrban, veh.consumptionExtraUrban)),
    climatisation: asKey(pick(m.climatisation, veh.climatisation)),
    parkingAssistants,
    features,
    internalNumber: asStr(pick(m.internalNumber, veh.internalNumber)),
    vin: asStr(pick(m.vin, veh.vin)),
    description: asStr(pick(m.description, d.description, veh.description)),
    consumerPriceGross: priceStr,
    vatRate: asStr(pick(priceM.vatRate, priceD.vatRate, priceD["vat-rate"])) || "19.00",
  };
}

/** Baut das Mobile.de-Seller-API-Payload aus dem Formularzustand. */
export function buildVehiclePayload(form: FormState): Record<string, unknown> {
  const vehicle: Record<string, unknown> = {
    class: { key: "Car" },
    make: form.make ? { key: form.make } : undefined,
    model: form.model ? { key: form.model } : undefined,
    "model-description": form.modelDescription || undefined,
    category: form.category ? { key: form.category } : undefined,
    mileage: form.mileage ? parseInt(form.mileage, 10) : undefined,
    "first-registration":
      form.regYear && form.regMonth
        ? `${form.regYear}${form.regMonth.padStart(2, "0")}`
        : undefined,
    fuel: form.fuel ? { key: form.fuel } : undefined,
    gearbox: form.gearbox ? { key: form.gearbox } : undefined,
    power: form.power ? parseInt(form.power, 10) : undefined,
    "cubic-capacity": form.cubicCapacity ? parseInt(form.cubicCapacity, 10) : undefined,
    condition: form.condition,
    "damage-unrepaired": form.damageUnrepaired === "true",
  };

  const intIf = (s: string) => {
    if (!s) return undefined;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? undefined : n;
  };
  const floatIf = (s: string) => {
    if (!s) return undefined;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  };

  if (form.trimLine) vehicle.trimLine = form.trimLine;
  if (form.doors) vehicle.doors = { key: form.doors };
  const seats = intIf(form.seats); if (seats !== undefined) vehicle.seats = seats;
  const cyl = intIf(form.cylinders); if (cyl !== undefined) vehicle.cylinder = cyl;
  const fc = intIf(form.fuelCapacity); if (fc !== undefined) vehicle.fuelCapacity = fc;
  if (form.driveType) vehicle.driveType = { key: form.driveType };

  if (form.exteriorColor) vehicle.exteriorColor = { key: form.exteriorColor };
  if (form.manufacturerColorName) vehicle.manufacturerColorName = form.manufacturerColorName;
  if (form.metallic) vehicle.metallic = true;
  if (form.matt) vehicle.matteColor = true;

  if (form.accidentDamaged === "true") vehicle.accidentDamaged = true;
  else if (form.accidentDamaged === "false") vehicle.accidentDamaged = false;
  if (form.roadworthy === "true") vehicle.roadworthy = true;
  else if (form.roadworthy === "false") vehicle.roadworthy = false;
  if (form.fullServiceHistory) vehicle.fullServiceHistory = true;
  if (form.nonSmokerVehicle) vehicle.nonSmokerVehicle = true;
  if (form.warranty) vehicle.warranty = true;
  const prev = intIf(form.numberOfPreviousOwners);
  if (prev !== undefined) vehicle.numberOfPreviousOwners = prev;

  if (form.particulateFilter) vehicle.particulateFilter = true;
  if (form.emissionClass) vehicle.emissionClass = { key: form.emissionClass };
  if (form.emissionSticker) vehicle.emissionSticker = { key: form.emissionSticker };
  if (form.hsnYear && form.hsnMonth) {
    vehicle.generalInspection = `${form.hsnYear}${form.hsnMonth.padStart(2, "0")}`;
  }
  if (form.huNew) vehicle.huNew = true;
  if (form.inspectionNew) vehicle.inspectionNew = true;
  const co2 = floatIf(form.co2EmissionsCombined);
  if (co2 !== undefined) vehicle.co2EmissionsCombined = co2;
  const cc = floatIf(form.consumptionCombined);
  if (cc !== undefined) vehicle.consumptionCombined = cc;
  const ci = floatIf(form.consumptionInner);
  if (ci !== undefined) vehicle.consumptionInner = ci;
  const co = floatIf(form.consumptionOuter);
  if (co !== undefined) vehicle.consumptionOuter = co;
  const cu = floatIf(form.consumptionUrban);
  if (cu !== undefined) vehicle.consumptionUrban = cu;
  const ce = floatIf(form.consumptionExtraUrban);
  if (ce !== undefined) vehicle.consumptionExtraUrban = ce;

  if (form.climatisation) vehicle.climatisation = { key: form.climatisation };
  if (form.parkingAssistants.length) {
    vehicle.parkingAssistants = form.parkingAssistants.map((k) => ({ key: k }));
  }

  for (const f of ALL_FEATURES) {
    if (form.features[f.key]) vehicle[f.key] = true;
  }

  if (form.internalNumber) vehicle.internalNumber = form.internalNumber;
  if (form.vin) vehicle.vin = form.vin;

  // Mobile.de erwartet vatRate als Dezimal-String ("19.00").
  const vatRate = "19.00";

  return {
    vehicleClass: "Car",
    // Portal-Fahrzeugart getrennt vom Mobile.de-Kategorieschlüssel mitführen.
    _portalCategory: form.portalCategory || undefined,
    vehicle,
    price: {
      consumerPriceGross: String(form.consumerPriceGross || "").replace(/[^0-9]/g, ""),
      currency: "EUR",
      vatRate,
      type: "FIXED",
    },
    description: form.description || undefined,
  };
}

/** Ein einzelnes Pflichtfeld des Mobile.de-Inserats. */
export interface RequiredField {
  field: string;
  label: string;
  /** Abschnitt in Schritt 3 bzw. "fotos" */
  section: AdFieldSection;
  /** Mobile.de-Payload-Schlüssel (null = reines Portalfeld) */
  api?: string | null;
}

/** Abgeleitet aus der gemeinsamen Liste — keine zweite Pflichtfeldliste! */
export const REQUIRED_FIELDS: RequiredField[] = REQUIRED_AD_FIELDS.map((f) => ({
  field: f.form,
  label: f.label,
  section: f.section,
  api: f.api,
}));

/** Formularwerte in der Form, wie die gemeinsame Prüfung sie erwartet. */
export function requiredValuesFromForm(form: FormState): Record<string, unknown> {
  return {
    ...form,
    regYear: form.regYear && form.regMonth
      ? `${form.regYear}${String(form.regMonth).padStart(2, "0")}`
      : "",
    damageUnrepaired: form.damageUnrepaired === "true",
  };
}

/** Liefert alle fehlenden Pflichtangaben. */
export function missingRequired(
  form: FormState,
  opts?: { skipPortalOnly?: boolean },
): RequiredField[] {
  const missing = checkRequiredAdFields(requiredValuesFromForm(form), {
    by: "form",
    skipPortalOnly: opts?.skipPortalOnly,
  });
  const keys = new Set(missing.map((m) => m.form));
  return REQUIRED_FIELDS.filter((r) => keys.has(r.field));
}

export function isFieldFilled(form: FormState, field: RequiredField["field"]): boolean {
  return !missingRequired(form).some((r) => r.field === field);
}

/** Kompatible Kurzform: erste fehlende Pflichtangabe als Meldung (ohne Portalfelder). */
export function validateForm(form: FormState): string | null {
  const missing = missingRequired(form, { skipPortalOnly: true });
  return missing.length ? `${missing[0].label} fehlt` : null;
}


/** Kernfelder für die normalen vehicles-Spalten. */
export function buildVehicleColumnsFor(
  form: FormState,
  makeName: string,
  modelName: string,
): Record<string, unknown> {
  const title = [makeName, modelName, form.modelDescription].filter(Boolean).join(" ").trim();
  const priceNum = Number(String(form.consumerPriceGross || "").replace(/[^0-9]/g, ""));
  return {
    title: title || "Unbenanntes Fahrzeug",
    brand: makeName || null,
    model: modelName || null,
    model_description: form.modelDescription || null,
    // category/body_type = Mobile.de-Karosserieform, vehicle_category = Portal-Fahrzeugart
    category: form.category ? labelFor(CATEGORY_LABELS, form.category, form.category) : null,
    vehicle_category: form.portalCategory || undefined,
    body_type: form.category || null,
    year: form.regYear || null,
    mileage: form.mileage ? parseInt(String(form.mileage).replace(/[^0-9]/g, ""), 10) : null,
    price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : null,
    currency: "EUR",
    fuel: form.fuel || null,
    gearbox: form.gearbox || null,
    power: form.power ? parseInt(String(form.power).replace(/[^0-9]/g, ""), 10) : null,
    cubic_capacity: form.cubicCapacity ? parseInt(String(form.cubicCapacity).replace(/[^0-9]/g, ""), 10) : null,
    exterior_color: form.exteriorColor || null,
    description: form.description || null,
  };
}
