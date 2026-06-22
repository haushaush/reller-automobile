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

    // ── Step 1: upload images one by one ──────────────────────
    const refs: string[] = [];
    for (let i = 0; i < imagePaths.length; i++) {
      const p = imagePaths[i];
      try {
        const { data: file, error: dlErr } = await admin.storage
          .from("mobile-ad-images")
          .download(p);
        if (dlErr || !file) throw new Error(`Storage download failed: ${dlErr?.message}`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const jpeg = await ensureJpegUnder2MB(bytes, file.type || "application/octet-stream");
        const filename = (p.split("/").pop() ?? `image_${i}.jpg`).replace(/\.[^.]+$/, ".jpg");
        const ref = await uploadOneImage(jpeg, filename);
        refs.push(ref);
      } catch (e) {
        const msg = (e as Error).message || String(e);
        console.error(`Image ${i} (${p}) failed: ${msg}`);
        await admin
          .from("mobile_ad_drafts")
          .update({ status: "error", error_message: `Bild ${i + 1}: ${msg}` })
          .eq("id", draftId);
        return json(502, { error: `Bild ${i + 1}: ${msg}` });
      }
    }

    // ── Step 2: create ad with image refs ─────────────────────
    const adBody: Record<string, unknown> = { ...payload };
    if (refs.length) {
      adBody.images = refs.map((ref) => ({ ref }));
    }

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

    await admin
      .from("mobile_ad_drafts")
      .update({
        status: "published",
        mobile_ad_id: mobileAdId ?? null,
        error_message: null,
      })
      .eq("id", draftId);

    return json(200, {
      ok: true,
      mobileAdId,
      detailPageUrl,
      uploadedImages: refs.length,
    });
  } catch (err) {
    console.error("publish-mobile-ad fatal:", err);
    return json(500, { error: String((err as Error).message || err) });
  }
});
