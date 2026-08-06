/**
 * Zentrale Speicher-/Download-Logik für das gesamte Portal.
 *
 * Regeln:
 *  - Bild + Touch-Gerät  → Teilen-Dialog („In Fotos sichern“), sonst Download
 *  - Bild + Desktop      → direkter Download
 *  - PDF/ZIP/CSV/…       → immer direkter Download (auch auf dem Handy)
 *
 * Es gibt bewusst nur diese eine Weiche — keine Kopien in einzelnen Seiten.
 */

import { useEffect, useState } from "react";

type NavigatorWithShare = Navigator & {
  canShare?: (data: { files?: File[] }) => boolean;
  share?: (data: { files?: File[]; title?: string }) => Promise<void>;
  userAgentData?: { mobile?: boolean };
};

/**
 * Erkennt ein echtes Touch-Gerät (Handy/Tablet).
 * Nicht über die Fensterbreite und nicht über navigator.share — ein
 * verkleinertes Desktop-Fenster und macOS mit Handoff sind kein Handy.
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  const nav = navigator as NavigatorWithShare;
  const touchPoints = nav.maxTouchPoints ?? 0;

  // Verlässlichste Angabe, wenn der Browser sie liefert (Chromium).
  if (typeof nav.userAgentData?.mobile === "boolean" && nav.userAgentData.mobile) return true;

  // iPadOS meldet sich als „Macintosh“ — mehr als ein Touchpunkt verrät das iPad.
  const ua = nav.userAgent || "";
  if (/Macintosh/i.test(ua) && touchPoints > 1) return true;
  if (/iPhone|iPod|Android|Windows Phone/i.test(ua) && touchPoints > 0) return true;

  const coarse =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse) and (hover: none)").matches;

  return coarse && touchPoints > 0;
}

/** React-Hook für die Beschriftung („Teilen / Speichern“ vs. „Herunterladen“). */
export function useIsTouchDevice(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(isTouchDevice());
  }, []);
  return touch;
}

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "heic", "avif"];

/** Erkennt Bilddateien an Endung oder MIME-Typ. */
export function isImageFile(filename: string, mimeType?: string | null): boolean {
  if (mimeType && mimeType.startsWith("image/")) return true;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.includes(ext);
}

/** Direkter Download über Blob und Objekt-URL — in allen Fällen identisch. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type SaveResult = "shared" | "downloaded" | "cancelled";

/**
 * Speichert einen Blob nach den oben beschriebenen Regeln.
 * „cancelled“ heißt: Nutzer hat den Teilen-Dialog abgebrochen — kein Fehler.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<SaveResult> {
  const image = isImageFile(filename, blob.type);

  if (image && isTouchDevice()) {
    const nav = navigator as NavigatorWithShare;
    const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: filename });
        return "shared";
      } catch (e) {
        if (e instanceof Error && (e.name === "AbortError" || e.name === "NotAllowedError")) {
          return "cancelled";
        }
        // Teilen fehlgeschlagen → auf den direkten Download zurückfallen.
      }
    }
  }

  downloadBlob(blob, filename);
  return "downloaded";
}

/** Holt eine Datei per fetch und speichert bzw. teilt sie. */
export async function saveFromUrl(url: string, filename: string): Promise<SaveResult> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return saveBlob(await response.blob(), filename);
}

/** Speichert Text (z. B. CSV) als Datei. */
export async function saveText(text: string, filename: string, mime: string): Promise<SaveResult> {
  return saveBlob(new Blob([text], { type: mime }), filename);
}

/** Beschriftung der Schaltfläche je nach Gerät und Dateityp. */
export function saveButtonLabel(isImage: boolean, touch = isTouchDevice()): string {
  return isImage && touch ? "Teilen / Speichern" : "Herunterladen";
}

/** Hinweistext unter der Schaltfläche (nur Bild auf Touch-Gerät). */
export const GALLERY_HINT = "Über „In Fotos sichern“ landet das Bild in Ihrer Galerie.";

/** Passende Erfolgsmeldung zum Ergebnis. */
export function saveToastMessage(result: SaveResult, isImage: boolean): string | null {
  if (result === "cancelled") return null;
  if (result === "shared") return "Bild geteilt — über „In Fotos sichern“ landet es in der Galerie";
  return isImage ? "Bild gespeichert" : "Datei heruntergeladen";
}
