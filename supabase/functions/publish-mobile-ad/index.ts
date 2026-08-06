// Publishes a mobile_ad_drafts row as a real ad on Mobile.de Seller-API.
// Admin-only. Uploads images first (JPEG, <=2MB), then creates the ad with image refs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { uploadVehicleImages, storeImageRefs } from "../_shared/mobile-images.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { stripECarFields } from "../_shared/mobile-ecar.ts";

import { emitNotificationEvent } from "../_shared/emit-event.ts";
import {
  resolveMobileAccount,
  syncMobileListing,
  type PlatformAccount,
} from "../_shared/platform-accounts.ts";
import {
  checkRequiredAdFields,
  type RequiredAdField,
} from "../_shared/mobile-ad-required.ts";
import {
  parseMobileErrors,
  summarizeIssues,
  messageCode,
  type AdIssue,
} from "../_shared/mobile-ad-errors.ts";
import { loadMobileErrorTexts } from "../_shared/mobile-error-texts.ts";


const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Zugangsdaten und Verkäufer-ID stammen aus platform_accounts (Standard- bzw.
// Unfall-Konto). Sie werden pro Anfrage gesetzt; ein Mutex verhindert, dass sich
// parallele Anfragen im selben Isolate gegenseitig überschreiben.
let ACCOUNT: PlatformAccount = {
  account_key: "standard",
  label: "Mobile.de",
  seller_id: "451040",
  username: "",
  password: "",
};
let MOBILE_USER = "";
let MOBILE_PASS = "";
let SELLER_ID = "451040";

let requestChain: Promise<unknown> = Promise.resolve();
function withAccountLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = requestChain.then(fn, fn);
  requestChain = run.catch(() => undefined);
  return run;
}

function applyAccount(account: PlatformAccount) {
  ACCOUNT = account;
  MOBILE_USER = account.username;
  MOBILE_PASS = account.password;
  SELLER_ID = account.seller_id;
}
const API_BASE = "https://services.mobile.de/seller-api";
const MOBILE_MIME = "application/vnd.de.mobile.api+json";

function basicAuth(): string {
  return `Basic ${btoa(`${MOBILE_USER}:${MOBILE_PASS}`)}`;
}


/**
 * Liest aus einer Mobile.de-Anzeige die Bild-URLs (größte verfügbare
 * Repräsentation je Bild) heraus, damit Portal und Inserat dieselben
 * Bilder zeigen.
 */
export function extractAdImageUrls(ad: unknown): string[] {
  const images = (ad as { images?: unknown })?.images;
  if (!Array.isArray(images)) return [];
  const urls: string[] = [];
  for (const img of images) {
    const entry = img as {
      ref?: string;
      representations?: { url?: string; size?: string }[];
      url?: string;
    };
    const reps = Array.isArray(entry?.representations) ? entry.representations : [];
    const preferred =
      reps.find((r) => r?.size === "XXXL")?.url ??
      reps.find((r) => r?.size === "XXL")?.url ??
      reps.find((r) => r?.size === "L")?.url ??
      reps.find((r) => typeof r?.url === "string")?.url ??
      entry?.url ??
      (typeof entry?.ref === "string" && /^https?:\/\//.test(entry.ref) ? entry.ref : undefined);
    if (preferred && /^https?:\/\//.test(preferred)) urls.push(preferred);
  }
  return Array.from(new Set(urls));
}

// Robust extractor for the Mobile.de ad ID from create-ad responses.
// Tries multiple JSON keys and both relative + absolute Location header URLs.
export function extractMobileAdId(
  res: { headers: { get(name: string): string | null } },
  bodyText: string,
): { mobileAdId: string | undefined; source: string } {
  const looksLikeId = (v: unknown): string | undefined => {
    if (v === null || v === undefined) return undefined;
    const s = String(v).trim();
    if (!s) return undefined;
    // Mobile.de IDs are numeric strings, typically 8-12 digits.
    if (/^\d{6,}$/.test(s)) return s;
    return undefined;
  };

  // 1) JSON body — try multiple keys, including nested ad object
  try {
    const j = JSON.parse(bodyText);
    const candidates = [
      j?.mobileAdId, j?.id, j?.adId,
      j?.ad?.id, j?.ad?.mobileAdId, j?.ad?.adId,
    ];
    for (const c of candidates) {
      const id = looksLikeId(c);
      if (id) return { mobileAdId: id, source: "json" };
    }
  } catch { /* not JSON */ }

  // 2) Location header — supports relative path or absolute URL
  const loc = res.headers.get("Location") ?? res.headers.get("location");
  if (loc) {
    const tail = loc.split("?")[0].split("#")[0].replace(/\/+$/, "").split("/").pop() ?? "";
    const id = looksLikeId(tail);
    if (id) return { mobileAdId: id, source: "location-header" };
  }

  // 3) Last resort: regex over body for /ads/<digits>
  const m = bodyText.match(/\/ads\/(\d{6,})/);
  if (m) return { mobileAdId: m[1], source: "body-regex" };

  return { mobileAdId: undefined, source: "none" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping: bequemer Draft (flach ODER verschachtelt) → flacher Seller-API Body.
// Sendet NIE die interne `vehicle`-Property oder deutsche Labels an Mobile.de.
// Unsichere Enum-Werte werden weggelassen und in `warnings` protokolliert.
// ─────────────────────────────────────────────────────────────────────────────

type AdPayload = Record<string, unknown>;
type BuildResult = { adBody: AdPayload; missing: string[]; missingFields: RequiredAdField[]; warnings: string[] };

const SAFE_CLIMATISATION = new Set([
  "MANUAL_CLIMATISATION",
  "AUTOMATIC_CLIMATISATION",
  "2_ZONE_AUTOMATIC_AIR_CONDITIONING",
  "3_ZONE_AUTOMATIC_AIR_CONDITIONING",
  "4_ZONE_AUTOMATIC_AIR_CONDITIONING",
]);

const SAFE_PARKING_ASSISTANTS = new Set(["FRONT_SENSORS", "REAR_SENSORS"]);
const PARKING_ASSISTANT_ALIAS: Record<string, string> = {
  FRONT: "FRONT_SENSORS",
  REAR: "REAR_SENSORS",
};
const UNSAFE_PARKING_ASSISTANTS = new Set(["CAMERA", "AUTOMATIC_PARKING", "REAR_CAMERA"]);

// FEATURE_MAP: API field name + alias list (alte/falsche UI-Namen).
// An Mobile.de wird ausschließlich `api` gesendet, niemals ein Alias.
const FEATURE_MAP: { api: string; aliases: string[] }[] = [
  { api: "alloyWheels", aliases: [] },
  { api: "navigationSystem", aliases: [] },
  { api: "electricHeatedSeats", aliases: [] },
  { api: "bluetooth", aliases: [] },
  { api: "carplay", aliases: [] },
  { api: "androidAuto", aliases: [] },
  { api: "electricWindows", aliases: [] },
  { api: "centralLocking", aliases: [] },
  { api: "isofix", aliases: [] },
  { api: "sunroof", aliases: [] },
  { api: "panoramicGlassRoof", aliases: [] },
  { api: "usb", aliases: [] },
  { api: "touchscreen", aliases: [] },
  { api: "soundSystem", aliases: [] },
  { api: "summerTires", aliases: [] },
  { api: "winterTires", aliases: [] },
  { api: "allSeasonTires", aliases: [] },
  { api: "tintedWindows", aliases: [] },
  { api: "ambientLighting", aliases: [] },
  { api: "electricExteriorMirrors", aliases: [] },
  { api: "electricAdjustableSeats", aliases: [] },
  { api: "powerAssistedSteering", aliases: ["powerSteering"] },
  { api: "hillStartAssist", aliases: [] },
  { api: "onBoardComputer", aliases: [] },
  { api: "handsFreePhoneSystem", aliases: [] },
  { api: "roofRails", aliases: ["roofRack"] },
  { api: "winterPackage", aliases: [] },
  { api: "multifunctionalWheel", aliases: ["multifunctionalSteeringWheel"] },
  { api: "abs", aliases: [] },
  { api: "esp", aliases: [] },
  { api: "immobilizer", aliases: [] },
  { api: "fatigueWarningSystem", aliases: [] },
  { api: "collisionAvoidance", aliases: ["emergencyBrakeAssistant"] },
  { api: "automaticRainSensor", aliases: ["rainSensor"] },
  { api: "tirePressureMonitoring", aliases: [] },
  { api: "laneDepartureWarning", aliases: [] },
  { api: "startStopSystem", aliases: [] },
  { api: "trafficSignRecognition", aliases: [] },
  { api: "highBeamAssist", aliases: ["highBeamAssistant"] },
];

const UNSAFE_FIELDS = new Set([
  "speedControl", "headlightType", "trailerCouplingType", "airbag",
  "breakdownService", "corneringLight", "daytimeRunningLamps",
  "emergencyCallSystem",
]);

// Interne/deutsche/falsche Feldnamen, die niemals an Mobile.de gesendet werden dürfen.
// Werden nach dem Mapping aus adBody entfernt und in removedInternal protokolliert.
const FORBIDDEN_INTERNAL_KEYS = new Set([
  "cylinders", "fuelCapacity", "matt", "matte", "zylinder",
  "powerSteering", "roofRack", "multifunctionalSteeringWheel",
  "rainSensor", "highBeamAssistant", "emergencyBrakeAssistant",
  "huNew", "inspectionNew", "particulateFilter",
  "co2", "co2EmissionsCombined",
  "consumptionCombined", "consumptionInner", "consumptionOuter",
  "consumptionUrban", "consumptionExtraUrban",
]);

export function buildMobileAdPayload(payload: AdPayload, refs: string[]): BuildResult {
  const warnings: string[] = [];
  const removedInternal: string[] = [];
  const vehicle = (payload.vehicle ?? {}) as AdPayload;

  const getKey = (v: unknown): string | undefined => {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object" && typeof (v as { key?: unknown }).key === "string") {
      return (v as { key: string }).key;
    }
    return undefined;
  };
  const pick = (...candidates: unknown[]): unknown => {
    for (const c of candidates) if (c !== undefined && c !== null && c !== "") return c;
    return undefined;
  };
  const num = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    return undefined;
  };

  const priceObj = (payload.price ?? {}) as AdPayload;
  const rawAmount = pick(
    priceObj.consumerPriceGross,
    priceObj["consumer-price-gross"],
    payload.consumerPriceGross,
  );
  const cleanAmount = String(rawAmount ?? "").replace(/[^0-9]/g, "");
  const rawVat = pick(priceObj.vatRate, priceObj["vat-rate"], payload.vatRate) ?? "19.00";

  const adBody: AdPayload = {
    vehicleClass: "Car",
    make: getKey(pick(payload.make, vehicle.make)),
    model: getKey(pick(payload.model, vehicle.model)),
    modelDescription: pick(payload.modelDescription, vehicle["model-description"], vehicle.modelDescription),
    category: getKey(pick(payload.category, vehicle.category)),
    mileage: num(pick(payload.mileage, vehicle.mileage)),
    firstRegistration: pick(payload.firstRegistration, vehicle["first-registration"], vehicle.firstRegistration),
    fuel: getKey(pick(payload.fuel, vehicle.fuel)),
    gearbox: getKey(pick(payload.gearbox, vehicle.gearbox)),
    power: num(pick(payload.power, vehicle.power)),
    cubicCapacity: num(pick(payload.cubicCapacity, vehicle["cubic-capacity"], vehicle.cubicCapacity)),
    condition: (pick(payload.condition, vehicle.condition) as string) || "USED",
    damageUnrepaired:
      pick(payload.damageUnrepaired, vehicle["damage-unrepaired"], vehicle.damageUnrepaired) === true,
    price: {
      consumerPriceGross: cleanAmount,
      currency: "EUR",
      vatRate: String(rawVat),
      type: "FIXED",
    },
  };

  const desc = pick(payload.description, vehicle.description);
  if (typeof desc === "string" && desc.trim()) adBody.description = desc.trim();

  // Flacher Quell-Lookup: payload.<key> oder vehicle.<key>
  const src: AdPayload = { ...vehicle, ...payload };
  const addStr = (k: string, alts: string[] = []) => {
    const v = pick(src[k], ...alts.map((a) => src[a]));
    if (typeof v === "string" && v.trim()) adBody[k] = v.trim();
  };
  const addBoolTrue = (k: string, alts: string[] = []) => {
    for (const candidate of [k, ...alts]) {
      if (src[candidate] === true) { adBody[k] = true; return; }
    }
  };
  const addBoolEither = (k: string) => {
    if (src[k] === true || src[k] === false) adBody[k] = src[k];
  };
  const addKey = (k: string) => {
    const key = getKey(src[k]);
    if (key) adBody[k] = key;
  };

  addStr("trimLine"); addStr("modelRange");
  addKey("doors");
  addStr("vin"); addStr("internalNumber");

  // Tankgröße: Mobile.de erwartet "fuelTankVolume" (Integer Liter), NICHT "fuelCapacity"
  const fuelTankVolume = num(pick(src.fuelTankVolume, src.fuelCapacity));
  if (fuelTankVolume !== undefined) adBody.fuelTankVolume = fuelTankVolume;

  // Baujahr (Oldtimer): Root-Feld "constructionYear"
  const constructionYear = num(pick(src.constructionYear, src["construction-year"], src.baujahr));
  if (constructionYear !== undefined && constructionYear >= 1900) {
    adBody.constructionYear = constructionYear;
  }

  addKey("driveType");
  addKey("exteriorColor"); addKey("interiorColor"); addKey("interiorType");
  addStr("manufacturerColorName"); addBoolTrue("metallic");

  // Cylinder: Root-Feld "cylinder" (Integer 1–24)
  const cylinder = num(pick(src.cylinder, src.cylinders, src.zylinder));
  if (cylinder !== undefined && cylinder >= 1 && cylinder <= 24) adBody.cylinder = cylinder;

  // Seats: Root-Feld "seats" (Integer 1–255)
  const seats = num(pick(src.seats, src.numberOfSeats, src["number-of-seats"]));
  if (seats !== undefined && seats >= 1 && seats <= 255) adBody.seats = seats;

  // Matt-Lackierung: Root-Feld "matteColor" (Boolean)
  const matteColor = pick(src.matteColor, src.matt, src.matte);
  if (matteColor === true) adBody.matteColor = true;

  addBoolEither("accidentDamaged"); addBoolEither("roadworthy");
  addBoolTrue("warranty"); addBoolTrue("nonSmokerVehicle"); addBoolTrue("fullServiceHistory");

  // HU/Inspektion neu: korrekt newHuAu / newService
  addBoolTrue("newHuAu", ["huNew"]);
  addBoolTrue("newService", ["inspectionNew"]);

  const numNop = (k: string) => {
    const v = num(src[k]);
    if (v !== undefined) adBody[k] = v;
  };
  numNop("numberOfPreviousOwners");
  addStr("generalInspection");

  // Partikelfilter: korrekt particulateFilterDiesel
  addBoolTrue("particulateFilterDiesel", ["particulateFilter"]);

  addKey("emissionClass"); addKey("emissionSticker");

  // CO₂ verschachtelt: emissions.combined.co2
  const co2 = num(pick(src.co2, src.co2EmissionsCombined));
  if (co2 !== undefined) {
    adBody.emissions = { combined: { co2 } };
  }

  // Verbrauch verschachtelt: consumptions.fuel.{combined,city,suburban,rural,highway}
  const fuelCons: Record<string, number> = {};
  const consCombined = num(src.consumptionCombined);
  const consCity = num(pick(src.consumptionUrban, src.consumptionInner));
  const consSuburban = num(src.consumptionExtraUrban);
  const consOuter = num(src.consumptionOuter);
  if (consCombined !== undefined) fuelCons.combined = consCombined;
  if (consCity !== undefined) fuelCons.city = consCity;
  if (consSuburban !== undefined) fuelCons.suburban = consSuburban;
  if (consOuter !== undefined) {
    // UI bündelt "Landstraße/Autobahn" — bis zur Trennung als rural mappen + Warnung
    fuelCons.rural = consOuter;
    warnings.push("TODO: consumptionOuter wird als consumptions.fuel.rural gesendet — separate UI-Felder für rural/highway erforderlich");
  }
  if (Object.keys(fuelCons).length) {
    adBody.consumptions = { fuel: fuelCons };
  }

  const cli = getKey(src.climatisation);
  if (cli) {
    if (SAFE_CLIMATISATION.has(cli)) adBody.climatisation = cli;
    else warnings.push(`climatisation="${cli}" nicht in Whitelist – nicht gesendet`);
  }

  // parkingAssistants als String-Array, NICHT [{key:...}]
  if (Array.isArray(src.parkingAssistants)) {
    const safe: string[] = [];
    for (const x of src.parkingAssistants as unknown[]) {
      const raw = getKey(x);
      if (!raw) continue;
      const mapped = PARKING_ASSISTANT_ALIAS[raw] ?? raw;
      if (SAFE_PARKING_ASSISTANTS.has(mapped)) safe.push(mapped);
      else if (UNSAFE_PARKING_ASSISTANTS.has(raw))
        warnings.push(`parkingAssistant "${raw}" unsicher – nicht gesendet`);
      else warnings.push(`parkingAssistant "${raw}" unbekannt – nicht gesendet`);
    }
    if (safe.length) adBody.parkingAssistants = [...new Set(safe)];
  }

  // Features: nur API-Namen senden, Aliase aus Draft akzeptieren
  const featSrc = (src.features && typeof src.features === "object")
    ? (src.features as AdPayload) : {};
  for (const { api, aliases } of FEATURE_MAP) {
    const present =
      featSrc[api] === true ||
      src[api] === true ||
      aliases.some((a) => featSrc[a] === true || src[a] === true);
    if (present) adBody[api] = true;
  }

  // Unsichere Enum-Felder entfernen
  for (const k of Array.from(Object.keys(adBody))) {
    if (UNSAFE_FIELDS.has(k)) {
      warnings.push(`Feld "${k}" entfernt (Enum unsicher)`);
      delete adBody[k];
    }
  }
  for (const k of UNSAFE_FIELDS) {
    const v = src[k];
    if (v !== undefined && v !== "" && v !== false && v !== null) {
      warnings.push(`Feld "${k}" im Draft ignoriert (Enum unsicher)`);
    }
  }

  // Interne/deutsche/falsche Feldnamen NIE an Mobile.de senden
  for (const k of Array.from(Object.keys(adBody))) {
    if (FORBIDDEN_INTERNAL_KEYS.has(k)) {
      removedInternal.push(k);
      delete adBody[k];
    }
  }

  // Neufahrzeug: countryVersion erforderlich (Default DE)
  if (adBody.condition === "NEW") {
    const cv = getKey(pick(src.countryVersion, vehicle.countryVersion)) || "DE";
    adBody.countryVersion = cv;
  }

  if (refs.length) adBody.images = refs.map((ref) => ({ ref }));

  // Pflichtfeldprüfung aus der gemeinsamen Liste (_shared/mobile-ad-required.ts),
  // damit Assistent und Server niemals auseinanderlaufen.
  const m = adBody;
  const missingFields: RequiredAdField[] = checkRequiredAdFields({
    make: m.make,
    model: m.model,
    modelDescription: m.modelDescription,
    category: m.category,
    mileage: m.mileage,
    firstRegistration: m.firstRegistration,
    fuel: m.fuel,
    gearbox: m.gearbox,
    power: m.power,
    cubicCapacity: m.cubicCapacity,
    condition: m.condition,
    damageUnrepaired: m.damageUnrepaired,
    accidentDamaged: m.accidentDamaged,
    roadworthy: m.roadworthy,
    "price.consumerPriceGross": cleanAmount,
    "price.vatRate": rawVat,
  });
  const missing: string[] = missingFields.map((f) => f.api!);

  if (removedInternal.length) {
    warnings.push(`Interne Feldnamen entfernt: ${removedInternal.join(", ")}`);
  }

  // Elektro-Felder nur bei elektrischem/hybridem Antrieb senden — sonst meldet
  // Mobile.de "vehicle-not-eligible-for-e-car-attributes".
  {
    const removedECar = stripECarFields(adBody, adBody.fuel);
    if (removedECar.length) {
      warnings.push(`Elektro-Felder nicht gesendet (kein E-/Hybridantrieb): ${removedECar.join(", ")}`);
    }
  }

  return { adBody, missing, missingFields, warnings };
}

Deno.serve((req) => withAccountLock(async () => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── Admin auth ────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json(401, { error: "Unauthorized" });

    const userId = claimsData.claims.sub as string;
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json(403, { error: "Forbidden" });

    // ── Input ─────────────────────────────────────────────────
    let vehicleId: string | undefined;
    let confirmPrice = false;
    try {
      const body = await req.json();
      vehicleId = body?.vehicleId;
      confirmPrice = body?.confirmPrice === true;
    } catch { /* empty body */ }
    if (!vehicleId) return json(400, { error: "vehicleId required" });

    // Konto (Standard oder Unfall) anhand des Fahrzeugs bestimmen
    applyAccount(await resolveMobileAccount(admin, vehicleId));
    console.log(`publish-mobile-ad: Konto "${ACCOUNT.account_key}" (${ACCOUNT.label})`);
    if (!MOBILE_USER || !MOBILE_PASS) {
      return json(500, {
        error: `Zugangsdaten für das Konto "${ACCOUNT.label}" fehlen`,
      });
    }

    const { data: vehicle, error: vehErr } = await admin
      .from("vehicles")
      .select("id, publish_status, mobile_ad_id, mobile_payload")
      .eq("id", vehicleId)
      .maybeSingle();
    if (vehErr || !vehicle) return json(404, { error: "Fahrzeug nicht gefunden" });
    if (vehicle.mobile_ad_id && vehicle.publish_status === "published") {
      return json(400, { error: "Fahrzeug ist bereits veröffentlicht" });
    }

    // Doppelklick-Schutz: läuft bereits eine Veröffentlichung oder existiert
    // schon ein aktives Inserat auf diesem Konto?
    if (vehicle.publish_status === "publishing") {
      return json(409, {
        error: "Für dieses Fahrzeug läuft bereits eine Veröffentlichung. Bitte einen Moment warten.",
      });
    }
    {
      const { data: liveListing } = await admin
        .from("listings")
        .select("id, status, external_ad_id")
        .eq("vehicle_id", vehicleId)
        .eq("platform", "mobile_de")
        .in("status", ["live", "publishing"])
        .maybeSingle();
      if (liveListing?.external_ad_id) {
        return json(409, {
          error: "Für dieses Fahrzeug besteht bereits ein Mobile.de-Inserat.",
          mobileAdId: liveListing.external_ad_id,
        });
      }
    }

    const payload = (vehicle.mobile_payload ?? {}) as Record<string, unknown>;
    const imagePaths = Array.isArray(payload._imagePaths) ? (payload._imagePaths as string[]) : [];

    // Feste, eindeutige Kennung je Fahrzeug: verhindert Doppel-Inserate bei
    // Wiederholungsversuchen (Mobile.de antwortet dann mit 303 auf die vorhandene Anzeige).
    let insertionRequestId = typeof payload._insertionRequestId === "string"
      ? payload._insertionRequestId
      : "";
    if (!insertionRequestId) {
      insertionRequestId = `veh-${vehicleId}`;
      await admin.from("vehicles").update({
        mobile_payload: { ...payload, _insertionRequestId: insertionRequestId } as never,
      } as never).eq("id", vehicleId);
      payload._insertionRequestId = insertionRequestId;
    }
    console.log(`X-Mobile-Insertion-Request-Id=${insertionRequestId}`);
    console.log(`Publishing vehicle ${vehicleId}, ${imagePaths.length} image(s)`);

    /**
     * Protokollzeile VOR dem Aufruf anlegen. Bricht die Function danach ab,
     * bleibt eine Zeile ohne Antwort stehen — das ist der Nachweis.
     */
    const beginPush = async (action: string, requestBody: unknown): Promise<string | null> => {
      try {
        const { data, error } = await admin.from("mobile_push_log").insert({
          vehicle_id: vehicleId,
          action,
          request_body: (requestBody ?? null) as never,
          response_status: null,
          response_body: "Aufruf abgesetzt – Antwort ausstehend",
        } as never).select("id").single();
        if (error) throw error;
        return (data as { id: string }).id;
      } catch (e) {
        console.warn("mobile_push_log (Vorabzeile) fehlgeschlagen:", (e as Error).message);
        return null;
      }
    };
    const finishPush = async (
      id: string | null,
      responseStatus: number | null,
      responseBody: string,
    ) => {
      if (!id) return;
      try {
        await admin.from("mobile_push_log").update({
          response_status: responseStatus,
          response_body: responseBody.slice(0, 5000),
        } as never).eq("id", id);
      } catch (e) {
        console.warn("mobile_push_log (Antwort) fehlgeschlagen:", (e as Error).message);
      }
    };

    const logPush = async (
      action: string,
      requestBody: unknown,
      responseStatus: number | null,
      responseBody: string,
    ) => {
      try {
        await admin.from("mobile_push_log").insert({
          vehicle_id: vehicleId,
          action,
          request_body: (requestBody ?? null) as never,
          response_status: responseStatus,
          response_body: responseBody.slice(0, 5000),
        });
      } catch (e) {
        console.warn("mobile_push_log insert failed:", (e as Error).message);
      }
    };
    const failVehicle = async (msg: string) => {
      await admin
        .from("vehicles")
        .update({
          publish_status: "publish_error",
          publish_error: msg.slice(0, 2000),
          last_pushed_at: new Date().toISOString(),
        } as never)
        .eq("id", vehicleId);
      await syncMobileListing(admin, vehicleId!, {
        status: "error",
        error_message: msg.slice(0, 2000),
        account_key: ACCOUNT.account_key,
      });
      const { data: failedVehicle } = await admin
        .from("vehicles").select("title").eq("id", vehicleId!).maybeSingle();
      await emitNotificationEvent(admin, "publish_failed", {
        vehicleId,
        title: (failedVehicle as { title?: string } | null)?.title ?? "Fahrzeug",
        platform: "Mobile.de",
        account: ACCOUNT.label ?? ACCOUNT.account_key,
        error: msg.slice(0, 500),
      });
    };

    await syncMobileListing(admin, vehicleId, {
      status: "publishing",
      error_message: null,
      account_key: ACCOUNT.account_key,
    });
    await admin
      .from("vehicles")
      .update({ publish_status: "publishing", publish_error: null } as never)
      .eq("id", vehicleId);

    // ── Build flat Mobile.de payload — tolerate flat or nested drafts ──
    const { adBody: mobilePayload, missing, missingFields, warnings } = buildMobileAdPayload(payload, []);
    console.log(`buildMobileAdPayload: keys=${Object.keys(mobilePayload).join(",")}`);
    if (warnings.length) console.warn(`buildMobileAdPayload warnings:`, warnings);

    if (missing.length) {
      const labels = missingFields.map((f) => f.label);
      const msg = missingFields.length === 1
        ? `${labels[0]}: Pflichtangabe für Mobile.de.`
        : `${missingFields.length} Angaben müssen korrigiert werden.`;
      const errorId = messageCode("publish:missing", labels.join(","));
      console.error(`[${errorId}] Pflichtangaben fehlen: ${missing.join(", ")}`);
      await failVehicle(`Pflichtangaben fehlen: ${labels.join(", ")}`);
      await logPush("publish", mobilePayload, null, `[${errorId}] missing: ${missing.join(", ")}`);
      return json(400, {
        error: msg,
        errorId,
        missing,
        issues: missingFields.map((f) => ({
          key: "missing-field",
          path: f.api,
          value: null,
          message: `${f.label}: Pflichtangabe für Mobile.de.`,
          code: errorId,
          field: { form: f.form, label: f.label, section: f.section },
        })),
        missingFields: missingFields.map((f) => ({
          api: f.api, form: f.form, label: f.label, section: f.section,
        })),
        warnings,
      });
    }


    // ── Preis-Plausibilität (unter 500 € / über 500.000 €) ────
    {
      const priceRaw = (mobilePayload.price as Record<string, unknown> | undefined)?.consumerPriceGross;
      const priceNum = Number(String(priceRaw ?? "").replace(/[^0-9]/g, ""));
      if (Number.isFinite(priceNum) && priceNum > 0 && (priceNum < 500 || priceNum > 500000) && !confirmPrice) {
        const msg = priceNum < 500
          ? `Der Preis von ${priceNum.toLocaleString("de-DE")} € wirkt sehr niedrig. Bitte prüfen und bestätigen.`
          : `Der Preis von ${priceNum.toLocaleString("de-DE")} € wirkt sehr hoch. Bitte prüfen und bestätigen.`;
        await admin
          .from("vehicles")
          .update({ publish_status: "draft", publish_error: null } as never)
          .eq("id", vehicleId);
        await syncMobileListing(admin, vehicleId, {
          status: "draft", error_message: null, account_key: ACCOUNT.account_key,
        });
        return json(422, { error: msg, needsPriceConfirmation: true, price: priceNum });
      }
    }


    // ── Schritt 1: Bilder — bereits vorab hochgeladene Referenzen nutzen ──
    // Der Assistent überträgt die Fotos schon beim Speichern (Schritt 1).
    // Fehlt eine Referenz, wird sie hier nachgeholt.
    const knownRefs = (payload._imageRefs ?? {}) as Record<string, string>;
    const upload = await uploadVehicleImages(admin, basicAuth(), imagePaths, knownRefs);
    if (upload.uploaded > 0) {
      await storeImageRefs(admin, vehicleId, upload.refs);
    }
    const refs: string[] = imagePaths.map((p) => upload.refs[p]).filter(Boolean);
    const skipped = upload.skipped.map((s) => ({
      index: imagePaths.indexOf(s.path) + 1,
      path: s.path,
      reason: s.reason,
    }));
    console.log(
      `Bilder: gesamt=${imagePaths.length} vorab=${upload.reused} neu=${upload.uploaded} übersprungen=${skipped.length}`,
    );


    if (imagePaths.length > 0 && refs.length === 0) {
      const msg = `Kein Bild konnte zu Mobile.de hochgeladen werden. ${skipped.map((s) => `#${s.index}: ${s.reason}`).join("; ")}`;
      console.error(msg);
      await failVehicle(msg);
      await logPush("publish", { imagePaths }, null, msg);
      return json(400, { error: "Kein Bild konnte zu Mobile.de hochgeladen werden", skipped });
    }


    // ── Step 2: create ad with image refs ─────────────────────
    const adBody: Record<string, unknown> = { ...mobilePayload };
    if (refs.length) {
      adBody.images = refs.map((ref) => ({ ref }));
    }

    console.log("Mobile.de POST adBody root-keys:", Object.keys(adBody).join(","));
    console.log("Mobile.de optional fields:", JSON.stringify({
      cylinder: adBody.cylinder,
      seats: adBody.seats,
      matteColor: adBody.matteColor,
      metallic: adBody.metallic,
      fuelTankVolume: adBody.fuelTankVolume,
      powerAssistedSteering: adBody.powerAssistedSteering,
      roofRails: adBody.roofRails,
      multifunctionalWheel: adBody.multifunctionalWheel,
      automaticRainSensor: adBody.automaticRainSensor,
      highBeamAssist: adBody.highBeamAssist,
      collisionAvoidance: adBody.collisionAvoidance,
      newHuAu: adBody.newHuAu,
      newService: adBody.newService,
      particulateFilterDiesel: adBody.particulateFilterDiesel,
      emissions: adBody.emissions,
      consumptions: adBody.consumptions,
      parkingAssistants: adBody.parkingAssistants,
      countryVersion: adBody.countryVersion,
    }));
    console.log("Mobile.de warnings:", JSON.stringify(warnings));
    console.log("Mobile.de required fields:", JSON.stringify({
      vehicleClass: adBody.vehicleClass,
      make: adBody.make,
      model: adBody.model,
      modelDescription: adBody.modelDescription,
      category: adBody.category,
      mileage: adBody.mileage,
      firstRegistration: adBody.firstRegistration,
      fuel: adBody.fuel,
      gearbox: adBody.gearbox,
      power: adBody.power,
      cubicCapacity: adBody.cubicCapacity,
      condition: adBody.condition,
      damageUnrepaired: adBody.damageUnrepaired,
      imageCount: refs.length,
    }));


    const createUrl = `${API_BASE}/sellers/${SELLER_ID}/ads`;
    const pushLogId = await beginPush("publish", adBody);
    const createRes = await fetch(createUrl, {
      method: "POST",
      // Kein automatisches Folgen: 303 verweist auf die bereits vorhandene Anzeige.
      redirect: "manual",
      headers: {
        Authorization: basicAuth(),
        "Content-Type": MOBILE_MIME,
        Accept: MOBILE_MIME,
        "X-Mobile-Insertion-Request-Id": insertionRequestId,
      },
      body: JSON.stringify(adBody),
    });
    const createText = await createRes.text();
    await finishPush(pushLogId, createRes.status, createText);
    const alreadyCreated = createRes.status === 303;
    if (alreadyCreated) {
      console.log(`Mobile.de meldet 303 – Anzeige existiert bereits (Location=${createRes.headers.get("Location") ?? "(none)"}).`);
    }
    const createOk = (createRes.status >= 200 && createRes.status < 300) || alreadyCreated;
    console.log(`Create ad -> status ${createRes.status} (ok=${createOk}) location=${createRes.headers.get("Location") ?? "(none)"}`);

    if (!createOk) {
      // Fehlerobjekt strukturiert auswerten — deutsche Texte aus den
      // Referenzdaten, Feldpfade auf die Eingabefelder des Assistenten.
      const texts = await loadMobileErrorTexts(MOBILE_USER, MOBILE_PASS);
      const issues: AdIssue[] = parseMobileErrors(createText, {
        texts,
        onUnknownKey: (key) =>
          console.error(`Unbekannter Mobile.de-Fehlerschlüssel ohne Übersetzung: "${key}"`),
      });
      const summary = summarizeIssues(issues);
      const errorId = messageCode(`publish:${createRes.status}`, summary);
      // Technischer Text nur ins Protokoll, nie auf den Bildschirm.
      console.error(`[${errorId}] Create ad failed ${createRes.status}: ${createText.slice(0, 800)}`);
      for (const i of issues) console.error(`[${i.code}] ${i.key} path=${i.path ?? "-"} value=${i.value ?? "-"}`);
      await failVehicle(issues.map((i) => i.message).join(" · ") || summary);
      await finishPush(pushLogId, createRes.status, `[${errorId}] ${createText}`);
      return json(400, {
        error: summary,
        errorId,
        issues: issues.map((i) => ({
          key: i.key, path: i.path, value: i.value, message: i.message,
          code: i.code, field: i.field,
        })),
      });
    }


    // Warnungen aus der Antwort sind KEIN Fehler — sie werden nur gemeldet.
    const mobileWarnings: string[] = [];
    try {
      const parsedOk = JSON.parse(createText) as { warnings?: unknown };
      const list = Array.isArray(parsedOk?.warnings) ? parsedOk.warnings : [];
      for (const w of list) {
        const entry = w as { key?: string; message?: string; args?: { key?: string; value?: string }[] };
        const path = entry.args?.find((a) => a?.key === "path")?.value;
        if (entry.key === "missing-field" && path) {
          mobileWarnings.push(`Optionale Angabe fehlt: ${path}`);
        } else {
          mobileWarnings.push(entry.message || entry.key || JSON.stringify(w));
        }
      }
    } catch { /* keine JSON-Antwort */ }
    if (mobileWarnings.length) console.log("Mobile.de Hinweise:", mobileWarnings.join(" | "));

    // ── Step 3: success ───────────────────────────────────────

    const { mobileAdId, source: idSource } = extractMobileAdId(createRes, createText);
    let detailPageUrl: string | undefined;
    try {
      const j = JSON.parse(createText);
      detailPageUrl = j?.detailPageUrl ?? j?.detail_page_url ?? j?.url;
    } catch { /* ignore */ }
    console.log(`Mobile.de ad created. mobileAdId=${mobileAdId ?? "(none)"} source=${idSource}`);

    // ── Verify: GET /sellers/{SELLER_ID}/ads/{mobileAdId} (best-effort) ──
    let adImageUrls: string[] = [];
    if (mobileAdId) {
      try {
        const verifyRes = await fetch(`${API_BASE}/sellers/${SELLER_ID}/ads/${mobileAdId}`, {
          headers: { Authorization: basicAuth(), Accept: MOBILE_MIME },
        });
        const verifyText = await verifyRes.text();
        if (verifyRes.ok) {
          try {
            const vj = JSON.parse(verifyText);
            const optionalEchoed = Object.keys(vj).filter(
              (k) => !["vehicleClass","make","model","modelDescription","category","mileage","firstRegistration","fuel","gearbox","power","cubicCapacity","condition","damageUnrepaired","price","images","creationDate","modificationDate","mobileAdId","detailPageUrl"].includes(k),
            );
            const imgCount = Array.isArray(vj.images) ? vj.images.length : 0;
            console.log(`Verify GET ${mobileAdId}: rootKeys=${Object.keys(vj).join(",")}`);
            console.log(`Verify optional fields returned: ${optionalEchoed.join(",")}`);
            console.log(`Verify image count: ${imgCount}`);
            adImageUrls = extractAdImageUrls(vj);
            console.log(`Verify image urls: ${adImageUrls.length}`);
          } catch {
            console.log(`Verify GET ${mobileAdId}: non-JSON response, status=${verifyRes.status}`);
          }
        } else {
          console.warn(`Verify GET failed (${verifyRes.status}): ${verifyText.slice(0, 200)}`);
        }
      } catch (e) {
        console.warn(`Verify GET error: ${(e as Error).message}`);
      }
    }
    if (adImageUrls.length === 0) {
      // Fallback: Referenzen aus dem Upload, sofern sie bereits URLs sind
      adImageUrls = refs.filter((r) => /^https?:\/\//.test(r));
    }



    const skippedNote = skipped.length
      ? `Hinweis: ${skipped.length} Bild(er) übersprungen: ${skipped.map((s) => `#${s.index} (${s.reason})`).join("; ")}`
      : null;

    const nowIso = new Date().toISOString();

    if (!mobileAdId) {
      const warnMsg = "Inserat wurde vermutlich erstellt, aber Mobile.de-ID konnte nicht aus der Antwort gelesen werden. Bitte im Adminbereich über die Bestandsübernahme zuordnen.";
      console.warn(`extractMobileAdId failed. location=${createRes.headers.get("Location") ?? "(none)"} bodyPreview=${createText.slice(0, 300)}`);
      await admin
        .from("vehicles")
        .update({
          publish_status: "published",
          published_at: nowIso,
          last_pushed_at: nowIso,
          publish_error: [warnMsg, skippedNote].filter(Boolean).join(" ").slice(0, 2000),
        } as never)
        .eq("id", vehicleId);
      await syncMobileListing(admin, vehicleId, {
        status: "live", error_message: warnMsg, account_key: ACCOUNT.account_key,
      });
      return json(200, {
        ok: true,
        success: true,
        warning: true,
        mobileAdId: null,
        message: warnMsg,
        mobileWarnings,
        detailPageUrl,
        uploadedImages: refs.length,
        skippedImages: skipped,
      });
    }

    await admin
      .from("vehicles")
      .update({
        publish_status: "published",
        mobile_ad_id: mobileAdId,
        published_at: nowIso,
        last_pushed_at: nowIso,
        publish_error: skippedNote,
        detail_page_url: detailPageUrl ?? null,
        is_sold: false,
        // Bildreferenzen des Inserats übernehmen, damit Portal und Inserat
        // dieselben Bilder zeigen.
        ...(adImageUrls.length ? { image_urls: adImageUrls } : {}),
      } as never)
      .eq("id", vehicleId);

    await syncMobileListing(admin, vehicleId, {
      status: "live",
      external_ad_id: mobileAdId,
      external_url: detailPageUrl ?? null,
      error_message: null,
      account_key: ACCOUNT.account_key,
    });
    console.log(`publish-mobile-ad: vehicle=${vehicleId} mobileAdId=${mobileAdId} published`);

    {
      const { data: publishedVehicle } = await admin
        .from("vehicles").select("title").eq("id", vehicleId).maybeSingle();
      await emitNotificationEvent(admin, "vehicle_published", {
        vehicleId,
        title: (publishedVehicle as { title?: string } | null)?.title ?? "Fahrzeug",
        platform: "Mobile.de",
        account: ACCOUNT.label ?? ACCOUNT.account_key,
        url: detailPageUrl ?? null,
      });
    }

    // Benachrichtigung wird jetzt direkt beim Veröffentlichen ausgelöst
    // (nicht mehr über den Pull-Sync).
    try {
      await admin.functions.invoke("notify-new-synced-vehicle", {
        body: { vehicleId, trigger: "portal-publish" },
      });
    } catch (e) {
      console.warn("notify-new-synced-vehicle failed:", (e as Error).message);
    }

    return json(200, {
      ok: true,
      success: true,
      mobileAdId,
      detailPageUrl,
      mobileWarnings,
      // 303 ist kein Fehler: Die Anzeige bestand bereits und wurde verknüpft.
      alreadyExisted: alreadyCreated,
      message: alreadyCreated
        ? "Das Inserat bestand bereits und wurde verknüpft."
        : "Fahrzeug wurde bei Mobile.de veröffentlicht.",
      uploadedImages: refs.length,
      skippedImages: skipped,
    });
  } catch (err) {
    const errorId = messageCode("publish:fatal", String((err as Error).message || err));
    console.error(`[${errorId}] publish-mobile-ad fatal:`, err);
    return json(500, {
      error: "Das Inserat konnte nicht an Mobile.de übertragen werden. Bitte erneut versuchen.",
      errorId,
    });
  }

}));
