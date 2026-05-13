// Generate vehicle "story" mockup images (1080x1920) via SVG + resvg-wasm.
// Pixel-exact layout matching the Reller story template. Requires admin auth.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Story-E-Mails gehen NUR an digital@haushhaush.de.
// Optional via Edge-Secret STORY_EMAIL_RECIPIENT überschreibbar.
// (Inquiries und Alerts haben separate Empfänger in ihren eigenen Functions.)
const STORY_EMAIL_RECIPIENT =
  Deno.env.get("STORY_EMAIL_RECIPIENT") || "digital@haushhaush.de";

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
function fitTitle(text: string, maxWidth: number, maxLines: number) {
  const words = text.trim().split(/\s+/);
  // Try sizes from large to small
  const sizes = [100, 90, 82, 76, 70, 64, 58];
  for (const size of sizes) {
    const charW = size * 0.52;
    const maxChars = Math.floor(maxWidth / charW);
    // Greedy line-wrap
    const lines: string[] = [];
    let current = "";
    for (const w of words) {
      const candidate = current ? `${current} ${w}` : w;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines && lines.every((l) => l.length <= maxChars)) {
      return { lines, fontSize: size, lineHeight: Math.round(size * 1.1) };
    }
  }
  // Last resort: smallest size, truncate
  const size = 58;
  const charW = size * 0.52;
  const maxChars = Math.floor(maxWidth / charW);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxChars) current = candidate;
    else {
      if (current) lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && lines[maxLines - 1].length > maxChars) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxChars - 1) + "…";
  }
  return { lines: lines.slice(0, maxLines), fontSize: size, lineHeight: Math.round(size * 1.1) };
}

function generateSVG(vehicle: VehicleRow, imageDataUrl: string | null): string {
  const brand = (vehicle.brand || "").toUpperCase();
  const titleRaw = vehicle.model_description || vehicle.title || "";
  const title = fitTitle(titleRaw, 960, 3);

  const price = vehicle.price ? `${vehicle.price.toLocaleString("de-DE")}€` : "Auf Anfrage";
  const year = vehicle.year || "—";
  const power = vehicle.power
    ? `${vehicle.power}kW (${Math.round(vehicle.power * 1.36)}PS)`
    : "—";
  const mileage = vehicle.mileage ? `${vehicle.mileage.toLocaleString("de-DE")} KM` : "—";
  const fuel = vehicle.fuel || "—";
  const gearbox = vehicle.gearbox || "—";

  // Layout constants — header 400px tall, image overlaps by 80px
  const HEADER_H = 400;
  const IMAGE_Y = 320;
  const IMAGE_H = 700;
  const IMAGE_BOTTOM = IMAGE_Y + IMAGE_H; // 1020

  // Generous whitespace below image
  const brandY = IMAGE_BOTTOM + 90; // 1110
  const titleStartY = brandY + 140; // 1250 — baseline of first title line
  const titleBlockHeight = title.lines.length * title.lineHeight;
  const priceY = titleStartY - title.fontSize + titleBlockHeight + 60;
  const specY = priceY + 200;

  const specs: Array<[string, string]> = [
    ["Baujahr", year],
    ["Leistung", power],
    ["Kilometerstand", mileage],
    ["Kraftstoff", fuel],
    ["Getriebe", gearbox],
  ];
  const rowHeight = 50;
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
  <text x="540" y="200" font-family="Inter" font-weight="900" font-style="italic"
        font-size="100" fill="#FFFFFF" text-anchor="middle">Aktuell verfügbar</text>

  <!-- Header line 2 -->
  <text x="540" y="290" font-family="Inter" font-weight="400" font-style="italic"
        font-size="50" fill="#FFFFFF" text-anchor="middle">fahrzeuge.reller-automobile.de</text>

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

async function renderStoryPng(vehicle: VehicleRow): Promise<Uint8Array | null> {
  const sourceImage = vehicle.image_urls?.[0];
  if (!sourceImage) return null;

  await ensureWasm();
  await ensureFonts();

  const dataUrl = await fetchImageAsDataUrl(sourceImage);
  const svg = generateSVG(vehicle, dataUrl);

  const resvg = new Resvg(svg, {
    background: "#FFFFFF",
    fitTo: { mode: "width", value: 1080 },
    font: {
      fontBuffers,
      defaultFontFamily: "Inter",
      loadSystemFonts: false,
    },
  });
  return resvg.render().asPng();
}

async function uploadStoryImage(
  admin: ReturnType<typeof createClient>,
  vehicleId: string,
  pngBytes: Uint8Array,
): Promise<string | null> {
  const path = `${vehicleId}/${Date.now()}.png`;
  const { error } = await admin.storage
    .from("vehicle-stories")
    .upload(path, pngBytes, { contentType: "image/png", upsert: true });
  if (error) {
    console.error("Storage upload failed:", error);
    return null;
  }
  const { data } = admin.storage.from("vehicle-stories").getPublicUrl(path);
  return data.publicUrl;
}

async function sendDealerEmail(vehicle: VehicleRow, storyUrl: string) {
  if (!RESEND_API_KEY) return;
  const recipients = [STORY_EMAIL_RECIPIENT];
  const html = `
    <h2>Neue Story für ${escapeXml(vehicle.title)}</h2>
    <p>Eine neue Story wurde generiert.</p>
    <p><a href="${storyUrl}">Story-Bild öffnen</a></p>
    <p><img src="${storyUrl}" alt="Story" style="max-width: 360px; border-radius: 12px;" /></p>
  `;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Reller Portal <noreply@reller-automobile.de>",
      to: recipients,
      subject: `Story erstellt: ${vehicle.title}`,
      html,
    }),
  });
}

// ─── HTTP handler ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!Array.isArray(body.vehicleIds) || body.vehicleIds.length === 0) {
      return new Response(JSON.stringify({ error: "vehicleIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: vehicles } = await admin
      .from("vehicles")
      .select(
        "id, title, brand, model_description, price, image_urls, mileage, year, fuel, power, gearbox",
      )
      .in("id", body.vehicleIds);

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
            await sendDealerEmail(v, existing.story_image_url);
            await admin
              .from("vehicle_stories")
              .update({ sent_to_dealer: true, sent_at: new Date().toISOString() })
              .eq("id", existing.id);
            resent++;
            continue;
          }
        }

        const pngBytes = await renderStoryPng(v);
        if (!pngBytes) continue;
        const publicUrl = await uploadStoryImage(admin, v.id, pngBytes);
        if (!publicUrl) continue;
        await admin.from("vehicle_stories").insert({
          vehicle_id: v.id,
          story_image_url: publicUrl,
          generated_by: user.id,
          sent_to_dealer: !!RESEND_API_KEY,
          sent_at: RESEND_API_KEY ? new Date().toISOString() : null,
        });
        await sendDealerEmail(v, publicUrl);
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
