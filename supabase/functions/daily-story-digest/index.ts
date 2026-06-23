// Daily Business Report (technischer Function-Name bleibt "daily-story-digest"
// aus Cron-Gründen). Statt eines Story/Exposé-Digests berechnet die Function
// kompakte Tageskennzahlen zum Fahrzeugbestand und versendet einen
// Kennzahlenbericht via send-transactional-email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ENABLED_KEY = "daily_digest_enabled";
const HOUR_KEY = "daily_digest_hour";
const LAST_SENT_KEY = "daily_digest_last_sent";
const RECIPIENTS_KEY = "daily_report_recipients";
const STORY_RECIPIENTS_KEY = "story_email_recipients";
const INC_NEW_KEY = "daily_report_include_new_vehicles";
const INC_SOLD_KEY = "daily_report_include_sold_vehicles";
const INC_INVENTORY_KEY = "daily_report_include_inventory_value";
const INC_SYNC_KEY = "daily_report_include_sync_status";

const PORTAL_BASE = "https://fahrzeuge.reller-automobile.de";

// ─── German label mapping for raw Mobile.de enums ─────────────────────────────
const BRAND_LABELS: Record<string, string> = {
  VW: "Volkswagen",
  MERCEDES_BENZ: "Mercedes-Benz",
  "Mercedes-Benz": "Mercedes-Benz",
  BMW: "BMW",
  AUDI: "Audi",
};
const FUEL_LABELS: Record<string, string> = {
  PETROL: "Benzin", DIESEL: "Diesel", ELECTRICITY: "Elektro",
  HYBRID: "Hybrid", HYBRID_DIESEL: "Hybrid (Diesel)", LPG: "LPG", CNG: "CNG",
};
const GEARBOX_LABELS: Record<string, string> = {
  MANUAL_GEAR: "Schaltgetriebe",
  AUTOMATIC_GEAR: "Automatik",
  SEMIAUTOMATIC_GEAR: "Halbautomatik",
};
const COLOR_LABELS: Record<string, string> = {
  GREY: "Grau", BLACK: "Schwarz", WHITE: "Weiß", BLUE: "Blau",
  RED: "Rot", SILVER: "Silber", GREEN: "Grün", BROWN: "Braun",
  YELLOW: "Gelb", BEIGE: "Beige", GOLD: "Gold", ORANGE: "Orange", VIOLET: "Violett",
};
function mapBrand(v?: string | null) { return v ? (BRAND_LABELS[v] ?? v) : ""; }

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtPrice(price?: number | null, currency = "€"): string {
  if (price == null || !Number.isFinite(Number(price))) return "–";
  return `${Number(price).toLocaleString("de-DE")} ${currency}`;
}
function fmtKm(mileage?: number | null): string {
  if (mileage == null || !Number.isFinite(Number(mileage))) return "–";
  return `${Number(mileage).toLocaleString("de-DE")} km`;
}
function fmtFirstReg(firstReg?: string | null): string | null {
  if (!firstReg) return null;
  const s = String(firstReg);
  if (/^\d{6}$/.test(s)) return `${s.slice(4, 6)}/${s.slice(0, 4)}`;
  return s;
}
function fmtBerlinDateTime(iso?: string | null): string {
  if (!iso) return "–";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(iso));
  } catch { return String(iso); }
}
function fmtBerlinDate(d = new Date()): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function berlinNowParts() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = parseInt(get("hour"), 10);
  return { date, hour };
}

async function loadSetting<T>(
  admin: ReturnType<typeof createClient>,
  key: string,
): Promise<T | null> {
  const { data } = await admin
    .from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}

function vehicleUrl(v: { id: string; detail_page_url?: string | null }): string {
  return v.detail_page_url ?? `${PORTAL_BASE}/fahrzeug/${v.id}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Auth (cron service-role OR admin user)
  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (token !== SUPABASE_SERVICE_ROLE_KEY) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleRow } = await admin
        .from("user_roles").select("role")
        .eq("user_id", claimsData.claims.sub as string).eq("role", "admin").maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  } catch (err) {
    console.error("daily-business-report: auth check failed", err);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const warnings: string[] = [];

  try {
    const enabled = await loadSetting<boolean>(admin, ENABLED_KEY);
    if (!force && enabled !== true) {
      console.log("daily-business-report: disabled, skipping");
      return new Response(JSON.stringify({ skipped: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hourSetting = (await loadSetting<number>(admin, HOUR_KEY)) ?? 7;
    const { date: berlinDate, hour: berlinHour } = berlinNowParts();

    if (!force && berlinHour !== hourSetting) {
      console.log(`daily-business-report: hour mismatch (now=${berlinHour}, target=${hourSetting})`);
      return new Response(JSON.stringify({ skipped: "wrong_hour", berlinHour, target: hourSetting }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastSent = await loadSetting<string>(admin, LAST_SENT_KEY);
    if (!force && lastSent === berlinDate) {
      console.log(`daily-business-report: already sent today (${berlinDate})`);
      return new Response(JSON.stringify({ skipped: "already_sent_today", date: berlinDate }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recipients: prefer daily_report_recipients, fall back to story recipients.
    let recipients = (await loadSetting<string[]>(admin, RECIPIENTS_KEY)) ?? [];
    if (!Array.isArray(recipients) || recipients.length === 0) {
      const storyR = (await loadSetting<string[]>(admin, STORY_RECIPIENTS_KEY)) ?? [];
      recipients = Array.isArray(storyR) ? storyR : [];
    }
    recipients = recipients.filter((r) => typeof r === "string" && r.includes("@"));
    if (recipients.length === 0) {
      console.log("daily-business-report: no recipients configured");
      return new Response(JSON.stringify({ skipped: "no_recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const incNew = (await loadSetting<boolean>(admin, INC_NEW_KEY)) ?? true;
    const incSold = (await loadSetting<boolean>(admin, INC_SOLD_KEY)) ?? true;
    const incInventory = (await loadSetting<boolean>(admin, INC_INVENTORY_KEY)) ?? true;
    const incSync = (await loadSetting<boolean>(admin, INC_SYNC_KEY)) ?? true;

    const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since = sinceDate.toISOString();

    // ─── KPIs ─────────────────────────────────────────────────────────────
    // 1. New vehicles (last 24h, not sold)
    const { data: newVehiclesData, error: newErr } = await admin
      .from("vehicles")
      .select("id, brand, model, model_description, price, currency, mileage, first_registration, detail_page_url, created_at")
      .gte("created_at", since)
      .eq("is_sold", false)
      .order("created_at", { ascending: false });
    if (newErr) {
      console.error("daily-business-report: new vehicles query failed", newErr);
      warnings.push("Neue Fahrzeuge konnten nicht geladen werden.");
    }
    const newVehicles = newVehiclesData ?? [];

    // 2. Sold vehicles (last 24h)
    const { data: soldVehiclesData, error: soldErr } = await admin
      .from("vehicles")
      .select("id, brand, model, model_description, price, currency, sold_at, detail_page_url")
      .eq("is_sold", true)
      .gte("sold_at", since)
      .order("sold_at", { ascending: false });
    if (soldErr) {
      console.error("daily-business-report: sold vehicles query failed", soldErr);
      warnings.push("Verkaufte Fahrzeuge konnten nicht geladen werden.");
    }
    const soldVehicles = soldVehiclesData ?? [];

    // 3. Current inventory + inventory value + missing price/images
    const { data: inventoryData, error: invErr } = await admin
      .from("vehicles")
      .select("id, price, image_urls")
      .eq("is_sold", false);
    if (invErr) {
      console.error("daily-business-report: inventory query failed", invErr);
      warnings.push("Bestand konnte nicht geladen werden.");
    }
    const inventory = inventoryData ?? [];
    const currentInventoryCount = inventory.length;
    let inventoryValue = 0;
    let vehiclesWithoutPriceCount = 0;
    let vehiclesWithoutImagesCount = 0;
    for (const v of inventory as Array<{ price: number | null; image_urls: string[] | null }>) {
      const p = Number(v.price);
      if (Number.isFinite(p) && p > 0) inventoryValue += p;
      else vehiclesWithoutPriceCount++;
      if (!Array.isArray(v.image_urls) || v.image_urls.length === 0) {
        vehiclesWithoutImagesCount++;
      }
    }

    // 4. Sales value 24h
    let salesValue24h = 0;
    let soldWithPriceCount = 0;
    for (const v of soldVehicles as Array<{ price: number | null }>) {
      const p = Number(v.price);
      if (Number.isFinite(p) && p > 0) {
        salesValue24h += p;
        soldWithPriceCount++;
      }
    }
    const avgSalePrice = soldWithPriceCount > 0 ? Math.round(salesValue24h / soldWithPriceCount) : null;

    // 5. Sync status
    let lastSyncLabel: string | null = null;
    const syncErrors: Array<{ syncName: string; when: string; message?: string | null }> = [];
    if (incSync) {
      const { data: lastSync, error: lsErr } = await admin
        .from("sync_logs")
        .select("sync_name, completed_at")
        .eq("status", "success")
        .order("completed_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (lsErr) {
        console.error("daily-business-report: last sync query failed", lsErr);
        warnings.push("Letzter Sync konnte nicht ermittelt werden.");
      } else if (lastSync) {
        lastSyncLabel = `${lastSync.sync_name} · ${fmtBerlinDateTime(lastSync.completed_at as string)}`;
      }
      const { data: errs } = await admin
        .from("sync_logs")
        .select("sync_name, completed_at, started_at, error_message, status")
        .neq("status", "success")
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(20);
      for (const e of (errs ?? []) as Array<any>) {
        syncErrors.push({
          syncName: e.sync_name,
          when: fmtBerlinDateTime(e.completed_at ?? e.started_at),
          message: e.error_message ?? e.status,
        });
      }
    }

    // ─── Build template data ──────────────────────────────────────────────
    const MAX_LIST = 10;
    const newList = newVehicles.slice(0, MAX_LIST).map((v: any) => ({
      id: v.id,
      brand: mapBrand(v.brand),
      model: v.model,
      modelDescription: v.model_description,
      priceFormatted: fmtPrice(v.price, v.currency ?? "€"),
      mileageFormatted: fmtKm(v.mileage),
      firstRegistration: fmtFirstReg(v.first_registration),
      url: vehicleUrl(v),
    }));
    const soldList = soldVehicles.slice(0, MAX_LIST).map((v: any) => ({
      id: v.id,
      brand: mapBrand(v.brand),
      model: v.model,
      modelDescription: v.model_description,
      priceFormatted: fmtPrice(v.price, v.currency ?? "€"),
      soldAtFormatted: fmtBerlinDateTime(v.sold_at),
      url: vehicleUrl(v),
    }));

    const dateLabel = fmtBerlinDate();
    const templateData = {
      dateLabel,
      periodLabel: "Zeitraum: letzte 24 Stunden",
      kpis: {
        newVehiclesCount: newVehicles.length,
        soldVehiclesCount: soldVehicles.length,
        currentInventoryCount,
        inventoryValueFormatted: fmtPrice(inventoryValue),
        salesValue24hFormatted: fmtPrice(salesValue24h),
        avgSalePriceFormatted: avgSalePrice != null ? fmtPrice(avgSalePrice) : null,
      },
      newVehicles: newList,
      newVehiclesMore: Math.max(0, newVehicles.length - MAX_LIST),
      soldVehicles: soldList,
      soldVehiclesMore: Math.max(0, soldVehicles.length - MAX_LIST),
      vehiclesWithoutPriceCount,
      vehiclesWithoutImagesCount,
      lastSyncLabel,
      syncErrors,
      warnings,
      includeNewVehicles: incNew,
      includeSoldVehicles: incSold,
      includeInventoryValue: incInventory,
      includeSyncStatus: incSync,
    };

    console.log("daily-business-report: kpis", {
      date: berlinDate,
      newVehiclesCount: newVehicles.length,
      soldVehiclesCount: soldVehicles.length,
      currentInventoryCount,
      inventoryValue,
      salesValue24h,
      vehiclesWithoutPriceCount,
      vehiclesWithoutImagesCount,
      recipients: recipients.length,
      warnings: warnings.length,
    });

    const subject = `Tagesreport Reller Automobile – ${dateLabel}`;

    // ─── Send via send-transactional-email (one recipient per call) ──────
    const adminWithAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    });

    const sendResults: Array<{ recipient: string; success: boolean; error?: string }> = [];
    let anySuccess = false;
    let firstError: string | null = null;
    for (const recipient of recipients) {
      const idempotencyKey = `daily-report-${berlinDate}-${recipient}`;
      try {
        const { data, error } = await adminWithAuth.functions.invoke("send-transactional-email", {
          body: {
            templateName: "daily-business-report",
            recipientEmail: recipient,
            idempotencyKey,
            templateData,
          },
        });
        if (error) {
          const msg = (error as Error).message ?? String(error);
          console.error(`daily-business-report: send failed for ${recipient}`, msg);
          sendResults.push({ recipient, success: false, error: msg });
          if (!firstError) firstError = msg;
        } else {
          console.log(`daily-business-report: sent to ${recipient}`, data);
          sendResults.push({ recipient, success: true });
          anySuccess = true;
        }
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        console.error(`daily-business-report: send exception for ${recipient}`, msg);
        sendResults.push({ recipient, success: false, error: msg });
        if (!firstError) firstError = msg;
      }
    }

    // ─── Log to email_logs (one entry summarizing the daily report) ──────
    try {
      const status = anySuccess
        ? (sendResults.every((r) => r.success) ? "sent" : "partial")
        : "failed";
      await admin.from("email_logs").insert({
        mail_type: "daily_business_report",
        status,
        recipients,
        subject,
        provider: "send-transactional-email",
        provider_response: { results: sendResults },
        error_message: firstError,
        sent_at: anySuccess ? new Date().toISOString() : null,
        metadata: {
          date: berlinDate,
          newVehiclesCount: newVehicles.length,
          soldVehiclesCount: soldVehicles.length,
          currentInventoryCount,
          inventoryValue,
          salesValue24h,
          avgSalePrice,
          vehiclesWithoutPriceCount,
          vehiclesWithoutImagesCount,
          syncErrorsCount: syncErrors.length,
          warnings,
          force,
        },
      });
    } catch (logErr) {
      console.error("daily-business-report: email_logs insert failed", logErr);
    }

    if (!force && anySuccess) {
      await admin.from("app_settings").upsert(
        { key: LAST_SENT_KEY, value: berlinDate, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    }

    return new Response(JSON.stringify({
      sent: sendResults.filter((r) => r.success).length,
      total: recipients.length,
      date: berlinDate,
      results: sendResults,
      warnings,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("daily-business-report: fatal", err);
    try {
      await admin.from("email_logs").insert({
        mail_type: "daily_business_report",
        status: "failed",
        recipients: [],
        subject: "Tagesreport Reller Automobile",
        error_message: (err as Error).message,
        metadata: { fatal: true, warnings },
      });
    } catch (_e) { /* ignore */ }
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
