// Zentrale Mail-Konfiguration + harte Absender-Regel.
// info@reller-automobile.de darf NIEMALS Absender oder Antwortadresse sein.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const FORBIDDEN_SENDER = "info@reller-automobile.de";

export type MailSettings = {
  sender_address: string;
  sender_name: string;
  reply_to_customer: string;
  reply_to_internal: string | null;
  inquiry_inbox: string;
};

export const MAIL_SETTINGS_FALLBACK: MailSettings = {
  sender_address: "no-reply@reller-automobile.de",
  sender_name: "Reller Automobile",
  reply_to_customer: "anfrage@reller-automobile.de",
  reply_to_internal: null,
  inquiry_inbox: "anfrage@reller-automobile.de",
};

type Admin = ReturnType<typeof createClient>;

export function serviceClient(): Admin {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function loadMailSettings(admin: Admin): Promise<MailSettings> {
  try {
    const { data } = await admin
      .from("mail_settings")
      .select("sender_address, sender_name, reply_to_customer, reply_to_internal, inquiry_inbox")
      .eq("id", 1)
      .maybeSingle();
    if (data) return { ...MAIL_SETTINGS_FALLBACK, ...(data as Partial<MailSettings>) };
  } catch (err) {
    console.error("loadMailSettings failed:", err);
  }
  return MAIL_SETTINGS_FALLBACK;
}

function normalize(value: string | null | undefined): string {
  if (!value) return "";
  // "Name <mail@example.com>" -> "mail@example.com"
  const match = String(value).match(/<([^>]+)>/);
  return (match ? match[1] : String(value)).trim().toLowerCase();
}

export async function logGuardViolation(
  admin: Admin,
  context: string,
  field: string,
  value: string,
  detail?: string,
): Promise<void> {
  try {
    await admin.from("mail_guard_log").insert({
      context,
      offending_field: field,
      offending_value: value,
      detail: detail ?? null,
    });
  } catch (err) {
    console.error("mail_guard_log insert failed:", err);
  }
  console.error(`[MAIL-GUARD] Versand blockiert (${context}): ${field}=${value}`);
}

/**
 * Prüft Absender und Antwortadresse. Wirft, wenn info@ verwendet wird,
 * und protokolliert den blockierten Versand.
 */
export async function assertSendableAddresses(
  admin: Admin,
  context: string,
  addresses: { from?: string | null; replyTo?: string | null },
): Promise<void> {
  const checks: Array<[string, string]> = [
    ["from", normalize(addresses.from)],
    ["reply_to", normalize(addresses.replyTo)],
  ];
  for (const [field, value] of checks) {
    if (value && value === FORBIDDEN_SENDER) {
      await logGuardViolation(
        admin,
        context,
        field,
        value,
        "info@reller-automobile.de ist ausschließlich Empfängeradresse.",
      );
      throw new Error(
        `Versand blockiert: ${FORBIDDEN_SENDER} darf nicht als Absender oder Antwortadresse verwendet werden.`,
      );
    }
  }
}

export function formatFrom(settings: MailSettings): string {
  return `${settings.sender_name} <${settings.sender_address}>`;
}
