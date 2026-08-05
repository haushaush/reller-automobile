import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ListingPlatform = Database["public"]["Enums"]["listing_platform"];
export type ListingStatus = Database["public"]["Enums"]["listing_status"];
export type ListingTaskAction = Database["public"]["Enums"]["listing_task_action"];

export type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
export type PlatformAccountRow = Database["public"]["Tables"]["platform_accounts"]["Row"];
export type ListingTaskRow = Database["public"]["Tables"]["listing_tasks"]["Row"];

/** Reihenfolge, in der Plattformen überall dargestellt werden */
export const PLATFORM_ORDER: ListingPlatform[] = ["mobile_de", "autoscout24", "kleinanzeigen"];

export const PLATFORM_LABELS: Record<ListingPlatform, string> = {
  mobile_de: "Mobile.de",
  autoscout24: "AutoScout24",
  kleinanzeigen: "Kleinanzeigen",
};

/** Kurzkürzel für die kompakte Badge-Darstellung in Listen */
export const PLATFORM_SHORT: Record<ListingPlatform, string> = {
  mobile_de: "MD",
  autoscout24: "AS",
  kleinanzeigen: "KA",
};

/** Plattformen ohne Schnittstelle — Status wird von Hand gepflegt */
export const MANUAL_PLATFORMS: ListingPlatform[] = ["autoscout24", "kleinanzeigen"];

export function isManualPlatform(platform: ListingPlatform): boolean {
  return MANUAL_PLATFORMS.includes(platform);
}

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  not_listed: "Nicht inseriert",
  draft: "Entwurf",
  publishing: "Wird übertragen",
  live: "Online",
  error: "Fehler",
  paused: "Pausiert",
  ended: "Beendet",
};

/** Status, die ein Mensch für manuelle Plattformen selbst setzen darf */
export const MANUAL_STATUS_CHOICES: ListingStatus[] = [
  "not_listed",
  "live",
  "paused",
  "ended",
];

export const TASK_ACTION_LABELS: Record<ListingTaskAction, string> = {
  end_listing: "Inserat beenden",
  update_price: "Preis anpassen",
  mark_reserved: "Als reserviert kennzeichnen",
  reactivate: "Inserat wieder aktivieren",
};

/** Fahrzeugstatus, der zentral gesetzt werden kann */
export type VehicleSaleStatus = "available" | "reserved" | "sold";

export const SALE_STATUS_LABELS: Record<VehicleSaleStatus, string> = {
  available: "Verfügbar",
  reserved: "Reserviert",
  sold: "Verkauft",
};

export function vehicleSaleStatus(v: {
  is_sold?: boolean | null;
  reserved_at?: string | null;
}): VehicleSaleStatus {
  if (v.is_sold) return "sold";
  if (v.reserved_at) return "reserved";
  return "available";
}

/** Kompakte Form, wie sie der View vehicle_listing_overview liefert */
export interface ListingSummary {
  id: string;
  platform: ListingPlatform;
  account_key: string | null;
  status: ListingStatus;
  is_manual: boolean;
  external_ad_id: string | null;
  external_url: string | null;
  note: string | null;
  error_message: string | null;
  updated_at: string;
}

/**
 * Lädt die Inserats-Übersicht für mehrere Fahrzeuge in einer Abfrage.
 * Verhindert N+1-Abfragen in Listen.
 */
export async function loadListingOverview(
  vehicleIds: string[],
): Promise<Map<string, ListingSummary[]>> {
  const result = new Map<string, ListingSummary[]>();
  if (vehicleIds.length === 0) return result;
  const { data, error } = await supabase
    .from("vehicle_listing_overview")
    .select("vehicle_id, listings")
    .in("vehicle_id", vehicleIds);
  if (error) throw error;
  for (const row of data ?? []) {
    if (!row.vehicle_id) continue;
    result.set(row.vehicle_id, (row.listings as unknown as ListingSummary[]) ?? []);
  }
  return result;
}

/** Schlägt anhand der Fahrzeugkategorie das passende Mobile.de-Konto vor. */
export function suggestAccountKey(
  accounts: PlatformAccountRow[],
  vehicleCategory: string | null | undefined,
): string | null {
  const active = accounts.filter((a) => a.platform === "mobile_de" && a.is_active);
  if (active.length === 0) return null;
  const category = vehicleCategory ?? "";
  const match = active.find((a) => (a.default_for_categories ?? []).includes(category));
  if (match) return match.account_key;
  const standard = active.find((a) => a.account_key === "standard");
  return (standard ?? active[0]).account_key;
}

/** Sobald ein Inserat live war, ist das Konto fix. */
export function isAccountLocked(listing: Pick<ListingRow, "status"> | null | undefined): boolean {
  if (!listing) return false;
  return ["publishing", "live", "paused", "ended"].includes(listing.status);
}

export function accountLabel(
  accounts: PlatformAccountRow[],
  platform: ListingPlatform,
  accountKey: string | null | undefined,
): string | null {
  if (!accountKey) return null;
  return (
    accounts.find((a) => a.platform === platform && a.account_key === accountKey)?.label ??
    accountKey
  );
}

/** Stellt sicher, dass für ein Fahrzeug für jede Plattform eine Zeile existiert. */
export async function ensureListingRows(
  vehicleId: string,
  vehicleCategory: string | null | undefined,
  accounts: PlatformAccountRow[],
): Promise<void> {
  const { data: existing, error } = await supabase
    .from("listings")
    .select("id, platform")
    .eq("vehicle_id", vehicleId);
  if (error) throw error;
  const have = new Set((existing ?? []).map((l) => l.platform));
  const missing = PLATFORM_ORDER.filter((p) => !have.has(p)).map((platform) => ({
    vehicle_id: vehicleId,
    platform,
    account_key:
      platform === "mobile_de" ? suggestAccountKey(accounts, vehicleCategory) : null,
    status: "not_listed" as ListingStatus,
    is_manual: isManualPlatform(platform),
  }));
  if (missing.length === 0) return;
  const { error: insErr } = await supabase.from("listings").insert(missing);
  if (insErr) throw insErr;
}

/** Legt Aufgaben für alle manuellen Plattformen an, die gerade online sind. */
export async function createTasksForManualListings(
  vehicleId: string,
  action: ListingTaskAction,
  reason: string,
): Promise<number> {
  const { data: listings, error } = await supabase
    .from("listings")
    .select("id, platform, status, is_manual")
    .eq("vehicle_id", vehicleId)
    .eq("is_manual", true)
    .eq("status", "live");
  if (error) throw error;
  const rows = (listings ?? []).map((l) => ({
    listing_id: l.id,
    vehicle_id: vehicleId,
    action,
    reason,
  }));
  if (rows.length === 0) return 0;
  const { error: insErr } = await supabase.from("listing_tasks").insert(rows);
  if (insErr) throw insErr;
  return rows.length;
}

export function formatEuro(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toLocaleString("de-DE")} €`;
}
