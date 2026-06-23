// Sends a notification email after a Mobile.de ad was successfully published
// from the portal (publish-mobile-ad). Uses existing Lovable email infra and
// re-uses generate-story if a linked vehicle exists.
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
    enabled: enabledV !== false, // default true
    recipients: recList,
    includeStory: includeStoryV !== false,
    includeExpose: includeExposeV !== false,
    includeVehicleLink: includeVehicleLinkV !== false,
  };
}

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
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.label === "string" && o.label.trim()) return o.label.trim();
    if (typeof o.key === "string" && o.key.trim()) return o.key.trim();
  }
  return undefined;
}

function extractFacts(payload: unknown) {
  const make = strOrKey(readFirst(payload, [["vehicle", "make"], ["make"]]));
  const model = strOrKey(readFirst(payload, [["vehicle", "model"], ["model"]]));
  const desc = strOrKey(readFirst(payload, [["vehicle", "modelDescription"], ["vehicle", "model-description"], ["modelDescription"]]));
  const priceRaw = readFirst(payload, [["price", "consumerPriceGross"], ["price", "consumer-price-gross"], ["consumerPriceGross"]]);
  const priceNum = typeof priceRaw === "number" ? priceRaw : (typeof priceRaw === "string" ? Number(String(priceRaw).replace(/[^0-9.]/g, "")) : NaN);
  const mileageRaw = readFirst(payload, [["vehicle", "mileage"], ["mileage"]]);
  const mileage = typeof mileageRaw === "number" ? mileageRaw : (typeof mileageRaw === "string" ? Number(mileageRaw) : NaN);
  const firstReg = readFirst(payload, [["vehicle", "firstRegistration"], ["firstRegistration"], ["vehicle", "first-registration"]]);
  const fuel = strOrKey(readFirst(payload, [["vehicle", "fuel"], ["fuel"]]));
  const gearbox = strOrKey(readFirst(payload, [["vehicle", "gearbox"], ["gearbox"]]));
  const powerRaw = readFirst(payload, [["vehicle", "power"], ["power"]]);
  const power = typeof powerRaw === "number" ? powerRaw : (typeof powerRaw === "string" ? Number(powerRaw) : NaN);
  const cubicRaw = readFirst(payload, [["vehicle", "cubicCapacity"], ["cubicCapacity"]]);
  const cubic = typeof cubicRaw === "number" ? cubicRaw : (typeof cubicRaw === "string" ? Number(cubicRaw) : NaN);
  const color = strOrKey(readFirst(payload, [["vehicle", "exteriorColor"], ["exteriorColor"]]));
  const vin = strOrKey(readFirst(payload, [["vehicle", "vin"], ["vin"]]));
  return { make, model, desc, priceNum, mileage, firstReg, fuel, gearbox, power, cubic, color, vin };
}

function fmtPrice(n: number): string | undefined {
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
function fmtFirstReg(v: unknown): string | undefined {
  const s = String(v ?? "");
  // Expect YYYYMM or YYYY-MM or YYYY
  const m = s.match(/^(\d{4})(\d{2})?$/) ?? s.match(/^(\d{4})-(\d{2})/);
  if (m) {
    const y = m[1];
    const mo = m[2];
    return mo ? `${mo}/${y}` : y;
  }
  return s || undefined;
}

async function findLinkedVehicleId(
  admin: ReturnType<typeof createClient>,
  draft: { id: string; mobile_ad_id: string | null; payload: unknown },
): Promise<string | null> {
  const linked = readPath(draft.payload, ["_linkedVehicleId"]);
  if (typeof linked === "string" && linked) return linked;
  if (draft.mobile_ad_id) {
    const { data } = await admin.from("vehicles").select("id").eq("mobile_de_id", draft.mobile_ad_id).maybeSingle();
    if (data?.id) return data.id as string;
  }
  const vin = strOrKey(readFirst(draft.payload, [["vehicle", "vin"], ["vin"]]));
  if (vin) {
    const { data } = await admin.from("vehicles").select("id").ilike("vin", vin).maybeSingle();
    if (data?.id) return data.id as string;
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
    console.warn("getOrCreateStory: lookup failed:", (e as Error).message);
  }
  // Generate fresh via existing function (skip dealer email to avoid double-send).
  try {
    const { data, error } = await admin.functions.invoke("generate-story", {
      body: { vehicleIds: [vehicleId], skipDealerEmail: true },
    });
    if (error) return { error: `Story-Erzeugung fehlgeschlagen: ${error.message}` };
    const generated = (data as { generated?: Array<{ vehicleId: string; storyImageUrl?: string }> } | null)?.generated;
    const first = generated?.find((g) => g.vehicleId === vehicleId)?.storyImageUrl;
    if (first) return { url: first };
    // Fallback: re-query
    const { data: row } = await admin
      .from("vehicle_stories")
      .select("story_image_url")
      .eq("vehicle_id", vehicleId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row?.story_image_url) return { url: row.story_image_url as string };
    return { error: "WhatsApp-Story konnte nicht automatisch erzeugt werden." };
  } catch (e) {
    return { error: `Story-Erzeugung fehlgeschlagen: ${(e as Error).message}` };
  }
}

async function findExposeSignedUrl(
  admin: ReturnType<typeof createClient>,
  vehicleId: string,
): Promise<{ url?: string; error?: string }> {
  try {
    const { data: files, error } = await admin.storage
      .from("vehicle-exposes")
      .list("", { search: vehicleId, limit: 50 });
    if (error) return { error: `Exposé-Suche fehlgeschlagen: ${error.message}` };
    const match = (files ?? []).find((f) => f.name.includes(vehicleId)) ?? (files ?? [])[0];
    if (!match) return { error: "Exposé wird verfügbar, sobald das Fahrzeug im Bestand synchronisiert wurde." };
    const { data: signed, error: sErr } = await admin.storage
      .from("vehicle-exposes")
      .createSignedUrl(match.name, 60 * 60 * 24 * 7); // 7 days
    if (sErr || !signed?.signedUrl) return { error: `Exposé-Link konnte nicht erzeugt werden.` };
    return { url: signed.signedUrl };
  } catch (e) {
    return { error: `Exposé konnte nicht automatisch ermittelt werden: ${(e as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Service-role bypass for internal callers (publish-mobile-ad); otherwise require admin.
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
    if (!draftId) return json(400, { error: "draftId required" });

    const { data: draft, error: draftErr } = await admin
      .from("mobile_ad_drafts")
      .select("id, status, payload, mobile_ad_id, publish_email_sent_at")
      .eq("id", draftId)
      .maybeSingle();
    if (draftErr || !draft) return json(404, { error: "Draft not found" });

    const settings = await loadSettings(admin);
    if (!settings.enabled) {
      console.log(`notify: disabled in settings (draft ${draftId})`);
      return json(200, { ok: true, skipped: "disabled" });
    }
    if (settings.recipients.length === 0) {
      console.warn(`notify: no recipients configured (draft ${draftId})`);
      await admin.from("mobile_ad_drafts").update({
        publish_email_error: "Keine Empfänger konfiguriert.",
      }).eq("id", draftId);
      return json(200, { ok: false, skipped: "no_recipients" });
    }
    if ((draft as Record<string, unknown>).publish_email_sent_at && !force) {
      console.log(`notify: already sent (draft ${draftId})`);
      return json(200, { ok: true, skipped: "already_sent" });
    }

    const facts = extractFacts(draft.payload);
    const adminWithAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    });

    // Story
    let storyImageUrl: string | undefined;
    let storyError: string | undefined;
    let vehicleId: string | null = null;
    if (settings.includeStory) {
      vehicleId = await findLinkedVehicleId(admin, draft as never);
      if (vehicleId) {
        const r = await getOrCreateStory(adminWithAuth, vehicleId);
        storyImageUrl = r.url;
        storyError = r.error;
      } else {
        storyError = "WhatsApp-Story wird verfügbar, sobald das Fahrzeug im Bestand synchronisiert wurde.";
      }
    }

    // Expose
    let exposeUrl: string | undefined;
    let exposeError: string | undefined;
    if (settings.includeExpose) {
      if (!vehicleId) vehicleId = await findLinkedVehicleId(admin, draft as never);
      if (vehicleId) {
        const r = await findExposeSignedUrl(adminWithAuth, vehicleId);
        exposeUrl = r.url;
        exposeError = r.error;
      } else {
        exposeError = "Exposé wird verfügbar, sobald das Fahrzeug im Bestand synchronisiert wurde.";
      }
    }

    const mobileAdUrl = draft.mobile_ad_id
      ? `https://suchen.mobile.de/fahrzeuge/details.html?id=${draft.mobile_ad_id}`
      : undefined;
    const portalUrl = settings.includeVehicleLink && vehicleId
      ? `${PORTAL_BASE}/fahrzeug/${vehicleId}`
      : undefined;

    const specs = [
      { label: "Marke", value: facts.make },
      { label: "Modell", value: facts.model },
      facts.desc ? { label: "Modellbeschreibung", value: facts.desc } : null,
      { label: "Preis", value: fmtPrice(facts.priceNum) },
      Number.isFinite(facts.mileage) ? { label: "Kilometerstand", value: `${(facts.mileage as number).toLocaleString("de-DE")} km` } : null,
      { label: "Erstzulassung", value: fmtFirstReg(facts.firstReg) },
      { label: "Kraftstoff", value: facts.fuel },
      { label: "Getriebe", value: facts.gearbox },
      Number.isFinite(facts.power) ? { label: "Leistung", value: `${facts.power} kW` } : null,
      Number.isFinite(facts.cubic) ? { label: "Hubraum", value: `${(facts.cubic as number).toLocaleString("de-DE")} cm³` } : null,
      { label: "Farbe", value: facts.color },
      facts.vin ? { label: "FIN", value: facts.vin } : null,
    ].filter(Boolean);

    const templateData = {
      title: [facts.make, facts.model].filter(Boolean).join(" "),
      brand: facts.make,
      model: facts.model,
      modelDescription: facts.desc,
      mobileAdId: draft.mobile_ad_id ?? undefined,
      specs,
      storyImageUrl,
      storyDownloadUrl: storyImageUrl,
      storyError,
      exposeUrl,
      exposeError,
      mobileAdUrl,
      portalUrl,
    };

    const baseKey = `mobile-ad-published-${draftId}${force ? `-resend-${Date.now()}` : ""}`;
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
    console.log(`notify draft=${draftId} sent=${sentOk}/${sendResults.length} failed=${JSON.stringify(failed)}`);

    if (sentOk > 0) {
      await admin.from("mobile_ad_drafts").update({
        publish_email_sent_at: new Date().toISOString(),
        publish_email_error: failed.length ? `Teilfehler: ${failed.map((f) => f.recipient).join(", ")}` : null,
      }).eq("id", draftId);
    } else {
      await admin.from("mobile_ad_drafts").update({
        publish_email_error: `Versand fehlgeschlagen: ${failed.map((f) => `${f.recipient}: ${f.error}`).join("; ").slice(0, 1500)}`,
      }).eq("id", draftId);
      return json(502, { ok: false, error: "send failed", failed });
    }

    return json(200, {
      ok: true,
      sent: sentOk,
      total: sendResults.length,
      failed: failed.map((f) => f.recipient),
      storyIncluded: Boolean(storyImageUrl),
      exposeIncluded: Boolean(exposeUrl),
    });
  } catch (err) {
    console.error("notify-mobile-ad-published fatal:", err);
    return json(500, { error: String((err as Error).message || err) });
  }
});
