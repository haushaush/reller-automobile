// Gemeinsame Abgleich-Logik: Portal (vehicles) ist führend, Mobile.de wird nur
// noch verglichen. Es werden KEINE Fahrzeuge mehr angelegt oder überschrieben.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const MOBILE_MIME = "application/vnd.de.mobile.api+json";
export const API_BASE = "https://services.mobile.de/seller-api";

export interface SellerAd {
  mobileAdId: string;
  price: number | null;
  mileage: number | null;
  detailPageUrl: string | null;
  title: string;
  raw: Record<string, unknown>;
}

export interface SellerAdsResult {
  ads: SellerAd[];
  pages: number;
  error?: string;
  rootKeys: string[];
}

export function basicAuth(user: string, pass: string) {
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeAd(raw: Record<string, unknown>): SellerAd | null {
  const id = raw.mobileAdId ?? raw.id ?? raw.adId;
  if (id === undefined || id === null) return null;
  const priceObj = (raw.price ?? {}) as Record<string, unknown>;
  return {
    mobileAdId: String(id),
    price: toNum(priceObj.consumerPriceGross ?? priceObj.consumerValue ?? raw.price),
    mileage: toNum(raw.mileage),
    detailPageUrl: (raw.detailPageUrl as string) ?? null,
    title: [raw.make, raw.model, raw.modelDescription].filter(Boolean).join(" ") || String(id),
    raw,
  };
}

/** Liest alle eigenen Inserate über die Seller-API (paginiert). */
export async function fetchSellerAds(
  sellerId: string,
  auth: string,
): Promise<SellerAdsResult> {
  const ads: SellerAd[] = [];
  let page = 1;
  const pageSize = 100;
  const maxPages = 50;
  const startedAt = Date.now();
  let rootKeys: string[] = [];
  while (page <= maxPages) {
    if (Date.now() - startedAt >= 90_000) {
      return { ads, pages: page - 1, rootKeys, error: "Gesamtbudget der Seller-API-Pagination (90 Sekunden) überschritten" };
    }
    const url = `${API_BASE}/sellers/${sellerId}/ads?page.size=${pageSize}&page.number=${page}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: auth, Accept: MOBILE_MIME },
        signal: AbortSignal.timeout(Math.min(20_000, 90_000 - (Date.now() - startedAt))),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ads, pages: page - 1, rootKeys, error: `Seller-API Timeout/Netzwerkfehler auf Seite ${page}: ${message}` };
    }
    const text = await res.text();
    if (!res.ok) {
      return { ads, pages: page - 1, rootKeys, error: `Seller-API ${res.status}: ${text.slice(0, 300)}` };
    }
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { return { ads, pages: page - 1, rootKeys, error: "Ungültige Seller-API-Antwort" }; }
    if (page === 1) {
      rootKeys = Object.keys(json);
      console.log(`Seller-API first response root keys: ${rootKeys.join(", ") || "(none)"}`);
    }
    const embedded = json._embedded as Record<string, unknown> | undefined;
    const searchResult = json.searchResult as Record<string, unknown> | unknown[] | undefined;
    const list = (
      json.ads ??
      json.items ??
      (Array.isArray(searchResult) ? searchResult : searchResult?.ads ?? searchResult?.items) ??
      embedded?.ads ??
      embedded?.items ??
      []
    ) as unknown[];
    const arr = Array.isArray(list) ? list : [];
    for (const item of arr) {
      const ad = normalizeAd(item as Record<string, unknown>);
      if (ad) ads.push(ad);
    }
    if (arr.length < pageSize) return { ads, pages: page, rootKeys };
    page++;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { ads, pages: maxPages, rootKeys, error: "Maximale Seitenzahl der Seller-API erreicht" };
}

export interface ReconcileResult {
  checked: number;
  orphanAds: number;
  missingAds: number;
  driftAds: number;
  issues: number;
}

/** Vergleicht Seller-Ads gegen vehicles und schreibt Abweichungen. */
export async function reconcile(
  supabase: SupabaseClient,
  ads: SellerAd[],
  scope: string,
  allowUnpublish = true,
): Promise<ReconcileResult> {
  const { data: rows } = await supabase
    .from("vehicles")
    .select("id, mobile_ad_id, mobile_de_id, detail_page_url, price, mileage, publish_status, is_sold");
  const vehicles = (rows ?? []) as Array<Record<string, unknown>>;

  const byAdId = new Map<string, Record<string, unknown>>();
  for (const v of vehicles) {
    if (v.mobile_ad_id) byAdId.set(String(v.mobile_ad_id), v);
  }

  const issues: Array<Record<string, unknown>> = [];
  const liveIds = new Set<string>();

  for (const ad of ads) {
    liveIds.add(ad.mobileAdId);
    const v = byAdId.get(ad.mobileAdId);
    if (!v) {
      issues.push({
        vehicle_id: null, mobile_ad_id: ad.mobileAdId, scope,
        issue_type: "orphan_ad", severity: "warning",
        detail: `Inserat "${ad.title}" existiert bei Mobile.de, hat aber kein Fahrzeug im Portal.`,
      });
      continue;
    }
    const priceLocal = typeof v.price === "number" ? v.price : null;
    if (ad.price !== null && priceLocal !== null && Math.abs(ad.price - priceLocal) >= 1) {
      issues.push({
        vehicle_id: v.id, mobile_ad_id: ad.mobileAdId, scope,
        issue_type: "price_drift", severity: "warning",
        detail: `Preis weicht ab: Portal ${priceLocal} € / Mobile.de ${ad.price} €.`,
      });
    }
    const mileageLocal = typeof v.mileage === "number" ? v.mileage : null;
    if (ad.mileage !== null && mileageLocal !== null && Math.abs(ad.mileage - mileageLocal) >= 1) {
      issues.push({
        vehicle_id: v.id, mobile_ad_id: ad.mobileAdId, scope,
        issue_type: "mileage_drift", severity: "warning",
        detail: `Kilometerstand weicht ab: Portal ${mileageLocal} km / Mobile.de ${ad.mileage} km.`,
      });
    }
  }

  // Portal sagt "published", Mobile.de kennt das Inserat nicht mehr
  const vanished = vehicles.filter(
    (v) => v.publish_status === "published" && v.mobile_ad_id && !liveIds.has(String(v.mobile_ad_id)),
  );
  for (const v of vanished) {
    issues.push({
      vehicle_id: v.id, mobile_ad_id: String(v.mobile_ad_id), scope,
      issue_type: "ad_missing", severity: "error",
        detail: allowUnpublish
          ? "Inserat ist bei Mobile.de nicht mehr auffindbar – Status auf „zurückgezogen“ gesetzt."
          : "Inserat ist bei Mobile.de nicht mehr auffindbar – Statusänderung wegen ungewöhnlich kleiner Ergebnismenge übersprungen.",
    });
  }
  if (allowUnpublish && vanished.length) {
    await supabase
      .from("vehicles")
      .update({ publish_status: "unpublished" })
      .in("id", vanished.map((v) => v.id as string));
  }

  // Alte offene Meldungen dieses Scopes schließen und neu schreiben
  await supabase
    .from("mobile_reconciliation_issues")
    .update({ resolved_at: new Date().toISOString() })
    .eq("scope", scope)
    .is("resolved_at", null);

  if (issues.length) {
    await supabase.from("mobile_reconciliation_issues").insert(issues);
  }

  return {
    checked: ads.length,
    orphanAds: issues.filter((i) => i.issue_type === "orphan_ad").length,
    missingAds: vanished.length,
    driftAds: issues.filter((i) => String(i.issue_type).endsWith("_drift")).length,
    issues: issues.length,
  };
}

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
