import { useEffect, useMemo, useState, ChangeEvent } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Loader2, Upload, X, Save, ChevronDown, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RefItem = { key: string; name: string };

const FUEL_LABELS: Record<string, string> = {
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

const GEARBOX_LABELS: Record<string, string> = {
  MANUAL_GEAR: "Schaltgetriebe",
  SEMIAUTOMATIC_GEAR: "Halbautomatik",
  AUTOMATIC_GEAR: "Automatik",
};

const CATEGORY_LABELS: Record<string, string> = {
  Cabrio: "Cabrio/Roadster",
  SmallCar: "Kleinwagen",
  EstateCar: "Kombi",
  Limousine: "Limousine",
  SportsCar: "Sportwagen/Coupé",
  Van: "Van/Kleinbus",
  OffRoad: "SUV/Geländewagen",
  OtherCar: "Andere",
};

const DOORS_OPTIONS: { key: string; label: string }[] = [
  { key: "TWO_OR_THREE", label: "2/3" },
  { key: "FOUR_OR_FIVE", label: "4/5" },
];

// Fallbacks (only used when refdata returns empty / fails)
const EXTERIOR_COLOR_FALLBACK: RefItem[] = [
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
const COMFORT_FEATURES: { key: string; label: string }[] = [
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

const SAFETY_FEATURES: { key: string; label: string }[] = [
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

const ALL_FEATURES = [...COMFORT_FEATURES, ...SAFETY_FEATURES];

// Uncertain enums — UI shown disabled with TODO until refdata is wired up.
// Do NOT send these to Mobile.de yet (would risk invalid-reference-data-value).
const TODO_ENUM_FIELDS: { key: string; label: string }[] = [
  { key: "speedControl", label: "Geschwindigkeitsregelung (Tempomat)" },
  { key: "headlightType", label: "Hauptscheinwerfer" },
  { key: "trailerCouplingType", label: "Anhängerkupplung" },
  { key: "airbag", label: "Airbags" },
  { key: "breakdownService", label: "Pannenhilfe" },
  { key: "corneringLight", label: "Kurvenlicht" },
];

const labelFor = (map: Record<string, string>, key: string, fallback: string) =>
  map[key] ?? fallback ?? key;

interface FormState {
  // Basis
  make: string;
  model: string;
  modelDescription: string;
  trimLine: string;
  category: string;
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

const EMPTY: FormState = {
  make: "", model: "", modelDescription: "", trimLine: "",
  category: "", mileage: "", regYear: "", regMonth: "",
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

async function loadRef(kind: string, make?: string): Promise<RefItem[]> {
  const { data, error } = await supabase.functions.invoke("mobile-refdata", {
    body: { kind, make },
  });
  if (error) throw error;
  return (data as { items: RefItem[] })?.items ?? [];
}

function payloadToForm(payload: Record<string, unknown> | null | undefined): FormState {
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
function mobileAdToFormFlat(
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

export default function MobileAdCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const { draftId } = useParams<{ draftId?: string }>();
  const isLive = location.pathname.includes("/live-edit");
  const isEdit = Boolean(draftId) && !isLive;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [liveMobileAdId, setLiveMobileAdId] = useState<string>("");
  const [liveImageCount, setLiveImageCount] = useState<number>(0);
  const [liveLoadError, setLiveLoadError] = useState<string | null>(null);
  const [lastUpdateError, setLastUpdateError] = useState<{ msg: string; details?: string } | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  // Refdata
  const [makes, setMakes] = useState<RefItem[]>([]);
  const [models, setModels] = useState<RefItem[]>([]);
  const [categories, setCategories] = useState<RefItem[]>([]);
  const [fuels, setFuels] = useState<RefItem[]>([]);
  const [gearboxes, setGearboxes] = useState<RefItem[]>([]);
  const [vatRates, setVatRates] = useState<RefItem[]>([]);
  const [exteriorColors, setExteriorColors] = useState<RefItem[]>([]);
  const [climatisations, setClimatisations] = useState<RefItem[]>([]);
  const [emissionClasses, setEmissionClasses] = useState<RefItem[]>([]);
  const [emissionStickers, setEmissionStickers] = useState<RefItem[]>([]);
  const [driveTypes, setDriveTypes] = useState<RefItem[]>([]);
  const [parkingAssistantOpts, setParkingAssistantOpts] = useState<RefItem[]>([]);

  const [loadingMakes, setLoadingMakes] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(isEdit || isLive);
  const [draftStatus, setDraftStatus] = useState<string>("draft");
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initial refdata
  useEffect(() => {
    (async () => {
      try {
        const [m, c, f, g, v, ec, cl, emC, emS, dt, pa] = await Promise.all([
          loadRef("makes"),
          loadRef("categories").catch(() => []),
          loadRef("fuels").catch(() => []),
          loadRef("gearboxes").catch(() => []),
          loadRef("vatrates").catch(() => []),
          loadRef("exterior-colors").catch(() => []),
          loadRef("climatisations").catch(() => []),
          loadRef("emission-classes").catch(() => []),
          loadRef("emission-stickers").catch(() => []),
          loadRef("drive-types").catch(() => []),
          loadRef("parking-assistants").catch(() => []),
        ]);
        setMakes(m);
        setCategories(c);
        setFuels(f);
        setGearboxes(g);
        setVatRates(v.length ? v : [
          { key: "19.00", name: "19 %" },
          { key: "OTHER", name: "Differenzbesteuert" },
        ]);
        setExteriorColors(ec.length ? ec : EXTERIOR_COLOR_FALLBACK);
        setClimatisations(cl);
        setEmissionClasses(emC);
        setEmissionStickers(emS);
        setDriveTypes(dt);
        setParkingAssistantOpts(pa);
      } catch (err) {
        console.error(err);
        toast.error("Refdaten konnten nicht geladen werden");
      } finally {
        setLoadingMakes(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!form.make) { setModels([]); return; }
    setLoadingModels(true);
    loadRef("models", form.make)
      .then(setModels)
      .catch((err) => {
        console.error(err);
        toast.error("Modelle konnten nicht geladen werden");
      })
      .finally(() => setLoadingModels(false));
  }, [form.make]);

  useEffect(() => {
    if (!draftId) return;
    if (isLive) {
      (async () => {
        try {
          const { data, error } = await supabase.functions.invoke("get-mobile-ad", {
            body: { draftId },
          });
          const d = data as { success?: boolean; error?: string; draft?: Record<string, unknown>; mobileAd?: Record<string, unknown> | null } | null;
          if (error || !d?.success) {
            const msg = d?.error || error?.message || "Live-Daten konnten nicht geladen werden";
            setLiveLoadError(msg);
            toast.error(msg);
            return;
          }
          const ad = d.mobileAd ?? null;
          const draft = d.draft ?? {};
          const mobileAdId = String((draft as { mobile_ad_id?: string }).mobile_ad_id ?? "");
          setLiveMobileAdId(mobileAdId);
          const imgs = ad && Array.isArray((ad as Record<string, unknown>).images)
            ? ((ad as { images: unknown[] }).images).length : 0;
          setLiveImageCount(imgs);
          setForm(mobileAdToFormFlat(ad, (draft as { payload?: Record<string, unknown> }).payload ?? null));
          setDraftStatus("published");
        } catch (e) {
          console.error(e);
          setLiveLoadError("Live-Daten konnten nicht geladen werden");
        } finally {
          setLoadingDraft(false);
        }
      })();
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from("mobile_ad_drafts")
          .select("status, payload, image_paths")
          .eq("id", draftId)
          .maybeSingle();
        if (error || !data) {
          toast.error("Entwurf nicht gefunden");
          navigate("/admin/mobile-ad");
          return;
        }
        if (data.status === "published") {
          toast.error("Bereits veröffentlichte Inserate können hier nicht bearbeitet werden");
          navigate("/admin/mobile-ad");
          return;
        }
        setDraftStatus(data.status);
        setForm(payloadToForm(data.payload as Record<string, unknown> | null));
        const paths = (data.image_paths ?? []) as string[];
        setImagePaths(paths);
        const previews: Record<string, string> = {};
        await Promise.all(
          paths.map(async (p) => {
            const { data: s } = await supabase.storage
              .from("mobile-ad-images")
              .createSignedUrl(p, 60 * 60);
            if (s?.signedUrl) previews[p] = s.signedUrl;
          }),
        );
        setImagePreviews(previews);
      } catch (e) {
        console.error(e);
        toast.error("Entwurf konnte nicht geladen werden");
      } finally {
        setLoadingDraft(false);
      }
    })();
  }, [draftId, isLive, navigate]);


  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newPaths: string[] = [];
      const newPreviews: Record<string, string> = {};
      const prefix = `drafts/${Date.now()}`;
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage
          .from("mobile-ad-images")
          .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (error) {
          console.error(error);
          toast.error(`Upload fehlgeschlagen: ${file.name}`);
          continue;
        }
        const { data: signed } = await supabase.storage
          .from("mobile-ad-images")
          .createSignedUrl(path, 60 * 60);
        newPaths.push(path);
        if (signed?.signedUrl) newPreviews[path] = signed.signedUrl;
      }
      setImagePaths((p) => [...p, ...newPaths]);
      setImagePreviews((p) => ({ ...p, ...newPreviews }));
      e.target.value = "";
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (path: string) => {
    await supabase.storage.from("mobile-ad-images").remove([path]);
    setImagePaths((p) => p.filter((x) => x !== path));
    setImagePreviews((p) => {
      const { [path]: _drop, ...rest } = p;
      return rest;
    });
  };

  const buildPayload = () => {
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

    // Basis (optional)
    if (form.trimLine) vehicle.trimLine = form.trimLine;
    if (form.doors) vehicle.doors = { key: form.doors };
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
    const seats = intIf(form.seats); if (seats !== undefined) vehicle.seats = seats;
    const cyl = intIf(form.cylinders); if (cyl !== undefined) vehicle.cylinder = cyl;
    const fc = intIf(form.fuelCapacity); if (fc !== undefined) vehicle.fuelCapacity = fc;
    if (form.driveType) vehicle.driveType = { key: form.driveType };

    // Farbe
    if (form.exteriorColor) vehicle.exteriorColor = { key: form.exteriorColor };
    if (form.manufacturerColorName) vehicle.manufacturerColorName = form.manufacturerColorName;
    if (form.metallic) vehicle.metallic = true;
    if (form.matt) vehicle.matteColor = true;

    // Historie
    if (form.accidentDamaged === "true") vehicle.accidentDamaged = true;
    else if (form.accidentDamaged === "false") vehicle.accidentDamaged = false;
    if (form.roadworthy === "true") vehicle.roadworthy = true;
    else if (form.roadworthy === "false") vehicle.roadworthy = false;
    if (form.fullServiceHistory) vehicle.fullServiceHistory = true;
    if (form.nonSmokerVehicle) vehicle.nonSmokerVehicle = true;
    if (form.warranty) vehicle.warranty = true;
    const prev = intIf(form.numberOfPreviousOwners);
    if (prev !== undefined) vehicle.numberOfPreviousOwners = prev;

    // Umwelt
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

    // Klimatisierung / Einparkhilfe
    if (form.climatisation) vehicle.climatisation = { key: form.climatisation };
    if (form.parkingAssistants.length) {
      vehicle.parkingAssistants = form.parkingAssistants.map((k) => ({ key: k }));
    }

    // Equipment / Safety booleans
    for (const f of ALL_FEATURES) {
      if (form.features[f.key]) vehicle[f.key] = true;
    }

    // Nummern
    if (form.internalNumber) vehicle.internalNumber = form.internalNumber;
    if (form.vin) vehicle.vin = form.vin;

    // Mobile.de erwartet vatRate als Dezimal-String ("19.00").
    // "OTHER" (Differenzbesteuerung) wird zur Sicherheit ebenfalls als "19.00" gesendet,
    // damit consumerpriceamount-invalid nicht auftritt — Sondersteuerung ist TODO.
    const vatRate = form.vatRate === "19.00" || form.vatRate === "" ? "19.00" : "19.00";

    return {
      vehicleClass: "Car",
      vehicle,
      price: {
        consumerPriceGross: String(form.consumerPriceGross || "").replace(/[^0-9]/g, ""),
        currency: "EUR",
        vatRate,
        type: "FIXED",
      },
      description: form.description || undefined,
    };
  };

  const validate = (): string | null => {
    if (!form.make) return "Marke fehlt";
    if (!form.model) return "Modell fehlt";
    if (!form.category) return "Kategorie fehlt";
    if (!form.mileage) return "Kilometerstand fehlt";
    if (!form.regYear || !form.regMonth) return "Erstzulassung (Monat + Jahr) fehlt";
    if (!form.fuel) return "Kraftstoff fehlt";
    if (!form.gearbox) return "Getriebe fehlt";
    if (!form.power) return "Leistung (kW) fehlt";
    if (!form.cubicCapacity) return "Hubraum fehlt";
    const cleanPrice = String(form.consumerPriceGross || "").replace(/[^0-9]/g, "");
    if (!cleanPrice || cleanPrice === "0") return "Preis fehlt/ungültig";
    if (!form.vatRate) return "MwSt.-Satz fehlt";
    return null;
  };

  const saveDraft = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      if (isEdit && draftId) {
        const nextStatus = draftStatus === "error" ? "draft" : draftStatus;
        const { error } = await supabase
          .from("mobile_ad_drafts")
          .update({
            payload: buildPayload() as never,
            image_paths: imagePaths,
            status: nextStatus,
            error_message: nextStatus === "draft" ? null : undefined,
          })
          .eq("id", draftId);
        if (error) {
          console.error(error);
          toast.error(`Speichern fehlgeschlagen: ${error.message}`);
          return;
        }
        toast.success("Entwurf aktualisiert");
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const { error } = await supabase.from("mobile_ad_drafts").insert({
          status: "draft",
          payload: buildPayload() as never,
          image_paths: imagePaths,
          created_by: userRes.user?.id ?? null,
        });
        if (error) {
          console.error(error);
          toast.error(`Speichern fehlgeschlagen: ${error.message}`);
          return;
        }
        toast.success("Entwurf gespeichert");
      }
      navigate("/admin/mobile-ad");
    } finally {
      setSaving(false);
    }
  };

  const saveLive = async () => {
    if (!draftId) return;
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    setLastUpdateError(null);
    try {
      const { data, error } = await supabase.functions.invoke("update-mobile-ad", {
        body: { draftId, mobileAdId: liveMobileAdId || undefined, formPayload: buildPayload() },
      });
      const d = (data ?? null) as { success?: boolean; error?: string; details?: unknown } | null;
      if (error || !d?.success) {
        const raw = d?.error || error?.message || "Update fehlgeschlagen";
        const detStr = typeof d?.details === "string" ? d.details : JSON.stringify(d?.details ?? raw, null, 2);
        const isPriceErr = /price|consumer-?price|consumerValue|consumer-price-not-in-range/i.test(raw + " " + detStr);
        const msg = isPriceErr
          ? "Mobile.de hat das Update abgelehnt: Preis prüfen."
          : `Mobile.de hat das Update abgelehnt: ${raw}`;
        setLastUpdateError({ msg, details: detStr });
        toast.error(msg);
        return;
      }
      toast.success("Inserat wurde live bei Mobile.de aktualisiert.");
      navigate("/admin/mobile-ad");
    } catch (e) {
      const msg = (e as Error)?.message || "Unbekannter Fehler beim Live-Update";
      setLastUpdateError({ msg });
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")),
    [],
  );
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 40 }, (_, i) => String(now - i));
  }, []);
  const huYears = useMemo(
    () => Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + i)),
    [],
  );

  if (loadingDraft) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        {isLive ? "Lade Live-Daten von Mobile.de…" : "Lade Entwurf…"}
      </div>
    );
  }
  if (isLive && liveLoadError) {
    return (
      <Card className="p-6 space-y-3 max-w-2xl">
        <div className="text-destructive font-medium">{liveLoadError}</div>
        <Button variant="outline" onClick={() => navigate("/admin/mobile-ad")}>
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Button>
      </Card>
    );
  }

  const featureGrid = (items: { key: string; label: string }[]) => (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {items.map((f) => (
        <div key={f.key} className="flex items-center gap-2">
          <Checkbox
            id={`f-${f.key}`}
            checked={!!form.features[f.key]}
            onCheckedChange={(c) =>
              setForm((prev) => ({
                ...prev,
                features: { ...prev.features, [f.key]: c === true },
              }))
            }
          />
          <Label htmlFor={`f-${f.key}`} className="cursor-pointer text-sm">
            {f.label}
          </Label>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {isLive
            ? "Live-Bearbeitung"
            : isEdit
            ? "Mobile.de Inserat bearbeiten"
            : "Mobile.de Inserat anlegen"}
        </h1>
        <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
          {isLive ? (
            <>
              <span>Änderungen werden direkt im veröffentlichten Mobile.de-Inserat gespeichert.</span>
              {liveMobileAdId && (
                <>
                  <span>·</span>
                  <span>Mobile.de ID: <span className="font-mono">{liveMobileAdId}</span></span>
                </>
              )}
              <Badge variant="default">published</Badge>
            </>
          ) : (
            <span>
              {isEdit
                ? "Änderungen werden im bestehenden Entwurf gespeichert."
                : "Pflichtfelder ausfüllen und als Entwurf speichern."}
            </span>
          )}
        </div>
      </div>

      {isLive && (
        <Card className="p-4 bg-muted/30 text-sm">
          Bilder bleiben bei dieser Live-Bearbeitung unverändert.
          {liveImageCount > 0 && <> Aktuell {liveImageCount} Bild(er) bei Mobile.de.</>}
        </Card>
      )}

      {/* ── Fahrzeuggrunddaten ── */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Fahrzeuggrunddaten</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Zustand *</Label>
            <Select value={form.condition} onValueChange={(v) => update("condition", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USED">Gebrauchtfahrzeug</SelectItem>
                <SelectItem value="NEW">Neufahrzeug</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Art des Inserats</Label>
            <Input value="Normales Inserat" disabled />
          </div>
          <div className="space-y-2">
            <Label>Marke *</Label>
            <Select
              value={form.make}
              onValueChange={(v) => { update("make", v); update("model", ""); }}
              disabled={loadingMakes}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingMakes ? "Lade…" : "Marke wählen"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {makes.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Modell *</Label>
            <Select
              value={form.model}
              onValueChange={(v) => update("model", v)}
              disabled={!form.make || loadingModels}
            >
              <SelectTrigger>
                <SelectValue placeholder={!form.make ? "Erst Marke wählen" : loadingModels ? "Lade…" : "Modell wählen"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {models.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Modellvariante *</Label>
            <Input
              value={form.modelDescription}
              onChange={(e) => update("modelDescription", e.target.value)}
              placeholder="z. B. 2.0 TDI Style"
            />
          </div>
          <div className="space-y-2">
            <Label>Ausstattungslinie / Trim</Label>
            <Input
              value={form.trimLine}
              onChange={(e) => update("trimLine", e.target.value)}
              placeholder="z. B. S line"
            />
          </div>
          <div className="space-y-2">
            <Label>
              Baureihe <span className="text-xs text-muted-foreground">(TODO: Refdata)</span>
            </Label>
            <Input disabled placeholder="folgt: per Refdata pro Modell" />
          </div>
          <div className="space-y-2">
            <Label>Kilometerstand *</Label>
            <Input
              type="number"
              value={form.mileage}
              onChange={(e) => update("mileage", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Erstzulassung *</Label>
            <div className="flex gap-2">
              <Select value={form.regMonth} onValueChange={(v) => update("regMonth", v)}>
                <SelectTrigger className="w-24"><SelectValue placeholder="MM" /></SelectTrigger>
                <SelectContent>
                  {months.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={form.regYear} onValueChange={(v) => update("regYear", v)}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="YYYY" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {years.map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Kategorie *</Label>
            <Select value={form.category} onValueChange={(v) => update("category", v)}>
              <SelectTrigger><SelectValue placeholder="Kategorie wählen" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {categories.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {labelFor(CATEGORY_LABELS, c.key, c.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Türen</Label>
            <Select value={form.doors} onValueChange={(v) => update("doors", v)}>
              <SelectTrigger><SelectValue placeholder="Wählen" /></SelectTrigger>
              <SelectContent>
                {DOORS_OPTIONS.map((d) => (
                  <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Anzahl Sitzplätze</Label>
            <Input
              type="number"
              value={form.seats}
              onChange={(e) => update("seats", e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* ── Motor / Technik ── */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Motor / Technik</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Getriebe *</Label>
            <Select value={form.gearbox} onValueChange={(v) => update("gearbox", v)}>
              <SelectTrigger><SelectValue placeholder="Wählen" /></SelectTrigger>
              <SelectContent>
                {gearboxes.map((g) => (
                  <SelectItem key={g.key} value={g.key}>{labelFor(GEARBOX_LABELS, g.key, g.name)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Kraftstoff *</Label>
            <Select value={form.fuel} onValueChange={(v) => update("fuel", v)}>
              <SelectTrigger><SelectValue placeholder="Wählen" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {fuels.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{labelFor(FUEL_LABELS, f.key, f.name)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Hubraum (ccm) *</Label>
            <Input
              type="number"
              value={form.cubicCapacity}
              onChange={(e) => update("cubicCapacity", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Leistung (kW) *</Label>
            <Input
              type="number"
              value={form.power}
              onChange={(e) => update("power", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Zylinder</Label>
            <Input
              type="number"
              value={form.cylinders}
              onChange={(e) => update("cylinders", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Tankgröße (L)</Label>
            <Input
              type="number"
              value={form.fuelCapacity}
              onChange={(e) => update("fuelCapacity", e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Antriebsart</Label>
            <Select value={form.driveType} onValueChange={(v) => update("driveType", v)} disabled={!driveTypes.length}>
              <SelectTrigger>
                <SelectValue placeholder={driveTypes.length ? "Wählen" : "Refdata nicht verfügbar"} />
              </SelectTrigger>
              <SelectContent>
                {driveTypes.map((d) => (
                  <SelectItem key={d.key} value={d.key}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* ── Farbe ── */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Farbe</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Außenfarbe</Label>
            <Select value={form.exteriorColor} onValueChange={(v) => update("exteriorColor", v)}>
              <SelectTrigger><SelectValue placeholder="Wählen" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {exteriorColors.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Herstellerfarbe</Label>
            <Input
              value={form.manufacturerColorName}
              onChange={(e) => update("manufacturerColorName", e.target.value)}
              placeholder="z. B. MYTHOS BLACK"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="metallic" checked={form.metallic} onCheckedChange={(c) => update("metallic", c === true)} />
            <Label htmlFor="metallic" className="cursor-pointer">Metallic</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="matt" checked={form.matt} onCheckedChange={(c) => update("matt", c === true)} />
            <Label htmlFor="matt" className="cursor-pointer">Matt</Label>
          </div>
        </div>
      </Card>

      {/* ── Fahrzeughistorie / Zustand ── */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Fahrzeughistorie &amp; Zustand</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Unfallfahrzeug</Label>
            <Select
              value={form.accidentDamaged}
              onValueChange={(v) => update("accidentDamaged", v as "" | "true" | "false")}
            >
              <SelectTrigger><SelectValue placeholder="Keine Angabe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Nein</SelectItem>
                <SelectItem value="true">Ja</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Beschädigtes Fahrzeug (unreparierte Schäden)</Label>
            <Select
              value={form.damageUnrepaired}
              onValueChange={(v) => update("damageUnrepaired", v as "true" | "false")}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Nein</SelectItem>
                <SelectItem value="true">Ja</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Fahrtauglich</Label>
            <Select
              value={form.roadworthy}
              onValueChange={(v) => update("roadworthy", v as "" | "true" | "false")}
            >
              <SelectTrigger><SelectValue placeholder="Keine Angabe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Ja</SelectItem>
                <SelectItem value="false">Nein</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Anzahl Fahrzeughalter</Label>
            <Input
              type="number"
              value={form.numberOfPreviousOwners}
              onChange={(e) => update("numberOfPreviousOwners", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="warranty" checked={form.warranty} onCheckedChange={(c) => update("warranty", c === true)} />
            <Label htmlFor="warranty" className="cursor-pointer">Garantie</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="nonsmoker" checked={form.nonSmokerVehicle} onCheckedChange={(c) => update("nonSmokerVehicle", c === true)} />
            <Label htmlFor="nonsmoker" className="cursor-pointer">Nichtraucher-Fahrzeug</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="fsh" checked={form.fullServiceHistory} onCheckedChange={(c) => update("fullServiceHistory", c === true)} />
            <Label htmlFor="fsh" className="cursor-pointer">Scheckheftgepflegt</Label>
          </div>
        </div>
      </Card>

      {/* ── Umwelt / Untersuchungen ── */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Umwelt &amp; Untersuchungen</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Checkbox id="pf" checked={form.particulateFilter} onCheckedChange={(c) => update("particulateFilter", c === true)} />
            <Label htmlFor="pf" className="cursor-pointer">Partikelfilter</Label>
          </div>
          <div className="flex items-center gap-2 md:justify-end">
            <Checkbox id="hunew" checked={form.huNew} onCheckedChange={(c) => update("huNew", c === true)} />
            <Label htmlFor="hunew" className="cursor-pointer">HU neu</Label>
            <Checkbox id="inew" checked={form.inspectionNew} onCheckedChange={(c) => update("inspectionNew", c === true)} className="ml-4" />
            <Label htmlFor="inew" className="cursor-pointer">Inspektion neu</Label>
          </div>
          <div className="space-y-2">
            <Label>Schadstoffklasse</Label>
            <Select value={form.emissionClass} onValueChange={(v) => update("emissionClass", v)} disabled={!emissionClasses.length}>
              <SelectTrigger><SelectValue placeholder={emissionClasses.length ? "Wählen" : "Refdata nicht verfügbar"} /></SelectTrigger>
              <SelectContent className="max-h-72">
                {emissionClasses.map((e) => (<SelectItem key={e.key} value={e.key}>{e.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Umweltplakette</Label>
            <Select value={form.emissionSticker} onValueChange={(v) => update("emissionSticker", v)} disabled={!emissionStickers.length}>
              <SelectTrigger><SelectValue placeholder={emissionStickers.length ? "Wählen" : "Refdata nicht verfügbar"} /></SelectTrigger>
              <SelectContent>
                {emissionStickers.map((e) => (<SelectItem key={e.key} value={e.key}>{e.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Nächste HU</Label>
            <div className="flex gap-2">
              <Select value={form.hsnMonth} onValueChange={(v) => update("hsnMonth", v)}>
                <SelectTrigger className="w-24"><SelectValue placeholder="MM" /></SelectTrigger>
                <SelectContent>
                  {months.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={form.hsnYear} onValueChange={(v) => update("hsnYear", v)}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="YYYY" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {huYears.map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>CO₂ kombiniert (g/km)</Label>
            <Input type="number" value={form.co2EmissionsCombined}
              onChange={(e) => update("co2EmissionsCombined", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Verbrauch kombiniert (l/100km)</Label>
            <Input type="number" step="0.1" value={form.consumptionCombined}
              onChange={(e) => update("consumptionCombined", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Verbrauch innerorts</Label>
            <Input type="number" step="0.1" value={form.consumptionUrban}
              onChange={(e) => update("consumptionUrban", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Verbrauch außerorts</Label>
            <Input type="number" step="0.1" value={form.consumptionExtraUrban}
              onChange={(e) => update("consumptionExtraUrban", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Verbrauch Stadtrand</Label>
            <Input type="number" step="0.1" value={form.consumptionInner}
              onChange={(e) => update("consumptionInner", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Verbrauch Landstraße/Autobahn</Label>
            <Input type="number" step="0.1" value={form.consumptionOuter}
              onChange={(e) => update("consumptionOuter", e.target.value)} />
          </div>
        </div>
      </Card>

      {/* ── Klimatisierung ── */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Klimatisierung</h2>
        <Select value={form.climatisation} onValueChange={(v) => update("climatisation", v)} disabled={!climatisations.length}>
          <SelectTrigger>
            <SelectValue placeholder={climatisations.length ? "Wählen" : "Refdata nicht verfügbar (TODO)"} />
          </SelectTrigger>
          <SelectContent>
            {climatisations.map((o) => (<SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </Card>

      {/* ── Ausstattung / Komfort ── */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Ausstattung</h2>
        {featureGrid(COMFORT_FEATURES)}
        <div className="pt-4 border-t border-border space-y-2">
          <Label className="block">Einparkhilfe</Label>
          {parkingAssistantOpts.length ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {parkingAssistantOpts.map((p) => {
                const checked = form.parkingAssistants.includes(p.key);
                return (
                  <div key={p.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`pa-${p.key}`}
                      checked={checked}
                      onCheckedChange={(c) =>
                        setForm((prev) => ({
                          ...prev,
                          parkingAssistants:
                            c === true
                              ? [...prev.parkingAssistants, p.key]
                              : prev.parkingAssistants.filter((x) => x !== p.key),
                        }))
                      }
                    />
                    <Label htmlFor={`pa-${p.key}`} className="cursor-pointer text-sm">{p.name}</Label>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Refdata nicht verfügbar (TODO).</p>
          )}
        </div>
      </Card>

      {/* ── Sicherheit ── */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Sicherheit</h2>
        {featureGrid(SAFETY_FEATURES)}
        <div className="pt-4 border-t border-border space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Folgende Auswahlfelder folgen, sobald die zugehörigen Refdata-Enums geklärt sind:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {TODO_ENUM_FIELDS.map((t) => (
              <div key={t.key} className="space-y-1 opacity-60">
                <Label className="text-xs">{t.label}</Label>
                <Input disabled placeholder="TODO – Refdata" />
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Fahrzeugnummern ── */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Fahrzeugnummern</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Interne Nummer</Label>
            <Input
              value={form.internalNumber}
              onChange={(e) => update("internalNumber", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>FIN / VIN</Label>
            <Input
              value={form.vin}
              onChange={(e) => update("vin", e.target.value.toUpperCase())}
              maxLength={17}
              className="font-mono"
            />
          </div>
        </div>
      </Card>

      {/* ── Beschreibung ── */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Beschreibung</h2>
        <Textarea
          rows={6}
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Eigene Fahrzeugbeschreibung"
        />
      </Card>

      {/* ── Preis ── */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Preis</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Verbraucherpreis brutto (EUR) *</Label>
            <Input
              type="number"
              value={form.consumerPriceGross}
              onChange={(e) => update("consumerPriceGross", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>MwSt.-Auswahl *</Label>
            <Select value={form.vatRate} onValueChange={(v) => update("vatRate", v)}>
              <SelectTrigger><SelectValue placeholder="Wählen" /></SelectTrigger>
              <SelectContent>
                {vatRates.map((v) => (
                  <SelectItem key={v.key} value={v.key}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 text-xs text-muted-foreground">
            Typ: FIXED · Währung: EUR · Differenzbesteuerung folgt später.
          </div>
        </div>
      </Card>

      {/* ── Bilder ── */}
      {isLive ? (
        <Card className="p-6 space-y-2 bg-muted/30">
          <h2 className="text-lg font-semibold">Bilder</h2>
          <p className="text-sm text-muted-foreground">
            Bilder bleiben bei dieser Live-Bearbeitung unverändert.
            {liveImageCount > 0 && <> Aktuell {liveImageCount} Bild(er) bei Mobile.de.</>}
          </p>
        </Card>
      ) : (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Bilder</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {imagePaths.map((path) => (
              <div key={path} className="relative aspect-[4/3] rounded-md overflow-hidden border border-border bg-muted">
                {imagePreviews[path] ? (
                  <img src={imagePreviews[path]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                    {path.split("/").pop()}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeImage(path)}
                  aria-label="Bild entfernen"
                  className="absolute top-1 right-1 bg-background/90 rounded-full p-1 hover:bg-background"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div>
            <Label
              htmlFor="ad-images"
              className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 h-10 text-sm font-medium"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Bilder hochladen
            </Label>
            <input
              id="ad-images"
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
          </div>
        </Card>
      )}

      {/* ── Technische Mobile.de-Payload-Vorschau (Debug) ── */}
      <PayloadPreview form={form} imageCount={isLive ? liveImageCount : imagePaths.length} />

      {isLive && lastUpdateError && (
        <Card className="p-4 border-destructive/50 bg-destructive/5 space-y-2">
          <div className="text-destructive font-medium text-sm">{lastUpdateError.msg}</div>
          {lastUpdateError.details && (
            <>
              <button
                type="button"
                onClick={() => setShowErrorDetails((s) => !s)}
                className="text-xs underline text-muted-foreground"
              >
                {showErrorDetails ? "Details ausblenden" : "Details anzeigen"}
              </button>
              {showErrorDetails && (
                <pre className="bg-muted/40 p-2 rounded overflow-x-auto max-h-60 text-xs">
                  {lastUpdateError.details}
                </pre>
              )}
            </>
          )}
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate("/admin/mobile-ad")} disabled={saving}>
          Abbrechen
        </Button>
        {isLive ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Änderungen live speichern
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Änderungen live bei Mobile.de speichern?</AlertDialogTitle>
                <AlertDialogDescription>
                  Diese Änderung wird direkt im veröffentlichten Mobile.de-Inserat sichtbar. Bitte vorher prüfen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={saveLive}>Ja, live aktualisieren</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button onClick={saveDraft} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEdit ? "Änderungen speichern" : "Als Entwurf speichern"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Debug-Vorschau: spiegelt grob das Mapping in publish-mobile-ad
// (keine Secrets, keine Live-Werte an Mobile.de).
// ──────────────────────────────────────────────────────────────────────────
const SAFE_CLIMATISATION_UI = new Set([
  "MANUAL_CLIMATISATION",
  "AUTOMATIC_CLIMATISATION",
  "2_ZONE_AUTOMATIC_AIR_CONDITIONING",
  "3_ZONE_AUTOMATIC_AIR_CONDITIONING",
  "4_ZONE_AUTOMATIC_AIR_CONDITIONING",
]);
const SAFE_PARKING_UI = new Set(["FRONT_SENSORS", "REAR_SENSORS"]);
const PARKING_ALIAS_UI: Record<string, string> = { FRONT: "FRONT_SENSORS", REAR: "REAR_SENSORS" };

function PayloadPreview({ form, imageCount }: { form: FormState; imageCount: number }) {
  const { rootKeys, presentRequired, missing, warnings } = useMemo(() => {
    const root: string[] = ["vehicleClass", "price"];
    const req: Record<string, unknown> = {
      make: form.make,
      model: form.model,
      modelDescription: form.modelDescription,
      category: form.category,
      mileage: form.mileage,
      firstRegistration:
        form.regYear && form.regMonth ? `${form.regYear}${form.regMonth.padStart(2, "0")}` : "",
      fuel: form.fuel,
      gearbox: form.gearbox,
      power: form.power,
      cubicCapacity: form.cubicCapacity,
      condition: form.condition,
      damageUnrepaired: form.damageUnrepaired,
      "price.consumerPriceGross": String(form.consumerPriceGross || "").replace(/[^0-9]/g, ""),
      "price.vatRate": form.vatRate,
    };
    const missing: string[] = [];
    const present: string[] = [];
    for (const [k, v] of Object.entries(req)) {
      const ok = v !== undefined && v !== null && String(v).trim() !== "" && v !== "0";
      if (ok) present.push(k);
      else missing.push(k);
      if (!k.startsWith("price.") && !root.includes(k)) root.push(k);
    }

    // Optional roots (finale Mobile.de-Feldnamen)
    const addIf = (k: string, v: unknown) => {
      if (v !== undefined && v !== null && v !== "" && v !== false && !root.includes(k)) root.push(k);
    };
    addIf("description", form.description);
    addIf("trimLine", form.trimLine);
    addIf("doors", form.doors); addIf("seats", form.seats);
    addIf("vin", form.vin); addIf("internalNumber", form.internalNumber);
    addIf("cylinder", form.cylinders);
    addIf("fuelTankVolume", form.fuelCapacity);
    addIf("driveType", form.driveType);
    addIf("exteriorColor", form.exteriorColor);
    addIf("manufacturerColorName", form.manufacturerColorName);
    if (form.metallic) addIf("metallic", true);
    if (form.matt) addIf("matteColor", true);
    if (form.accidentDamaged) addIf("accidentDamaged", true);
    if (form.roadworthy) addIf("roadworthy", true);
    if (form.warranty) addIf("warranty", true);
    if (form.nonSmokerVehicle) addIf("nonSmokerVehicle", true);
    if (form.fullServiceHistory) addIf("fullServiceHistory", true);
    addIf("numberOfPreviousOwners", form.numberOfPreviousOwners);
    if (form.hsnYear && form.hsnMonth) addIf("generalInspection", true);
    if (form.huNew) addIf("newHuAu", true);
    if (form.inspectionNew) addIf("newService", true);
    if (form.particulateFilter) addIf("particulateFilterDiesel", true);
    addIf("emissionClass", form.emissionClass);
    addIf("emissionSticker", form.emissionSticker);
    if (form.co2EmissionsCombined) addIf("emissions", true);
    if (
      form.consumptionCombined || form.consumptionUrban || form.consumptionInner ||
      form.consumptionExtraUrban || form.consumptionOuter
    ) addIf("consumptions", true);
    if (form.condition === "NEW") addIf("countryVersion", "DE");

    const warnings: string[] = [];
    if (form.climatisation) {
      if (SAFE_CLIMATISATION_UI.has(form.climatisation)) addIf("climatisation", true);
      else warnings.push(`climatisation="${form.climatisation}" nicht in Whitelist – wird nicht gesendet`);
    }
    if (form.parkingAssistants.length) {
      const safe = form.parkingAssistants
        .map((k) => PARKING_ALIAS_UI[k] ?? k)
        .filter((k) => SAFE_PARKING_UI.has(k));
      const unsafe = form.parkingAssistants.filter(
        (k) => !SAFE_PARKING_UI.has(PARKING_ALIAS_UI[k] ?? k),
      );
      if (safe.length) addIf("parkingAssistants", true);
      if (unsafe.length) warnings.push(`parkingAssistants ${unsafe.join(", ")} unsicher – nicht gesendet`);
    }
    if (form.consumptionOuter) {
      warnings.push("TODO: Verbrauch Landstraße/Autobahn — separate UI-Felder fehlen, wird als rural gesendet");
    }

    // Feature-Aliase auf API-Namen mappen für Preview
    const FEATURE_ALIAS_UI: Record<string, string> = {
      powerSteering: "powerAssistedSteering",
      roofRack: "roofRails",
      multifunctionalSteeringWheel: "multifunctionalWheel",
      emergencyBrakeAssistant: "collisionAvoidance",
      rainSensor: "automaticRainSensor",
      highBeamAssistant: "highBeamAssist",
    };
    const feats = Object.entries(form.features)
      .filter(([, v]) => v)
      .map(([k]) => FEATURE_ALIAS_UI[k] ?? k);
    if (feats.length) root.push(...feats);

    if (imageCount > 0) root.push("images");

    return { rootKeys: [...new Set(root)], presentRequired: present, missing, warnings };
  }, [form, imageCount]);

  return (
    <details className="rounded-md border border-border bg-muted/30 p-4 group">
      <summary className="cursor-pointer flex items-center justify-between text-sm font-medium">
        <span>Technische Mobile.de-Payload-Vorschau</span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-4 space-y-4 text-xs">
        <p className="text-muted-foreground">
          Diese Werte werden an die Mobile.de Seller-API gesendet. Die Formularanzeige nutzt deutsche Labels.
        </p>
        <div>
          <div className="font-semibold mb-1">Root-Keys ({rootKeys.length})</div>
          <div className="font-mono break-all text-muted-foreground">{rootKeys.join(", ")}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="font-semibold mb-1 text-emerald-600">
              Pflichtfelder gesetzt ({presentRequired.length})
            </div>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              {presentRequired.map((k) => <li key={k}>{k}</li>)}
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-1 text-destructive">
              Pflichtfelder fehlend ({missing.length})
            </div>
            {missing.length === 0 ? (
              <div className="text-muted-foreground">Keine.</div>
            ) : (
              <ul className="list-disc list-inside text-destructive/90 space-y-0.5">
                {missing.map((k) => <li key={k}>{k}</li>)}
              </ul>
            )}
          </div>
        </div>
        <div>
          <div className="font-semibold mb-1">Bilder: {imageCount}</div>
        </div>
        {warnings.length > 0 && (
          <div>
            <div className="font-semibold mb-1 text-amber-600">
              Warnungen ({warnings.length})
            </div>
            <ul className="list-disc list-inside text-amber-700 space-y-0.5">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
