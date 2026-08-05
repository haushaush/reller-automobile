// Zugriff auf die Lead-API von mobile.de.
// Enthält KEINE personenbezogenen Daten in Logs — bewusst nur Zähler und Codes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const LEAD_API_BASE = "https://services.mobile.de";

type Db = ReturnType<typeof createClient>;

export interface LeadAccount {
  id: string;
  account_key: string;
  label: string;
  seller_id: string | null;
  lead_api_enabled: boolean;
  lead_cursor: string | null;
  username: string;
  password: string;
  /** true, wenn auf die Verkäufer-Zugangsdaten zurückgefallen wurde */
  usedFallback: boolean;
}

function secret(name: unknown): string {
  if (!name || typeof name !== "string") return "";
  return Deno.env.get(name) ?? "";
}

function legacyUser(): { username: string; password: string } {
  return {
    username:
      Deno.env.get("MOBILE_DE_SELLER_USERNAME") || Deno.env.get("MOBILE_DE_USERNAME") || "",
    password:
      Deno.env.get("MOBILE_DE_SELLER_PASSWORD") || Deno.env.get("MOBILE_DE_PASSWORD") || "",
  };
}

/** Baut aus einer platform_accounts-Zeile das Lead-Konto inkl. Fallback auf die Seller-Daten. */
export function toLeadAccount(row: Record<string, unknown>): LeadAccount {
  const leadUser = secret(row.lead_username_secret_name);
  const leadPass = secret(row.lead_password_secret_name);
  const sellerUser = secret(row.username_secret_name);
  const sellerPass = secret(row.password_secret_name);
  const legacy = legacyUser();

  const hasOwn = !!leadUser && !!leadPass;
  const username = hasOwn ? leadUser : sellerUser || legacy.username;
  const password = hasOwn ? leadPass : sellerPass || legacy.password;

  return {
    id: String(row.id),
    account_key: String(row.account_key ?? ""),
    label: String(row.label ?? row.account_key ?? ""),
    seller_id: (row.seller_id as string | null) ?? null,
    lead_api_enabled: row.lead_api_enabled === true,
    lead_cursor: (row.lead_cursor as string | null) ?? null,
    username,
    password,
    usedFallback: !hasOwn,
  };
}

export async function loadLeadAccounts(admin: Db, onlyEnabled = true): Promise<LeadAccount[]> {
  let query = admin
    .from("platform_accounts")
    .select("*")
    .eq("platform", "mobile_de")
    .eq("is_active", true)
    .order("sort_order");
  if (onlyEnabled) query = query.eq("lead_api_enabled", true);
  const { data } = await query;
  return ((data ?? []) as Record<string, unknown>[]).map(toLeadAccount);
}

export function leadAuthHeader(account: LeadAccount): string {
  return `Basic ${btoa(`${account.username}:${account.password}`)}`;
}

export async function leadRequest(
  account: LeadAccount,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown; raw: string }> {
  const res = await fetch(`${LEAD_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: leadAuthHeader(account),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const raw = await res.text();
  let body: unknown = raw;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    /* bleibt Text */
  }
  return { status: res.status, body, raw };
}

/** Kürzt Fehlertexte und entfernt mögliche Mailadressen/Telefonnummern. */
export function safeError(text: string): string {
  return String(text)
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, "[mail]")
    .replace(/\+?\d[\d\s/()-]{6,}\d/g, "[tel]")
    .slice(0, 300);
}
