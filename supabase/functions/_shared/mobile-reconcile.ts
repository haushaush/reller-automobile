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
  reserved: boolean | null;
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
    reserved: typeof raw.reserved === "boolean"
      ? raw.reserved
      : (raw.reserved === "true" ? true : raw.reserved === "false" ? false : null),
    title: [raw.make, raw.model, raw.modelDescription].filter(Boolean).join(" ") || String(id),
    raw,
  };
}

function pickPaginationInfo(json: Record<string, unknown>): Record<string, unknown> {
  const info: Record<string, unknown> = {};
  const interesting = /total|page|size|count|num|links|next|last/i;
  for (const [k, v] of Object.entries(json)) {
    if (!interesting.test(k)) continue;
    if (v === null || typeof v !== "object") info[k] = v;
    else if (Array.isArray(v)) info[k] = `array(${v.length})`;
    else info[k] = Object.keys(v as Record<string, unknown>);
  }
  const links = json._links as Record<string, unknown> | undefined;
  if (links) info["_links.keys"] = Object.keys(links);
  return info;
}

function nextHref(json: Record<string, unknown>): string | null {
  const links = json._links as Record<string, unknown> | undefined;
  const next = links?.next as Record<string, unknown> | string | undefined;
  if (!next) return null;
  const href = typeof next === "string" ? next : (next.href as string | undefined);
  return href ?? null;
}

/** Liest alle eigenen Inserate über die Seller-API (paginiert, mit Stillstands-Schutz). */
export async function fetchSellerAds(
  sellerId: string,
  auth: string,
): Promise<SellerAdsResult> {
  const ads: SellerAd[] = [];
  const seen = new Set<string>();
  let page = 1;
  const pageSize = 100;
  const maxPages = 50;
  const startedAt = Date.now();
  let rootKeys: string[] = [];
  let url: string | null =
    `${API_BASE}/sellers/${sellerId}/ads?page.size=${pageSize}&page.number=${page}`;

  while (url && page <= maxPages) {
    if (Date.now() - startedAt >= 90_000) {
      return { ads, pages: page - 1, rootKeys, error: "Gesamtbudget der Seller-API-Pagination (90 Sekunden) überschritten" };
    }
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
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("json")) {
      return {
        ads,
        pages: page - 1,
        rootKeys,
        error: `Unerwarteter Seller-API Content-Type auf Seite ${page}: ${contentType || "unbekannt"}`,
      };
    }
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { return { ads, pages: page - 1, rootKeys, error: "Ungültige Seller-API-Antwort" }; }
    if (page === 1) {
      rootKeys = Object.keys(json);
      console.log(`Seller-API first response root keys: ${rootKeys.join(", ") || "(none)"}`);
      console.log(`Seller-API pagination fields: ${JSON.stringify(pickPaginationInfo(json))}`);
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

    let fresh = 0;
    for (const item of arr) {
      const ad = normalizeAd(item as Record<string, unknown>);
      if (!ad || seen.has(ad.mobileAdId)) continue;
      seen.add(ad.mobileAdId);
      ads.push(ad);
      fresh++;
    }
    console.log(`Seller-API Seite ${page}: ${arr.length} Einträge, davon ${fresh} neu (gesamt ${ads.length})`);

    // Stillstands-Schutz: Seite enthält ausschließlich bereits bekannte Inserate
    if (page > 1 && arr.length > 0 && fresh === 0) {
      return {
        ads,
        pages: page,
        rootKeys,
        error: "Pagination liefert wiederholt dieselben Inserate",
      };
    }

    const next = nextHref(json);
    const hasPaginationHint = Object.keys(pickPaginationInfo(json)).length > 0;
    if (next) {
      url = next.startsWith("http") ? next : `https://services.mobile.de${next.startsWith("/") ? "" : "/"}${next}`;
    } else if (arr.length === 0 || !hasPaginationHint) {
      // Antwort enthält weder Folge-Link noch Paginierungsangaben: vollständige Liste.
      return { ads, pages: page, rootKeys };
    } else {
      url = `${API_BASE}/sellers/${sellerId}/ads?page.size=${pageSize}&page.number=${page + 1}`;
    }

    page++;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { ads, pages: Math.min(page - 1, maxPages), rootKeys, error: "Maximale Seitenzahl der Seller-API erreicht" };
}

export const SEARCH_API_BASE = "https://services.mobile.de/search-api";

/**
 * Liest die öffentlich sichtbaren Inserate eines Händlers über die Search-API.
 * Fallback, wenn die Seller-API keine Zugangsdaten akzeptiert (401/403).
 * Achtung: Suchindex ist verzögert und kennt keine pausierten/beendeten Inserate.
 */
export async function fetchSearchAds(
  sellerId: string,
  auth: string,
): Promise<SellerAdsResult> {
  const ads: SellerAd[] = [];
  const seen = new Set<string>();
  const pageSize = 100;
  const maxPages = 50;
  const startedAt = Date.now();
  let rootKeys: string[] = [];
  let page = 1;
  let knownMaxPages = 1;

  while (page <= maxPages) {
    if (Date.now() - startedAt >= 90_000) {
      return { ads, pages: page - 1, rootKeys, error: "Gesamtbudget der Search-API-Pagination (90 Sekunden) überschritten" };
    }
    const url = `${SEARCH_API_BASE}/search?customerId=${sellerId}&page.size=${pageSize}&page.number=${page}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: auth, Accept: MOBILE_MIME },
        signal: AbortSignal.timeout(Math.min(20_000, 90_000 - (Date.now() - startedAt))),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ads, pages: page - 1, rootKeys, error: `Search-API Timeout/Netzwerkfehler auf Seite ${page}: ${message}` };
    }
    const text = await res.text();
    if (!res.ok) {
      return { ads, pages: page - 1, rootKeys, error: `Search-API ${res.status}: ${text.slice(0, 300)}` };
    }
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { return { ads, pages: page - 1, rootKeys, error: "Ungültige Search-API-Antwort" }; }
    if (page === 1) {
      rootKeys = Object.keys(json);
      console.log(`Search-API: total=${json.total} maxPages=${json.maxPages} pageSize=${json.pageSize}`);
    }
    const mp = toNum(json.maxPages);
    if (mp && mp > 0) knownMaxPages = mp;
    const arr = Array.isArray(json.ads) ? (json.ads as unknown[]) : [];
    let fresh = 0;
    for (const item of arr) {
      const ad = normalizeAd(item as Record<string, unknown>);
      if (!ad || seen.has(ad.mobileAdId)) continue;
      seen.add(ad.mobileAdId);
      ads.push(ad);
      fresh++;
    }
    console.log(`Search-API Seite ${page}/${knownMaxPages}: ${arr.length} Einträge, davon ${fresh} neu (gesamt ${ads.length})`);
    if (arr.length === 0) return { ads, pages: page, rootKeys };
    if (page > 1 && fresh === 0) {
      return { ads, pages: page, rootKeys, error: "Pagination liefert wiederholt dieselben Inserate" };
    }
    if (page >= knownMaxPages) return { ads, pages: page, rootKeys };
    page++;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { ads, pages: Math.min(page - 1, maxPages), rootKeys, error: "Maximale Seitenzahl der Search-API erreicht" };
}



export interface ReconcileResult {
  checked: number;
  listingsInScope: number;
  matched: number;
  unmatched: number;
  accountMismatch: number;
  orphanAds: number;
  missingAds: number;
  driftAds: number;
  soldButListed: number;
  issues: number;
  pricesAdopted?: number;
}

export interface ReconcileOptions {
  /** account_key des Kontos, dessen Inserate gelesen wurden (z. B. "standard" / "unfall"). */
  accountKey: string;
  /** Fahrzeuge ohne eigenes mobile_de-Listing diesem Konto zurechnen (Altbestand). */
  claimLegacyVehicles?: boolean;
  allowUnpublish?: boolean;
  /**
   * Vollständige Inseratsliste gelesen? Dann wird pro Fahrzeug festgehalten, ob es
   * aktuell bei Mobile.de gefunden wurde (mobile_live_at / mobile_missing_since).
   * Die öffentliche Seite blendet fehlende Fahrzeuge nach einer Karenzzeit aus.
   */
  syncVisibility?: boolean;
  /**
   * Preise von Mobile.de ins Portal übernehmen (solange das Portal selbst nicht
   * pushen kann). Manuelle Preis-Overrides bleiben unangetastet.
   */
  adoptPrices?: boolean;
}


/** Vergleicht Seller-Ads eines Kontos gegen die Listings genau dieses Kontos. */
export async function reconcile(
  supabase: SupabaseClient,
  rawAds: SellerAd[],
  scope: string,
  options: ReconcileOptions,
): Promise<ReconcileResult> {
  const { accountKey, claimLegacyVehicles = false } = options;
  const allowUnpublish = options.allowUnpublish ?? true;

  // Testfahrzeuge werden vollständig ignoriert — weder ihre Datensätze noch ihre Inserate.
  const { data: testRows } = await supabase
    .from("vehicles")
    .select("mobile_ad_id, mobile_de_id")
    .eq("is_test", true);
  const testAdIds = new Set<string>();
  for (const t of (testRows ?? []) as Array<Record<string, unknown>>) {
    if (t.mobile_ad_id) testAdIds.add(String(t.mobile_ad_id).replace(/^accident_/, ""));
    if (t.mobile_de_id) testAdIds.add(String(t.mobile_de_id).replace(/^accident_/, ""));
  }

  // Entdopplung über die Inserats-ID: doppelte Seiten dürfen nie doppelte Meldungen erzeugen.
  const adMap = new Map<string, SellerAd>();
  for (const ad of rawAds) {
    if (testAdIds.has(String(ad.mobileAdId).replace(/^accident_/, ""))) continue;
    if (!adMap.has(ad.mobileAdId)) adMap.set(ad.mobileAdId, ad);
  }
  const ads = [...adMap.values()];
  if (ads.length !== rawAds.length) {
    console.log(`Reconcile: ${rawAds.length - ads.length} doppelte oder Test-Inserate vor der Auswertung entfernt.`);
  }

  const { data: rows } = await supabase
    .from("vehicles")
    .select("id, title, mobile_ad_id, mobile_de_id, detail_page_url, price, mileage, publish_status, is_sold, sold_at, reserved_at, is_test, manual_overrides")
    .eq("is_test", false);
  const vehicles = (rows ?? []) as Array<Record<string, unknown>>;

  const vehicleById = new Map<string, Record<string, unknown>>();
  for (const v of vehicles) vehicleById.set(String(v.id), v);

  // Interne Präfixe (z. B. "accident_") gehören nicht zur echten Mobile.de-Inseratsnummer.
  const bareAdId = (value: unknown) => String(value).replace(/^accident_/, "");
  const byAdId = new Map<string, Record<string, unknown>>();
  for (const v of vehicles) {
    if (v.mobile_ad_id) byAdId.set(bareAdId(v.mobile_ad_id), v);
    if (v.mobile_de_id && !byAdId.has(bareAdId(v.mobile_de_id))) byAdId.set(bareAdId(v.mobile_de_id), v);
  }

  // Kontozuordnung: mobile_de-Listings aller Konten
  const { data: listingRows } = await supabase
    .from("listings")
    .select("id, vehicle_id, account_key, external_ad_id, status")
    .eq("platform", "mobile_de");
  const listings = (listingRows ?? []) as Array<Record<string, unknown>>;

  const listingByAdId = new Map<string, Record<string, unknown>>();
  const accountByVehicle = new Map<string, string>();
  for (const l of listings) {
    const key = String(l.account_key ?? "");
    if (l.external_ad_id) listingByAdId.set(bareAdId(l.external_ad_id), l);
    if (l.vehicle_id && key && !accountByVehicle.has(String(l.vehicle_id))) {
      accountByVehicle.set(String(l.vehicle_id), key);
    }
  }
  // Fallback: Fahrzeug-Ad-ID an Listing-Konto koppeln
  for (const v of vehicles) {
    if (!v.mobile_ad_id) continue;
    const adId = bareAdId(v.mobile_ad_id);
    if (!listingByAdId.has(adId)) {
      const acc = accountByVehicle.get(String(v.id));
      if (acc) listingByAdId.set(adId, { vehicle_id: v.id, account_key: acc, external_ad_id: adId, status: "live" });
    }
  }

  const accountOfVehicle = (vehicleId: string): string | null =>
    accountByVehicle.get(vehicleId) ?? (claimLegacyVehicles ? accountKey : null);

  // Prüfumfang: nur Listings dieses Kontos (+ Altbestand ohne Listing, falls erlaubt)
  const scopeListings = listings.filter(
    (l) => String(l.account_key ?? "") === accountKey && l.status === "live",
  );
  const legacyVehicles = claimLegacyVehicles
    ? vehicles.filter(
      (v) => v.mobile_ad_id && v.publish_status === "published" && !accountByVehicle.has(String(v.id)),
    )
    : [];
  const listingsInScope = scopeListings.length + legacyVehicles.length;

  const issues: Array<Record<string, unknown>> = [];
  const liveIds = new Set<string>();
  const liveVehicleIds = new Set<string>();
  const priceAdoptions: Array<{ id: string; price: number; from: number }> = [];
  let matched = 0;
  let accountMismatch = 0;


  for (const ad of ads) {
    liveIds.add(ad.mobileAdId);
    const listing = listingByAdId.get(ad.mobileAdId);
    const v = byAdId.get(ad.mobileAdId) ??
      (listing?.vehicle_id ? vehicleById.get(String(listing.vehicle_id)) : undefined);

    if (!v && !listing) {
      issues.push({
        vehicle_id: null, mobile_ad_id: ad.mobileAdId, scope,
        issue_type: "orphan_ad", severity: "warning",
        detail: `Inserat "${ad.title}" existiert bei Mobile.de (Konto ${accountKey}), hat aber kein Fahrzeug im Portal.`,
      });
      continue;
    }

    const ownerAccount = listing
      ? String(listing.account_key ?? "")
      : (v ? accountOfVehicle(String(v.id)) : null);

    if (ownerAccount && ownerAccount !== accountKey) {
      accountMismatch++;
      issues.push({
        vehicle_id: v?.id ?? null, mobile_ad_id: ad.mobileAdId, scope,
        issue_type: "account_mismatch", severity: "error",
        detail: `Inserat "${ad.title}" wurde auf Konto „${accountKey}“ gefunden, im Portal ist das Inserat aber dem Konto „${ownerAccount}“ zugeordnet. Bitte einzeln prüfen – es wird nichts automatisch geändert.`,
      });
      continue;
    }
    if (!ownerAccount) {
      // Fahrzeug ohne Kontozuordnung: nicht bewertbar, gilt als nicht zugeordnet
      issues.push({
        vehicle_id: v?.id ?? null, mobile_ad_id: ad.mobileAdId, scope,
        issue_type: "orphan_ad", severity: "warning",
        detail: `Inserat "${ad.title}" ist keinem Konto-Inserat im Portal zugeordnet (Konto ${accountKey}).`,
      });
      continue;
    }

    matched++;
    if (!v) continue;
    liveVehicleIds.add(String(v.id));


    if (v.is_sold === true) {
      const soldAt = v.sold_at ? new Date(String(v.sold_at)).toLocaleDateString("de-DE") : "unbekannt";
      issues.push({
        vehicle_id: v.id, mobile_ad_id: ad.mobileAdId, scope,
        issue_type: "sold_but_listed", severity: "error",
        detail: `Fahrzeug „${v.title ?? ad.title}“ ist im Portal als verkauft markiert (Verkauft am: ${soldAt}), das Inserat steht auf Konto „${accountKey}“ aber noch online. Bitte prüfen – es wird nichts automatisch beendet.`,
      });
    }



    // Reserviert-Kennzeichen: Portal gegen Mobile.de
    if (ad.reserved !== null && v.is_sold !== true) {
      const reservedLocal = !!v.reserved_at;
      if (reservedLocal !== ad.reserved) {
        issues.push({
          vehicle_id: v.id, mobile_ad_id: ad.mobileAdId, scope,
          issue_type: "status_drift", severity: "warning",
          detail: reservedLocal
            ? `Portal führt „${v.title ?? ad.title}“ als reserviert, auf Mobile.de ist das Inserat nicht als reserviert gekennzeichnet.`
            : `Mobile.de kennzeichnet „${v.title ?? ad.title}“ als reserviert, im Portal ist das Fahrzeug verfügbar.`,
        });
      }
    }

    const priceLocal = typeof v.price === "number" ? v.price : null;
    if (ad.price !== null && priceLocal !== null && Math.abs(ad.price - priceLocal) >= 1) {
      const overrides = (v.manual_overrides ?? {}) as Record<string, unknown>;
      const priceLocked = Object.prototype.hasOwnProperty.call(overrides, "price");
      if (options.adoptPrices && !priceLocked) {
        priceAdoptions.push({ id: String(v.id), price: ad.price, from: priceLocal });
      } else {
        issues.push({
          vehicle_id: v.id, mobile_ad_id: ad.mobileAdId, scope,
          issue_type: "price_drift", severity: "warning",
          detail: priceLocked
            ? `Preis weicht ab: Portal ${priceLocal} € / Mobile.de ${ad.price} €. Portalpreis ist manuell gesetzt und wurde nicht überschrieben.`
            : `Preis weicht ab: Portal ${priceLocal} € / Mobile.de ${ad.price} €.`,
        });
      }
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

  // Portal sagt "live"/"published", Mobile.de kennt das Inserat nicht mehr – NUR eigenes Konto
  const vanishedIds = new Set<string>();
  const vanished: Array<{ vehicle_id: string | null; mobile_ad_id: string }> = [];
  for (const l of scopeListings) {
    const adId = l.external_ad_id ? bareAdId(l.external_ad_id) : null;
    if (!adId || liveIds.has(adId) || vanishedIds.has(adId)) continue;
    vanishedIds.add(adId);
    vanished.push({ vehicle_id: l.vehicle_id ? String(l.vehicle_id) : null, mobile_ad_id: adId });
  }
  for (const v of legacyVehicles) {
    const adId = bareAdId(v.mobile_ad_id);
    if (liveIds.has(adId) || vanishedIds.has(adId)) continue;
    vanishedIds.add(adId);
    vanished.push({ vehicle_id: String(v.id), mobile_ad_id: adId });
  }
  for (const entry of vanished) {
    issues.push({
      vehicle_id: entry.vehicle_id, mobile_ad_id: entry.mobile_ad_id, scope,
      issue_type: "ad_missing", severity: "error",
      detail: allowUnpublish
        ? `Inserat ist bei Mobile.de (Konto ${accountKey}) nicht mehr auffindbar – Status auf „zurückgezogen“ gesetzt.`
        : `Inserat ist bei Mobile.de (Konto ${accountKey}) nicht mehr auffindbar – Statusänderung übersprungen.`,
    });
  }
  const vanishedVehicleIds = vanished.map((e) => e.vehicle_id).filter((id): id is string => !!id);
  if (allowUnpublish && vanishedVehicleIds.length) {
    await supabase
      .from("vehicles")
      .update({ publish_status: "unpublished" })
      .in("id", vanishedVehicleIds);
  }

  // Sichtbarkeit im Portal an Mobile.de koppeln: gefundene Fahrzeuge werden als
  // "live" markiert, alle übrigen veröffentlichten Fahrzeuge bekommen einen
  // Fehlt-seit-Zeitstempel. Die öffentliche Seite blendet sie nach Karenzzeit aus.
  if (options.syncVisibility) {
    const now = new Date().toISOString();
    const liveList = [...liveVehicleIds];
    if (liveList.length) {
      const { error } = await supabase
        .from("vehicles")
        .update({ mobile_live_at: now, mobile_missing_since: null })
        .in("id", liveList);
      if (error) console.error("mobile_live_at konnte nicht gesetzt werden:", error.message);
    }
    const { data: publishedRows } = await supabase
      .from("vehicles")
      .select("id")
      .eq("is_test", false)
      .is("archived_at", null)
      .is("mobile_missing_since", null)
      .or("publish_status.is.null,publish_status.in.(published,out_of_sync)");
    const missingIds = ((publishedRows ?? []) as Array<{ id: string }>)
      .map((r) => String(r.id))
      .filter((id) => !liveVehicleIds.has(id));
    if (missingIds.length) {
      const { error } = await supabase
        .from("vehicles")
        .update({ mobile_missing_since: now })
        .in("id", missingIds);
      if (error) console.error("mobile_missing_since konnte nicht gesetzt werden:", error.message);
      console.log(`Sichtbarkeit: ${liveList.length} Fahrzeuge live, ${missingIds.length} neu als "bei Mobile.de nicht gefunden" markiert.`);
    }
  }


  // Preise von Mobile.de übernehmen (Mobile.de ist Preisquelle, solange das
  // Portal nicht pushen kann). Manuell gesetzte Preise bleiben unberührt.
  let pricesAdopted = 0;
  for (const p of priceAdoptions) {
    const { error } = await supabase
      .from("vehicles")
      .update({ price: p.price })
      .eq("id", p.id);
    if (error) {
      console.error(`Preisübernahme für ${p.id} fehlgeschlagen:`, error.message);
      continue;
    }
    pricesAdopted++;
    await supabase
      .from("vehicle_price_history")
      .insert({ vehicle_id: p.id, price: p.price, currency: "EUR" });
  }
  if (pricesAdopted) {
    console.log(`Preise von Mobile.de übernommen: ${pricesAdopted}`);
  }


  // Alte offene Meldungen dieses Scopes schließen und neu schreiben
  await supabase
    .from("mobile_reconciliation_issues")
    .update({ resolved_at: new Date().toISOString() })
    .eq("scope", scope)
    .is("resolved_at", null);

  // Zusätzlich je Lauf entdoppeln (issue_type + scope + mobile_ad_id)
  const uniqueIssues = [...new Map(
    issues.map((i) => [`${i.issue_type}|${i.scope}|${i.mobile_ad_id}`, i]),
  ).values()];

  if (uniqueIssues.length) {
    const { error } = await supabase
      .from("mobile_reconciliation_issues")
      .insert(uniqueIssues, { count: "exact" });
    if (error) console.error("Meldungen konnten nicht geschrieben werden:", error.message);
  }


  const orphanAds = uniqueIssues.filter((i) => i.issue_type === "orphan_ad").length;
  return {
    checked: ads.length,
    listingsInScope,
    matched,
    unmatched: orphanAds + accountMismatch,
    accountMismatch,
    orphanAds,
    missingAds: vanished.length,
    driftAds: uniqueIssues.filter((i) => String(i.issue_type).endsWith("_drift")).length,
    soldButListed: uniqueIssues.filter((i) => i.issue_type === "sold_but_listed").length,
    issues: uniqueIssues.length,
    pricesAdopted,
  };

}

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
