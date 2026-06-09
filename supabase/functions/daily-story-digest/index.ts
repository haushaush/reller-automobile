// Daily Story Digest: generates story images for all vehicles added in the
// last 24h and sends a single digest email to the configured story recipients.
//
// Runs hourly via pg_cron. The function checks app_settings on each tick:
//   - daily_digest_enabled (jsonb boolean): on/off switch
//   - daily_digest_hour    (jsonb number):  target send hour in Europe/Berlin
//   - daily_digest_last_sent (jsonb string YYYY-MM-DD): idempotency marker
// Only when the current Berlin hour matches and we haven't sent today, it runs.
// Query param ?force=true bypasses the hour + idempotency checks (for manual tests).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import React from "npm:react@18.3.1";
import {
  Document,
  Page,
  Text,
  View,
  Image as PdfImage,
  StyleSheet,
  renderToBuffer,
} from "npm:@react-pdf/renderer@3.4.4";

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

const EXPOSE_BUCKET = "vehicle-exposes";
const EXPOSE_SIGNED_TTL = 60 * 60 * 24 * 7; // 7 days

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

// ─── Minimal server-side Exposé PDF (mirrors VehicleExpose key fields) ──────
const pdfStyles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#222" },
  header: { marginBottom: 20, borderBottom: "2px solid #c0392b", paddingBottom: 12 },
  companyName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#c0392b", marginBottom: 2 },
  companyInfo: { fontSize: 8, color: "#666", lineHeight: 1.5 },
  mainImage: { width: "100%", height: 260, objectFit: "cover", borderRadius: 6, marginBottom: 16 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  price: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#c0392b", marginBottom: 16 },
  tableRow: { flexDirection: "row", borderBottom: "1px solid #eee", paddingVertical: 5 },
  tableLabel: { width: "40%", fontFamily: "Helvetica-Bold", fontSize: 9, color: "#555" },
  tableValue: { width: "60%", fontSize: 9 },
  sectionTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 8, marginTop: 16 },
  description: { fontSize: 9, lineHeight: 1.6, color: "#444", marginTop: 12 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, borderTop: "1px solid #ddd", paddingTop: 8, fontSize: 7, color: "#999", textAlign: "center" },
});

function buildExposeDoc(v: Record<string, any>) {
  const h = React.createElement;
  const mainImage = Array.isArray(v.image_urls) ? v.image_urls[0] : null;
  const ps = v.power ? Math.round(Number(v.power) * 1.36) : null;
  const formattedPrice = v.price
    ? `${Number(v.price).toLocaleString("de-DE")} ${v.currency || "€"}`
    : null;
  const today = new Date().toLocaleDateString("de-DE");

  const specs: Array<[string, string]> = [
    ["Baujahr", String(v.year ?? "–")],
    ["Kilometerstand", v.mileage ? `${Number(v.mileage).toLocaleString("de-DE")} km` : "–"],
    ["Leistung", v.power ? `${v.power} kW${ps ? ` (${ps} PS)` : ""}` : "–"],
    ["Kraftstoff", v.fuel ?? "–"],
    ["Getriebe", v.gearbox ?? "–"],
    ["Erstzulassung", v.first_registration ?? "–"],
    ["Hubraum", v.cubic_capacity ? `${v.cubic_capacity} ccm` : "–"],
    ["Farbe", v.exterior_color ?? "–"],
  ];

  const row = (label: string, value: string, key: number) =>
    h(View, { key, style: pdfStyles.tableRow },
      h(Text, { style: pdfStyles.tableLabel }, label),
      h(Text, { style: pdfStyles.tableValue }, value),
    );

  return h(Document, {},
    h(Page, { size: "A4", style: pdfStyles.page },
      h(View, { style: pdfStyles.header },
        h(Text, { style: pdfStyles.companyName }, "Reller Automobile GmbH"),
        h(Text, { style: pdfStyles.companyInfo },
          "Hauptstraße 1 · 12345 Musterstadt · Tel: +49 (0)123 456789 · info@reller-automobile.de"),
      ),
      mainImage ? h(PdfImage, { src: mainImage, style: pdfStyles.mainImage }) : null,
      h(Text, { style: pdfStyles.title }, v.title || "Fahrzeug"),
      formattedPrice ? h(Text, { style: pdfStyles.price }, formattedPrice) : null,
      h(Text, { style: pdfStyles.sectionTitle }, "Technische Daten"),
      ...specs.map(([l, val], i) => row(l, val, i)),
      v.description ? h(Text, { style: pdfStyles.description }, String(v.description).slice(0, 1500)) : null,
      h(Text, { style: pdfStyles.footer },
        `Exposé erstellt am ${today} · Reller Automobile GmbH · Angaben ohne Gewähr`),
    ),
  );
}

async function ensureExposeForVehicle(
  admin: ReturnType<typeof createClient>,
  vehicleId: string,
): Promise<string | null> {
  // 1. Reuse existing if present
  const { data: existing } = await admin
    .from("vehicle_exposes")
    .select("pdf_url")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  let path = (existing as { pdf_url?: string } | null)?.pdf_url;

  if (!path) {
    // 2. Generate fresh PDF
    const { data: full, error: vErr } = await admin
      .from("vehicles").select("*").eq("id", vehicleId).maybeSingle();
    if (vErr || !full) {
      console.error(`expose: vehicle ${vehicleId} fetch failed`, vErr);
      return null;
    }
    const buffer = await renderToBuffer(buildExposeDoc(full as Record<string, any>));
    path = `exposes/${vehicleId}.pdf`;
    const { error: upErr } = await admin.storage
      .from(EXPOSE_BUCKET)
      .upload(path, buffer, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      console.error(`expose: upload failed for ${vehicleId}`, upErr);
      return null;
    }
    const { error: dbErr } = await admin.from("vehicle_exposes").upsert(
      { vehicle_id: vehicleId, pdf_url: path, updated_at: new Date().toISOString() },
      { onConflict: "vehicle_id" },
    );
    if (dbErr) {
      console.error(`expose: db upsert failed for ${vehicleId}`, dbErr);
      // continue — signed URL will still work
    }
  }

  // 3. Signed URL (7 days)
  const { data: signed, error: signErr } = await admin.storage
    .from(EXPOSE_BUCKET)
    .createSignedUrl(path, EXPOSE_SIGNED_TTL);
  if (signErr || !signed) {
    console.error(`expose: signed URL failed for ${vehicleId}`, signErr);
    return null;
  }
  return signed.signedUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Auth: accept service-role (cron) OR an authenticated admin user (manual test).
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
    console.error("daily-story-digest: auth check failed", err);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const enabled = await loadSetting<boolean>(admin, ENABLED_KEY);
    if (!force && enabled !== true) {
      console.log("daily-story-digest: disabled, skipping");
      return new Response(JSON.stringify({ skipped: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hourSetting = (await loadSetting<number>(admin, HOUR_KEY)) ?? 7;
    const { date: berlinDate, hour: berlinHour } = berlinNowParts();

    if (!force && berlinHour !== hourSetting) {
      console.log(`daily-story-digest: hour mismatch (now=${berlinHour}, target=${hourSetting})`);
      return new Response(JSON.stringify({ skipped: "wrong_hour", berlinHour, target: hourSetting }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastSent = await loadSetting<string>(admin, LAST_SENT_KEY);
    if (!force && lastSent === berlinDate) {
      console.log(`daily-story-digest: already sent today (${berlinDate})`);
      return new Response(JSON.stringify({ skipped: "already_sent_today", date: berlinDate }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: vehicles, error: vehErr } = await admin
      .from("vehicles")
      .select("id, created_at")
      .gte("created_at", since)
      .eq("is_sold", false);

    if (vehErr) {
      console.error("daily-story-digest: vehicles query failed", vehErr);
      return new Response(JSON.stringify({ error: vehErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vehicleIds = (vehicles ?? []).map((v) => v.id);
    console.log(`daily-story-digest: found ${vehicleIds.length} new vehicles since ${since}`);

    if (vehicleIds.length === 0) {
      if (!force) {
        await admin.from("app_settings").upsert(
          { key: LAST_SENT_KEY, value: berlinDate, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      }
      return new Response(JSON.stringify({ sent: 0, reason: "no_new_vehicles", date: berlinDate }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate story images via generate-story (service-role bypass; skip per-vehicle email).
    const adminWithAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    });
    const { data: genData, error: genErr } = await adminWithAuth.functions.invoke("generate-story", {
      body: { vehicleIds, skipDealerEmail: true },
    });
    if (genErr) {
      console.error("daily-story-digest: generate-story failed", genErr);
      return new Response(JSON.stringify({ error: "generate-story failed", details: String(genErr) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const storyIds: string[] = Array.isArray(genData?.storyIds) ? genData.storyIds : [];
    console.log(`daily-story-digest: generated ${storyIds.length} stories`);

    if (storyIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_stories_generated" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure exposé PDF + signed URL for each vehicle. Failure per vehicle = skip its link.
    const exposeUrls: Record<string, string> = {};
    await Promise.all(vehicleIds.map(async (vid) => {
      try {
        const link = await ensureExposeForVehicle(admin, vid);
        if (link) exposeUrls[vid] = link;
      } catch (err) {
        console.error(`daily-story-digest: expose generation failed for ${vid}`, err);
      }
    }));
    console.log(`daily-story-digest: prepared ${Object.keys(exposeUrls).length}/${vehicleIds.length} expose links`);

    const { data: sendData, error: sendErr } = await adminWithAuth.functions.invoke("send-stories-email", {
      body: {
        storyIds,
        note: "Neue Fahrzeuge der letzten 24 Stunden",
        exposeUrls,
      },
    });
    if (sendErr) {
      console.error("daily-story-digest: send-stories-email failed", sendErr);
      return new Response(JSON.stringify({ error: "send-stories-email failed", details: String(sendErr) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!force) {
      await admin.from("app_settings").upsert(
        { key: LAST_SENT_KEY, value: berlinDate, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    }

    console.log(`daily-story-digest: done`, sendData);
    return new Response(JSON.stringify({
      sent: storyIds.length,
      date: berlinDate,
      exposeLinks: Object.keys(exposeUrls).length,
      sendResult: sendData,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("daily-story-digest: fatal", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
