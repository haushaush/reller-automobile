// Backend-Helper: erzeugt das Exposé-PDF für ein Fahrzeug on demand
// (analog zum Exposé-Archiv-Download), legt es in den Bucket
// `vehicle-exposes` unter `exposes/<vehicleId>.pdf` ab, upsertet
// die Tabelle `vehicle_exposes` und liefert eine 7-Tage-Signed-URL.
//
// Wird vom Mail-Flow (notify-mobile-ad-published) verwendet, damit auch
// Fahrzeuge ohne vorhandenes PDF ein Exposé in der Mail bekommen.
// Hinweis: rendert serverseitig mit pdf-lib (keine React-Pipeline),
// das Layout ist an `src/components/VehicleExpose.tsx` angelehnt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "vehicle-exposes";
const EXPIRES_SECONDS = 60 * 60 * 24 * 7; // 7 days

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ─────────── label maps (kept inline to avoid frontend imports) ───────────
const BODY: Record<string, string> = {
  EstateCar: "Kombi", Cabrio: "Cabrio", Convertible: "Cabrio", Coupe: "Coupé",
  SmallCar: "Kleinwagen", Limousine: "Limousine", Saloon: "Limousine",
  SportsCar: "Sportwagen", Van: "Van", OffRoad: "SUV/Geländewagen",
  OffRoader: "SUV/Geländewagen", SUV: "SUV",
};
const FUEL: Record<string, string> = {
  Petrol: "Benzin", PETROL: "Benzin", Diesel: "Diesel", DIESEL: "Diesel",
  Electric: "Elektro", Electricity: "Elektro", ELECTRICITY: "Elektro",
  Hybrid: "Hybrid", HYBRID: "Hybrid",
  PluginHybrid: "Plug-in-Hybrid", PLUGIN_HYBRID: "Plug-in-Hybrid",
  LPG: "Autogas (LPG)", CNG: "Erdgas (CNG)",
};
const GEAR: Record<string, string> = {
  Automatic: "Automatik", AutomaticGear: "Automatik", AUTOMATIC_GEAR: "Automatik",
  Manual: "Schaltgetriebe", ManualGear: "Schaltgetriebe", MANUAL_GEAR: "Schaltgetriebe",
  SemiAutomatic: "Halbautomatik", SemiautomaticGear: "Halbautomatik", SEMIAUTOMATIC_GEAR: "Halbautomatik",
};
const CLIMA: Record<string, string> = {
  NoClimatisation: "Keine", ManualClimatisation: "Klimaanlage",
  AutomaticClimatisation: "Klimaautomatik",
  AutomaticClimatisation2Zones: "2-Zonen-Klimaautomatik",
  AutomaticClimatisation3Zones: "3-Zonen-Klimaautomatik",
  AutomaticClimatisation4Zones: "4-Zonen-Klimaautomatik",
};
const COND: Record<string, string> = {
  New: "Neufahrzeug", Used: "Gebrauchtfahrzeug",
  Demonstration: "Vorführwagen", EmployeesCar: "Mitarbeiterfahrzeug",
  PreRegistration: "Tageszulassung", NEW: "Neufahrzeug", USED: "Gebrauchtfahrzeug",
};
const mapLabel = (m: Record<string, string>, v: unknown) => {
  if (v === null || v === undefined || v === "") return undefined;
  const k = String(v);
  return m[k] ?? m[k.toUpperCase()] ?? k;
};

type Vehicle = Record<string, unknown>;

// Sanitize text for WinAnsi-encoded standard fonts: replace characters
// pdf-lib's Helvetica can't render (e.g. emoji, exotic glyphs) with "?".
function safe(text: string): string {
  // Basic replacement: keep Latin-1 range, fall back to "?" elsewhere.
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 63;
    out += c <= 0xff ? ch : "?";
  }
  return out;
}

async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; type: "jpg" | "png" } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const isPng = ct.includes("png") || (buf[0] === 0x89 && buf[1] === 0x50);
    return { bytes: buf, type: isPng ? "png" : "jpg" };
  } catch {
    return null;
  }
}

async function buildExposePdf(vehicle: Vehicle): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const accent = rgb(0.753, 0.224, 0.169); // ~ #c0392b
  const muted = rgb(0.4, 0.4, 0.4);
  const text = rgb(0.13, 0.13, 0.13);
  const border = rgb(0.93, 0.93, 0.93);

  const A4 = { w: 595.28, h: 841.89 };
  const margin = 40;

  const imageUrls = Array.isArray(vehicle.image_urls) ? (vehicle.image_urls as string[]) : [];
  const mainUrl = imageUrls[0];
  const moreUrls = imageUrls.slice(1, 7);

  const power = Number(vehicle.power);
  const ps = Number.isFinite(power) && power > 0 ? Math.round(power * 1.35962) : null;
  const priceVal = Number(vehicle.price);
  const formattedPrice = Number.isFinite(priceVal) && priceVal > 0
    ? `${Math.round(priceVal).toLocaleString("de-DE")} ${String(vehicle.currency || "€")}`
    : null;

  const specs: [string, string][] = [
    ["Baujahr", String(vehicle.year ?? "") || "–"],
    ["Kilometerstand", Number.isFinite(Number(vehicle.mileage)) && Number(vehicle.mileage) >= 0
      ? `${Number(vehicle.mileage).toLocaleString("de-DE")} km` : "–"],
    ["Leistung", Number.isFinite(power) && power > 0 ? `${power} kW (${ps} PS)` : "–"],
    ["Hubraum", Number.isFinite(Number(vehicle.cubic_capacity)) && Number(vehicle.cubic_capacity) > 0
      ? `${Number(vehicle.cubic_capacity).toLocaleString("de-DE")} cm³` : "–"],
    ["Getriebe", mapLabel(GEAR, vehicle.gearbox) ?? "–"],
    ["Kraftstoff", mapLabel(FUEL, vehicle.fuel) ?? "–"],
    ["Karosserie", mapLabel(BODY, vehicle.body_type) ?? "–"],
    ["Farbe außen", String(vehicle.exterior_color ?? "") || "–"],
    ["Farbe innen", String(vehicle.interior_color ?? "") || "–"],
    ["Sitze", vehicle.num_seats != null ? String(vehicle.num_seats) : "–"],
    ["Klimaanlage", mapLabel(CLIMA, vehicle.climatisation) ?? "–"],
    ["Zustand", mapLabel(COND, vehicle.condition) ?? "–"],
    ["MwSt. ausweisbar", vehicle.vatable === true ? "Ja" : vehicle.vatable === false ? "Nein" : "–"],
  ];

  // ───────────── Page 1 ─────────────
  const page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - margin;

  // Header
  page.drawText(safe("Reller Automobile GmbH"), { x: margin, y: y - 14, font: bold, size: 16, color: accent });
  y -= 22;
  page.drawText(
    safe("Steinbruchweg 16-22, 33106 Paderborn | Tel: 05251 69 42 40 | info@reller-automobile.de"),
    { x: margin, y: y - 10, font, size: 8, color: muted },
  );
  y -= 18;
  page.drawLine({
    start: { x: margin, y },
    end: { x: A4.w - margin, y },
    thickness: 2,
    color: accent,
  });
  y -= 14;

  // Main image
  if (mainUrl) {
    const img = await fetchImageBytes(mainUrl);
    if (img) {
      try {
        const embed = img.type === "png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
        const targetW = A4.w - margin * 2;
        const targetH = 260;
        // letterbox-style scale (cover-like, using max ratio so it fills)
        const ratio = Math.max(targetW / embed.width, targetH / embed.height);
        const drawW = embed.width * ratio;
        const drawH = embed.height * ratio;
        const cx = margin + targetW / 2;
        const cy = (y - targetH) + targetH / 2;
        page.drawRectangle({ x: margin, y: y - targetH, width: targetW, height: targetH, color: rgb(0.95, 0.95, 0.95) });
        // Note: pdf-lib has no clip; we just draw scaled-to-fit (contain) to avoid overflow.
        const ratioContain = Math.min(targetW / embed.width, targetH / embed.height);
        const wC = embed.width * ratioContain;
        const hC = embed.height * ratioContain;
        page.drawImage(embed, {
          x: cx - wC / 2,
          y: cy - hC / 2,
          width: wC,
          height: hC,
        });
        y -= targetH + 12;
        // suppress unused vars warning
        void drawW; void drawH; void ratio;
      } catch (e) {
        console.warn(`ensure-vehicle-expose: main image embed failed: ${(e as Error).message}`);
      }
    }
  }

  // Title
  const title = String(vehicle.title ?? "Fahrzeug");
  page.drawText(safe(title), { x: margin, y: y - 16, font: bold, size: 18, color: text });
  y -= 24;

  if (formattedPrice) {
    page.drawText(safe(formattedPrice), { x: margin, y: y - 16, font: bold, size: 16, color: accent });
    y -= 24;
  }

  // Specs section title
  y -= 6;
  page.drawText(safe("Technische Daten"), { x: margin, y: y - 12, font: bold, size: 13, color: text });
  y -= 18;

  const colLabelW = (A4.w - margin * 2) * 0.4;
  for (const [label, value] of specs) {
    if (y < margin + 80) break; // leave space for footer
    page.drawText(safe(label), { x: margin, y: y - 10, font: bold, size: 9, color: muted });
    page.drawText(safe(value).slice(0, 90), {
      x: margin + colLabelW, y: y - 10, font, size: 9, color: text,
    });
    y -= 16;
    page.drawLine({
      start: { x: margin, y: y + 2 },
      end: { x: A4.w - margin, y: y + 2 },
      thickness: 0.5, color: border,
    });
  }

  // Description (if fits)
  const description = String(vehicle.description ?? "").trim();
  if (description && y > margin + 120) {
    y -= 10;
    page.drawText(safe("Beschreibung"), { x: margin, y: y - 12, font: bold, size: 13, color: text });
    y -= 18;
    const maxWidth = A4.w - margin * 2;
    const words = safe(description).split(/\s+/);
    let line = "";
    const lineHeight = 12;
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      const width = font.widthOfTextAtSize(trial, 9);
      if (width > maxWidth) {
        if (y < margin + 60) break;
        page.drawText(line, { x: margin, y: y - 10, font, size: 9, color: rgb(0.27, 0.27, 0.27) });
        y -= lineHeight;
        line = w;
      } else {
        line = trial;
      }
    }
    if (line && y > margin + 60) {
      page.drawText(line, { x: margin, y: y - 10, font, size: 9, color: rgb(0.27, 0.27, 0.27) });
      y -= lineHeight;
    }
  }

  // Footer
  const today = new Date().toLocaleDateString("de-DE");
  page.drawLine({
    start: { x: margin, y: margin + 22 },
    end: { x: A4.w - margin, y: margin + 22 },
    thickness: 0.5, color: rgb(0.87, 0.87, 0.87),
  });
  page.drawText(
    safe(`Dieses Exposé wurde automatisch erstellt. Alle Angaben ohne Gewähr. Stand: ${today}`),
    { x: margin, y: margin + 12, font, size: 7, color: rgb(0.6, 0.6, 0.6) },
  );
  page.drawText(
    safe("Reller Automobile GmbH – Steinbruchweg 16-22, 33106 Paderborn – 05251 69 42 40"),
    { x: margin, y: margin + 2, font, size: 7, color: rgb(0.6, 0.6, 0.6) },
  );

  // ───────────── Page 2: extra images ─────────────
  if (moreUrls.length > 0) {
    const p2 = doc.addPage([A4.w, A4.h]);
    let y2 = A4.h - margin;
    p2.drawText(safe("Weitere Bilder"), { x: margin, y: y2 - 12, font: bold, size: 13, color: text });
    y2 -= 22;
    const gap = 10;
    const cellW = (A4.w - margin * 2 - gap) / 2;
    const cellH = 160;
    let col = 0;
    let rowY = y2 - cellH;
    for (const url of moreUrls) {
      const img = await fetchImageBytes(url);
      if (!img) continue;
      try {
        const embed = img.type === "png" ? await p2.doc.embedPng(img.bytes) : await p2.doc.embedJpg(img.bytes);
        const ratio = Math.min(cellW / embed.width, cellH / embed.height);
        const w = embed.width * ratio;
        const h = embed.height * ratio;
        const cx = margin + col * (cellW + gap) + cellW / 2;
        const cy = rowY + cellH / 2;
        p2.drawRectangle({
          x: margin + col * (cellW + gap), y: rowY, width: cellW, height: cellH,
          color: rgb(0.95, 0.95, 0.95),
        });
        p2.drawImage(embed, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
      } catch (e) {
        console.warn(`ensure-vehicle-expose: extra image embed failed: ${(e as Error).message}`);
      }
      col = (col + 1) % 2;
      if (col === 0) {
        rowY -= cellH + gap;
        if (rowY < margin + 30) break;
      }
    }
    p2.drawText(
      safe("Reller Automobile GmbH – Steinbruchweg 16-22, 33106 Paderborn – 05251 69 42 40"),
      { x: margin, y: margin + 2, font, size: 7, color: rgb(0.6, 0.6, 0.6) },
    );
  }

  return await doc.save();
}

async function existingPdfPath(
  admin: ReturnType<typeof createClient>,
  vehicleId: string,
): Promise<string | null> {
  const path = `exposes/${vehicleId}.pdf`;
  try {
    const { data } = await admin.storage.from(BUCKET).list("exposes", {
      search: `${vehicleId}.pdf`,
      limit: 5,
    });
    if ((data ?? []).some((f) => f.name === `${vehicleId}.pdf`)) return path;
  } catch (e) {
    console.warn(`ensure-vehicle-expose: list failed: ${(e as Error).message}`);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const isService = token === SUPABASE_SERVICE_ROLE_KEY;
    let userId: string | null = null;
    if (!isService) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
      if (cErr || !claims?.claims?.sub) return json(401, { error: "Unauthorized" });
      userId = claims.claims.sub as string;
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleRow) return json(403, { error: "Forbidden" });
    }

    const body = await req.json().catch(() => ({}));
    const vehicleId = String((body as { vehicleId?: string }).vehicleId ?? "").trim();
    const force = Boolean((body as { force?: boolean }).force);
    if (!vehicleId) return json(400, { error: "vehicleId required" });

    console.log(`ensure-vehicle-expose: vehicleId=${vehicleId} force=${force} caller=${isService ? "service" : userId}`);

    const path = `exposes/${vehicleId}.pdf`;

    // 1) Reuse existing PDF if available and not forced
    let pdfExists = false;
    if (!force) {
      const found = await existingPdfPath(admin, vehicleId);
      pdfExists = Boolean(found);
      console.log(`ensure-vehicle-expose: ${vehicleId} existing pdf=${pdfExists}`);
    }

    // 2) Otherwise build & upload
    if (!pdfExists) {
      const { data: vehicle, error: vErr } = await admin
        .from("vehicles").select("*").eq("id", vehicleId).maybeSingle();
      if (vErr || !vehicle) {
        console.warn(`ensure-vehicle-expose: vehicle not found ${vehicleId}: ${vErr?.message ?? "n/a"}`);
        return json(404, { error: "Vehicle not found" });
      }
      console.log(`ensure-vehicle-expose: vehicle loaded ${vehicleId} title="${(vehicle as Vehicle).title ?? ""}"`);

      let pdfBytes: Uint8Array;
      try {
        pdfBytes = await buildExposePdf(vehicle as Vehicle);
        console.log(`ensure-vehicle-expose: pdf built (${pdfBytes.byteLength} bytes) ${vehicleId}`);
      } catch (e) {
        console.error(`ensure-vehicle-expose: build failed ${vehicleId}: ${(e as Error).message}`);
        return json(500, { error: `PDF build failed: ${(e as Error).message}` });
      }

      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, pdfBytes, {
        contentType: "application/pdf", upsert: true,
      });
      if (upErr) {
        console.error(`ensure-vehicle-expose: upload failed ${vehicleId}: ${upErr.message}`);
        return json(500, { error: `Upload failed: ${upErr.message}` });
      }
      console.log(`ensure-vehicle-expose: uploaded ${path}`);

      const { error: dbErr } = await admin.from("vehicle_exposes").upsert(
        {
          vehicle_id: vehicleId,
          pdf_url: path,
          created_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "vehicle_id" },
      );
      if (dbErr) console.warn(`ensure-vehicle-expose: db upsert failed ${vehicleId}: ${dbErr.message}`);
    }

    // 3) Signed URL (7d)
    const { data: signed, error: sErr } = await admin.storage
      .from(BUCKET).createSignedUrl(path, EXPIRES_SECONDS);
    if (sErr || !signed?.signedUrl) {
      console.error(`ensure-vehicle-expose: signed url failed ${vehicleId}: ${sErr?.message ?? "n/a"}`);
      return json(500, { error: `Signed URL failed: ${sErr?.message ?? "unknown"}` });
    }
    console.log(`ensure-vehicle-expose: signed url ok ${vehicleId}`);

    return json(200, {
      success: true,
      path,
      signedUrl: signed.signedUrl,
      generated: !pdfExists,
    });
  } catch (err) {
    console.error("ensure-vehicle-expose fatal:", (err as Error).message);
    return json(500, { error: (err as Error).message });
  }
});
