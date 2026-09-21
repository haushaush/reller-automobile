// Vollständiger Datenabgleich über die Mobile.de-Search-API:
// holt alle Inserate des Händlers und aktualisiert die zugeordneten Fahrzeuge
// (Bilder, Beschreibung, Kilometer, Preis, technische Daten).
// Manuelle Überschreibungen (manual_overrides) bleiben unangetastet.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { adSlug, basicAuth, fetchSearchAds, SellerAd } from "../_shared/mobile-reconcile.ts";
import { deriveCategory, normalizeField, stripManualOverrides } from "../_shared/mobile-de-normalize.ts";

const SEARCH_USER = Deno.env.get("MOBILE_DE_SEARCH_USERNAME") || "";
const SEARCH_PASS = Deno.env.get("MOBILE_DE_SEARCH_PASSWORD") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object" && typeof (v as { key?: string }).key === "string") return (v as { key: string }).key;
  return String(v);
}
function int(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}
const bare = (v: unknown) => String(v ?? "").replace(/^[a-z_]+_/, "");
const urlNumberOf = (url: string | null | undefined) =>
  url ? url.split("?")[0].match(/(\d{6,})\.html$/)?.[1] ?? null : null;

/** Bildliste aus dem Inserat in höchstmöglicher Auflösung. */
function imagesOf(raw: Row): string[] {
  if (!Array.isArray(raw.images)) return [];
  return (raw.images as Row[])
    .map((i) => str(i.xxxl ?? i.xxl ?? i.xl ?? i.l ?? i.ref))
    .filter((x): x is string => !!x);
}

function adToPatch(ad: SellerAd): Row {
  const r = ad.raw as Row;
  const firstReg = String(r.firstRegistration ?? "");
  const year = firstReg.length >= 4 ? firstReg.slice(0, 4) : null;
  const price = (r.price ?? {}) as Row;
  const bodyType = normalizeField("body_type", str(r.category));
  const fuel = normalizeField("fuel", str(r.fuel));
  const gearbox = normalizeField("gearbox", str(r.gearbox));
  const condition = normalizeField("condition", str(r.condition));
  const usageType = normalizeField("usage_type", str(r.usageType));
  const climatisation = normalizeField("climatisation", str(r.climatisation));
  const interiorType = normalizeField("interior_type", str(r.interiorType));
  const exteriorColor = normalizeField("exterior_color", str(r.exteriorColor));
  const damageUnrepaired = r.damageUnrepaired === true;
  const description =
    (typeof r.plainTextDescription === "string" && r.plainTextDescription.trim()) ||
    (typeof r.description === "string" && r.description.trim()) ||
    null;
  const images = imagesOf(r);

  const patch: Row = {
    title: ad.title,
    brand: str(r.make),
    model: str(r.model),
    model_description: str(r.modelDescription),
    category: bodyType.label ?? str(r.category),
    body_type: bodyType.label ?? str(r.category),
    body_type_key: bodyType.key,
    body_type_label: bodyType.label,
    vehicle_category: deriveCategory({
      bodyTypeKey: bodyType.key,
      conditionKey: condition.key,
      conditionLabel: condition.label,
      usageTypeKey: usageType.key,
      usageTypeLabel: usageType.label,
      damageUnrepaired,
      year,
      isAccidentSync: false,
    }),
    year,
    mileage: int(r.mileage),
    price: int(price.consumerPriceGross ?? price.consumerValue),
    currency: "EUR",
    power: int(r.power),
    cubic_capacity: int(r.cubicCapacity),
    num_seats: int(r.seats),
    fuel: fuel.label,
    fuel_key: fuel.key,
    fuel_label: fuel.label,
    gearbox: gearbox.label,
    gearbox_key: gearbox.key,
    gearbox_label: gearbox.label,
    condition: condition.label,
    condition_key: condition.key,
    condition_label: condition.label,
    usage_type: usageType.label,
    usage_type_key: usageType.key,
    usage_type_label: usageType.label,
    climatisation: climatisation.label,
    climatisation_key: climatisation.key,
    climatisation_label: climatisation.label,
    interior_type: interiorType.label,
    interior_type_key: interiorType.key,
    interior_type_label: interiorType.label,
    interior_color: str(r.interiorColor),
    exterior_color: exteriorColor.label,
    exterior_color_key: exteriorColor.key,
    exterior_color_label: exteriorColor.label,
    damage_unrepaired: damageUnrepaired,
    detail_page_url: ad.detailPageUrl,
    creation_date: ad.creationDate,
    modification_date: ad.modificationDate,
    mobile_payload: r as never,
    synced_at: new Date().toISOString(),
  };
  if (description) patch.description = description;
  if (images.length > 0) patch.image_urls = images;
  return patch;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsError || !claims?.claims?.sub) return json(401, { error: "Unauthorized" });
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", claims.claims.sub as string).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { error: "Forbidden" });

    let dryRun = true;
    let sellerId = "451040";
    try {
      const body = await req.json();
      dryRun = body?.dryRun !== false;
      if (body?.sellerId) sellerId = String(body.sellerId);
    } catch { /* Standard: Probelauf */ }

    if (!SEARCH_USER || !SEARCH_PASS) return json(500, { error: "Such-Zugangsdaten fehlen" });

    const { ads, error } = await fetchSearchAds(sellerId, basicAuth(SEARCH_USER, SEARCH_PASS));
    if (error && ads.length === 0) return json(502, { error });

    const { data: rows } = await admin
      .from("vehicles")
      .select("id, title, mobile_ad_id, mobile_de_id, detail_page_url, manual_overrides")
      .eq("is_test", false);
    const vehicles = (rows ?? []) as Row[];

    const byAdId = new Map<string, Row>();
    const byMobileDeId = new Map<string, Row>();
    const byUrl = new Map<string, Row>();
    const bySlug = new Map<string, Row>();
    for (const v of vehicles) {
      if (v.mobile_ad_id) byAdId.set(bare(v.mobile_ad_id), v);
      if (v.mobile_de_id) byMobileDeId.set(bare(v.mobile_de_id), v);
      if (v.detail_page_url) {
        const u = String(v.detail_page_url).split("?")[0];
        byUrl.set(u, v);
        const slug = adSlug(v.detail_page_url);
        if (slug && !bySlug.has(slug)) bySlug.set(slug, v);
      }
    }

    const matches: { vehicle: Row; ad: SellerAd }[] = [];
    const unmatched: string[] = [];
    const seenVehicles = new Set<string>();
    for (const ad of ads) {
      const key = bare(ad.mobileAdId);
      const u = ad.detailPageUrl ? ad.detailPageUrl.split("?")[0] : null;
      const n = urlNumberOf(u);
      const v =
        byAdId.get(key) ??
        byMobileDeId.get(key) ??
        (u ? byUrl.get(u) : undefined) ??
        (n ? byMobileDeId.get(n) ?? byAdId.get(n) : undefined) ??
        (u ? bySlug.get(adSlug(u) ?? "") : undefined);
      if (!v) { unmatched.push(`${ad.mobileAdId} – ${ad.title}`); continue; }
      if (seenVehicles.has(String(v.id))) continue; // Inserat doppelt bei Mobile.de
      seenVehicles.add(String(v.id));
      matches.push({ vehicle: v, ad });
    }

    if (dryRun) {
      return json(200, {
        ok: true, dryRun: true, totalAds: ads.length,
        willUpdate: matches.length, unmatched: unmatched.length,
        unmatchedSamples: unmatched.slice(0, 20),
        sample: matches[0] ? { title: matches[0].ad.title, patch: adToPatch(matches[0].ad) } : null,
        partialFetchError: error ?? null,
      });
    }

    let updated = 0;
    const skippedFields = new Set<string>();
    const failures: string[] = [];
    for (const m of matches) {
      const full = adToPatch(m.ad);
      const patch = stripManualOverrides(full, m.vehicle.manual_overrides);
      for (const f of Object.keys(full)) if (!(f in patch)) skippedFields.add(f);
      const { error: uErr } = await admin.from("vehicles").update(patch as never).eq("id", m.vehicle.id as string);
      if (uErr) failures.push(`${m.ad.mobileAdId}: ${uErr.message}`);
      else updated++;
    }

    console.log(`refresh-from-search: ${updated}/${matches.length} aktualisiert, ${unmatched.length} ohne Zuordnung`);
    return json(200, {
      ok: true, dryRun: false, totalAds: ads.length, updated,
      unmatched: unmatched.length, unmatchedSamples: unmatched.slice(0, 20),
      keptManualFields: [...skippedFields], failures,
    });
  } catch (err) {
    console.error("refresh-from-search fatal:", err);
    return json(500, { error: String((err as Error).message || err) });
  }
});
