import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MobileDeAd {
  id: string;
  title: string;
  category?: string;
  make?: string;
  model?: string;
  bodyType?: string;
  firstRegistration?: string;
  mileage?: number;
  price?: number;
  currency?: string;
  images?: string[];
  description?: string;
}

function parseXmlValue(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

function parseXmlAttribute(xml: string, tag: string, attr: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

function parseImages(adXml: string): string[] {
  const images: string[] = [];
  const imgRegex = /<image:representation[^>]*url="([^"]*)"[^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(adXml)) !== null) {
    images.push(match[1]);
  }
  // Fallback: try <image url="...">
  if (images.length === 0) {
    const fallbackRegex = /<image[^>]*url="([^"]*)"[^>]*>/gi;
    while ((match = fallbackRegex.exec(adXml)) !== null) {
      images.push(match[1]);
    }
  }
  return images;
}

function parseAds(xmlText: string): MobileDeAd[] {
  const ads: MobileDeAd[] = [];
  // Split by ad entries
  const adRegex = /<ad:ad\b[^>]*>([\s\S]*?)<\/ad:ad>/gi;
  let adMatch;

  while ((adMatch = adRegex.exec(xmlText)) !== null) {
    const adXml = adMatch[0];
    const adContent = adMatch[1];

    const id = parseXmlAttribute(adXml, "ad:ad", "key") ||
               parseXmlValue(adContent, "ad:key") ||
               parseXmlValue(adContent, "key") ||
               `unknown-${ads.length}`;

    const title = parseXmlValue(adContent, "ad:title") ||
                  parseXmlValue(adContent, "title") || "Unbekanntes Fahrzeug";

    const make = parseXmlAttribute(adContent, "ad:make", "key") ||
                 parseXmlValue(adContent, "ad:make") ||
                 parseXmlValue(adContent, "make");

    const model = parseXmlAttribute(adContent, "ad:model", "key") ||
                  parseXmlValue(adContent, "ad:model") ||
                  parseXmlValue(adContent, "model");

    const bodyType = parseXmlAttribute(adContent, "ad:body-type", "key") ||
                     parseXmlValue(adContent, "ad:body-type") ||
                     parseXmlValue(adContent, "body-type");

    const category = parseXmlAttribute(adContent, "ad:vehicle-class", "key") ||
                     parseXmlValue(adContent, "ad:vehicle-class") ||
                     parseXmlValue(adContent, "ad:category") ||
                     parseXmlValue(adContent, "category");

    const firstReg = parseXmlValue(adContent, "ad:first-registration") ||
                     parseXmlValue(adContent, "first-registration");

    const mileageStr = parseXmlAttribute(adContent, "ad:mileage", "value") ||
                       parseXmlValue(adContent, "ad:mileage") ||
                       parseXmlValue(adContent, "mileage");

    const priceStr = parseXmlAttribute(adContent, "ad:consumer-price-amount", "value") ||
                     parseXmlValue(adContent, "ad:consumer-price-amount") ||
                     parseXmlValue(adContent, "ad:price") ||
                     parseXmlValue(adContent, "price");

    const currency = parseXmlAttribute(adContent, "ad:consumer-price-amount", "currency") || "EUR";

    const images = parseImages(adXml);

    ads.push({
      id,
      title,
      category,
      make,
      model,
      bodyType,
      firstRegistration: firstReg,
      mileage: mileageStr ? parseInt(mileageStr, 10) : undefined,
      price: priceStr ? parseInt(priceStr, 10) : undefined,
      currency,
      images,
    });
  }

  return ads;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const username = Deno.env.get("MOBILE_DE_USERNAME");
    const password = Deno.env.get("MOBILE_DE_PASSWORD");
    const sellerKey = Deno.env.get("MOBILE_DE_SELLER_KEY");

    if (!username || !password || !sellerKey) {
      return new Response(
        JSON.stringify({ error: "Missing Mobile.de API credentials" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch ads from Mobile.de Search API
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
    console.log("Received XML response, length:", xmlText.length);
    // Log first ad XML for debugging field structure
    const firstAdMatch = xmlText.match(/<ad:ad\b[^>]*>[\s\S]*?<\/ad:ad>/i);
    if (firstAdMatch) {
      console.log("=== FIRST AD RAW XML ===");
      console.log(firstAdMatch[0].substring(0, 5000));
      console.log("=== END FIRST AD ===");
    }

    const ads = parseAds(xmlText);
    console.log(`Parsed ${ads.length} ads from Mobile.de`);

    // Connect to Supabase with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // Upsert all vehicles
    const vehicleRows = ads.map((ad) => ({
      mobile_de_id: ad.id,
      title: ad.title,
      category: ad.category || null,
      brand: ad.make || null,
      model: ad.model || null,
      body_type: ad.bodyType || null,
      year: ad.firstRegistration || null,
      mileage: ad.mileage || null,
      price: ad.price || null,
      currency: ad.currency || "EUR",
      image_urls: ad.images || [],
      description: ad.description || null,
      synced_at: now,
    }));

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
    }

    // Remove vehicles no longer in Mobile.de
    const mobileDeIds = ads.map((ad) => ad.id);
    if (mobileDeIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("vehicles")
        .delete()
        .not("mobile_de_id", "in", `(${mobileDeIds.map((id) => `"${id}"`).join(",")})`);

      if (deleteError) {
        console.error("Delete error:", deleteError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced: vehicleRows.length, removed_stale: true }),
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
