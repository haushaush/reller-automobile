// Generate vehicle "story" mockup images (1080x1920) via SVG + resvg-wasm.
// Pixel-exact layout matching the Reller story template. Requires admin auth.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Story-Empfänger werden primär aus public.app_settings (key 'story_email_recipients')
// geladen. Fallback: Edge-Secret STORY_EMAIL_RECIPIENT, danach harte Defaults.
const STORY_EMAIL_DEFAULTS = (
  Deno.env.get("STORY_EMAIL_RECIPIENT") || "info@reller-automobile.de,digital@haushhaush.de"
).split(",").map((e) => e.trim()).filter(Boolean);

async function loadStoryRecipients(
  admin: ReturnType<typeof createClient>,
): Promise<string[]> {
  try {
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "story_email_recipients")
      .maybeSingle();
    const value = data?.value;
    if (Array.isArray(value)) {
      const emails = (value as unknown[])
        .filter((v): v is string => typeof v === "string")
        .map((e) => e.trim())
        .filter(Boolean);
      if (emails.length > 0) return emails;
    }
  } catch (err) {
    console.error("Failed to load story recipients from app_settings:", err);
  }
  return STORY_EMAIL_DEFAULTS;
}

async function loadStoryContactString(
  admin: ReturnType<typeof createClient>,
  key: "story_contact_phone" | "story_contact_email",
): Promise<string> {
  try {
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const raw = data?.value;
    if (raw === null || raw === undefined) return "";
    if (typeof raw !== "string") return "";
    let out = raw.trim();
    // Handle double-encoded JSON strings like "\"foo@bar.de\""
    if (out.startsWith('"') && out.endsWith('"')) {
      try {
        const parsed = JSON.parse(out);
        if (typeof parsed === "string") out = parsed.trim();
      } catch {
        // not valid JSON; strip surrounding quotes below
      }
    }
    // Final safety: strip any remaining surrounding quotes
    if (out.startsWith('"') && out.endsWith('"')) {
      out = out.slice(1, -1).trim();
    }
    return out;
  } catch (err) {
    console.error(`Failed to load ${key} from app_settings:`, err);
    return "";
  }
}


// Font URLs — fallback Inter (italic) from jsdelivr fontsource CDN.
// To swap to JustSans: upload TTF files to a public storage bucket and replace these URLs.
const FONT_URLS = [
  "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-900-italic.woff2",
  "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-400-italic.woff2",
  "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-900-normal.woff2",
  "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-400-normal.woff2",
];

interface RequestBody {
  vehicleIds: string[];
  forceResend?: boolean;
  skipDealerEmail?: boolean;
}

interface VehicleRow {
  id: string;
  title: string;
  brand: string | null;
  model_description: string | null;
  price: number | null;
  image_urls: string[] | null;
  mileage: number | null;
  year: string | null;
  fuel: string | null;
  power: number | null;
  gearbox: string | null;
}

// ─── WASM + font init (module scope, cached across invocations) ─────────────
let wasmReady: Promise<void> | null = null;
let fontBuffers: Uint8Array[] = [];

async function ensureWasm() {
  if (!wasmReady) {
    wasmReady = (async () => {
      const wasmRes = await fetch("https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm");
      await initWasm(await wasmRes.arrayBuffer());
    })();
  }
  await wasmReady;
}

async function ensureFonts() {
  if (fontBuffers.length > 0) return;
  const results = await Promise.all(
    FONT_URLS.map(async (u) => {
      try {
        const r = await fetch(u);
        if (!r.ok) return null;
        return new Uint8Array(await r.arrayBuffer());
      } catch {
        return null;
      }
    }),
  );
  fontBuffers = results.filter((b): b is Uint8Array => b !== null);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapTextSmart(text: string, maxCharsPerLine: number): string[] {
  const t = text.trim();
  if (t.length <= maxCharsPerLine) return [t];

  const words = t.split(/\s+/);
  // Find best split that balances line lengths
  let bestSplit = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(" ");
    const right = words.slice(i).join(" ");
    if (left.length > maxCharsPerLine || right.length > maxCharsPerLine + 4) continue;
    const diff = Math.abs(left.length - right.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplit = i;
    }
  }
  const line1 = words.slice(0, bestSplit).join(" ");
  let line2 = words.slice(bestSplit).join(" ");
  // Truncate line 2 if still too long
  if (line2.length > maxCharsPerLine + 4) {
    line2 = line2.slice(0, maxCharsPerLine + 1).trimEnd() + "…";
  }
  return [line1, line2];
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "image/jpeg";
    const buf = new Uint8Array(await res.arrayBuffer());
    // Base64 encode in chunks to avoid stack overflow
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return `data:${ct};base64,${btoa(binary)}`;
  } catch (e) {
    console.error("fetchImageAsDataUrl failed:", e);
    return null;
  }
}

// ─── SVG composition ────────────────────────────────────────────────────────
// Dynamic title sizing: pick the largest font that fits within `maxWidth` and
// at most `maxLines`. Approximation uses avgCharWidth ≈ fontSize * 0.52 for
// Inter Black Italic.
function wrapLines(text: string, maxWidth: number, fontSize: number, charRatio = 0.52): string[] {
  const charW = fontSize * charRatio;
  const maxChars = Math.max(1, Math.floor(maxWidth / charW));
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxChars) current = candidate;
    else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Pick the largest font that fits within maxWidth, maxLines AND availableHeight.
// More lines force smaller font sizes so the entire composition fits in 1920px.
function fitTitle(text: string, maxWidth: number, availableHeight: number) {
  const configs: Array<{ maxLines: number; fontSize: number }> = [
    { maxLines: 1, fontSize: 100 },
    { maxLines: 1, fontSize: 90 },
    { maxLines: 2, fontSize: 90 },
    { maxLines: 2, fontSize: 80 },
    { maxLines: 2, fontSize: 72 },
    { maxLines: 3, fontSize: 70 },
    { maxLines: 3, fontSize: 64 },
    { maxLines: 3, fontSize: 56 },
    { maxLines: 4, fontSize: 50 },
    { maxLines: 4, fontSize: 44 },
  ];
  for (const c of configs) {
    const lines = wrapLines(text, maxWidth, c.fontSize);
    const lineHeight = Math.round(c.fontSize * 1.1);
    const totalH = lines.length * lineHeight;
    if (lines.length <= c.maxLines && totalH <= availableHeight) {
      return { lines, fontSize: c.fontSize, lineHeight };
    }
  }
  // Ultimate fallback
  const size = 38;
  const lines = wrapLines(text, maxWidth, size).slice(0, 4);
  return { lines, fontSize: size, lineHeight: Math.round(size * 1.1) };
}

function generateSVG(
  vehicle: VehicleRow,
  imageDataUrl: string | null,
  contactPhone?: string,
  contactEmail?: string,
): string {
  const brand = (vehicle.brand || "").toUpperCase();
  const titleRaw = vehicle.model_description || vehicle.title || "";

  const price = vehicle.price ? `${vehicle.price.toLocaleString("de-DE")}€` : "Auf Anfrage";
  const year = vehicle.year || "—";
  const power = vehicle.power
    ? `${vehicle.power}kW (${Math.round(vehicle.power * 1.36)}PS)`
    : "—";
  const mileage = vehicle.mileage ? `${vehicle.mileage.toLocaleString("de-DE")} KM` : "—";
  const fuel = vehicle.fuel || "—";
  const gearbox = vehicle.gearbox || "—";

  // === Y-POSITIONS ===
  const TOTAL_HEIGHT = 1920;
  const BOTTOM_MARGIN = 60;

  const HEADER_H = 400;
  const IMAGE_Y = 320;
  const IMAGE_H = 700;
  const IMAGE_BOTTOM = IMAGE_Y + IMAGE_H; // 1020

  const brandY = IMAGE_BOTTOM + 90; // 1110

  // Spec table pinned to bottom
  const SPEC_ROW_HEIGHT = 50;
  const SPEC_BOX_HEIGHT = 290;
  const specY = TOTAL_HEIGHT - BOTTOM_MARGIN - SPEC_BOX_HEIGHT; // 1570

  // Price box directly above spec table
  const PRICE_BOX_HEIGHT = 150;
  const priceY = specY - 60 - PRICE_BOX_HEIGHT; // 1360

  // Title fits in the space between brand and price box
  const titleAvailableHeight = priceY - brandY - 220; // padding above & below
  const title = fitTitle(titleRaw, 960, Math.max(120, titleAvailableHeight));
  const titleStartY = brandY + 140;

  const specs: Array<[string, string]> = [
    ["Baujahr", year],
    ["Leistung", power],
    ["Kilometerstand", mileage],
    ["Kraftstoff", fuel],
    ["Getriebe", gearbox],
  ];
  const rowHeight = SPEC_ROW_HEIGHT;
  const firstRowY = specY + 65;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <clipPath id="imageClip">
      <rect x="60" y="${IMAGE_Y}" width="960" height="${IMAGE_H}" rx="32" ry="32"/>
    </clipPath>
  </defs>

  <!-- White body -->
  <rect width="1080" height="1920" fill="#FFFFFF"/>

  <!-- Header bar: full width, 400px tall -->
  <rect x="0" y="0" width="1080" height="${HEADER_H}" fill="#10182d"/>

  <!-- Header line 1 -->
  <text x="540" y="160" font-family="Inter" font-weight="900" font-style="italic"
        font-size="100" fill="#FFFFFF" text-anchor="middle">Aktuell verfügbar</text>

  <!-- Header line 2 -->
  <text x="540" y="235" font-family="Inter" font-weight="400" font-style="italic"
        font-size="50" fill="#FFFFFF" text-anchor="middle">fahrzeuge.reller-automobile.de</text>

  <!-- Header line 3: contact (optional) -->
  ${(() => {
    const phone = (contactPhone || "").trim();
    const email = (contactEmail || "").trim();
    if (!phone && !email) return "";
    const parts: string[] = [];
    if (phone) parts.push(`Tel: ${phone}`);
    if (email) parts.push(email);
    const line = parts.join("   •   ");
    return `<text x="540" y="295" font-family="Inter" font-weight="400" font-style="normal"
        font-size="38" fill="#FFFFFF" text-anchor="middle">${escapeXml(line)}</text>`;
  })()}

  <!-- Vehicle image (overlaps header by 80px) -->
  ${
    imageDataUrl
      ? `<image x="60" y="${IMAGE_Y}" width="960" height="${IMAGE_H}" href="${imageDataUrl}" preserveAspectRatio="xMidYMid slice" clip-path="url(#imageClip)"/>`
      : `<rect x="60" y="${IMAGE_Y}" width="960" height="${IMAGE_H}" rx="32" fill="#E5E5E5"/>`
  }

  <!-- Brand label -->
  <text x="540" y="${brandY}" font-family="Inter" font-weight="400" font-style="italic"
        font-size="52" fill="#10182d" text-anchor="middle" letter-spacing="10">${escapeXml(brand)}</text>

  <!-- Model title (dynamic size) -->
  ${title.lines
    .map(
      (line, i) =>
        `<text x="540" y="${titleStartY + i * title.lineHeight}" font-family="Inter" font-weight="900" font-style="italic"
              font-size="${title.fontSize}" fill="#000000" text-anchor="middle">${escapeXml(line)}</text>`,
    )
    .join("\n  ")}

  <!-- Price box -->
  <rect x="240" y="${priceY}" width="600" height="150" rx="32" fill="#10182d"/>
  <text x="540" y="${priceY + 102}" font-family="Inter" font-weight="900"
        font-size="84" fill="#FFFFFF" text-anchor="middle">${escapeXml(price)}</text>

  <!-- Spec table border -->
  <rect x="60" y="${specY}" width="960" height="290" rx="32" fill="none" stroke="#10182d" stroke-width="5"/>

  <!-- Spec rows -->
  ${specs
    .map(([label, value], i) => {
      const rowY = firstRowY + i * rowHeight;
      return `<text x="120" y="${rowY}" font-family="Inter" font-weight="900" font-style="italic"
                  font-size="44" fill="#10182d">${escapeXml(label)}</text>
  <text x="960" y="${rowY}" font-family="Inter" font-weight="400"
        font-size="44" fill="#333333" text-anchor="end">${escapeXml(value)}</text>`;
    })
    .join("\n  ")}
</svg>`;
}

async function renderStoryJpg(
  vehicle: VehicleRow,
  contactPhone?: string,
  contactEmail?: string,
): Promise<Uint8Array | null> {
  const sourceImage = vehicle.image_urls?.[0];
  if (!sourceImage) return null;

  await ensureWasm();
  await ensureFonts();

  const dataUrl = await fetchImageAsDataUrl(sourceImage);
  const svg = generateSVG(vehicle, dataUrl, contactPhone, contactEmail);

  const resvg = new Resvg(svg, {
    background: "#FFFFFF",
    fitTo: { mode: "width", value: 1080 },
    font: {
      fontBuffers,
      defaultFontFamily: "Inter",
      loadSystemFonts: false,
    },
  });
  const pngBytes = resvg.render().asPng();

  // Convert PNG → JPG: iOS/Android mail clients recognize JPGs as photos
  // (offering "Save to Photos" on long-press). PNG is often offered only as a file.
  try {
    const image = await Image.decode(pngBytes);
    const jpgBytes = await image.encodeJPEG(92);
    return jpgBytes;
  } catch (err) {
    console.error("PNG→JPG conversion failed, falling back to PNG:", err);
    return pngBytes;
  }
}

async function uploadStoryImage(
  admin: ReturnType<typeof createClient>,
  vehicleId: string,
  imageBytes: Uint8Array,
): Promise<string | null> {
  // Detect JPG vs PNG by magic bytes (JPG starts with 0xFF 0xD8)
  const isJpg = imageBytes[0] === 0xff && imageBytes[1] === 0xd8;
  const ext = isJpg ? "jpg" : "png";
  const contentType = isJpg ? "image/jpeg" : "image/png";
  const path = `${vehicleId}/${Date.now()}.${ext}`;
  const { error } = await admin.storage
    .from("vehicle-stories")
    .upload(path, imageBytes, { contentType, upsert: true });
  if (error) {
    console.error("Storage upload failed:", error);
    return null;
  }
  const { data } = admin.storage.from("vehicle-stories").getPublicUrl(path);
  return data.publicUrl;
}

async function sendDealerEmail(
  admin: ReturnType<typeof createClient>,
  vehicle: VehicleRow,
  storyId: string,
  storyUrl: string,
  recipients: string[],
) {
  try {
    const adminWithAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: {
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      },
    });

    await Promise.all(recipients.map((recipient) =>
      adminWithAuth.functions.invoke("send-transactional-email", {
        body: {
          templateName: "stories-digest",
          recipientEmail: recipient,
          idempotencyKey: `stories-digest-${storyId}-${recipient}`,
          templateData: {
            count: 1,
            stories: [{
              imageUrl: storyUrl,
              title: vehicle.title,
              brand: vehicle.brand ?? "",
              price: vehicle.price ? `${Number(vehicle.price).toLocaleString("de-DE")} €` : "Auf Anfrage",
            }],
          },
        },
      })
    ));
  } catch (err) {
    console.error("Dealer email failed:", err);
  }
}

// ─── HTTP handler ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let userId: string | null = null;
    // Service-role bypass: internal callers (e.g. daily-story-digest cron job)
    // present the service-role key directly and skip the admin check.
    if (token === SUPABASE_SERVICE_ROLE_KEY) {
      userId = null;
    } else {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claimsData.claims.sub as string;
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = (await req.json()) as RequestBody;
    if (!Array.isArray(body.vehicleIds) || body.vehicleIds.length === 0) {
      return new Response(JSON.stringify({ error: "vehicleIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // admin client already created above
    const { data: vehicles } = await admin
      .from("vehicles")
      .select(
        "id, title, brand, model_description, price, image_urls, mileage, year, fuel, power, gearbox",
      )
      .in("id", body.vehicleIds);

    const recipients = await loadStoryRecipients(admin);
    const contactPhone = await loadStoryContactString(admin, "story_contact_phone");
    const contactEmail = await loadStoryContactString(admin, "story_contact_email");
    console.log("Story contact loaded:", { contactPhone, contactEmail });


    let generated = 0;
    let resent = 0;
    for (const v of (vehicles ?? []) as VehicleRow[]) {
      try {
        if (body.forceResend) {
          const { data: existing } = await admin
            .from("vehicle_stories")
            .select("id, story_image_url")
            .eq("vehicle_id", v.id)
            .order("generated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (existing?.story_image_url) {
            await sendDealerEmail(admin, v, existing.id, existing.story_image_url, recipients);
            await admin
              .from("vehicle_stories")
              .update({ sent_to_dealer: true, sent_at: new Date().toISOString() })
              .eq("id", existing.id);
            resent++;
            continue;
          }
        }

        const imageBytes = await renderStoryJpg(v, contactPhone, contactEmail);
        if (!imageBytes) continue;
        const publicUrl = await uploadStoryImage(admin, v.id, imageBytes);
        if (!publicUrl) continue;
        const { data: inserted } = await admin.from("vehicle_stories").insert({
          vehicle_id: v.id,
          story_image_url: publicUrl,
          generated_by: userId,
          sent_to_dealer: true,
          sent_at: new Date().toISOString(),
        }).select("id").single();
        if (inserted?.id) {
          await sendDealerEmail(admin, v, inserted.id, publicUrl, recipients);
        }
        generated++;
      } catch (err) {
        console.error("Story failed for", v.id, err);
      }
    }

    return new Response(JSON.stringify({ generated, resent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
