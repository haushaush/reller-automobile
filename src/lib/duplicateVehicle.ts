/**
 * Fahrzeug samt Inseratsdaten duplizieren.
 *
 * Bewusst NICHT kopiert werden alle Angaben, die pro Fahrzeug einmalig sind
 * (mobile_de_id, FIN, interne Nummer, Kilometerstand, Erstzulassung) sowie
 * sämtliche Zustands- und Verlaufsdaten (Veröffentlichung, Preishistorie,
 * Protokolle, Aufgaben, Anfragen, Materialien).
 *
 * Bilder werden im Speicher unter neuen Pfaden kopiert — die Bildreferenzen
 * von Mobile.de dürfen NICHT übernommen werden: Beim Beenden einer Anzeige
 * löscht Mobile.de deren Bilder, die Kopie verlöre sie damit ebenfalls.
 */
import { supabase } from "@/integrations/supabase/client";
import { payloadToForm, buildVehiclePayload, type FormState } from "@/lib/mobileAdForm";

const MOBILE_BUCKET = "mobile-ad-images";
const PUBLIC_BUCKET = "vehicle-stories";

/** Interne Schlüssel, die niemals in die Kopie gehören. */
const INTERNAL_KEYS_TO_DROP = [
  "_imagePaths",
  "_imagePublicUrls",
  "_imageRefs",
  // Neue Kennung erzwingen: sonst antwortet Mobile.de mit 303 und verweist
  // auf die Anzeige des Originals.
  "_insertionRequestId",
  "_wizardStep",
  "_mobileAdId",
];

/** Felder, die in der Kopie leer bleiben müssen. */
const CLEARED_FORM_FIELDS: Partial<FormState> = {
  mileage: "",
  regYear: "",
  regMonth: "",
  internalNumber: "",
  vin: "",
};

export interface DuplicateSource {
  id: string;
  title: string;
  mobile_payload: unknown;
  vehicle_category: string | null;
}

export interface DuplicateResult {
  newVehicleId: string;
  copiedImages: number;
}

/** Anzahl eigener Bilddateien, die kopiert werden könnten. */
export function ownImagePathCount(payload: unknown): number {
  const p = (payload ?? {}) as Record<string, unknown>;
  return Array.isArray(p._imagePaths) ? (p._imagePaths as string[]).length : 0;
}

/** Angaben, die in der Kopie bewusst leer bleiben — für den Dialog. */
export const DUPLICATE_BLANK_FIELDS: string[] = [
  "Kilometerstand (Pflichtangabe)",
  "Erstzulassung (Pflichtangabe)",
  "Fahrzeug-Identifikationsnummer (FIN)",
  "Interne Nummer",
  "Mobile.de-Inserats-ID und Veröffentlichungsstatus",
  "Verlaufsdaten: Preishistorie, Protokolle, Aufgaben, Anfragen, Materialien",
];

async function copyImages(
  paths: string[],
  publicUrls: Record<string, string>,
  newVehicleId: string,
): Promise<{ imagePaths: string[]; publicUrls: Record<string, string> }> {
  const prefix = `drafts/${newVehicleId}`;
  const nextPaths: string[] = [];
  const nextPublic: Record<string, string> = {};

  for (const oldPath of paths) {
    const name = oldPath.split("/").pop() || `${Date.now()}.jpg`;
    const newPath = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`;
    const { error } = await supabase.storage.from(MOBILE_BUCKET).copy(oldPath, newPath);
    if (error) {
      console.error("Bild konnte nicht kopiert werden", oldPath, error);
      continue;
    }
    nextPaths.push(newPath);

    // Öffentliche Kopie für die Portalanzeige — Fehler sind nicht kritisch.
    const oldPublic = publicUrls[oldPath];
    if (oldPublic) {
      const marker = `/${PUBLIC_BUCKET}/`;
      const idx = oldPublic.indexOf(marker);
      const oldPublicPath = idx >= 0 ? decodeURIComponent(oldPublic.slice(idx + marker.length)) : "";
      if (oldPublicPath) {
        const newPublicPath = `custom-vehicle-images/${newPath}`;
        const { error: pubErr } = await supabase.storage
          .from(PUBLIC_BUCKET)
          .copy(oldPublicPath, newPublicPath);
        if (!pubErr) {
          nextPublic[newPath] = supabase.storage
            .from(PUBLIC_BUCKET)
            .getPublicUrl(newPublicPath).data.publicUrl;
        }
      }
    }
  }
  return { imagePaths: nextPaths, publicUrls: nextPublic };
}

export async function duplicateVehicle(
  sourceId: string,
  opts: { title: string; copyImages: boolean },
): Promise<DuplicateResult> {
  const { data: source, error: loadErr } = await supabase
    .from("vehicles")
    .select("id, title, mobile_payload, vehicle_category")
    .eq("id", sourceId)
    .maybeSingle();
  if (loadErr || !source) throw new Error("Fahrzeug konnte nicht geladen werden");

  const payload = (source.mobile_payload ?? {}) as Record<string, unknown>;
  const form: FormState = { ...payloadToForm(payload), ...CLEARED_FORM_FIELDS };

  const newVehicleId = crypto.randomUUID();

  const sourcePaths = Array.isArray(payload._imagePaths) ? (payload._imagePaths as string[]) : [];
  const sourcePublic = (payload._imagePublicUrls ?? {}) as Record<string, string>;
  const images = opts.copyImages && sourcePaths.length > 0
    ? await copyImages(sourcePaths, sourcePublic, newVehicleId)
    : { imagePaths: [] as string[], publicUrls: {} as Record<string, string> };

  const basePayload = buildVehiclePayload(form) as Record<string, unknown>;
  for (const key of INTERNAL_KEYS_TO_DROP) delete basePayload[key];
  const newPayload = {
    ...basePayload,
    _imagePaths: images.imagePaths,
    _imagePublicUrls: images.publicUrls,
    _imageRefs: {},
    // Direkt in Schritt 3 („Daten“) öffnen — dort fehlen die Pflichtangaben.
    _wizardStep: 3,
  };

  const customUrls = images.imagePaths.map((p) => images.publicUrls[p]).filter(Boolean);

  const { error: insErr } = await supabase.from("vehicles").insert({
    id: newVehicleId,
    mobile_de_id: `portal_${Date.now()}`,
    title: opts.title || `${source.title} (Kopie)`,
    source: "portal",
    publish_status: "draft",
    is_sold: false,
    is_featured: false,
    synced_at: new Date().toISOString(),
    duplicated_from: sourceId,
    vehicle_category: source.vehicle_category,
    brand: form.make || null,
    model: form.model || null,
    model_description: form.modelDescription || null,
    body_type: form.category || null,
    fuel: form.fuel || null,
    gearbox: form.gearbox || null,
    power: form.power ? parseInt(form.power.replace(/[^0-9]/g, ""), 10) : null,
    cubic_capacity: form.cubicCapacity ? parseInt(form.cubicCapacity.replace(/[^0-9]/g, ""), 10) : null,
    exterior_color: form.exteriorColor || null,
    description: form.description || null,
    price: form.consumerPriceGross
      ? Number(form.consumerPriceGross.replace(/[^0-9]/g, "")) || null
      : null,
    currency: "EUR",
    // Kilometerstand und Erstzulassung bleiben leer — Pflichtangaben der Kopie
    mileage: null,
    year: null,
    custom_image_urls: customUrls,
    image_order: customUrls,
    mobile_payload: newPayload as never,
  } as never);
  if (insErr) throw new Error(insErr.message);

  // Eigene Inseratszeilen anlegen — ohne Inserats-ID, Status „nicht inseriert“.
  const { data: srcListings } = await supabase
    .from("listings")
    .select("platform, account_key, is_manual")
    .eq("vehicle_id", sourceId);
  const rows = (srcListings ?? []).map((l) => ({
    vehicle_id: newVehicleId,
    platform: l.platform,
    account_key: l.account_key,
    is_manual: l.is_manual,
    status: "not_listed" as const,
    external_ad_id: null,
    external_url: null,
  }));
  if (rows.length > 0) {
    const { error: listErr } = await supabase.from("listings").insert(rows as never);
    if (listErr) console.error("Inseratszeilen der Kopie", listErr);
  }

  return { newVehicleId, copiedImages: images.imagePaths.length };
}
