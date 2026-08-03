// Einmalige Bestandsübernahme: liest alle aktiven Mobile.de-Inserate (Seller-API)
// und übernimmt sie als vehicles-Zeilen. Zweistufig: dryRun → apply. Admin-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { basicAuth, fetchSellerAds, SellerAd } from "../_shared/mobile-reconcile.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SELLER_ID = "451040";
const MOBILE_USER =
  Deno.env.get("MOBILE_DE_SELLER_USERNAME") || Deno.env.get("MOBILE_DE_USERNAME") || "";
const MOBILE_PASS =
  Deno.env.get("MOBILE_DE_SELLER_PASSWORD") || Deno.env.get("MOBILE_DE_PASSWORD") || "";

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

function adToVehicle(ad: SellerAd): Row {
  const r = ad.raw;
  const firstReg = String(r.firstRegistration ?? "");
  const price = (r.price ?? {}) as Row;
  return {
    mobile_de_id: ad.mobileAdId,
    mobile_ad_id: ad.mobileAdId,
    source: "adopted",
    publish_status: "published",
    published_at: new Date().toISOString(),
    title: ad.title,
    brand: str(r.make),
    model: str(r.model),
    model_description: str(r.modelDescription),
    category: str(r.category),
    vehicle_category: str(r.category),
    body_type: str(r.category),
    year: firstReg.length >= 4 ? firstReg.slice(0, 4) : null,
    mileage: int(r.mileage),
    price: int(price.consumerPriceGross ?? price.consumerValue),
    currency: "EUR",
    power: int(r.power),
    cubic_capacity: int(r.cubicCapacity),
    fuel: str(r.fuel),
    gearbox: str(r.gearbox),
    condition: str(r.condition),
    num_seats: int(r.seats),
    exterior_color: str(r.exteriorColor),
    damage_unrepaired: r.damageUnrepaired === true,
    description: typeof r.description === "string" ? r.description : null,
    detail_page_url: ad.detailPageUrl,
    image_urls: Array.isArray(r.images)
      ? (r.images as Row[])
          .map((i) => str(i.xxxl ?? i.xxl ?? i.l ?? i.ref))
          .filter((x): x is string => !!x)
      : [],
    mobile_payload: r as never,
    is_sold: false,
    synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) return json(401, { error: "Unauthorized" });
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", claims.claims.sub as string).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { error: "Forbidden" });

    if (!MOBILE_USER || !MOBILE_PASS) return json(500, { error: "Mobile.de Seller-API Zugangsdaten fehlen" });

    let dryRun = true;
    try {
      const body = await req.json();
      dryRun = body?.dryRun !== false;
    } catch { /* default dry run */ }

    const { ads, error } = await fetchSellerAds(SELLER_ID, basicAuth(MOBILE_USER, MOBILE_PASS));
    if (error && ads.length === 0) return json(502, { error });

    const { data: rows } = await admin
      .from("vehicles")
      .select("id, mobile_ad_id, mobile_de_id, detail_page_url, title");
    const vehicles = (rows ?? []) as Row[];

    const byAdId = new Map<string, Row>();
    const byMobileDeId = new Map<string, Row>();
    const byUrl = new Map<string, Row>();
    for (const v of vehicles) {
      if (v.mobile_ad_id) byAdId.set(String(v.mobile_ad_id), v);
      if (v.mobile_de_id) byMobileDeId.set(String(v.mobile_de_id), v);
      if (v.detail_page_url) byUrl.set(String(v.detail_page_url).split("?")[0], v);
    }

    const toCreate: SellerAd[] = [];
    const toMatch: { vehicleId: string; ad: SellerAd; via: string }[] = [];
    const alreadyLinked: string[] = [];

    for (const ad of ads) {
      if (byAdId.has(ad.mobileAdId)) { alreadyLinked.push(ad.mobileAdId); continue; }
      const viaUrl = ad.detailPageUrl ? byUrl.get(ad.detailPageUrl.split("?")[0]) : undefined;
      const viaId = byMobileDeId.get(ad.mobileAdId);
      const hit = viaId ?? viaUrl;
      if (hit) {
        toMatch.push({ vehicleId: hit.id as string, ad, via: viaId ? "mobile_de_id" : "detail_page_url" });
      } else {
        toCreate.push(ad);
      }
    }

    const preview = {
      totalAds: ads.length,
      alreadyLinked: alreadyLinked.length,
      willCreate: toCreate.length,
      willMatch: toMatch.length,
      unclear: 0,
      createSamples: toCreate.slice(0, 20).map((a) => ({ mobileAdId: a.mobileAdId, title: a.title, price: a.price })),
      matchSamples: toMatch.slice(0, 20).map((m) => ({ mobileAdId: m.ad.mobileAdId, title: m.ad.title, via: m.via })),
      partialFetchError: error ?? null,
    };

    if (dryRun) return json(200, { ok: true, dryRun: true, ...preview });

    let created = 0;
    let matched = 0;
    const failures: string[] = [];

    for (const m of toMatch) {
      const { error: uErr } = await admin.from("vehicles").update({
        mobile_ad_id: m.ad.mobileAdId,
        publish_status: "published",
        detail_page_url: m.ad.detailPageUrl,
      } as never).eq("id", m.vehicleId);
      if (uErr) failures.push(`${m.ad.mobileAdId}: ${uErr.message}`);
      else matched++;
    }

    for (const ad of toCreate) {
      const { error: iErr } = await admin.from("vehicles").insert(adToVehicle(ad) as never);
      if (iErr) failures.push(`${ad.mobileAdId}: ${iErr.message}`);
      else created++;
    }

    console.log(`adopt-mobile-ads applied: created=${created} matched=${matched} failures=${failures.length}`);
    return json(200, { ok: true, dryRun: false, ...preview, created, matched, failures });
  } catch (err) {
    console.error("adopt-mobile-ads fatal:", err);
    return json(500, { error: String((err as Error).message || err) });
  }
});
