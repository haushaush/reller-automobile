// Sendet die Benachrichtigungs-Mail NACH erfolgreichem Mobile.de Search-Sync
// (Trigger aus sync-vehicles), nicht direkt nach dem Publish.
// Verwendet primär den verifizierten vehicles-Datensatz und übersetzt
// Mobile.de-API-Keys (z. B. PETROL, MANUAL_GEAR) in deutsche Anzeigenamen.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL_BASE = "https://fahrzeuge.reller-automobile.de";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ───────────────────────── German label mappings ─────────────────────────
const MAKE_LABELS: Record<string, string> = {
  VW: "Volkswagen",
  VOLKSWAGEN: "Volkswagen",
  "MERCEDES-BENZ": "Mercedes-Benz",
  MERCEDES: "Mercedes-Benz",
  BMW: "BMW",
  AUDI: "Audi",
  KIA: "Kia",
  FIAT: "Fiat",
  CITROEN: "Citroën",
  "CITROËN": "Citroën",
};
const FUEL_LABELS: Record<string, string> = {
  PETROL: "Benzin",
  DIESEL: "Diesel",
  HYBRID: "Hybrid",
  ELECTRICITY: "Elektro",
  ELECTRIC: "Elektro",
  PLUGIN_HYBRID: "Plug-in-Hybrid",
  HYBRID_PLUGIN: "Plug-in-Hybrid",
  LPG: "Autogas LPG",
  CNG: "Erdgas CNG",
};
const GEARBOX_LABELS: Record<string, string> = {
  MANUAL_GEAR: "Schaltgetriebe",
  AUTOMATIC_GEAR: "Automatik",
  SEMIAUTOMATIC_GEAR: "Halbautomatik",
};
const COLOR_LABELS: Record<string, string> = {
  BLACK: "Schwarz",
  GREY: "Grau",
  GRAY: "Grau",
  WHITE: "Weiß",
  SILVER: "Silber",
  BLUE: "Blau",
  RED: "Rot",
  GREEN: "Grün",
  YELLOW: "Gelb",
  BROWN: "Braun",
  BEIGE: "Beige",
  ORANGE: "Orange",
  GOLD: "Gold",
};
const CATEGORY_LABELS: Record<string, string> = {
  SmallCar: "Kleinwagen",
  Limousine: "Limousine",
  EstateCar: "Kombi",
  OffRoad: "SUV/Geländewagen",
  Van: "Van/Kleinbus",
  SportsCar: "Sportwagen/Coupé",
  Cabrio: "Cabrio",
};
const DOORS_LABELS: Record<string, string> = {
  TWO_OR_THREE: "2/3",
  FOUR_OR_FIVE: "4/5",
  SIX_OR_SEVEN: "6/7",
};
const CONDITION_LABELS: Record<string, string> = {
  USED: "Gebrauchtfahrzeug",
  NEW: "Neufahrzeug",
};

function mapLabel(map: Record<string, string>, raw: unknown, missing: string[], field: string): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const key = String(raw).trim();
  if (!key) return undefined;
  const hit = map[key] ?? map[key.toUpperCase()];
  if (hit) return hit;
  missing.push(`${field}=${key}`);
  return key; // fallback: original
}

// ───────────────────────── Settings ─────────────────────────
type Settings = {
  enabled: boolean;
  recipients: string[];
  includeStory: boolean;
  includeExpose: boolean;
  includeVehicleLink: boolean;
};

async function readSetting<T>(admin: ReturnType<typeof createClient>, key: string): Promise<T | null> {
  try {
    const { data } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
    return (data?.value ?? null) as T | null;
  } catch {
    return null;
  }
}

async function loadSettings(admin: ReturnType<typeof createClient>): Promise<Settings> {
  const enabledV = await readSetting<boolean>(admin, "mobile_ad_publish_email_enabled");
  const includeStoryV = await readSetting<boolean>(admin, "mobile_ad_publish_email_include_story");
  const includeExposeV = await readSetting<boolean>(admin, "mobile_ad_publish_email_include_expose");
  const includeVehicleLinkV = await readSetting<boolean>(admin, "mobile_ad_publish_email_include_vehicle_link");
  let recipients = (await readSetting<unknown>(admin, "mobile_ad_publish_email_recipients")) as unknown;
  if (!Array.isArray(recipients) || recipients.length === 0) {
    recipients = await readSetting<unknown>(admin, "story_email_recipients");
  }
  const recList = Array.isArray(recipients)
    ? (recipients as unknown[]).filter((v): v is string => typeof v === "string").map((s) => s.trim()).filter(Boolean)
    : [];
  return {
    enabled: enabledV !== false,
    recipients: recList,
    includeStory: includeStoryV !== false,
    includeExpose: includeExposeV !== false,
    includeVehicleLink: includeVehicleLinkV !== false,
  };
}

// ───────────────────────── Helpers ─────────────────────────
function readPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else return undefined;
  }
  return cur;
}
function readFirst(obj: unknown, paths: string[][]): unknown {
  for (const p of paths) {
    const v = readPath(obj, p);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
function strOrKey(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.key === "string" && o.key.trim()) return o.key.trim();
    if (typeof o.label === "string" && o.label.trim()) return o.label.trim();
  }
  return undefined;
}
function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}
function fmtPrice(n: number): string | undefined {
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return `${Math.round(n).toLocaleString("de-DE")} €`;
}
function fmtMileage(n: number): string | undefined {
  if (!Number.isFinite(n) || n < 0) return undefined;
  return `${Math.round(n).toLocaleString("de-DE")} km`;
}
function fmtFirstReg(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{4})(\d{2})?$/) ?? s.match(/^(\d{4})-(\d{2})/);
  if (m) {
    const y = m[1]; const mo = m[2];
    return mo ? `${mo}/${y}` : y;
  }
  return s;
}

type VehicleRow = Record<string, unknown> | null;

/**
 * Übersetzt Vehicle + Draft-Payload in deutsche Anzeigenamen.
 * Priorität: vehicles-Spalte → draft.payload (verschachtelt oder flach).
 */
function formatVehicleForEmail(vehicle: VehicleRow, draftPayload: unknown) {
  const missing: string[] = [];
  const v = (vehicle ?? {}) as Record<string, unknown>;
  const p = draftPayload;

  const pickRaw = (vehKey: string, draftPaths: string[][]): unknown => {
    const fromVeh = v[vehKey];
    if (fromVeh !== undefined && fromVeh !== null && fromVeh !== "") return fromVeh;
    return readFirst(p, draftPaths);
  };

  const makeRaw = strOrKey(pickRaw("brand", [["vehicle", "make"], ["make"]]));
  const modelRaw = strOrKey(pickRaw("model", [["vehicle", "model"], ["model"]]));
  const descRaw = strOrKey(pickRaw("model_description", [["vehicle", "modelDescription"], ["modelDescription"], ["vehicle", "model-description"]]));
  const fuelRaw = strOrKey(pickRaw("fuel", [["vehicle", "fuel"], ["fuel"]]));
  const gearboxRaw = strOrKey(pickRaw("gearbox", [["vehicle", "gearbox"], ["gearbox"]]));
  const colorRaw = strOrKey(pickRaw("exterior_color", [["vehicle", "exteriorColor"], ["exteriorColor"]]));
  const categoryRaw = strOrKey(pickRaw("category", [["vehicle", "category"], ["category"]]));
  const conditionRaw = strOrKey(pickRaw("condition", [["vehicle", "condition"], ["condition"]]));
  const doorsRaw = strOrKey(readFirst(p, [["vehicle", "doors"], ["doors"]]));
  const manufacturerColor = strOrKey(readFirst(p, [["vehicle", "manufacturerColorName"], ["manufacturerColorName"]]));

  const price = toNum(pickRaw("price", [["price", "consumerPriceGross"], ["price", "consumer-price-gross"], ["consumerPriceGross"]]));
  const mileage = toNum(pickRaw("mileage", [["vehicle", "mileage"], ["mileage"]]));
  const power = toNum(pickRaw("power", [["vehicle", "power"], ["power"]]));
  const cubic = toNum(pickRaw("cubic_capacity", [["vehicle", "cubicCapacity"], ["cubicCapacity"]]));
  const firstReg = pickRaw("year", [["vehicle", "firstRegistration"], ["firstRegistration"], ["vehicle", "first-registration"]]);
  const vin = strOrKey(pickRaw("vin", [["vehicle", "vin"], ["vin"]]));

  const makeLabel = mapLabel(MAKE_LABELS, makeRaw, missing, "make");
  const fuelLabel = mapLabel(FUEL_LABELS, fuelRaw, missing, "fuel");
  const gearboxLabel = mapLabel(GEARBOX_LABELS, gearboxRaw, missing, "gearbox");
  const colorLabel = mapLabel(COLOR_LABELS, colorRaw, missing, "exteriorColor");
  const categoryLabel = mapLabel(CATEGORY_LABELS, categoryRaw, missing, "category");
  const conditionLabel = mapLabel(CONDITION_LABELS, conditionRaw, missing, "condition");
  const doorsLabel = mapLabel(DOORS_LABELS, doorsRaw, missing, "doors");

  const colorDisplay = colorLabel
    ? (manufacturerColor ? `${colorLabel} – ${manufacturerColor}` : colorLabel)
    : undefined;

  const powerDisplay = Number.isFinite(power) && power > 0
    ? `${Math.round(power)} kW (${Math.round(power * 1.35962)} PS)`
    : undefined;

  const specs: Array<{ label: string; value?: string }> = [
    { label: "Marke", value: makeLabel },
    { label: "Modell", value: modelRaw },
    descRaw ? { label: "Modellbeschreibung", value: descRaw } : { label: "", value: undefined },
    { label: "Preis", value: fmtPrice(price) },
    { label: "Kilometerstand", value: fmtMileage(mileage) },
    { label: "Erstzulassung", value: fmtFirstReg(firstReg) },
    { label: "Kraftstoff", value: fuelLabel },
    { label: "Getriebe", value: gearboxLabel },
    { label: "Leistung", value: powerDisplay },
    Number.isFinite(cubic) && cubic > 0 ? { label: "Hubraum", value: `${Math.round(cubic).toLocaleString("de-DE")} cm³` } : { label: "", value: undefined },
    { label: "Farbe", value: colorDisplay },
    categoryLabel ? { label: "Fahrzeugklasse", value: categoryLabel } : { label: "", value: undefined },
    doorsLabel ? { label: "Türen", value: doorsLabel } : { label: "", value: undefined },
    conditionLabel ? { label: "Zustand", value: conditionLabel } : { label: "", value: undefined },
    vin ? { label: "FIN", value: vin } : { label: "", value: undefined },
  ].filter((s) => s.label && s.value);

  return {
    title: [makeLabel, modelRaw].filter(Boolean).join(" ") || "Fahrzeug",
    brand: makeLabel,
    model: modelRaw,
    modelDescription: descRaw,
    specs,
    missing,
  };
}

async function findLinkedVehicle(
  admin: ReturnType<typeof createClient>,
  draft: { id: string; mobile_ad_id: string | null; payload: unknown; vehicle_id?: string | null },
): Promise<VehicleRow> {
  if (draft.vehicle_id) {
    const { data } = await admin.from("vehicles").select("*").eq("id", draft.vehicle_id).maybeSingle();
    if (data) return data as VehicleRow;
  }
  const linked = readPath(draft.payload, ["_linkedVehicleId"]);
  if (typeof linked === "string" && linked) {
    const { data } = await admin.from("vehicles").select("*").eq("id", linked).maybeSingle();
    if (data) return data as VehicleRow;
  }
  if (draft.mobile_ad_id) {
    const { data } = await admin.from("vehicles").select("*").eq("mobile_de_id", draft.mobile_ad_id).maybeSingle();
    if (data) return data as VehicleRow;
  }
  const vin = strOrKey(readFirst(draft.payload, [["vehicle", "vin"], ["vin"]]));
  if (vin) {
    const { data } = await admin.from("vehicles").select("*").ilike("vin", vin).maybeSingle();
    if (data) return data as VehicleRow;
  }
  return null;
}

async function getOrCreateStory(
  admin: ReturnType<typeof createClient>,
  vehicleId: string,
): Promise<{ url?: string; error?: string }> {
  try {
    const { data: existing } = await admin
      .from("vehicle_stories")
      .select("id, story_image_url")
      .eq("vehicle_id", vehicleId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.story_image_url) return { url: existing.story_image_url as string };
  } catch (e) {
    console.warn("getOrCreateStory lookup failed:", (e as Error).message);
  }
  try {
    const { data, error } = await admin.functions.invoke("generate-story", {
      body: { vehicleIds: [vehicleId], skipDealerEmail: true },
    });
    if (error) return { error: "WhatsApp-Story konnte nicht automatisch erzeugt werden." };
    const generated = (data as { generated?: Array<{ vehicleId: string; storyImageUrl?: string }> } | null)?.generated;
    const first = generated?.find((g) => g.vehicleId === vehicleId)?.storyImageUrl;
    if (first) return { url: first };
    const { data: row } = await admin
      .from("vehicle_stories").select("story_image_url").eq("vehicle_id", vehicleId)
      .order("generated_at", { ascending: false }).limit(1).maybeSingle();
    if (row?.story_image_url) return { url: row.story_image_url as string };
    return { error: "WhatsApp-Story konnte nicht automatisch erzeugt werden." };
  } catch {
    return { error: "WhatsApp-Story konnte nicht automatisch erzeugt werden." };
  }
}

async function ensureExposeSignedUrl(
  admin: ReturnType<typeof createClient>,
  vehicleId: string,
): Promise<{ url?: string; error?: string }> {
  try {
    const { data, error } = await admin.functions.invoke("ensure-vehicle-expose", {
      body: { vehicleId },
    });
    if (error) {
      console.warn(`ensureExposeSignedUrl: invoke error for ${vehicleId}: ${error.message ?? error}`);
      return { error: "Exposé konnte nicht automatisch erzeugt werden." };
    }
    const url = (data as { signedUrl?: string } | null)?.signedUrl;
    const generated = (data as { generated?: boolean } | null)?.generated;
    console.log(`ensureExposeSignedUrl: vehicleId=${vehicleId} generated=${generated ? "yes" : "no"} url=${url ? "ok" : "missing"}`);
    if (!url) return { error: "Exposé konnte nicht automatisch erzeugt werden." };
    return { url };
  } catch (e) {
    console.warn(`ensureExposeSignedUrl exception for ${vehicleId}: ${(e as Error).message}`);
    return { error: "Exposé konnte nicht automatisch erzeugt werden." };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const isService = token === SUPABASE_SERVICE_ROLE_KEY;
    if (!isService) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) return json(401, { error: "Unauthorized" });
      const userId = claimsData.claims.sub as string;
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleRow) return json(403, { error: "Forbidden" });
    }

    const body = await req.json().catch(() => ({}));
    const draftId = String((body as { draftId?: string }).draftId ?? "").trim();
    const force = Boolean((body as { force?: boolean }).force);
    const trigger = String((body as { trigger?: string }).trigger ?? "manual");
    if (!draftId) return json(400, { error: "draftId required" });

    const { data: draft, error: draftErr } = await admin
      .from("mobile_ad_drafts")
      .select("id, status, payload, mobile_ad_id, vehicle_id, publish_email_sent_at, publish_email_status")
      .eq("id", draftId)
      .maybeSingle();
    if (draftErr || !draft) return json(404, { error: "Draft not found" });

    console.log(`notify: draft=${draftId} mobileAdId=${draft.mobile_ad_id ?? "-"} trigger=${trigger} force=${force}`);

    const settings = await loadSettings(admin);
    if (!settings.enabled) {
      console.log(`notify: disabled in settings (draft ${draftId})`);
      return json(200, { ok: true, skipped: "disabled" });
    }
    if (settings.recipients.length === 0) {
      console.warn(`notify: no recipients configured (draft ${draftId})`);
      await admin.from("mobile_ad_drafts").update({
        publish_email_status: "failed",
        publish_email_error: "Keine Empfänger konfiguriert.",
      }).eq("id", draftId);
      return json(200, { ok: false, skipped: "no_recipients" });
    }
    if ((draft as Record<string, unknown>).publish_email_sent_at && !force) {
      console.log(`notify: already sent (draft ${draftId})`);
      return json(200, { ok: true, skipped: "already_sent" });
    }

    const vehicle = await findLinkedVehicle(admin, draft as never);
    const vehicleId = (vehicle?.id as string | undefined) ?? null;

    // Wenn noch kein vehicle vorhanden → warten auf Sync (kein Mailversand).
    if (!vehicle || !vehicleId) {
      console.log(`notify: vehicle not yet synced for draft=${draftId} mobileAdId=${draft.mobile_ad_id ?? "-"} → waiting_for_sync`);
      await admin.from("mobile_ad_drafts").update({
        publish_email_status: "waiting_for_sync",
        publish_email_error: null,
      }).eq("id", draftId);
      return json(200, { ok: true, skipped: "waiting_for_sync" });
    }

    const formatted = formatVehicleForEmail(vehicle, draft.payload);
    console.log(`notify: draft=${draftId} vehicleId=${vehicleId} label_misses=${formatted.missing.length ? formatted.missing.join("|") : "none"}`);

    const adminWithAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    });

    // Story
    let storyImageUrl: string | undefined;
    let storyError: string | undefined;
    if (settings.includeStory) {
      const r = await getOrCreateStory(adminWithAuth, vehicleId);
      storyImageUrl = r.url;
      storyError = r.error;
    }

    // Expose
    let exposeUrl: string | undefined;
    let exposeError: string | undefined;
    if (settings.includeExpose) {
      const r = await ensureExposeSignedUrl(adminWithAuth, vehicleId);
      exposeUrl = r.url;
      exposeError = r.error;
    }

    const mobileAdUrl = draft.mobile_ad_id
      ? `https://suchen.mobile.de/fahrzeuge/details.html?id=${draft.mobile_ad_id}`
      : undefined;
    const portalUrl = settings.includeVehicleLink ? `${PORTAL_BASE}/fahrzeug/${vehicleId}` : undefined;

    const templateData = {
      title: formatted.title,
      brand: formatted.brand,
      model: formatted.model,
      modelDescription: formatted.modelDescription,
      mobileAdId: draft.mobile_ad_id ?? undefined,
      specs: formatted.specs,
      storyImageUrl,
      storyDownloadUrl: storyImageUrl,
      storyError,
      exposeUrl,
      exposeError,
      mobileAdUrl,
      portalUrl,
    };

    const baseKey = `mobile-ad-synced-${draftId}${force ? `-resend-${Date.now()}` : ""}`;
    const sendResults = await Promise.all(
      settings.recipients.map((recipient) =>
        adminWithAuth.functions.invoke("send-transactional-email", {
          body: {
            templateName: "mobile-ad-published",
            recipientEmail: recipient,
            idempotencyKey: `${baseKey}-${recipient}`,
            templateData,
          },
        }).then((r) => ({ recipient, error: r.error ? String(r.error.message ?? r.error) : null }))
      ),
    );
    const failed = sendResults.filter((r) => r.error);
    const sentOk = sendResults.length - failed.length;
    console.log(`notify draft=${draftId} sent=${sentOk}/${sendResults.length} failed=${JSON.stringify(failed.map((f) => f.recipient))}`);

    if (sentOk > 0) {
      await admin.from("mobile_ad_drafts").update({
        publish_email_status: failed.length ? "sent_with_warning" : "sent",
        publish_email_sent_at: new Date().toISOString(),
        publish_email_error: failed.length ? `Teilfehler: ${failed.map((f) => f.recipient).join(", ")}` : null,
      }).eq("id", draftId);
    } else {
      await admin.from("mobile_ad_drafts").update({
        publish_email_status: "failed",
        publish_email_error: `Versand fehlgeschlagen: ${failed.map((f) => `${f.recipient}: ${f.error}`).join("; ").slice(0, 1500)}`,
      }).eq("id", draftId);
      return json(502, { ok: false, error: "send failed", failed });
    }

    return json(200, {
      ok: true,
      sent: sentOk,
      total: sendResults.length,
      vehicleId,
      labelMisses: formatted.missing,
      storyIncluded: Boolean(storyImageUrl),
      exposeIncluded: Boolean(exposeUrl),
    });
  } catch (err) {
    console.error("notify-mobile-ad-published fatal:", err);
    return json(500, { error: String((err as Error).message || err) });
  }
});
