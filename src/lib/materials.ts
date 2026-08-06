import { supabase } from "@/integrations/supabase/client";

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
 * Speichert eine Datei so, wie es das Gerät erlaubt: auf dem Handy über den
 * Teilen-Dialog (nur so landet ein Bild in der Fotogalerie), sonst als Download.
 */
export async function shareOrDownloadBlob(blob: Blob, filename: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string }) => Promise<void>;
  };
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    await nav.share({ files: [file], title: filename });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return "downloaded";
}

/** Lädt eine Bild-URL herunter bzw. teilt sie. */
export async function shareOrDownloadUrl(url: string, filename: string) {
  const blob = await loadImageBlob(url);
  return shareOrDownloadBlob(blob, filename);
}

export function safeFileName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Lädt eine Collage in den öffentlichen Story-Bucket und legt den Datensatz an. */
export async function uploadCollage(vehicleId: string, blob: Blob, baseName: string) {
  const path = `collages/${vehicleId}-${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from("vehicle-stories")
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from("vehicle-stories").getPublicUrl(path);
  const { data: userData } = await supabase.auth.getUser();
  const { error: dbErr } = await supabase.from("vehicle_collages").insert({
    vehicle_id: vehicleId,
    image_url: pub.publicUrl,
    storage_path: path,
    created_by: userData.user?.id ?? null,
  });
  if (dbErr) throw dbErr;
  return { url: pub.publicUrl, path, baseName };
}
