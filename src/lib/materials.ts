import { supabase } from "@/integrations/supabase/client";
import { saveBlob, isImageFile, type SaveResult } from "@/lib/download";

/** Bildproxy für Fremdbilder ohne CORS-Freigabe. */
const FETCH_IMAGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-image`;

export type MaterialKind = "story" | "expose" | "collage";

export const MATERIAL_LABELS: Record<MaterialKind, string> = {
  story: "Story",
  expose: "PDF-Exposé",
  collage: "Fotocollage",
};

export const MATERIAL_HINTS: Record<MaterialKind, string> = {
  story: "Hochformat für WhatsApp und Social Media",
  expose: "Datenblatt als PDF zum Weitergeben",
  collage: "Mehrere Fahrzeugbilder in einem Bild",
};

/** Lädt ein Bild, notfalls über den Proxy. */
export async function loadImageBlob(url: string): Promise<Blob> {
  try {
    const r = await fetch(url, { mode: "cors" });
    if (r.ok) return await r.blob();
  } catch {
    /* Proxy versuchen */
  }
  const r = await fetch(`${FETCH_IMAGE_URL}?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error(`Bild konnte nicht geladen werden (${r.status})`);
  return await r.blob();
}

function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Bild konnte nicht dekodiert werden"));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Bild konnte nicht erzeugt werden"))),
      mime,
      quality,
    );
  });
}

/** Zeichnet die Bilder als Raster-Collage. Gleiche Optik wie im Collagen-Bereich. */
export function drawCollage(images: HTMLImageElement[], background: string | null): HTMLCanvasElement {
  const count = images.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW = 800;
  const cellH = Math.round((cellW * 3) / 4);
  const gap = 12;

  const canvas = document.createElement("canvas");
  canvas.width = cols * cellW + (cols + 1) * gap;
  canvas.height = rows * cellH + (rows + 1) * gap;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas wird von diesem Browser nicht unterstützt");

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  images.forEach((img, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = gap + c * (cellW + gap);
    const y = gap + r * (cellH + gap);
    const scale = Math.max(cellW / img.width, cellH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, cellW, cellH);
    ctx.clip();
    ctx.drawImage(img, x + (cellW - w) / 2, y + (cellH - h) / 2, w, h);
    ctx.restore();
  });

  return canvas;
}

/** Baut aus bis zu neun Fahrzeugbildern eine Collage als JPEG. */
export async function buildCollageBlob(imageUrls: string[]): Promise<Blob> {
  const urls = imageUrls.slice(0, 9);
  const loaded: HTMLImageElement[] = [];
  for (const url of urls) {
    try {
      loaded.push(await decodeImage(await loadImageBlob(url)));
    } catch (e) {
      console.warn("Collage: Bild übersprungen", url, e);
    }
  }
  if (loaded.length === 0) throw new Error("Kein Bild konnte geladen werden");
  return canvasToBlob(drawCollage(loaded, "#ffffff"), "image/jpeg", 0.92);
}

/**
 * Speichert eine Datei über die zentrale Weiche in @/lib/download:
 * Bild auf Touch-Gerät → Teilen-Dialog, sonst immer direkter Download.
 */
export async function shareOrDownloadBlob(blob: Blob, filename: string): Promise<SaveResult> {
  return saveBlob(blob, filename);
}

/** Lädt eine Bild-URL herunter bzw. teilt sie. */
export async function shareOrDownloadUrl(url: string, filename: string): Promise<SaveResult> {
  return shareOrDownloadBlob(await loadImageBlob(url), filename);
}

/** true, wenn das Material ein Bild ist (Story, Collage). */
export function isImageMaterial(kind: MaterialKind, path?: string | null): boolean {
  if (kind === "expose") return false;
  return isImageFile(path ?? `x.${DEFAULT_EXT[kind]}`);
}

export function safeFileName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .toLowerCase();
}

/** Lädt eine Collage in den Story-Bucket und legt den Datensatz an (Pfad, keine URL). */
export async function uploadCollage(vehicleId: string, blob: Blob, baseName: string) {
  const path = `collages/${vehicleId}-${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from("vehicle-stories")
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (upErr) throw upErr;

  const { data: userData } = await supabase.auth.getUser();
  const { error: dbErr } = await supabase.from("vehicle_collages").insert({
    vehicle_id: vehicleId,
    image_url: path,
    storage_path: path,
    created_by: userData.user?.id ?? null,
  });
  if (dbErr) throw dbErr;
  return { path, baseName };
}

/* ---------------------------------------------------------------------------
 * Storage: Pfade, signierte Links, Downloads
 * ------------------------------------------------------------------------- */

export const MATERIAL_BUCKETS: Record<MaterialKind, string> = {
  story: "vehicle-stories",
  expose: "vehicle-exposes",
  collage: "vehicle-stories",
};

/** Standard-Endung je Materialart, falls der Pfad keine hergibt. */
const DEFAULT_EXT: Record<MaterialKind, string> = {
  story: "png",
  expose: "pdf",
  collage: "jpg",
};

const FILE_LABEL: Record<MaterialKind, string> = {
  story: "story",
  expose: "expose",
  collage: "collage",
};

/** Gültigkeit signierter Links in Sekunden (60 Minuten). */
export const SIGNED_URL_TTL = 60 * 60;

/** Wandelt eine gespeicherte URL oder einen Pfad in den reinen Storage-Pfad um. */
export function storagePathFromValue(value: string | null | undefined, bucket: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^\/+/, "");
  try {
    const url = new URL(trimmed);
    const marker = `/storage/v1/object/`;
    const idx = url.pathname.indexOf(marker);
    if (idx < 0) return null;
    let rest = url.pathname.slice(idx + marker.length);
    rest = rest.replace(/^(public|sign|authenticated)\//, "");
    if (rest.startsWith(`${bucket}/`)) rest = rest.slice(bucket.length + 1);
    return decodeURIComponent(rest) || null;
  } catch {
    return null;
  }
}

export class MaterialFileError extends Error {
  /** true, wenn die Datei im Bucket fehlt. */
  missing: boolean;
  constructor(message: string, missing = false) {
    super(message);
    this.name = "MaterialFileError";
    this.missing = missing;
  }
}

/** Übersetzt technische Storage-Fehler in verständliche Hinweise. */
export function describeStorageError(raw: unknown): MaterialFileError {
  const msg = (raw instanceof Error ? raw.message : String(raw ?? "")).toLowerCase();
  if (msg.includes("not found") || msg.includes("404") || msg.includes("no such")) {
    return new MaterialFileError("Die Datei ist im Speicher nicht mehr vorhanden.", true);
  }
  if (msg.includes("expired") || msg.includes("jwt")) {
    return new MaterialFileError("Der Link ist abgelaufen. Bitte erneut versuchen.");
  }
  if (msg.includes("403") || msg.includes("401") || msg.includes("unauthorized") || msg.includes("permission")) {
    return new MaterialFileError("Kein Zugriff auf diese Datei.");
  }
  return new MaterialFileError(
    raw instanceof Error && raw.message ? raw.message : "Die Datei konnte nicht geladen werden.",
  );
}

/** Erzeugt einen signierten Link (60 Minuten) – funktioniert auch für private Buckets. */
export async function createSignedMaterialUrl(
  bucket: string,
  path: string,
  expiresIn = SIGNED_URL_TTL,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw describeStorageError(error ?? "not found");
  return data.signedUrl;
}

/** Sprechender Dateiname aus Marke, Modell und Materialart. */
export function materialFileName(
  kind: MaterialKind,
  parts: { brand?: string | null; model?: string | null; fallback?: string | null },
  path?: string | null,
): string {
  const ext = (path?.match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? DEFAULT_EXT[kind]).toLowerCase();
  const base =
    safeFileName(
      [parts.brand, parts.model].filter(Boolean).join(" ") || parts.fallback || "Fahrzeug",
    ) || "Fahrzeug";
  return `${base}-${FILE_LABEL[kind]}.${ext}`;
}

/**
 * Lädt eine Datei per fetch als Blob und speichert bzw. teilt sie.
 * Nötig, weil das download-Attribut bei fremden Domains ignoriert wird.
 */
export async function downloadFromUrl(url: string, filename: string): Promise<SaveResult> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new MaterialFileError("Die Datei konnte nicht geladen werden (Netzwerkfehler).");
  }
  if (!response.ok) {
    throw describeStorageError(`${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();
  return shareOrDownloadBlob(blob, filename);
}

