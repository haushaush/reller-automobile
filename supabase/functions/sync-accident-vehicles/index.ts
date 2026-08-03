import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chunk,
  deriveCategory,
  normalizeField,
  runQualityScan,
  stripManualOverrides,
} from "../_shared/mobile-de-normalize.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ID_PREFIX = "accident_";

function decodeHtmlEntities(text: string | undefined | null): string | undefined {
  if (text === undefined || text === null) return undefined;
  let result = text;
  let previous = "";
  let iterations = 0;
  const maxIterations = 5;
  while (result !== previous && iterations < maxIterations) {
    previous = result;
    result = result
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&auml;/g, "ä")
      .replace(/&ouml;/g, "ö")
      .replace(/&uuml;/g, "ü")
      .replace(/&Auml;/g, "Ä")
      .replace(/&Ouml;/g, "Ö")
      .replace(/&Uuml;/g, "Ü")
      .replace(/&szlig;/g, "ß")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
    iterations++;
  }
  return result;
}

function attr(xml: string, tag: string, attribute: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*?\\b${attribute}="([^"]*)"`, "i");
  return decodeHtmlEntities(xml.match(regex)?.[1]?.trim());
}

function localDesc(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>\\s*<resource:local-description[^>]*>([^<]*)</resource:local-description>`, "i");
  return decodeHtmlEntities(xml.match(regex)?.[1]?.trim());
}

function textContent(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const val = decodeHtmlEntities(xml.match(regex)?.[1]?.trim());
  return val || undefined;
}

function parseImages(adXml: string): string[] {
  const images: string[] = [];
  const imageBlocks = adXml.match(/<ad:image>([\s\S]*?)<\/ad:image>/gi) || [];
  for (const block of imageBlocks) {
    for (const size of ["XXXL", "XXL", "XL", "L", "M"]) {
      const sizeRegex = new RegExp(`<ad:representation[^>]*size="${size}"[^>]*url="([^"]*)"`, "i");
      const match = block.match(sizeRegex);
      if (match) {
        images.push(match[1]);
        break;
      }
    }
  }
  return images;
}

interface VehicleRow {
  mobile_de_id: string;
  title: string;
  model_description: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  body_type: string | null;
  body_type_key: string | null;
  body_type_label: string | null;
  year: string | null;
  mileage: number | null;
  price: number | null;
  currency: string;
  price_type: string | null;
  vatable: boolean | null;
  image_urls: string[];
  description: string | null;
  exterior_color: string | null;
  exterior_color_key: string | null;
  exterior_color_label: string | null;
  fuel: string | null;
  fuel_key: string | null;
  fuel_label: string | null;
  power: number | null;
  gearbox: string | null;
  gearbox_key: string | null;
  gearbox_label: string | null;
  climatisation: string | null;
  climatisation_key: string | null;
  climatisation_label: string | null;
  num_seats: number | null;
  cubic_capacity: number | null;
  condition: string | null;
  condition_key: string | null;
  condition_label: string | null;
  usage_type: string | null;
  usage_type_key: string | null;
  usage_type_label: string | null;
  interior_color: string | null;
  interior_type: string | null;
  interior_type_key: string | null;
  interior_type_label: string | null;
  damage_unrepaired: boolean | null;
  detail_page_url: string | null;
  creation_date: string | null;
  modification_date: string | null;
  seller_city: string | null;
  seller_zipcode: string | null;
  synced_at: string;
  vehicle_category: string;
}

interface ParsedAd {
  row: VehicleRow;
  /** VIN wird NIE in vehicles gespeichert, sondern nur in vehicle_private_data. */
  vin: string | null;
}

function getAdStatus(xml: string): string | null {
  const stateMatch = xml.match(/<ad:state[^>]*>(?:\s*<resource:local-description[^>]*>)?([^<]+)/i);
  if (stateMatch) return stateMatch[1].trim().toUpperCase();
  const statusMatch = xml.match(/<ad:status[^>]*>(?:\s*<resource:local-description[^>]*>)?([^<]+)/i);
  if (statusMatch) return statusMatch[1].trim().toUpperCase();
  const visibilityMatch = xml.match(/<ad:visibility[^>]*>(?:\s*<resource:local-description[^>]*>)?([^<]+)/i);
  if (visibilityMatch) return visibilityMatch[1].trim().toUpperCase();
  return null;
}

function isPubliclyVisible(adXml: string): boolean {
  const status = getAdStatus(adXml);
  if (!status) return true;
  return ["ACTIVE", "PUBLISHED", "ONLINE"].includes(status);
}

function extractVin(content: string): string | null {
  const candidates = [
    attr(content, "ad:vin", "value"),
    attr(content, "ad:vehicle-identification-number", "value"),
    attr(content, "ad:fin", "value"),
    attr(content, "ad:chassis-number", "value"),
    textContent(content, "ad:vin"),
    textContent(content, "ad:fin"),
  ];
  const found = candidates.find((v) => !!v && v.trim().length >= 11);
  return found ? found.trim().toUpperCase() : null;
}

function parseAds(xmlText: string): ParsedAd[] {
  const parsed: ParsedAd[] = [];
  const adRegex = /<ad:ad\b[^>]*>([\s\S]*?)<\/ad:ad>/gi;
  let adMatch;
  let skippedCount = 0;
  const now = new Date().toISOString();

  while ((adMatch = adRegex.exec(xmlText)) !== null) {
    const full = adMatch[0];
    const content = adMatch[1];

    if (!isPubliclyVisible(full)) {
      skippedCount++;
      continue;
    }

    const rawId = attr(full, "ad:ad", "key") || `unknown-${parsed.length}`;
    const mobileDeId = `${ID_PREFIX}${rawId}`;

    const makeName = localDesc(content, "ad:make");
    const modelName = localDesc(content, "ad:model");
    const modelDesc = attr(content, "ad:model-description", "value");
    const title = makeName && modelDesc
      ? `${makeName} ${modelDesc}`
      : makeName && modelName
        ? `${makeName} ${modelName}`
        : modelDesc || "Unbekanntes Fahrzeug";

    const priceStr = attr(content, "ad:consumer-price-amount", "value");
    const powerStr = attr(content, "ad:power", "value");
    const mileageStr = attr(content, "ad:mileage", "value");
    const seatsStr = attr(content, "ad:num-seats", "value");
    const ccStr = attr(content, "ad:cubic-capacity", "value");
    const vatStr = attr(content, "ad:vatable", "value");
    const dmgStr = attr(content, "ad:damage-and-unrepaired", "value");

    const bodyType = normalizeField(
      "body_type",
      attr(content, "ad:body-type", "key") || attr(content, "ad:category", "key"),
      localDesc(content, "ad:body-type") || localDesc(content, "ad:category"),
    );
    const fuel = normalizeField("fuel", attr(content, "ad:fuel", "key"), localDesc(content, "ad:fuel"));
    const gearbox = normalizeField("gearbox", attr(content, "ad:gearbox", "key"), localDesc(content, "ad:gearbox"));
    const condition = normalizeField("condition", attr(content, "ad:condition", "key"), localDesc(content, "ad:condition"));
    const usageType = normalizeField("usage_type", attr(content, "ad:usage-type", "key"), localDesc(content, "ad:usage-type"));
    const climatisation = normalizeField("climatisation", attr(content, "ad:climatisation", "key"), localDesc(content, "ad:climatisation"));
    const interiorType = normalizeField("interior_type", attr(content, "ad:interior-type", "key"), localDesc(content, "ad:interior-type"));
    const exteriorColor = normalizeField("exterior_color", attr(content, "ad:exterior-color", "key"), localDesc(content, "ad:exterior-color"));

    const year = attr(content, "ad:first-registration", "value") || null;
    const damageUnrepaired = dmgStr ? dmgStr === "true" : null;

    parsed.push({
      vin: extractVin(content),
      row: {
        mobile_de_id: mobileDeId,
        title,
        model_description: modelDesc || null,
        category: localDesc(content, "ad:category") || null,
        brand: makeName || null,
        model: modelName || null,
        body_type: bodyType.label,
        body_type_key: bodyType.key,
        body_type_label: bodyType.label,
        year,
        mileage: mileageStr ? parseInt(mileageStr, 10) : null,
        price: priceStr ? Math.round(parseFloat(priceStr)) : null,
        currency: attr(content, "ad:price", "currency") || "EUR",
        price_type: attr(content, "ad:price", "type") || null,
        vatable: vatStr ? vatStr === "true" : null,
        image_urls: parseImages(full),
        description: textContent(content, "ad:description") || null,
        exterior_color: exteriorColor.label,
        exterior_color_key: exteriorColor.key,
        exterior_color_label: exteriorColor.label,
        fuel: fuel.label,
        fuel_key: fuel.key,
        fuel_label: fuel.label,
        power: powerStr ? parseInt(powerStr, 10) : null,
        gearbox: gearbox.label,
        gearbox_key: gearbox.key,
        gearbox_label: gearbox.label,
        climatisation: climatisation.label,
        climatisation_key: climatisation.key,
        climatisation_label: climatisation.label,
        num_seats: seatsStr ? parseInt(seatsStr, 10) : null,
        cubic_capacity: ccStr ? parseInt(ccStr, 10) : null,
        condition: condition.label,
        condition_key: condition.key,
        condition_label: condition.label,
        usage_type: usageType.label,
        usage_type_key: usageType.key,
        usage_type_label: usageType.label,
        interior_color: localDesc(content, "ad:interior-color") || null,
        interior_type: interiorType.label,
        interior_type_key: interiorType.key,
        interior_type_label: interiorType.label,
        damage_unrepaired: damageUnrepaired,
        detail_page_url: attr(content, "ad:detail-page", "url") || null,
        creation_date: attr(content, "ad:creation-date", "value") || null,
        modification_date: attr(content, "ad:modification-date", "value") || null,
        seller_city: textContent(content, "seller:city") || attr(content, "seller:city", "value") || null,
        seller_zipcode: attr(content, "seller:zipcode", "value") || null,
        synced_at: now,
        vehicle_category: deriveCategory({
          bodyTypeKey: bodyType.key,
          conditionKey: condition.key,
          conditionLabel: condition.label,
          usageTypeKey: usageType.key,
          usageTypeLabel: usageType.label,
          damageUnrepaired,
          year,
          isAccidentSync: true,
        }),
      },
    });
  }

  if (skippedCount > 0) {
    console.log(`[accident] parseAds: kept ${parsed.length} public ads, skipped ${skippedCount} non-public ads`);
  }
  return parsed;
}

interface ExistingLite {
  id: string;
  price: number | null;
  currency: string | null;
}

async function persistVinsAndPriceHistory(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  vehicleRows: VehicleRow[],
  vinByMobileId: Map<string, string>,
  existingMap: Map<string, ExistingLite>,
  priceChanged: Array<{ mobile_de_id: string; price: number | null; currency: string }>,
): Promise<void> {
  const relevantIds = new Set<string>([
    ...vinByMobileId.keys(),
    ...priceChanged.map((p) => p.mobile_de_id),
    ...vehicleRows.filter((v) => !existingMap.has(v.mobile_de_id)).map((v) => v.mobile_de_id),
  ]);
  if (relevantIds.size === 0) return;

  const idMap = new Map<string, string>();
  for (const c of chunk([...relevantIds], 200)) {
    const { data } = await supabase.from("vehicles").select("id, mobile_de_id").in("mobile_de_id", c);
    for (const r of data ?? []) idMap.set(r.mobile_de_id, r.id);
  }

  const vinRows = [...vinByMobileId.entries()]
    .filter(([mid]) => idMap.has(mid))
    .map(([mid, vin]) => ({ vehicle_id: idMap.get(mid)!, vin, updated_at: new Date().toISOString() }));
  for (const c of chunk(vinRows, 200)) {
    const { error } = await supabase.from("vehicle_private_data").upsert(c, { onConflict: "vehicle_id" });
    if (error) console.error("[accident] vehicle_private_data upsert failed:", error);
  }

  const historyRows: Array<{ vehicle_id: string; price: number | null; currency: string }> = [];
  for (const v of vehicleRows) {
    const vid = idMap.get(v.mobile_de_id);
    if (!vid) continue;
    if (!existingMap.has(v.mobile_de_id)) {
      historyRows.push({ vehicle_id: vid, price: v.price, currency: v.currency });
    }
  }
  for (const p of priceChanged) {
    const vid = idMap.get(p.mobile_de_id);
    if (!vid) continue;
    historyRows.push({ vehicle_id: vid, price: p.price, currency: p.currency });
  }
  for (const c of chunk(historyRows, 200)) {
    const { error } = await supabase.from("vehicle_price_history").insert(c);
    if (error) console.error("[accident] vehicle_price_history insert failed:", error);
  }
  console.log(`[accident] VIN-Rows: ${vinRows.length}, Preishistorie-Rows: ${historyRows.length}`);
}

async function fetchDetailImages(mobileDeIdRaw: string, authHeader: string): Promise<string[] | null> {
  try {
    const res = await fetch(`https://services.mobile.de/search-api/ad/${mobileDeIdRaw}`, {
      headers: { Authorization: authHeader, Accept: "application/xml", "Accept-Language": "de" },
    });
    if (!res.ok) {
      console.error(`Detail fetch failed for ${mobileDeIdRaw}: ${res.status}`);
      return null;
    }
    const xml = await res.text();
    const images = parseImages(xml);
    return images.length > 0 ? images : null;
  } catch (e) {
    console.error(`Detail fetch error for ${mobileDeIdRaw}:`, e);
    return null;
  }
}

async function enrichWithDetailImages(vehicles: VehicleRow[], authHeader: string, batchSize = 10, delayMs = 200): Promise<void> {
  for (let i = 0; i < vehicles.length; i += batchSize) {
    const batch = vehicles.slice(i, i + batchSize);
    const results = await Promise.all(
      // strip the prefix to call mobile.de detail API with the raw ID
      batch.map((v) => fetchDetailImages(v.mobile_de_id.replace(ID_PREFIX, ""), authHeader))
    );
    for (let j = 0; j < batch.length; j++) {
      if (results[j] && results[j]!.length > 0) {
        batch[j].image_urls = results[j]!;
      }
    }
    if (i + batchSize < vehicles.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

interface PaginationResult {
  pages: string[];
  totalCount: number | null;
  maxPages: number | null;
  lastCurrentPage: number | null;
  pageSize: number;
  stopReason: string;
  paginationConfident: boolean;
}

function parsePageInt(xml: string, tagBase: string): number | null {
  const patterns = [
    new RegExp(`<resource:${tagBase}[^>]*value="(\\d+)"`, "i"),
    new RegExp(`<resource:${tagBase}[^>]*>(\\d+)</resource:${tagBase}>`, "i"),
    new RegExp(`<${tagBase}[^>]*value="(\\d+)"`, "i"),
    new RegExp(`<${tagBase}[^>]*>(\\d+)</${tagBase}>`, "i"),
  ];
  for (const p of patterns) {
    const m = xml.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function countAdsInXml(xml: string): number {
  const matches = xml.match(/<ad:ad\b/gi);
  return matches ? matches.length : 0;
}

async function fetchAllAdsPages(authHeader: string, pageSize: number = 100): Promise<PaginationResult> {
  const allXmlPages: string[] = [];
  let pageNumber = 1;
  const maxPages = 50;
  let lastTotalCount: number | null = null;
  let lastMaxPages: number | null = null;
  let lastCurrentPage: number | null = null;
  let stopReason = "unknown";
  let paginationConfident = false;

  while (pageNumber <= maxPages) {
    const apiUrl = `https://services.mobile.de/search-api/search?page.size=${pageSize}&page.number=${pageNumber}`;
    console.log(`[accident] Fetching ${apiUrl}`);

    const response = await fetch(apiUrl, {
      headers: { Authorization: authHeader, Accept: "application/xml", "Accept-Language": "de" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[accident] Mobile.de API error on page ${pageNumber}:`, response.status, (errorText || "").slice(0, 300));
      throw new Error(`Mobile.de API returned ${response.status} on page ${pageNumber}`);
    }

    const xmlText = await response.text();
    allXmlPages.push(xmlText);

    const totalCount = parsePageInt(xmlText, "total-results-count");
    const totalPages = parsePageInt(xmlText, "max-pages");
    const currentPage = parsePageInt(xmlText, "current-page") ?? pageNumber;
    const adsOnPage = countAdsInXml(xmlText);

    lastTotalCount = totalCount;
    lastMaxPages = totalPages;
    lastCurrentPage = currentPage;

    console.log(
      `[accident] Page ${currentPage} (req=${pageNumber}, size=${pageSize}): http=${response.status}, ` +
      `ads=${adsOnPage}, total-results-count=${totalCount ?? "n/a"}, max-pages=${totalPages ?? "n/a"}`
    );

    if (totalPages != null && currentPage >= totalPages) {
      stopReason = `currentPage(${currentPage}) >= totalPages(${totalPages})`;
      paginationConfident = true;
      break;
    }
    if (adsOnPage === 0) {
      stopReason = `empty page at ${pageNumber}`;
      paginationConfident = true;
      break;
    }
    if (adsOnPage < pageSize) {
      stopReason = `page vehicle count (${adsOnPage}) < pageSize (${pageSize})`;
      paginationConfident = true;
      break;
    }
    if (pageNumber >= maxPages) {
      stopReason = `maxPages safety cap (${maxPages}) reached`;
      paginationConfident = false;
      break;
    }

    pageNumber++;
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(
    `[accident] Pagination done: pages=${allXmlPages.length}, stop=${stopReason}, ` +
    `confident=${paginationConfident}, mobile-total=${lastTotalCount ?? "n/a"}`
  );

  return {
    pages: allXmlPages,
    totalCount: lastTotalCount,
    maxPages: lastMaxPages,
    lastCurrentPage,
    pageSize,
    stopReason,
    paginationConfident,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseLock = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const lockName = "sync-accident-vehicles";
  const startTime = Date.now();
  const nowDate = new Date();
  const lockTimeout = new Date(nowDate.getTime() + 4 * 60 * 1000);

  const { data: lockData } = await supabaseLock
    .from("sync_locks")
    .select("locked_until")
    .eq("lock_name", lockName)
    .maybeSingle();

  if (lockData && new Date(lockData.locked_until) > nowDate) {
    console.log(`[accident] Sync already running until ${lockData.locked_until}, skipping`);
    return new Response(
      JSON.stringify({ skipped: true, reason: "Another accident sync is already running" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  await supabaseLock
    .from("sync_locks")
    .update({ locked_at: nowDate.toISOString(), locked_until: lockTimeout.toISOString() })
    .eq("lock_name", lockName);

  const { data: logEntry } = await supabaseLock
    .from("sync_logs")
    .insert({ sync_name: lockName, status: "running" })
    .select("id")
    .single();

  let logStatus: "success" | "success_with_warning" | "failed" | "skipped" = "failed";
  let logError: string | null = null;
  let logTotal = 0;
  let logAdded = 0;
  let logUpdated = 0;
  let logUnchanged = 0;
  let logPriceChanges = 0;
  let logQualityIssues = 0;
  let logSold = 0;
  let logPagesFetched = 0;
  let logPageSize = 100;
  let logMobileTotal: number | null = null;
  let logStopReason: string | null = null;
  let paginationConfident = false;

  try {
    const username = Deno.env.get("MOBILE_DE_ACCIDENT_USERNAME");
    const password = Deno.env.get("MOBILE_DE_ACCIDENT_PASSWORD");

    if (!username || !password) {
      logStatus = "skipped";
      logError = "Missing accident credentials";
      return new Response(
        JSON.stringify({ error: "Missing Mobile.de accident-account credentials (MOBILE_DE_ACCIDENT_USERNAME / MOBILE_DE_ACCIDENT_PASSWORD)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = "Basic " + btoa(`${username}:${password}`);
    console.log(`=== [accident] Sync Start === ${new Date().toISOString()}`);

    const paginationResult = await fetchAllAdsPages(authHeader, 100);
    const allXmlPages = paginationResult.pages;
    logPagesFetched = allXmlPages.length;
    logPageSize = paginationResult.pageSize;
    logMobileTotal = paginationResult.totalCount;
    logStopReason = paginationResult.stopReason;
    paginationConfident = paginationResult.paginationConfident;

    const parsedAds: ParsedAd[] = [];
    for (const xmlText of allXmlPages) {
      parsedAds.push(...parseAds(xmlText));
    }
    console.log(`[accident] After XML status filter: ${parsedAds.length} vehicles across ${allXmlPages.length} pages`);

    // URL HEAD-validation deactivated for cron performance.
    const vehicleRows: VehicleRow[] = parsedAds.map((p) => p.row);
    const vinByMobileId = new Map<string, string>();
    for (const p of parsedAds) {
      if (p.vin) vinByMobileId.set(p.row.mobile_de_id, p.vin);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (vehicleRows.length === 0) {
      console.warn("[accident] No vehicles returned from API — skipping soft-delete");
      logStatus = "skipped";
      logError = "No vehicles returned";
      return new Response(
        JSON.stringify({ success: false, scope: "accident", reason: "No vehicles returned, soft-delete skipped" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Diff-sync: only enrich new/changed/image-less vehicles
    type ExistingFull = {
      id: string;
      image_urls: string[] | null;
      modification_date: string | null;
      price: number | null;
      currency: string | null;
      // deno-lint-ignore no-explicit-any
      manual_overrides: any;
    };
    const existingMap = new Map<string, ExistingFull>();
    for (const ids of chunk(vehicleRows.map((v) => v.mobile_de_id), 200)) {
      const { data } = await supabase
        .from("vehicles")
        .select("id, mobile_de_id, image_urls, modification_date, price, currency, manual_overrides")
        .in("mobile_de_id", ids);
      for (const v of data ?? []) {
        existingMap.set(v.mobile_de_id, {
          id: v.id,
          image_urls: v.image_urls,
          modification_date: v.modification_date,
          price: v.price,
          currency: v.currency,
          manual_overrides: v.manual_overrides,
        });
      }
    }
    const existingMobileDeIds = new Set<string>(existingMap.keys());


    const toEnrich = vehicleRows.filter((v) => {
      const existing = existingMap.get(v.mobile_de_id);
      if (!existing) return true;
      if (!existing.image_urls || existing.image_urls.length === 0) return true;
      if (existing.modification_date !== v.modification_date) return true;
      return false;
    });

    console.log(`[accident] Enriching ${toEnrich.length} of ${vehicleRows.length} vehicles`);
    if (toEnrich.length > 0) {
      await enrichWithDetailImages(toEnrich, authHeader);
    }

    for (const v of vehicleRows) {
      if (!toEnrich.includes(v)) {
        const existing = existingMap.get(v.mobile_de_id);
        if (existing?.image_urls && existing.image_urls.length > 0) {
          v.image_urls = existing.image_urls;
        }
      }
    }

    const totalImages = vehicleRows.reduce((sum, v) => sum + v.image_urls.length, 0);
    console.log(`[accident] Total images: ${totalImages}`);

    // Preisänderungen erkennen (vor dem Upsert) + manuelle Overrides schützen.
    const priceChanged: Array<{ mobile_de_id: string; price: number | null; currency: string }> = [];
    for (const v of vehicleRows) {
      const existing = existingMap.get(v.mobile_de_id);
      if (existing && existing.price !== v.price) {
        priceChanged.push({ mobile_de_id: v.mobile_de_id, price: v.price, currency: v.currency });
      }
    }
    logPriceChanges = priceChanged.length;

    const upsertRows = vehicleRows.map((v) => {
      const existing = existingMap.get(v.mobile_de_id);
      return existing ? stripManualOverrides(v, existing.manual_overrides) : v;
    });

    const { error: upsertError } = await supabase
      .from("vehicles")
      .upsert(upsertRows, { onConflict: "mobile_de_id" });

    if (upsertError) {
      console.error("[accident] Upsert error:", upsertError);
      logError = `Upsert: ${JSON.stringify(upsertError)}`;
      return new Response(
        JSON.stringify({ error: "Failed to upsert vehicles", details: upsertError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log(`[accident] Upserted ${vehicleRows.length} vehicles`);
    logTotal = vehicleRows.length;
    logAdded = vehicleRows.filter((v) => !existingMobileDeIds.has(v.mobile_de_id)).length;
    logUpdated = vehicleRows.filter((v) => {
      const existing = existingMap.get(v.mobile_de_id);
      if (!existing) return false;
      return existing.modification_date !== v.modification_date || existing.price !== v.price;
    }).length;
    logUnchanged = vehicleRows.length - logAdded - logUpdated;

    await persistVinsAndPriceHistory(supabase, vehicleRows, vinByMobileId, existingMap, priceChanged);


    // Sync-Mail nur für wirklich neue Unfallwagen auslösen.
    // Die include_accident_vehicles-Einstellung wird in notify-new-synced-vehicle geprüft.
    try {
      const newlyAddedMobileDeIds = vehicleRows
        .filter((v) => !existingMobileDeIds.has(v.mobile_de_id))
        .map((v) => v.mobile_de_id);
      console.log(`[accident] notify-new-sync: ${newlyAddedMobileDeIds.length} new vehicle(s)`);
      if (newlyAddedMobileDeIds.length > 0) {
        const { data: newVehicles } = await supabase
          .from("vehicles")
          .select("id, mobile_de_id, new_sync_email_sent_at, new_sync_email_status")
          .in("mobile_de_id", newlyAddedMobileDeIds);
        for (const nv of newVehicles ?? []) {
          if (nv.new_sync_email_sent_at) continue;
          if (nv.new_sync_email_status === "sent") continue;
          try {
            const { error: notifyError } = await supabase.functions.invoke(
              "notify-new-synced-vehicle",
              { body: { vehicleId: nv.id, trigger: "sync-accident-vehicles", forceResend: false } },
            );
            if (notifyError) {
              console.warn(`[accident] notify-new-sync invoke error vehicle=${nv.id}: ${String(notifyError.message ?? notifyError).slice(0, 400)}`);
            }
          } catch (e) {
            console.warn(`[accident] notify-new-sync vehicle=${nv.id} threw: ${(e as Error).message.slice(0, 400)}`);
          }
        }
      }
    } catch (e) {
      console.warn(`[accident] notify-new-sync trigger failed: ${(e as Error).message}`);
    }


    const { count: activeCount } = await supabase
      .from("vehicles")
      .select("*", { count: "exact", head: true })
      .eq("is_sold", false)
      .eq("vehicle_category", "accident");

    const expectedCount = activeCount ?? 0;
    const droppedRatio = expectedCount > 0 ? (expectedCount - vehicleRows.length) / expectedCount : 0;

    if (expectedCount > 50 && droppedRatio > 0.5) {
      console.warn(
        `[accident] Sync returned ${vehicleRows.length} but DB has ${expectedCount} active. ` +
        `Drop ratio: ${(droppedRatio * 100).toFixed(1)}%. Skipping soft-delete.`
      );
      logStatus = "success";
      return new Response(
        JSON.stringify({
          success: true,
          scope: "accident",
          synced: vehicleRows.length,
          warning: "Soft-delete skipped due to suspicious drop in vehicle count",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!paginationConfident) {
      console.warn(
        `[accident] Skipping soft-delete: pagination not confident (stop=${logStopReason}). ` +
        `Fetched ${logPagesFetched} page(s), ${vehicleRows.length} vehicle(s).`
      );
      logStatus = "success_with_warning";
      logError = `Soft-delete skipped: pagination unsicher (${logStopReason})`;
    } else {
      const mobileDeIds = vehicleRows.map((v) => v.mobile_de_id);
      const { data: allDbVehicles } = await supabase
        .from("vehicles")
        .select("id, mobile_de_id, is_sold")
        .eq("vehicle_category", "accident");

      if (allDbVehicles) {
        const syncedSet = new Set(mobileDeIds);
        const toMarkSold = allDbVehicles.filter((v) => !syncedSet.has(v.mobile_de_id) && !v.is_sold);
        const toMarkAvailable = allDbVehicles.filter((v) => syncedSet.has(v.mobile_de_id) && v.is_sold);

        const soldAt = new Date().toISOString();
        for (const ids of chunk(toMarkSold.map((v) => v.id), 200)) {
          const { error } = await supabase
            .from("vehicles")
            .update({ is_sold: true, sold_at: soldAt, reserved_at: null, reserved_note: null })
            .in("id", ids);
          if (error) console.error("[accident] Bulk mark-sold failed:", error);
        }
        for (const ids of chunk(toMarkAvailable.map((v) => v.id), 200)) {
          const { error } = await supabase
            .from("vehicles")
            .update({ is_sold: false, sold_at: null })
            .in("id", ids);
          if (error) console.error("[accident] Bulk re-activate failed:", error);
        }
        logSold = toMarkSold.length;
        console.log(`[accident] Soft-delete: ${toMarkSold.length} marked sold, ${toMarkAvailable.length} re-activated`);
      }
    }

    try {
      const alertsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/check-alerts`;
      await fetch(alertsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
      });
      console.log("[accident] check-alerts triggered");
    } catch (e) {
      console.error("[accident] Failed to trigger check-alerts:", e);
    }

    try {
      logQualityIssues = await runQualityScan(supabase);
    } catch (e) {
      console.error("[accident] Quality scan failed:", e);
    }

    if (logStatus !== "success_with_warning") {
      logStatus = "success";
    }
    console.log(`=== [accident] Sync Complete (status=${logStatus}) ===`);
    return new Response(
      JSON.stringify({
        success: true,
        scope: "accident",
        synced: vehicleRows.length,
        totalImages,
        priceChanges: logPriceChanges,
        qualityIssues: logQualityIssues,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[accident] Sync error:", error);
    logError = String(error);
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } finally {
    await supabaseLock
      .from("sync_locks")
      .update({ locked_until: new Date().toISOString() })
      .eq("lock_name", lockName);

    if (logEntry?.id) {
      await supabaseLock
        .from("sync_logs")
        .update({
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
          vehicles_total: logTotal,
          vehicles_added: logAdded,
          vehicles_updated: logUpdated,
          vehicles_unchanged: logUnchanged,
          vehicles_marked_sold: logSold,
          pages_fetched: logPagesFetched,
          page_size: logPageSize,
          mobile_total_results: logMobileTotal,
          stop_reason: logStopReason,
          quality_issues_found: logQualityIssues,
          price_changes: logPriceChanges,
          status: logStatus,
          error_message: logError,
        })
        .eq("id", logEntry.id);
    }
    console.log(
      `[accident] Sync lock released (status=${logStatus}, duration=${Date.now() - startTime}ms, ` +
      `pages=${logPagesFetched}, total=${logTotal}, added=${logAdded}, updated=${logUpdated}, ` +
      `sold=${logSold}, mobile-total=${logMobileTotal ?? "n/a"}, stop=${logStopReason ?? "n/a"})`
    );
  }
});
