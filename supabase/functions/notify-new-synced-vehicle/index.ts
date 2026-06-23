// Sendet eine automatische Benachrichtigungs-Mail, wenn ein Fahrzeug NEU
// durch den Mobile.de Search-Sync in der Tabelle vehicles angelegt wurde.
// Trigger: sync-vehicles / sync-accident-vehicles (nach erfolgreichem Upsert)
// Manuell:  forceResend = true (Doppelsende-Schutz wird übergangen)
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

// ───────── German label maps ─────────
const MAKE_LABELS: Record<string, string> = {
  VW: "Volkswagen", VOLKSWAGEN: "Volkswagen",
  "MERCEDES-BENZ": "Mercedes-Benz", MERCEDES: "Mercedes-Benz",
  BMW: "BMW", AUDI: "Audi", KIA: "Kia", FIAT: "Fiat",
  CITROEN: "Citroën", "CITROËN": "Citroën",
};
const FUEL_LABELS: Record<string, string> = {
  PETROL: "Benzin", DIESEL: "Diesel", HYBRID: "Hybrid",
  ELECTRICITY: "Elektro", ELECTRIC: "Elektro",
  PLUGIN_HYBRID: "Plug-in-Hybrid", HYBRID_PLUGIN: "Plug-in-Hybrid",
  LPG: "Autogas LPG", CNG: "Erdgas CNG",
};
const GEARBOX_LABELS: Record<string, string> = {
  MANUAL_GEAR: "Schaltgetriebe", AUTOMATIC_GEAR: "Automatik",
  SEMIAUTOMATIC_GEAR: "Halbautomatik",
};
const COLOR_LABELS: Record<string, string> = {
  BLACK: "Schwarz", GREY: "Grau", GRAY: "Grau", WHITE: "Weiß",
  SILVER: "Silber", BLUE: "Blau", RED: "Rot", GREEN: "Grün",
  YELLOW: "Gelb", BROWN: "Braun", BEIGE: "Beige", ORANGE: "Orange", GOLD: "Gold",
};
const CATEGORY_LABELS: Record<string, string> = {
  SmallCar: "Kleinwagen", Limousine: "Limousine", EstateCar: "Kombi",
  OffRoad: "SUV/Geländewagen", Van: "Van/Kleinbus",
  SportsCar: "Sportwagen/Coupé", Cabrio: "Cabrio",
};
const CONDITION_LABELS: Record<string, string> = {
  USED: "Gebrauchtfahrzeug", NEW: "Neufahrzeug",
};

function mapLabel(map: Record<string, string>, raw: unknown, missing: string[], field: string): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const key = String(raw).trim();
  if (!key) return undefined;
  const hit = map[key] ?? map[key.toUpperCase()];
  if (hit) return hit;
  missing.push(`${field}=${key}`);
  return key;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}
const fmtPrice = (n: number) => Number.isFinite(n) && n > 0
  ? `${Math.round(n).toLocaleString("de-DE")} €` : undefined;
const fmtMileage = (n: number) => Number.isFinite(n) && n >= 0
  ? `${Math.round(n).toLocaleString("de-DE")} km` : undefined;
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

type Settings = {
  enabled: boolean;
  recipients: string[];
  includeStory: boolean;
  includeExpose: boolean;
  includeVehicleLink: boolean;
  includeAccident: boolean;
};

async function readSetting<T>(admin: ReturnType<typeof createClient>, key: string): Promise<T | null> {
  try {
    const { data } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
    return (data?.value ?? null) as T | null;
  } catch { return null; }
}

async function loadSettings(admin: ReturnType<typeof createClient>): Promise<Settings> {
  const enabledV = await readSetting<boolean>(admin, "new_synced_vehicle_email_enabled");
  const includeStoryV = await readSetting<boolean>(admin, "new_synced_vehicle_email_include_story");
  const includeExposeV = await readSetting<boolean>(admin, "new_synced_vehicle_email_include_expose");
  const includeVehicleLinkV = await readSetting<boolean>(admin, "new_synced_vehicle_email_include_vehicle_link");
  const includeAccidentV = await readSetting<boolean>(admin, "new_synced_vehicle_email_include_accident_vehicles");
  let recipients = await readSetting<unknown>(admin, "new_synced_vehicle_email_recipients");
  if (!Array.isArray(recipients) || (recipients as unknown[]).length === 0) {
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
    includeAccident: includeAccidentV !== false,
  };
}

function formatVehicleForEmail(v: Record<string, unknown>) {
  const missing: string[] = [];
  const makeRaw = v.brand as string | undefined;
  const modelRaw = v.model as string | undefined;
  const descRaw = v.model_description as string | undefined;
  const fuelRaw = v.fuel as string | undefined;
  const gearboxRaw = v.gearbox as string | undefined;
  const colorRaw = v.exterior_color as string | undefined;
  const categoryRaw = v.category as string | undefined;
  const conditionRaw = v.condition as string | undefined;
  const price = toNum(v.price);
  const mileage = toNum(v.mileage);
  const power = toNum(v.power);
  const cubic = toNum(v.cubic_capacity);

  const makeLabel = mapLabel(MAKE_LABELS, makeRaw, missing, "make");
  const fuelLabel = mapLabel(FUEL_LABELS, fuelRaw, missing, "fuel");
  const gearboxLabel = mapLabel(GEARBOX_LABELS, gearboxRaw, missing, "gearbox");
  const colorLabel = mapLabel(COLOR_LABELS, colorRaw, missing, "exteriorColor");
  const categoryLabel = mapLabel(CATEGORY_LABELS, categoryRaw, missing, "category");
  const conditionLabel = mapLabel(CONDITION_LABELS, conditionRaw, missing, "condition");

  const powerDisplay = Number.isFinite(power) && power > 0
    ? `${Math.round(power)} kW (${Math.round(power * 1.35962)} PS)`
    : undefined;

  const specs = [
    { label: "Marke", value: makeLabel },
    { label: "Modell", value: modelRaw },
    descRaw ? { label: "Modellbeschreibung", value: descRaw } : null,
    { label: "Preis", value: fmtPrice(price) },
    { label: "Kilometerstand", value: fmtMileage(mileage) },
    { label: "Erstzulassung", value: fmtFirstReg(v.year) },
    { label: "Kraftstoff", value: fuelLabel },
    { label: "Getriebe", value: gearboxLabel },
    { label: "Leistung", value: powerDisplay },
    Number.isFinite(cubic) && cubic > 0
      ? { label: "Hubraum", value: `${Math.round(cubic).toLocaleString("de-DE")} cm³` }
      : null,
    { label: "Farbe", value: colorLabel },
    categoryLabel ? { label: "Fahrzeugklasse", value: categoryLabel } : null,
    conditionLabel ? { label: "Zustand", value: conditionLabel } : null,
  ].filter((s): s is { label: string; value: string } => !!s && !!s.value);

  return {
    title: [makeLabel, modelRaw].filter(Boolean).join(" ") || "Fahrzeug",
    brand: makeLabel,
    model: modelRaw,
    modelDescription: descRaw,
    specs,
    missing,
  };
}

async function getOrCreateStory(
  admin: ReturnType<typeof createClient>,
  vehicleId: string,
): Promise<{ url?: string; storyId?: string; error?: string }> {
  try {
    const { data: existing } = await admin
      .from("vehicle_stories")
      .select("id, story_image_url")
      .eq("vehicle_id", vehicleId)
      .order("generated_at", { ascending: false })
      .limit(1).maybeSingle();
    if (existing?.story_image_url) {
      return { url: existing.story_image_url as string, storyId: existing.id as string };
    }
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
    if (first) {
      const { data: row } = await admin
        .from("vehicle_stories").select("id, story_image_url").eq("vehicle_id", vehicleId)
        .order("generated_at", { ascending: false }).limit(1).maybeSingle();
      return { url: first, storyId: row?.id as string | undefined };
    }
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
      console.warn(`ensureExpose invoke error vehicle=${vehicleId}: ${error.message ?? error}`);
      return { error: "Exposé konnte nicht automatisch erzeugt werden." };
    }
    const url = (data as { signedUrl?: string } | null)?.signedUrl;
    if (!url) return { error: "Exposé konnte nicht automatisch erzeugt werden." };
    return { url };
  } catch (e) {
    console.warn(`ensureExpose exception vehicle=${vehicleId}: ${(e as Error).message}`);
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
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", claimsData.claims.sub as string)
        .eq("role", "admin").maybeSingle();
      if (!roleRow) return json(403, { error: "Forbidden" });
    }

    const body = await req.json().catch(() => ({}));
    const vehicleId = String((body as { vehicleId?: string }).vehicleId ?? "").trim();
    const force = Boolean((body as { force?: boolean; forceResend?: boolean }).force
      ?? (body as { forceResend?: boolean }).forceResend);
    const trigger = String((body as { trigger?: string }).trigger ?? "manual");
    if (!vehicleId) return json(400, { success: false, emailSent: false, error: "vehicleId required" });

    const { data: vehicle, error: vErr } = await admin
      .from("vehicles").select("*").eq("id", vehicleId).maybeSingle();
    if (vErr || !vehicle) return json(404, { success: false, emailSent: false, error: "Vehicle not found" });

    const v = vehicle as Record<string, unknown>;
    const mobileDeId = v.mobile_de_id as string | null | undefined;
    const source = (v.source as string | null | undefined) ?? null;
    const vehicleCategory = (v.vehicle_category as string | null | undefined) ?? null;
    const alreadySent = v.new_sync_email_sent_at as string | null | undefined;
    const prevStatus = v.new_sync_email_status as string | null | undefined;

    console.log(`notify-new-sync: vehicleId=${vehicleId} mobileDeId=${mobileDeId ?? "-"} trigger=${trigger} force=${force} prevStatus=${prevStatus ?? "-"}`);

    const settings = await loadSettings(admin);
    if (!settings.enabled) {
      await admin.from("vehicles").update({ new_sync_email_status: "disabled" }).eq("id", vehicleId);
      return json(200, { success: true, emailSent: false, reason: "disabled" });
    }
    if (!mobileDeId) {
      return json(200, { success: false, emailSent: false, reason: "no_mobile_de_id" });
    }
    if (source && source !== "mobile_de") {
      return json(200, { success: false, emailSent: false, reason: "wrong_source" });
    }
    if (vehicleCategory === "accident" && !settings.includeAccident) {
      await admin.from("vehicles").update({ new_sync_email_status: "disabled" }).eq("id", vehicleId);
      return json(200, { success: true, emailSent: false, reason: "accident_excluded" });
    }
    if (alreadySent && !force) {
      return json(200, { success: true, emailSent: false, reason: "already_sent", sentAt: alreadySent });
    }
    if (settings.recipients.length === 0) {
      await admin.from("vehicles").update({
        new_sync_email_status: "error",
        new_sync_email_error: "Keine Empfänger konfiguriert.",
        new_sync_email_last_attempt_at: new Date().toISOString(),
      }).eq("id", vehicleId);
      return json(200, { success: false, emailSent: false, reason: "no_recipients" });
    }

    await admin.from("vehicles").update({
      new_sync_email_status: "sending",
      new_sync_email_last_attempt_at: new Date().toISOString(),
      new_sync_email_error: null,
    }).eq("id", vehicleId);

    const formatted = formatVehicleForEmail(v);
    console.log(`notify-new-sync: vehicleId=${vehicleId} label_misses=${formatted.missing.length ? formatted.missing.join("|") : "none"}`);

    const adminWithAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    });

    let storyImageUrl: string | undefined;
    let storyError: string | undefined;
    let storyId: string | undefined;
    if (settings.includeStory) {
      const r = await getOrCreateStory(adminWithAuth, vehicleId);
      storyImageUrl = r.url; storyError = r.error; storyId = r.storyId;
    }

    let exposeUrl: string | undefined;
    let exposeError: string | undefined;
    if (settings.includeExpose) {
      const r = await ensureExposeSignedUrl(adminWithAuth, vehicleId);
      exposeUrl = r.url; exposeError = r.error;
    }

    const mobileAdUrl = mobileDeId
      ? `https://suchen.mobile.de/fahrzeuge/details.html?id=${mobileDeId}`
      : undefined;
    const portalUrl = settings.includeVehicleLink ? `${PORTAL_BASE}/fahrzeug/${vehicleId}` : undefined;

    const templateData = {
      title: formatted.title,
      brand: formatted.brand,
      model: formatted.model,
      modelDescription: formatted.modelDescription,
      mobileAdId: mobileDeId ?? undefined,
      specs: formatted.specs,
      storyImageUrl,
      storyDownloadUrl: storyImageUrl,
      storyError,
      exposeUrl,
      exposeError,
      mobileAdUrl,
      portalUrl,
    };

    const baseKey = `new-synced-vehicle-${vehicleId}${force ? `-resend-${Date.now()}` : ""}`;
    const sendResults = await Promise.all(
      settings.recipients.map((recipient) =>
        adminWithAuth.functions.invoke("send-transactional-email", {
          body: {
            templateName: "mobile-ad-published",
            recipientEmail: recipient,
            idempotencyKey: `${baseKey}-${recipient}`,
            templateData,
            logContext: {
              mailType: "new_synced_vehicle",
              vehicleId,
              mobileAdId: mobileDeId ?? null,
              storyId: storyId ?? null,
              exposePath: vehicleId ? `exposes/${vehicleId}.pdf` : null,
              metadata: { trigger, force: !!force },
            },
          },
        }).then((r) => ({ recipient, error: r.error ? String(r.error.message ?? r.error) : null }))
      ),
    );
    const failed = sendResults.filter((r) => r.error);
    const sentOk = sendResults.length - failed.length;
    console.log(`notify-new-sync vehicleId=${vehicleId} story=${Boolean(storyImageUrl)} expose=${Boolean(exposeUrl)} sent=${sentOk}/${sendResults.length}`);

    if (sentOk > 0) {
      await admin.from("vehicles").update({
        new_sync_email_status: failed.length ? "sent_with_warning" : "sent",
        new_sync_email_sent_at: new Date().toISOString(),
        new_sync_email_error: failed.length
          ? `Teilfehler: ${failed.map((f) => f.recipient).join(", ")}`
          : null,
      }).eq("id", vehicleId);
      return json(200, {
        success: true, emailSent: true, vehicleId,
        sent: sentOk, total: sendResults.length,
        storyIncluded: Boolean(storyImageUrl),
        exposeIncluded: Boolean(exposeUrl),
        labelMisses: formatted.missing,
        partialFailures: failed,
      });
    }

    const errorMsg = `Versand fehlgeschlagen: ${failed.map((f) => `${f.recipient}: ${f.error}`).join("; ")}`.slice(0, 1500);
    await admin.from("vehicles").update({
      new_sync_email_status: "error",
      new_sync_email_error: errorMsg,
    }).eq("id", vehicleId);
    return json(502, { success: false, emailSent: false, vehicleId, error: errorMsg, failed });
  } catch (err) {
    console.error("notify-new-synced-vehicle fatal:", err);
    return json(500, { success: false, emailSent: false, error: String((err as Error).message || err) });
  }
});
