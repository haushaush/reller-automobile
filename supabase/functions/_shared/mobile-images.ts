// Bilder für Mobile.de: aus dem Speicher laden, als JPEG unter 2 MB bringen und
// einzeln vorab zur Seller-API hochladen. Die Referenzen werden am Fahrzeug
// gespeichert, damit der Veröffentlichungsaufruf kurz bleibt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode as decodeImage, Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

type Db = ReturnType<typeof createClient>;

export const IMAGE_API_BASE = "https://services.mobile.de/seller-api";
export const IMAGE_MIME = "application/vnd.de.mobile.api+json";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MiB laut Mobile.de

export function detectFormat(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (
    bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "webp";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  return "unknown";
}

export async function ensureJpegUnder2MB(input: Uint8Array): Promise<Uint8Array> {
  const decoded = await decodeImage(input);
  if (!(decoded instanceof Image)) {
    throw new Error("Bildformat wird nicht unterstützt (kein Einzelbild)");
  }
  const qualities = [90, 80, 70, 60, 50, 40, 30];
  for (const q of qualities) {
    const buf = await decoded.encodeJPEG(q);
    if (buf.byteLength <= MAX_IMAGE_BYTES) return buf;
  }
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

/** Lädt ein einzelnes JPEG hoch und liefert die Referenz (ref/hash/URL). */
export async function uploadOneImage(
  auth: string,
  jpeg: Uint8Array,
  filename: string,
): Promise<string> {
  const res = await fetch(`${IMAGE_API_BASE}/images`, {
    method: "POST",
    headers: { Authorization: auth, Accept: IMAGE_MIME, "Content-Type": "image/jpeg" },
    body: jpeg,
  });
  const text = await res.text();
  console.log(`Bild-Upload ${filename}: status=${res.status}, body=${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`Bild-Upload fehlgeschlagen (${res.status}): ${text.slice(0, 300)}`);

  let ref: string | undefined;
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    ref = (j.ref ?? j.hash ?? j.key ?? j.url) as string | undefined;
    if (!ref && Array.isArray(j.images)) {
      const first = (j.images as Record<string, unknown>[])[0];
      ref = (first?.ref ?? first?.hash ?? first?.url) as string | undefined;
    }
  } catch { /* keine JSON-Antwort */ }
  if (!ref) {
    const loc = res.headers.get("Location");
    if (loc) ref = loc.split("/").pop() ?? loc;
  }
  if (!ref) throw new Error("Mobile.de hat keine Bildreferenz zurückgegeben");
  return ref;
}

export interface ImageUploadResult {
  /** Speicherpfad → Mobile.de-Referenz */
  refs: Record<string, string>;
  uploaded: number;
  reused: number;
  skipped: { path: string; reason: string }[];
}

/**
 * Lädt alle noch nicht übertragenen Bilder eines Fahrzeugs vorab hoch.
 * Bereits vorhandene Referenzen werden wiederverwendet.
 */
export async function uploadVehicleImages(
  admin: Db,
  auth: string,
  imagePaths: string[],
  existingRefs: Record<string, string> = {},
): Promise<ImageUploadResult> {
  const refs: Record<string, string> = {};
  const skipped: { path: string; reason: string }[] = [];
  let uploaded = 0;
  let reused = 0;

  for (let i = 0; i < imagePaths.length; i++) {
    const path = imagePaths[i];
    const known = existingRefs[path];
    if (known) {
      refs[path] = known;
      reused++;
      continue;
    }
    try {
      const { data: file, error: dlErr } = await admin.storage.from("mobile-ad-images").download(path);
      if (dlErr || !file) throw new Error(`Datei nicht lesbar: ${dlErr?.message ?? "unbekannt"}`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const jpeg = await ensureJpegUnder2MB(bytes);
      const filename = (path.split("/").pop() ?? `bild_${i}.jpg`).replace(/\.[^.]+$/, ".jpg");
      refs[path] = await uploadOneImage(auth, jpeg, filename);
      uploaded++;
    } catch (e) {
      const reason = (e as Error).message || String(e);
      console.error(`Bild ${i + 1} (${path}) übersprungen: ${reason}`);
      skipped.push({ path, reason });
    }
  }

  return { refs, uploaded, reused, skipped };
}

/** Speichert die Bildreferenzen im mobile_payload des Fahrzeugs. */
export async function storeImageRefs(
  admin: Db,
  vehicleId: string,
  refs: Record<string, string>,
): Promise<void> {
  const { data } = await admin
    .from("vehicles")
    .select("mobile_payload")
    .eq("id", vehicleId)
    .maybeSingle();
  const payload = ((data as { mobile_payload?: Record<string, unknown> } | null)?.mobile_payload ?? {}) as Record<string, unknown>;
  const merged = { ...((payload._imageRefs ?? {}) as Record<string, string>), ...refs };
  await admin
    .from("vehicles")
    .update({ mobile_payload: { ...payload, _imageRefs: merged } as never } as never)
    .eq("id", vehicleId);
}
