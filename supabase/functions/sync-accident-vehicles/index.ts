import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  year: string | null;
  mileage: number | null;
  price: number | null;
  currency: string;
  price_type: string | null;
  vatable: boolean | null;
  image_urls: string[];
  description: string | null;
  exterior_color: string | null;
  fuel: string | null;
  power: number | null;
  gearbox: string | null;
  climatisation: string | null;
  num_seats: number | null;
  cubic_capacity: number | null;
  condition: string | null;
  usage_type: string | null;
  interior_color: string | null;
  interior_type: string | null;
  damage_unrepaired: boolean | null;
  detail_page_url: string | null;
  creation_date: string | null;
  modification_date: string | null;
  seller_city: string | null;
  seller_zipcode: string | null;
  synced_at: string;
  vehicle_category: string;
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

async function isUrlPubliclyAccessible(detailPageUrl: string): Promise<boolean> {
  try {
    const publicUrl = detailPageUrl.split("?")[0];
    const response = await fetch(publicUrl, {
      method: "HEAD",
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RellerSync/1.0)" },
    });
    if (response.status === 200) return true;
    if (response.status === 404 || response.status === 410) return false;
    if (response.status >= 300 && response.status < 400) {
      const location = (response.headers.get("location") || "").toLowerCase();
      if (location.includes("404") || location.includes("not-found") || location.includes("nicht-gefunden")) {
        return false;
      }
      return true;
    }
    return true;
  } catch (e) {
    console.error(`[accident] URL check failed for ${detailPageUrl}:`, e);
    return true;
  }
}

async function validateVehiclesArePublic(
  vehicles: VehicleRow[],
  batchSize = 10,
  delayMs = 200
): Promise<VehicleRow[]> {
  const validVehicles: VehicleRow[] = [];
  let removedCount = 0;
  for (let i = 0; i < vehicles.length; i += batchSize) {
    const batch = vehicles.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (v) => {
        if (!v.detail_page_url) return { vehicle: v, isPublic: true };
        const isPublic = await isUrlPubliclyAccessible(v.detail_page_url);
        return { vehicle: v, isPublic };
      })
    );
    for (const { vehicle, isPublic } of results) {
      if (isPublic) {
        validVehicles.push(vehicle);
      } else {
        removedCount++;
        console.log(`[accident] Removed non-public vehicle: ${vehicle.mobile_de_id} - ${vehicle.title}`);
      }
    }
    if (i + batchSize < vehicles.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.log(`[accident] URL validation: ${validVehicles.length} public, ${removedCount} non-public removed`);
  return validVehicles;
}

function parseAds(xmlText: string): VehicleRow[] {
  const rows: VehicleRow[] = [];
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

    const rawId = attr(full, "ad:ad", "key") || `unknown-${rows.length}`;
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

    rows.push({
      mobile_de_id: mobileDeId,
      title,
      model_description: modelDesc || null,
      category: localDesc(content, "ad:category") || null,
      brand: makeName || null,
      model: modelName || null,
      body_type: localDesc(content, "ad:body-type") || attr(content, "ad:category", "key") || null,
      year: attr(content, "ad:first-registration", "value") || null,
      mileage: mileageStr ? parseInt(mileageStr, 10) : null,
      price: priceStr ? Math.round(parseFloat(priceStr)) : null,
      currency: attr(content, "ad:price", "currency") || "EUR",
      price_type: attr(content, "ad:price", "type") || null,
      vatable: vatStr ? vatStr === "true" : null,
      image_urls: parseImages(full),
      description: textContent(content, "ad:description") || null,
      exterior_color: localDesc(content, "ad:exterior-color") || null,
      fuel: localDesc(content, "ad:fuel") || null,
      power: powerStr ? parseInt(powerStr, 10) : null,
      gearbox: localDesc(content, "ad:gearbox") || null,
      climatisation: localDesc(content, "ad:climatisation") || null,
      num_seats: seatsStr ? parseInt(seatsStr, 10) : null,
      cubic_capacity: ccStr ? parseInt(ccStr, 10) : null,
      condition: localDesc(content, "ad:condition") || null,
      usage_type: localDesc(content, "ad:usage-type") || null,
      interior_color: localDesc(content, "ad:interior-color") || null,
      interior_type: localDesc(content, "ad:interior-type") || null,
      damage_unrepaired: dmgStr ? dmgStr === "true" : null,
      detail_page_url: attr(content, "ad:detail-page", "url") || null,
      creation_date: attr(content, "ad:creation-date", "value") || null,
      modification_date: attr(content, "ad:modification-date", "value") || null,
      seller_city: textContent(content, "seller:city") || attr(content, "seller:city", "value") || null,
      seller_zipcode: attr(content, "seller:zipcode", "value") || null,
      synced_at: now,
      vehicle_category: "accident",
    });
  }

  if (skippedCount > 0) {
    console.log(`[accident] parseAds: kept ${rows.length} public ads, skipped ${skippedCount} non-public ads`);
  }
  return rows;
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

async function fetchAllAdsPages(authHeader: string, pageSize: number = 100): Promise<string[]> {
  const allXmlPages: string[] = [];
  let pageNumber = 1;
  let hasMorePages = true;
  const maxPages = 50;

  while (hasMorePages && pageNumber <= maxPages) {
    const apiUrl = `https://services.mobile.de/search-api/search?page.size=${pageSize}&page.number=${pageNumber}`;
    console.log(`[accident] Fetching page ${pageNumber}...`);

    const response = await fetch(apiUrl, {
      headers: { Authorization: authHeader, Accept: "application/xml", "Accept-Language": "de" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[accident] Mobile.de API error on page ${pageNumber}:`, response.status, errorText);
      throw new Error(`Mobile.de API returned ${response.status} on page ${pageNumber}`);
    }

    const xmlText = await response.text();
    allXmlPages.push(xmlText);

    const totalCountMatch = xmlText.match(/<resource:total-results-count>(\d+)<\/resource:total-results-count>/);
    const maxPagesMatch = xmlText.match(/<resource:max-pages>(\d+)<\/resource:max-pages>/);
    const currentPageMatch = xmlText.match(/<resource:current-page>(\d+)<\/resource:current-page>/);

    const totalCount = totalCountMatch ? parseInt(totalCountMatch[1], 10) : 0;
    const totalPages = maxPagesMatch ? parseInt(maxPagesMatch[1], 10) : 1;
    const currentPage = currentPageMatch ? parseInt(currentPageMatch[1], 10) : pageNumber;

    console.log(`[accident] Page ${currentPage}/${totalPages}, total ads: ${totalCount}`);

    if (currentPage >= totalPages) {
      hasMorePages = false;
    } else {
      pageNumber++;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(`[accident] Fetched ${allXmlPages.length} pages total`);
  return allXmlPages;
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

  let logStatus: "success" | "failed" | "skipped" = "failed";
  let logError: string | null = null;
  let logTotal = 0;

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

    const allXmlPages = await fetchAllAdsPages(authHeader, 100);

    const rawVehicleRows: VehicleRow[] = [];
    for (const xmlText of allXmlPages) {
      rawVehicleRows.push(...parseAds(xmlText));
    }
    console.log(`[accident] After XML status filter: ${rawVehicleRows.length} vehicles across ${allXmlPages.length} pages`);

    // URL HEAD-validation deactivated for cron performance.
    const vehicleRows = rawVehicleRows;

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
    const { data: existingVehicles } = await supabase
      .from("vehicles")
      .select("mobile_de_id, image_urls, modification_date")
      .in("mobile_de_id", vehicleRows.map((v) => v.mobile_de_id));

    const existingMap = new Map<string, { image_urls: string[] | null; modification_date: string | null }>(
      (existingVehicles || []).map((v) => [v.mobile_de_id, { image_urls: v.image_urls, modification_date: v.modification_date }])
    );

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

    const { error: upsertError } = await supabase
      .from("vehicles")
      .upsert(vehicleRows, { onConflict: "mobile_de_id" });

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

    const mobileDeIds = vehicleRows.map((v) => v.mobile_de_id);
    const { data: allDbVehicles } = await supabase
      .from("vehicles")
      .select("id, mobile_de_id, is_sold")
      .eq("vehicle_category", "accident");

    if (allDbVehicles) {
      const syncedSet = new Set(mobileDeIds);
      const toMarkSold = allDbVehicles.filter((v) => !syncedSet.has(v.mobile_de_id) && !v.is_sold);
      const toMarkAvailable = allDbVehicles.filter((v) => syncedSet.has(v.mobile_de_id) && v.is_sold);

      for (const v of toMarkSold) {
        await supabase.from("vehicles").update({ is_sold: true, sold_at: new Date().toISOString() }).eq("id", v.id);
      }
      for (const v of toMarkAvailable) {
        await supabase.from("vehicles").update({ is_sold: false, sold_at: null }).eq("id", v.id);
      }
      console.log(`[accident] Soft-delete: ${toMarkSold.length} marked sold, ${toMarkAvailable.length} re-activated`);
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

    logStatus = "success";
    console.log(`=== [accident] Sync Complete ===`);
    return new Response(
      JSON.stringify({ success: true, scope: "accident", synced: vehicleRows.length, totalImages }),
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
          status: logStatus,
          error_message: logError,
        })
        .eq("id", logEntry.id);
    }
    console.log(`[accident] Sync lock released (status=${logStatus}, duration=${Date.now() - startTime}ms)`);
  }
});
