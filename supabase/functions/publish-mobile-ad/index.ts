// Publishes a mobile_ad_drafts row as a real ad on Mobile.de Seller-API.
// Admin-only. Uploads images first (JPEG, <=2MB), then creates the ad with image refs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// imagescript: pure-TS image lib that runs in Deno without native deps
import { decode as decodeImage, Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOBILE_USER = Deno.env.get("MOBILE_DE_USERNAME")!;
const MOBILE_PASS = Deno.env.get("MOBILE_DE_PASSWORD")!;

const SELLER_ID = "451040";
const API_BASE = "https://services.mobile.de/seller-api";
const MOBILE_MIME = "application/vnd.de.mobile.api+json";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MiB cap per Mobile.de

function basicAuth(): string {
  return `Basic ${btoa(`${MOBILE_USER}:${MOBILE_PASS}`)}`;
}

function detectFormat(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  return "unknown";
}

async function ensureJpegUnder2MB(input: Uint8Array): Promise<Uint8Array> {
  // ALWAYS decode + re-encode as real JPEG, never trust file extension/content-type.
  const decoded = await decodeImage(input);
  if (!(decoded instanceof Image)) {
    throw new Error("Unsupported image format (multi-frame / not a static image)");
  }
  const qualities = [90, 80, 70, 60, 50, 40, 30];
  // First try original size at decreasing quality
  for (const q of qualities) {
    const buf = await decoded.encodeJPEG(q);
    if (buf.byteLength <= MAX_IMAGE_BYTES) return buf;
  }
  // Still too big: progressively shrink
  let scale = 0.8;
  while (scale >= 0.2) {
    const w = Math.max(640, Math.round(decoded.width * scale));
    const h = Math.max(480, Math.round(decoded.height * scale));
    const img = decoded.clone().resize(w, h);
    for (const q of qualities) {
      const buf = await img.encodeJPEG(q);
      if (buf.byteLength <= MAX_IMAGE_BYTES) return buf;
    }
    scale -= 0.15;
  }
  throw new Error("Bild konnte nicht unter 2 MB komprimiert werden");
}

async function uploadOneImage(jpeg: Uint8Array, filename: string): Promise<string> {
  // Mobile.de Seller-API: POST /sellers/{sellerId}/ads/images  (multipart, part name "image")
  // Reference: https://services.mobile.de/seller-api/openapi-docs  (operation "Upload Image")
  const url = `${API_BASE}/sellers/${SELLER_ID}/ads/images`;
  const form = new FormData();
  form.append("image", new Blob([jpeg], { type: "image/jpeg" }), filename);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      Accept: MOBILE_MIME,
    },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Image upload failed ${res.status}: ${text.slice(0, 500)}`);
    throw new Error(`Image upload failed (${res.status}): ${text.slice(0, 300)}`);
  }
  // Response is JSON with the image reference. Tolerate a few shapes.
  let ref: string | undefined;
  try {
    const j = JSON.parse(text);
    ref = j?.reference ?? j?.ref ?? j?.hash ?? j?.imageReference ?? j?.id;
    if (!ref && Array.isArray(j?.images) && j.images[0]) {
      ref = j.images[0]?.ref ?? j.images[0]?.reference;
    }
  } catch {
    // Some responses may put the reference in a header
    ref = res.headers.get("Location")?.split("/").pop() ?? undefined;
  }
  if (!ref) {
    console.error("No image reference in upload response:", text.slice(0, 500));
    throw new Error("Mobile.de Upload-Antwort ohne Bildreferenz");
  }
  console.log(`Uploaded image -> ref=${ref}`);
  return String(ref);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── Admin auth ────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json(401, { error: "Unauthorized" });
    const userId = claimsData.claims.sub as string;
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json(403, { error: "Forbidden" });

    // ── Input ─────────────────────────────────────────────────
    let draftId: string | undefined;
    try {
      const body = await req.json();
      draftId = body?.draftId;
    } catch { /* empty body */ }
    if (!draftId) return json(400, { error: "draftId required" });

    const { data: draft, error: draftErr } = await admin
      .from("mobile_ad_drafts")
      .select("id, status, payload, image_paths")
      .eq("id", draftId)
      .maybeSingle();
    if (draftErr || !draft) return json(404, { error: "Draft not found" });
    if (draft.status === "published") return json(400, { error: "Entwurf ist bereits veröffentlicht" });

    const payload = (draft.payload ?? {}) as Record<string, unknown>;
    const imagePaths = (draft.image_paths ?? []) as string[];
    console.log(`Publishing draft ${draftId}, ${imagePaths.length} image(s)`);

    // ── Build flat Mobile.de payload from nested draft structure ──
    const vehicle = (payload.vehicle ?? {}) as Record<string, unknown>;
    const price = (payload.price ?? {}) as Record<string, unknown>;
    const getKey = (v: unknown): string | undefined => {
      if (v && typeof v === "object" && typeof (v as { key?: unknown }).key === "string") {
        return (v as { key: string }).key;
      }
      return undefined;
    };
    const rawAmount = price.consumerPriceGross ?? price["consumer-price-gross"] ?? "";
    const cleanAmount = String(rawAmount).replace(/[^0-9]/g, "");
    const rawVat = price.vatRate ?? price["vat-rate"] ?? "19.00";

    const mobilePayload: Record<string, unknown> = {
      vehicleClass: "Car",
      make: getKey(vehicle.make),
      model: getKey(vehicle.model),
      modelDescription: vehicle["model-description"],
      category: getKey(vehicle.category),
      mileage: vehicle.mileage,
      firstRegistration: vehicle["first-registration"],
      fuel: getKey(vehicle.fuel),
      gearbox: getKey(vehicle.gearbox),
      power: vehicle.power,
      cubicCapacity: vehicle["cubic-capacity"],
      condition: (vehicle.condition as string) || "USED",
      damageUnrepaired: vehicle["damage-unrepaired"] === true,
      price: {
        consumerPriceGross: cleanAmount,
        currency: "EUR",
        vatRate: String(rawVat),
        type: "FIXED",
      },
    };
    if (payload.description) mobilePayload.description = payload.description;

    // ── Validate required fields BEFORE posting ──
    const missing: string[] = [];
    if (!mobilePayload.make) missing.push("make");
    if (!mobilePayload.model) missing.push("model");
    if (!mobilePayload.modelDescription) missing.push("modelDescription");
    if (!mobilePayload.category) missing.push("category");
    if (mobilePayload.mileage === undefined || mobilePayload.mileage === null) missing.push("mileage");
    if (!mobilePayload.firstRegistration || !/^\d{6}$/.test(String(mobilePayload.firstRegistration)))
      missing.push("firstRegistration (YYYYMM)");
    if (!mobilePayload.fuel) missing.push("fuel");
    if (!mobilePayload.gearbox) missing.push("gearbox");
    if (mobilePayload.power === undefined || mobilePayload.power === null) missing.push("power");
    if (mobilePayload.cubicCapacity === undefined || mobilePayload.cubicCapacity === null)
      missing.push("cubicCapacity");
    if (!mobilePayload.condition) missing.push("condition");
    if (typeof mobilePayload.damageUnrepaired !== "boolean") missing.push("damageUnrepaired");
    if (!cleanAmount || cleanAmount === "0") missing.push("price.consumerPriceGross (Preis fehlt/ungültig)");
    if (!rawVat) missing.push("price.vatRate");

    if (missing.length) {
      const msg = `Pflichtfelder fehlen oder ungültig: ${missing.join(", ")}`;
      console.error(msg);
      await admin
        .from("mobile_ad_drafts")
        .update({ status: "error", error_message: msg })
        .eq("id", draftId);
      return json(400, { error: msg, missing });
    }


    // ── Step 1: upload images one by one (skip individual failures) ──
    const refs: string[] = [];
    const skipped: { index: number; path: string; reason: string }[] = [];
    for (let i = 0; i < imagePaths.length; i++) {
      const p = imagePaths[i];
      try {
        const { data: file, error: dlErr } = await admin.storage
          .from("mobile-ad-images")
          .download(p);
        if (dlErr || !file) throw new Error(`Storage download failed: ${dlErr?.message}`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const origFormat = detectFormat(bytes);
        const origSize = bytes.byteLength;
        const jpeg = await ensureJpegUnder2MB(bytes);
        console.log(
          `Image ${i + 1}/${imagePaths.length} ${p}: original=${origFormat} ${origSize}B -> jpeg ${jpeg.byteLength}B`,
        );
        const filename = (p.split("/").pop() ?? `image_${i}.jpg`).replace(/\.[^.]+$/, ".jpg");
        const ref = await uploadOneImage(jpeg, filename);
        refs.push(ref);
      } catch (e) {
        const msg = (e as Error).message || String(e);
        console.error(`Image ${i + 1} (${p}) skipped: ${msg}`);
        skipped.push({ index: i + 1, path: p, reason: msg });
      }
    }
    if (skipped.length) {
      console.warn(`Skipped ${skipped.length}/${imagePaths.length} image(s):`, skipped);
    }


    // ── Step 2: create ad with image refs ─────────────────────
    const adBody: Record<string, unknown> = mobilePayload;
    if (refs.length) {
      adBody.images = refs.map((ref) => ({ ref }));
    }

    console.log("Mobile.de POST adBody keys:", Object.keys(adBody).join(","));
    console.log("Mobile.de required fields:", JSON.stringify({
      vehicleClass: mobilePayload.vehicleClass,
      make: mobilePayload.make,
      model: mobilePayload.model,
      modelDescription: mobilePayload.modelDescription,
      category: mobilePayload.category,
      mileage: mobilePayload.mileage,
      firstRegistration: mobilePayload.firstRegistration,
      fuel: mobilePayload.fuel,
      gearbox: mobilePayload.gearbox,
      power: mobilePayload.power,
      cubicCapacity: mobilePayload.cubicCapacity,
      condition: mobilePayload.condition,
      damageUnrepaired: mobilePayload.damageUnrepaired,
      priceAmount: cleanAmount,
      imageCount: refs.length,
    }));


    const createUrl = `${API_BASE}/sellers/${SELLER_ID}/ads`;
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: basicAuth(),
        "Content-Type": MOBILE_MIME,
        Accept: MOBILE_MIME,
      },
      body: JSON.stringify(adBody),
    });
    const createText = await createRes.text();
    console.log(`Create ad -> status ${createRes.status}`);

    if (!createRes.ok) {
      let parsed: unknown = createText;
      try { parsed = JSON.parse(createText); } catch { /* keep text */ }
      const human =
        typeof parsed === "object" && parsed && "errors" in (parsed as Record<string, unknown>)
          ? JSON.stringify((parsed as Record<string, unknown>).errors)
          : createText.slice(0, 500);
      console.error(`Create ad failed ${createRes.status}: ${createText.slice(0, 800)}`);
      await admin
        .from("mobile_ad_drafts")
        .update({ status: "error", error_message: human.slice(0, 2000) })
        .eq("id", draftId);
      return json(createRes.status, {
        error: "Mobile.de hat das Inserat abgelehnt",
        status: createRes.status,
        details: parsed,
      });
    }

    // ── Step 3: success ───────────────────────────────────────
    let mobileAdId: string | undefined;
    let detailPageUrl: string | undefined;
    try {
      const j = JSON.parse(createText);
      mobileAdId = String(j?.mobileAdId ?? j?.id ?? j?.adId ?? "");
      detailPageUrl = j?.detailPageUrl ?? j?.detail_page_url ?? j?.url;
    } catch {
      mobileAdId = createRes.headers.get("Location")?.split("/").pop() ?? undefined;
    }

    const skippedNote = skipped.length
      ? `Hinweis: ${skipped.length} Bild(er) übersprungen: ${skipped.map((s) => `#${s.index} (${s.reason})`).join("; ")}`
      : null;

    await admin
      .from("mobile_ad_drafts")
      .update({
        status: "published",
        mobile_ad_id: mobileAdId ?? null,
        error_message: skippedNote,
      })
      .eq("id", draftId);

    return json(200, {
      ok: true,
      mobileAdId,
      detailPageUrl,
      uploadedImages: refs.length,
      skippedImages: skipped,
    });
  } catch (err) {
    console.error("publish-mobile-ad fatal:", err);
    return json(500, { error: String((err as Error).message || err) });
  }
});
