import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

const COMMERCIAL_BODY_TYPES = new Set([
  "BoxTypeDeliveryVan",
  "BoxVan",
]);

function deriveCategory(bodyType: string | null, _category: string | null, year: string | null, isAccident: boolean): string {
  if (isAccident) return "accident";
  if (bodyType && COMMERCIAL_BODY_TYPES.has(bodyType)) return "commercial";
  if (year && /^\d{4}/.test(year)) {
    const y = parseInt(year.substring(0, 4), 10);
    const now = new Date().getFullYear();
    if (y <= now - 30) return "oldtimer";
    if (y <= now - 20) return "youngtimer";
  }
  return "used";
}

interface ParseOpts {
  isAccident?: boolean;
  /** Prefix prepended to mobile_de_id (e.g. "accident_") so accident & main syncs don't collide */
  idPrefix?: string;
}

function parseAds(xmlText: string, opts: ParseOpts = {}): VehicleRow[] {
  const { isAccident = false, idPrefix = "" } = opts;
  const rows: VehicleRow[] = [];
  const adRegex = /<ad:ad\b[^>]*>([\s\S]*?)<\/ad:ad>/gi;
  let adMatch;
  const now = new Date().toISOString();

  while ((adMatch = adRegex.exec(xmlText)) !== null) {
    const full = adMatch[0];
    const content = adMatch[1];

    const rawId = attr(full, "ad:ad", "key") || `unknown-${rows.length}`;
    const mobileDeId = `${idPrefix}${rawId}`;

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

    const bodyType = localDesc(content, "ad:body-type") || attr(content, "ad:category", "key") || null;
    const adCategory = localDesc(content, "ad:category") || null;
    const year = attr(content, "ad:first-registration", "value") || null;

    rows.push({
      mobile_de_id: mobileDeId,
      title,
      model_description: modelDesc || null,
      category: adCategory,
      brand: makeName || null,
      model: modelName || null,
      body_type: bodyType,
      year,
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
      vehicle_category: deriveCategory(bodyType, adCategory, year, isAccident),
    });
  }

  return rows;
}

async function fetchDetailImages(
  mobileDeId: string,
  authHeader: string
): Promise<string[] | null> {
  try {
    const res = await fetch(
      `https://services.mobile.de/search-api/ad/${mobileDeId}`,
      {
        headers: {
          Authorization: authHeader,
          Accept: "application/xml",
          "Accept-Language": "de",
        },
      }
    );
    if (!res.ok) {
      console.error(`Detail fetch failed for ${mobileDeId}: ${res.status}`);
      return null;
    }
    const xml = await res.text();
    const images = parseImages(xml);
    return images.length > 0 ? images : null;
  } catch (e) {
    console.error(`Detail fetch error for ${mobileDeId}:`, e);
    return null;
  }
}

async function enrichWithDetailImages(
  vehicles: VehicleRow[],
  authHeader: string,
  batchSize = 10,
  delayMs = 200
): Promise<void> {
  for (let i = 0; i < vehicles.length; i += batchSize) {
    const batch = vehicles.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((v) => fetchDetailImages(v.mobile_de_id, authHeader))
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const username = Deno.env.get("MOBILE_DE_USERNAME");
    const password = Deno.env.get("MOBILE_DE_PASSWORD");

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "Missing Mobile.de API credentials" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiUrl = `https://services.mobile.de/search-api/search?page.size=200`;
    const authHeader = "Basic " + btoa(`${username}:${password}`);

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: authHeader,
        Accept: "application/xml",
        "Accept-Language": "de",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Mobile.de API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Mobile.de API returned ${response.status}`, details: errorText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const xmlText = await response.text();
    console.log("Received XML, length:", xmlText.length);

    const vehicleRows = parseAds(xmlText);
    console.log(`Parsed ${vehicleRows.length} ads from search`);

    // Fetch detail pages to get all images per vehicle
    console.log("Fetching detail images for each vehicle...");
    await enrichWithDetailImages(vehicleRows, authHeader);
    const totalImages = vehicleRows.reduce((sum, v) => sum + v.image_urls.length, 0);
    console.log(`Total images after detail enrichment: ${totalImages}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (vehicleRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("vehicles")
        .upsert(vehicleRows, { onConflict: "mobile_de_id" });

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        return new Response(
          JSON.stringify({ error: "Failed to upsert vehicles", details: upsertError }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Soft-delete: mark vehicles no longer on Mobile.de as sold.
      // IMPORTANT: only touch vehicles owned by THIS sync (vehicle_category != 'accident'),
      // so the accident-vehicles sync and the main sync don't clobber each other.
      const mobileDeIds = vehicleRows.map((v) => v.mobile_de_id);
      const { data: allDbVehicles } = await supabase
        .from("vehicles")
        .select("id, mobile_de_id, is_sold, vehicle_category")
        .neq("vehicle_category", "accident");

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
        if (toMarkSold.length > 0) console.log(`Marked ${toMarkSold.length} vehicles as sold`);
        if (toMarkAvailable.length > 0) console.log(`Marked ${toMarkAvailable.length} vehicles as available again`);
      }

    }

    // Call check-alerts function
    try {
      const alertsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/check-alerts`;
      await fetch(alertsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
      });
      console.log("check-alerts triggered");
    } catch (e) {
      console.error("Failed to trigger check-alerts:", e);
    }

    // Chain accident-vehicles sync (only runs successfully if accident credentials are configured).
    // We fire-and-await but never fail the main sync if accident sync errors.
    try {
      const accidentUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-accident-vehicles`;
      const accRes = await fetch(accidentUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
      });
      console.log("sync-accident-vehicles triggered, status:", accRes.status);
    } catch (e) {
      console.error("Failed to trigger sync-accident-vehicles:", e);
    }

    return new Response(
      JSON.stringify({ success: true, synced: vehicleRows.length, totalImages }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
