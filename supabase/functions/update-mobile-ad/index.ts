// Update a live Mobile.de ad. Admin-only. Bilder werden NICHT verändert.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOBILE_USER =
  Deno.env.get("MOBILE_DE_SELLER_USERNAME") || Deno.env.get("MOBILE_DE_USERNAME") || "";
const MOBILE_PASS =
  Deno.env.get("MOBILE_DE_SELLER_PASSWORD") || Deno.env.get("MOBILE_DE_PASSWORD") || "";

const SELLER_ID = "451040";
const API_BASE = "https://services.mobile.de/seller-api";
const MOBILE_MIME = "application/vnd.de.mobile.api+json";

const basicAuth = () => `Basic ${btoa(`${MOBILE_USER}:${MOBILE_PASS}`)}`;

// ── Preis-Normalisierung (Seller-API) ────────────────────────────────────
const ALLOWED_PRICE_KEYS = new Set([
  "consumerPriceGross", "consumerPriceNet",
  "dealerPriceGross", "dealerPriceNet",
  "vatRate", "type", "currency",
]);

function extractPriceAmount(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v.toFixed(2) : undefined;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return extractPriceAmount(
      o.consumerPriceGross ?? o.amount ?? o.value ?? o.gross ?? o.consumerValue ?? o.net
    );
  }
  if (typeof v === "string") {
    let s = v.trim().replace(/[€$\s]/g, "");
    if (s.includes(",") && s.includes(".")) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (s.includes(",")) {
      const parts = s.split(",");
      if (parts.length === 2 && parts[1].length <= 2) s = parts[0] + "." + parts[1];
      else s = s.replace(/,/g, "");
    }
    s = s.replace(/[^0-9.]/g, "");
    if (!s) return undefined;
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n.toFixed(2);
  }
  return undefined;
}

function normalizeSellerApiPrice(
  currentPrice: Record<string, unknown> | undefined | null,
  formPayload: Record<string, unknown> | undefined | null
): Record<string, unknown> | null {
  const cur = (currentPrice ?? {}) as Record<string, unknown>;
  const fp = (formPayload ?? {}) as Record<string, unknown>;
  const fpPrice = (fp.price && typeof fp.price === "object" ? fp.price : {}) as Record<string, unknown>;

  const amount =
    extractPriceAmount(fpPrice.consumerPriceGross) ??
    extractPriceAmount(fpPrice["consumer-price-gross"]) ??
    extractPriceAmount(fp.consumerPriceGross) ??
    extractPriceAmount(typeof fp.price === "number" || typeof fp.price === "string" ? fp.price : undefined) ??
    extractPriceAmount(cur.consumerPriceGross) ??
    extractPriceAmount(cur.consumerValue);

  if (!amount) return null;

  const rawVat = fpPrice.vatRate ?? fpPrice["vat-rate"] ?? fp.vatRate ?? cur.vatRate ?? "19.00";
  const vatStr = typeof rawVat === "number" ? rawVat.toFixed(2) : String(rawVat || "19.00");

  return {
    consumerPriceGross: amount,
    currency: "EUR",
    vatRate: vatStr,
    type: "FIXED",
  };
}

function stripInvalidPriceFields(price: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(price)) if (ALLOWED_PRICE_KEYS.has(k)) out[k] = v;
  return out;
}

// ── Mapping (kopiert aus publish-mobile-ad, sicher gehalten) ─────────────
type AdPayload = Record<string, unknown>;
type BuildResult = { adBody: AdPayload; missing: string[]; warnings: string[] };

const SAFE_CLIMATISATION = new Set([
  "MANUAL_CLIMATISATION", "AUTOMATIC_CLIMATISATION",
  "2_ZONE_AUTOMATIC_AIR_CONDITIONING", "3_ZONE_AUTOMATIC_AIR_CONDITIONING",
  "4_ZONE_AUTOMATIC_AIR_CONDITIONING",
]);
const SAFE_PARKING_ASSISTANTS = new Set(["FRONT_SENSORS", "REAR_SENSORS"]);
const PARKING_ASSISTANT_ALIAS: Record<string, string> = { FRONT: "FRONT_SENSORS", REAR: "REAR_SENSORS" };

const FEATURE_KEYS = [
  "alloyWheels", "navigationSystem", "electricHeatedSeats", "bluetooth",
  "carplay", "androidAuto", "electricWindows", "centralLocking", "isofix",
  "sunroof", "panoramicGlassRoof", "usb", "touchscreen", "soundSystem",
  "summerTires", "winterTires", "allSeasonTires",
  "tintedWindows", "ambientLighting", "electricExteriorMirrors",
  "electricAdjustableSeats", "powerSteering", "hillStartAssist",
  "onBoardComputer", "handsFreePhoneSystem", "roofRack", "winterPackage",
  "multifunctionalSteeringWheel", "abs", "esp", "immobilizer",
  "fatigueWarningSystem", "emergencyBrakeAssistant", "rainSensor",
  "tirePressureMonitoring", "laneDepartureWarning", "startStopSystem",
  "trafficSignRecognition",
];
const UNSAFE_FIELDS = new Set([
  "speedControl", "headlightType", "trailerCouplingType", "airbag",
  "breakdownService", "corneringLight", "daytimeRunningLamps",
  "highBeamAssistant", "emergencyCallSystem",
]);

function buildMobileAdPayload(payload: AdPayload): BuildResult {
  const warnings: string[] = [];
  const vehicle = (payload.vehicle ?? {}) as AdPayload;
  const getKey = (v: unknown): string | undefined => {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object" && typeof (v as { key?: unknown }).key === "string") return (v as { key: string }).key;
    return undefined;
  };
  const pick = (...c: unknown[]): unknown => {
    for (const x of c) if (x !== undefined && x !== null && x !== "") return x;
    return undefined;
  };
  const num = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    return undefined;
  };

  const priceObj = (payload.price ?? {}) as AdPayload;
  const rawAmount = pick(priceObj.consumerPriceGross, priceObj["consumer-price-gross"], payload.consumerPriceGross);
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
    damageUnrepaired: pick(payload.damageUnrepaired, vehicle["damage-unrepaired"], vehicle.damageUnrepaired) === true,
    price: { consumerPriceGross: cleanAmount, currency: "EUR", vatRate: String(rawVat), type: "FIXED" },
  };

  const desc = pick(payload.description, vehicle.description);
  if (typeof desc === "string" && desc.trim()) adBody.description = desc.trim();

  const src: AdPayload = { ...vehicle, ...payload };
  const addStr = (k: string) => { const v = src[k]; if (typeof v === "string" && v.trim()) adBody[k] = v.trim(); };
  const addNum = (k: string) => { const v = num(src[k]); if (v !== undefined) adBody[k] = v; };
  const addBoolTrue = (k: string) => { if (src[k] === true) adBody[k] = true; };
  const addBoolEither = (k: string) => { if (src[k] === true || src[k] === false) adBody[k] = src[k]; };
  const addKey = (k: string) => { const x = getKey(src[k]); if (x) adBody[k] = x; };

  addStr("trimLine"); addStr("modelRange");
  addKey("doors");
  addStr("vin"); addStr("internalNumber");
  addNum("fuelCapacity"); addKey("driveType");
  addKey("exteriorColor"); addKey("interiorColor"); addKey("interiorType");
  addStr("manufacturerColorName"); addBoolTrue("metallic");

  // Cylinder: Root-Feld "cylinder" (Integer)
  const cylinder = num(pick(src.cylinder, src.cylinders, src.zylinder));
  if (cylinder !== undefined) adBody.cylinder = cylinder;

  // Seats: Root-Feld "seats" (Integer)
  const seats = num(pick(src.seats, src.numberOfSeats, src["number-of-seats"]));
  if (seats !== undefined) adBody.seats = seats;

  // Matt-Lackierung: Root-Feld "matteColor" (Boolean)
  const matteColor = pick(src.matteColor, src.matt, src.matte);
  if (matteColor === true) adBody.matteColor = true;
  addBoolEither("accidentDamaged"); addBoolEither("roadworthy");
  addBoolTrue("warranty"); addBoolTrue("nonSmokerVehicle"); addBoolTrue("fullServiceHistory");
  addBoolTrue("huNew"); addBoolTrue("inspectionNew");
  addNum("numberOfPreviousOwners"); addStr("generalInspection");
  addKey("emissionClass"); addKey("emissionSticker");

  const cli = getKey(src.climatisation);
  if (cli) { if (SAFE_CLIMATISATION.has(cli)) adBody.climatisation = cli; else warnings.push(`climatisation="${cli}" verworfen`); }

  if (Array.isArray(src.parkingAssistants)) {
    const safe: string[] = [];
    for (const x of src.parkingAssistants as unknown[]) {
      const raw = getKey(x); if (!raw) continue;
      const mapped = PARKING_ASSISTANT_ALIAS[raw] ?? raw;
      if (SAFE_PARKING_ASSISTANTS.has(mapped)) safe.push(mapped);
      else warnings.push(`parkingAssistant "${raw}" verworfen`);
    }
    if (safe.length) adBody.parkingAssistants = [...new Set(safe)].map((k) => ({ key: k }));
  }

  const featSrc = (src.features && typeof src.features === "object") ? (src.features as AdPayload) : {};
  for (const f of FEATURE_KEYS) if (featSrc[f] === true || src[f] === true) adBody[f] = true;

  for (const k of Array.from(Object.keys(adBody))) if (UNSAFE_FIELDS.has(k)) { warnings.push(`Feld "${k}" verworfen`); delete adBody[k]; }

  const missing: string[] = [];
  const m = adBody;
  if (!m.make) missing.push("make");
  if (!m.model) missing.push("model");
  if (!m.modelDescription) missing.push("modelDescription");
  if (!m.category) missing.push("category");
  if (m.mileage === undefined || m.mileage === null) missing.push("mileage");
  if (!m.firstRegistration || !/^\d{6}$/.test(String(m.firstRegistration))) missing.push("firstRegistration (YYYYMM)");
  if (!m.fuel) missing.push("fuel");
  if (!m.gearbox) missing.push("gearbox");
  if (m.power === undefined || m.power === null) missing.push("power");
  if (m.cubicCapacity === undefined || m.cubicCapacity === null) missing.push("cubicCapacity");
  if (!m.condition) missing.push("condition");
  if (typeof m.damageUnrepaired !== "boolean") missing.push("damageUnrepaired");
  if (!cleanAmount || cleanAmount === "0") missing.push("price.consumerPriceGross");
  if (!rawVat) missing.push("price.vatRate");

  return { adBody, missing, warnings };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json(401, { error: "Unauthorized" });
    const userId = claimsData.claims.sub as string;
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { error: "Forbidden" });

    let draftId: string | undefined;
    let mobileAdIdIn: string | undefined;
    let formPayload: AdPayload | undefined;
    try {
      const body = await req.json();
      draftId = body?.draftId;
      mobileAdIdIn = body?.mobileAdId;
      formPayload = body?.formPayload;
    } catch { /* empty */ }
    if (!draftId) return json(400, { error: "draftId required" });
    if (!formPayload || typeof formPayload !== "object") return json(400, { error: "formPayload required" });

    const { data: draft, error: dErr } = await admin
      .from("mobile_ad_drafts").select("id, status, payload, mobile_ad_id")
      .eq("id", draftId).maybeSingle();
    if (dErr || !draft) return json(404, { error: "Entwurf nicht gefunden" });
    const mobileAdId = mobileAdIdIn || draft.mobile_ad_id;
    if (!mobileAdId) return json(400, { error: "Keine Mobile.de-ID vorhanden" });

    console.log(`update-mobile-ad draftId=${draftId} mobileAdId=${mobileAdId}`);

    // 1) Aktuellen Live-Stand holen
    const getRes = await fetch(`${API_BASE}/sellers/${SELLER_ID}/ads/${mobileAdId}`, {
      headers: { Authorization: basicAuth(), Accept: MOBILE_MIME },
    });
    const getText = await getRes.text();
    console.log(`Mobile.de pre-GET status=${getRes.status}`);
    if (!getRes.ok) {
      console.warn(`pre-GET body=${getText.slice(0, 300)}`);
      const msg = `Aktuellen Live-Stand konnte nicht geladen werden (${getRes.status})`;
      await admin.from("mobile_ad_drafts").update({ error_message: msg.slice(0, 2000) }).eq("id", draftId);
      return json(getRes.status, { error: msg, details: getText.slice(0, 500) });
    }
    let currentMobileAd: AdPayload = {};
    try { currentMobileAd = JSON.parse(getText) as AdPayload; } catch { /* keep empty */ }

    // 2) Gemappten Update-Payload aus formPayload bauen
    const { adBody: mapped, missing, warnings } = buildMobileAdPayload(formPayload);
    console.log(`mapped keys=${Object.keys(mapped).join(",")}`);
    if (warnings.length) console.warn("warnings:", warnings);
    if (missing.length) {
      const msg = `Pflichtfelder fehlen oder ungültig: ${missing.join(", ")}`;
      await admin.from("mobile_ad_drafts").update({ error_message: msg.slice(0, 2000) }).eq("id", draftId);
      return json(400, { error: msg, missing, warnings });
    }

    // 3) Finaler PUT-Body: currentMobileAd als Basis, mapped drüber, Bilder erhalten
    const finalBody: AdPayload = { ...currentMobileAd, ...mapped };
    // Bilder NICHT anfassen: aus currentMobileAd übernehmen, mapped enthält keine images
    if (Array.isArray(currentMobileAd.images)) finalBody.images = currentMobileAd.images;
    else delete finalBody.images;
    // Niemals interne vehicle-Struktur senden
    delete (finalBody as Record<string, unknown>).vehicle;
    // undefined-Werte entfernen
    for (const k of Object.keys(finalBody)) if (finalBody[k] === undefined) delete finalBody[k];

    // Geänderte Felder ermitteln (Top-Level)
    const changedKeys: string[] = [];
    for (const k of Object.keys(mapped)) {
      if (JSON.stringify((currentMobileAd as AdPayload)[k]) !== JSON.stringify(mapped[k])) changedKeys.push(k);
    }
    console.log(`finalBody root-keys=${Object.keys(finalBody).join(",")}`);
    console.log("Mobile.de PUT field debug:", JSON.stringify({
      cylinder: finalBody.cylinder,
      seats: finalBody.seats,
      matteColor: finalBody.matteColor,
      metallic: finalBody.metallic,
    }));
    console.log(`changed keys=${changedKeys.join(",")}`);

    // 4) PUT
    const putRes = await fetch(`${API_BASE}/sellers/${SELLER_ID}/ads/${mobileAdId}`, {
      method: "PUT",
      headers: {
        Authorization: basicAuth(),
        Accept: MOBILE_MIME,
        "Content-Type": MOBILE_MIME,
      },
      body: JSON.stringify(finalBody),
    });
    const putText = await putRes.text();
    console.log(`Mobile.de PUT status=${putRes.status}`);
    if (!(putRes.status === 200 || putRes.status === 204)) {
      console.error(`PUT failed body=${putText.slice(0, 800)}`);
      let parsed: unknown = putText;
      try { parsed = JSON.parse(putText); } catch { /* keep text */ }
      const human = typeof parsed === "object" && parsed && "errors" in (parsed as Record<string, unknown>)
        ? JSON.stringify((parsed as Record<string, unknown>).errors) : putText.slice(0, 500);
      await admin.from("mobile_ad_drafts")
        .update({ error_message: human.slice(0, 2000) })
        .eq("id", draftId);
      return json(putRes.status, { error: "Mobile.de hat das Update abgelehnt", status: putRes.status, details: parsed });
    }

    // 5) Verify GET
    let verifiedAd: AdPayload | null = null;
    try {
      const vRes = await fetch(`${API_BASE}/sellers/${SELLER_ID}/ads/${mobileAdId}`, {
        headers: { Authorization: basicAuth(), Accept: MOBILE_MIME },
      });
      const vText = await vRes.text();
      console.log(`Mobile.de verify-GET status=${vRes.status}`);
      if (vRes.ok) { try { verifiedAd = JSON.parse(vText) as AdPayload; } catch { /* ignore */ } }
    } catch (e) {
      console.warn("verify error:", (e as Error).message);
    }

    await admin.from("mobile_ad_drafts").update({
      status: "published",
      payload: verifiedAd ?? finalBody,
      error_message: null,
    }).eq("id", draftId);

    return json(200, {
      success: true,
      message: "Inserat wurde live bei Mobile.de aktualisiert.",
      mobileAdId,
      verifiedAd,
      changedKeys,
      warnings,
    });
  } catch (err) {
    console.error("update-mobile-ad fatal:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
