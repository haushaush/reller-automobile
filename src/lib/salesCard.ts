import { supabase } from "@/integrations/supabase/client";

export interface CardButton {
  id: string;
  label: string;
  /** "appointment" öffnet das Terminformular, sonst wird href geöffnet */
  type: "appointment" | "link";
  href?: string;
  visible: boolean;
}

export interface SalesContact {
  id: string;
  slug: string;
  first_name: string;
  last_name: string;
  role: string | null;
  email?: string | null;
  phone: string | null;
  mobile: string | null;
  photo_url: string | null;
  buttons: CardButton[];
  is_active: boolean;
  sort_order: number;
  card_printed_at?: string | null;
}

export const CARD_BASE_URL = "https://fahrzeuge.reller-automobile.de";

export const DEFAULT_BUTTONS: CardButton[] = [
  { id: "appointment", label: "Termin vereinbaren", type: "appointment", visible: true },
  { id: "vehicles", label: "Fahrzeugbestand ansehen", type: "link", href: "/fahrzeuge", visible: true },
  { id: "website", label: "Website ansehen", type: "link", href: "https://reller-automobile.de", visible: true },
];

export const TIME_SLOTS: { value: string; label: string }[] = [
  { value: "morning", label: "Vormittag" },
  { value: "afternoon", label: "Nachmittag" },
  { value: "evening", label: "Abends" },
  { value: "any", label: "Egal" },
];

export function timeSlotLabel(value: string): string {
  return TIME_SLOTS.find((s) => s.value === value)?.label ?? value;
}

export function normalizeButtons(raw: unknown): CardButton[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_BUTTONS;
  return raw
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .map((b, i) => ({
      id: String(b.id ?? `btn-${i}`),
      label: String(b.label ?? ""),
      type: b.type === "appointment" ? "appointment" : "link",
      href: typeof b.href === "string" ? b.href : undefined,
      visible: b.visible !== false,
    }));
}

/** Umlaute umschreiben und eine saubere Kartenadresse bilden */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function cardUrl(slug: string): string {
  return `${CARD_BASE_URL}/karte/${slug}`;
}

export function contactName(c: Pick<SalesContact, "first_name" | "last_name">): string {
  return `${c.first_name} ${c.last_name}`.trim();
}

const PHOTO_BUCKET = "sales-contact-photos";

/** Signierte Adresse für ein Verkäuferfoto (privater Speicherbereich) */
export async function resolvePhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export const PHOTO_BUCKET_NAME = PHOTO_BUCKET;

/** Aufruf oder Klick zählen — Fehler dürfen die Seite nie stören */
export async function trackCardEvent(
  salesContactId: string,
  eventType: "view" | "click",
  buttonId?: string,
): Promise<void> {
  try {
    await supabase
      .from("sales_card_events")
      .insert({ sales_contact_id: salesContactId, event_type: eventType, button_id: buttonId ?? null });
  } catch {
    /* bewusst still */
  }
}
