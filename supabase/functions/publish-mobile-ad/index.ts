// Publishes a mobile_ad_drafts row as a real ad on Mobile.de Seller-API.
// Admin-only. Uploads images first (JPEG, <=2MB), then creates the ad with image refs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// imagescript: pure-TS image lib that runs in Deno without native deps
import { decode as decodeImage, Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HAS_SELLER_SPECIFIC =
  !!Deno.env.get("MOBILE_DE_SELLER_USERNAME") && !!Deno.env.get("MOBILE_DE_SELLER_PASSWORD");
const MOBILE_USER =
  Deno.env.get("MOBILE_DE_SELLER_USERNAME") || Deno.env.get("MOBILE_DE_USERNAME") || "";
const MOBILE_PASS =
  Deno.env.get("MOBILE_DE_SELLER_PASSWORD") || Deno.env.get("MOBILE_DE_PASSWORD") || "";

console.log(
  `Seller-API secrets: seller-specific=${HAS_SELLER_SPECIFIC ? "yes" : "no"}, fallback-used=${HAS_SELLER_SPECIFIC ? "no" : "yes"}`
);

const SELLER_ID = "451040";
const API_BASE = "https://services.mobile.de/seller-api";
const MOBILE_MIME = "application/vnd.de.mobile.api+json";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MiB cap per Mobile.de

function basicAuth(): string {
  return `Basic ${btoa(`${MOBILE_USER}:${MOBILE_PASS}`)}`;
}

function detectFormat(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  return "unknown";
}

async function ensureJpegUnder2MB(input: Uint8Array): Promise<Uint8Array> {
  // ALWAYS decode + re-encode as real JPEG, never trust file extension/content-type.
  const decoded = await decodeImage(input);
  if (!(decoded instanceof Image)) {
    throw new Error("Unsupported image format (multi-frame / not a static image)");
  }
  const qualities = [90, 80, 70, 60, 50, 40, 30];
  // First try original size at decreasing quality
  for (const q of qualities) {
    const buf = await decoded.encodeJPEG(q);
    if (buf.byteLength <= MAX_IMAGE_BYTES) return buf;
  }
  // Still too big: progressively shrink
  let scale = 0.8;
  while (scale >= 0.2) {
    const w = Math.max(640, Math.round(decoded.width * scale));
    const h = Math.max(480, Math.round(decoded.height * scale));
    const img = decoded.clone().resize(w, h);
    for (const q of qualities) {
      const buf = await img.encodeJPEG(q);
      if (buf.byteLength <= MAX_IMAGE_BYTES) return buf;
    }
    scale -= 0.15;
  }
  throw new Error("Bild konnte nicht unter 2 MB komprimiert werden");
}

async function uploadOneImage(jpeg: Uint8Array, filename: string): Promise<string> {
  // Mobile.de Seller-API: pre-upload image via POST /images with raw JPEG body.
  // Docs: https://services.mobile.de/seller-api/openapi-docs (operation "Upload Image")
  const url = `${API_BASE}/images`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      Accept: MOBILE_MIME,
      "Content-Type": "image/jpeg",
    },
    body: jpeg,
  });
  const text = await res.text();
  console.log(`Image upload ${filename}: status=${res.status}, body=${text.slice(0, 200)}`);
  if (!res.ok) {
    throw new Error(`Image upload failed (${res.status}): ${text.slice(0, 300)}`);
  }
  let ref: string | undefined;
  let hash: string | undefined;
  try {
    const j = JSON.parse(text);
    ref = j?.ref ?? j?.reference;
    hash = j?.hash;
  } catch {
    // fall through to Location header
  }
  if (!ref) {
    ref = res.headers.get("Location")?.split("/").pop() ?? undefined;
  }
  if (hash) console.log(`Image ${filename} hash=${hash}`);
  if (!ref) {
    throw new Error("Mobile.de Upload-Antwort ohne Bildreferenz");
  }
  console.log(`Uploaded image ${filename} -> ref=${ref}`);
  return String(ref);
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
type BuildResult = { adBody: AdPayload; missing: string[]; warnings: string[] };

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

  const missing: string[] = [];
  const m = adBody;
  if (!m.make) missing.push("make");
  if (!m.model) missing.push("model");
  if (!m.modelDescription) missing.push("modelDescription");
  if (!m.category) missing.push("category");
  if (m.mileage === undefined || m.mileage === null) missing.push("mileage");
  if (!m.firstRegistration || !/^\d{6}$/.test(String(m.firstRegistration)))
    missing.push("firstRegistration (YYYYMM)");
  if (!m.fuel) missing.push("fuel");
  if (!m.gearbox) missing.push("gearbox");
  if (m.power === undefined || m.power === null) missing.push("power");
  if (m.cubicCapacity === undefined || m.cubicCapacity === null) missing.push("cubicCapacity");
  if (!m.condition) missing.push("condition");
  if (typeof m.damageUnrepaired !== "boolean") missing.push("damageUnrepaired");
  if (!cleanAmount || cleanAmount === "0") missing.push("price.consumerPriceGross");
  if (!rawVat) missing.push("price.vatRate");

  if (removedInternal.length) {
    warnings.push(`Interne Feldnamen entfernt: ${removedInternal.join(", ")}`);
  }

  return { adBody, missing, warnings };
}

Deno.serve(async (req) => {
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

    if (!MOBILE_USER || !MOBILE_PASS) {
      return json(500, { error: "Mobile.de Seller-API Zugangsdaten fehlen" });
    }
    const userId = claimsData.claims.sub as string;
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json(403, { error: "Forbidden" });

    // ── Input ─────────────────────────────────────────────────
    let draftId: string | undefined;
    try {
      const body = await req.json();
      draftId = body?.draftId;
    } catch { /* empty body */ }
    if (!draftId) return json(400, { error: "draftId required" });

    const { data: draft, error: draftErr } = await admin
      .from("mobile_ad_drafts")
      .select("id, status, payload, image_paths")
      .eq("id", draftId)
      .maybeSingle();
    if (draftErr || !draft) return json(404, { error: "Draft not found" });
    if (draft.status === "published") return json(400, { error: "Entwurf ist bereits veröffentlicht" });

    const payload = (draft.payload ?? {}) as Record<string, unknown>;
    const imagePaths = (draft.image_paths ?? []) as string[];
    console.log(`Publishing draft ${draftId}, ${imagePaths.length} image(s)`);

    // ── Build flat Mobile.de payload — tolerate flat or nested drafts ──
    const { adBody: mobilePayload, missing, warnings } = buildMobileAdPayload(payload, []);
    console.log(`buildMobileAdPayload: keys=${Object.keys(mobilePayload).join(",")}`);
    if (warnings.length) console.warn(`buildMobileAdPayload warnings:`, warnings);

    if (missing.length) {
      const msg = `Pflichtfelder fehlen oder ungültig: ${missing.join(", ")}`;
      console.error(msg);
      await admin
        .from("mobile_ad_drafts")
        .update({ status: "error", error_message: msg })
        .eq("id", draftId);
      return json(400, { error: msg, missing, warnings });
    }



    // ── Step 1: upload images one by one (skip individual failures) ──
    const refs: string[] = [];
    const skipped: { index: number; path: string; reason: string }[] = [];
    for (let i = 0; i < imagePaths.length; i++) {
      const p = imagePaths[i];
      try {
        const { data: file, error: dlErr } = await admin.storage
          .from("mobile-ad-images")
          .download(p);
        if (dlErr || !file) throw new Error(`Storage download failed: ${dlErr?.message}`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const origFormat = detectFormat(bytes);
        const origSize = bytes.byteLength;
        const jpeg = await ensureJpegUnder2MB(bytes);
        console.log(
          `Image ${i + 1}/${imagePaths.length} ${p}: original=${origFormat} ${origSize}B -> jpeg ${jpeg.byteLength}B`,
        );
        const filename = (p.split("/").pop() ?? `image_${i}.jpg`).replace(/\.[^.]+$/, ".jpg");
        const ref = await uploadOneImage(jpeg, filename);
        refs.push(ref);
      } catch (e) {
        const msg = (e as Error).message || String(e);
        console.error(`Image ${i + 1} (${p}) skipped: ${msg}`);
        skipped.push({ index: i + 1, path: p, reason: msg });
      }
    }
    console.log(`Image upload summary: imagePaths=${imagePaths.length}, refs=${refs.length}, skipped=${skipped.length}`);
    if (skipped.length) {
      console.warn(`Skipped ${skipped.length}/${imagePaths.length} image(s):`, skipped);
    }

    if (imagePaths.length > 0 && refs.length === 0) {
      const msg = `Kein Bild konnte zu Mobile.de hochgeladen werden. ${skipped.map((s) => `#${s.index}: ${s.reason}`).join("; ")}`;
      console.error(msg);
      await admin
        .from("mobile_ad_drafts")
        .update({ status: "error", error_message: msg.slice(0, 2000) })
        .eq("id", draftId);
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
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: basicAuth(),
        "Content-Type": MOBILE_MIME,
        Accept: MOBILE_MIME,
      },
      body: JSON.stringify(adBody),
    });
    const createText = await createRes.text();
    console.log(`Create ad -> status ${createRes.status}`);

    if (!createRes.ok) {
      let parsed: unknown = createText;
      try { parsed = JSON.parse(createText); } catch { /* keep text */ }
      const human =
        typeof parsed === "object" && parsed && "errors" in (parsed as Record<string, unknown>)
          ? JSON.stringify((parsed as Record<string, unknown>).errors)
          : createText.slice(0, 500);
      console.error(`Create ad failed ${createRes.status}: ${createText.slice(0, 800)}`);
      await admin
        .from("mobile_ad_drafts")
        .update({ status: "error", error_message: human.slice(0, 2000) })
        .eq("id", draftId);
      return json(createRes.status, {
        error: "Mobile.de hat das Inserat abgelehnt",
        status: createRes.status,
        details: parsed,
      });
    }

    // ── Step 3: success ───────────────────────────────────────
    const { mobileAdId, source: idSource } = extractMobileAdId(createRes, createText);
    let detailPageUrl: string | undefined;
    try {
      const j = JSON.parse(createText);
      detailPageUrl = j?.detailPageUrl ?? j?.detail_page_url ?? j?.url;
    } catch { /* ignore */ }
    console.log(`Mobile.de ad created. mobileAdId=${mobileAdId ?? "(none)"} source=${idSource}`);

    // ── Verify: GET /sellers/{SELLER_ID}/ads/{mobileAdId} (best-effort) ──
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

    const skippedNote = skipped.length
      ? `Hinweis: ${skipped.length} Bild(er) übersprungen: ${skipped.map((s) => `#${s.index} (${s.reason})`).join("; ")}`
      : null;

    if (!mobileAdId) {
      const warnMsg = "Inserat wurde vermutlich erstellt, aber Mobile.de-ID konnte nicht aus der Antwort gelesen werden. Bitte im Adminbereich nachträglich mit synchronisiertem Fahrzeug verknüpfen.";
      console.warn(`extractMobileAdId failed. location=${createRes.headers.get("Location") ?? "(none)"} bodyPreview=${createText.slice(0, 300)}`);
      await admin
        .from("mobile_ad_drafts")
        .update({
          status: "published_with_warning",
          mobile_ad_id: null,
          error_message: [warnMsg, skippedNote].filter(Boolean).join(" "),
        })
        .eq("id", draftId);
      return json(200, {
        ok: true,
        warning: true,
        mobileAdId: null,
        message: warnMsg,
        detailPageUrl,
        uploadedImages: refs.length,
        skippedImages: skipped,
      });
    }

    await admin
      .from("mobile_ad_drafts")
      .update({
        status: "published",
        mobile_ad_id: mobileAdId,
        error_message: skippedNote,
        // E-Mail wird NICHT direkt verschickt. sync-vehicles triggert die
        // Benachrichtigung, sobald das Inserat über Mobile.de Search-API in
        // vehicles ankommt (damit Story/Exposé aus dem echten Vehicle-Datensatz
        // erzeugt werden können).
        publish_email_status: "waiting_for_sync",
        publish_email_sent_at: null,
        publish_email_error: null,
      })
      .eq("id", draftId);
    console.log(`publish-mobile-ad: draft=${draftId} mobileAdId=${mobileAdId} → publish_email_status=waiting_for_sync`);

    return json(200, {
      ok: true,
      mobileAdId,
      detailPageUrl,
      uploadedImages: refs.length,
      skippedImages: skipped,
    });
  } catch (err) {
    console.error("publish-mobile-ad fatal:", err);
    return json(500, { error: String((err as Error).message || err) });
  }
});
