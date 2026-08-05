// Löst das passende Plattform-Konto (Mobile.de) für ein Fahrzeug auf und liefert
// die zugehörigen Zugangsdaten aus den hinterlegten Secrets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface PlatformAccount {
  account_key: string;
  label: string;
  seller_id: string;
  username: string;
  password: string;
}

type Db = ReturnType<typeof createClient>;

function secret(name: string | null | undefined): string {
  if (!name) return "";
  return Deno.env.get(name) ?? "";
}

/** Fallback, falls kein Konto konfiguriert ist — verhält sich wie bisher. */
function legacyAccount(): PlatformAccount {
  return {
    account_key: "standard",
    label: "Mobile.de",
    seller_id: "451040",
    username:
      Deno.env.get("MOBILE_DE_SELLER_USERNAME") || Deno.env.get("MOBILE_DE_USERNAME") || "",
    password:
      Deno.env.get("MOBILE_DE_SELLER_PASSWORD") || Deno.env.get("MOBILE_DE_PASSWORD") || "",
  };
}

/**
 * Ermittelt das Konto für ein Fahrzeug.
 * Reihenfolge: bereits am Inserat hinterlegtes Konto → Vorgabe je Fahrzeugkategorie → "standard".
 */
export async function resolveMobileAccount(
  admin: Db,
  vehicleId: string | null,
): Promise<PlatformAccount> {
  const { data: accounts } = await admin
    .from("platform_accounts")
    .select("*")
    .eq("platform", "mobile_de")
    .eq("is_active", true)
    .order("sort_order");

  const list = (accounts ?? []) as Record<string, string | string[]>[];
  if (list.length === 0) return legacyAccount();

  let chosen: Record<string, string | string[]> | undefined;

  if (vehicleId) {
    const { data: listing } = await admin
      .from("listings")
      .select("account_key")
      .eq("vehicle_id", vehicleId)
      .eq("platform", "mobile_de")
      .maybeSingle();
    const key = (listing as { account_key?: string } | null)?.account_key;
    if (key) chosen = list.find((a) => a.account_key === key);

    if (!chosen) {
      const { data: vehicle } = await admin
        .from("vehicles")
        .select("vehicle_category")
        .eq("id", vehicleId)
        .maybeSingle();
      const cat = (vehicle as { vehicle_category?: string } | null)?.vehicle_category ?? "";
      chosen = list.find((a) => ((a.default_for_categories as string[]) ?? []).includes(cat));
    }
  }

  chosen = chosen ?? list.find((a) => a.account_key === "standard") ?? list[0];

  const username = secret(chosen.username_secret_name as string);
  const password = secret(chosen.password_secret_name as string);
  if (!username || !password) {
    console.warn(
      `platform_accounts: Zugangsdaten für "${chosen.account_key}" fehlen — nutze Standard-Secrets`,
    );
    const legacy = legacyAccount();
    return {
      account_key: chosen.account_key as string,
      label: chosen.label as string,
      seller_id: (chosen.seller_id as string) || legacy.seller_id,
      username: username || legacy.username,
      password: password || legacy.password,
    };
  }

  return {
    account_key: chosen.account_key as string,
    label: chosen.label as string,
    seller_id: chosen.seller_id as string,
    username,
    password,
  };
}

export function basicAuthFor(account: PlatformAccount): string {
  return `Basic ${btoa(`${account.username}:${account.password}`)}`;
}

/** Hält die listings-Zeile für Mobile.de aktuell (Status, Anzeigen-ID, Fehler). */
export async function syncMobileListing(
  admin: Db,
  vehicleId: string,
  patch: {
    status?: string;
    external_ad_id?: string | null;
    external_url?: string | null;
    error_message?: string | null;
    account_key?: string;
  },
): Promise<void> {
  try {
    const { data: existing } = await admin
      .from("listings")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .eq("platform", "mobile_de")
      .maybeSingle();

    const row = {
      ...patch,
      published_at: patch.status === "live" ? new Date().toISOString() : undefined,
    };

    if (existing) {
      await admin.from("listings").update(row).eq("id", (existing as { id: string }).id);
    } else {
      await admin.from("listings").insert({
        vehicle_id: vehicleId,
        platform: "mobile_de",
        is_manual: false,
        status: patch.status ?? "not_listed",
        ...row,
      });
    }
  } catch (e) {
    // Das Protokoll darf den eigentlichen Vorgang nie blockieren
    console.error("syncMobileListing failed:", (e as Error).message);
  }
}
