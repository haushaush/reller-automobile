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

// Nur diese Domain ist beim Mail-Provider verifiziert. Absender MUSS darauf liegen,
// sonst lehnt der Provider den Versand ab ("domain is not verified").
export const VERIFIED_SENDER_DOMAIN = "notify.viral-connect.de";

export const MAIL_SETTINGS_FALLBACK: MailSettings = {
  sender_address: `no-reply@${VERIFIED_SENDER_DOMAIN}`,
  sender_name: "Reller Automobile",
  reply_to_customer: "anfrage@reller-automobile.de",
  reply_to_internal: null,
  inquiry_inbox: "anfrage@reller-automobile.de",
};

/** Erzwingt die verifizierte Absenderdomain, behält aber den lokalen Teil bei. */
export function enforceSenderDomain(address: string | null | undefined): string {
  const raw = String(address ?? "").trim();
  const inner = raw.match(/<([^>]+)>/)?.[1]?.trim() ?? raw;
  const local = (inner.split("@")[0] || "no-reply").replace(/[^a-zA-Z0-9._-]/g, "") || "no-reply";
  return `${local}@${VERIFIED_SENDER_DOMAIN}`;
}


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
  return `${settings.sender_name} <${enforceSenderDomain(settings.sender_address)}>`;
}

/**
 * Stellt eine fertig gerenderte Mail in die Lovable-Emails-Queue.
 * Der Versand über Resend scheitert, weil dort keine Domain verifiziert ist.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function queueMail(
  admin: Admin,
  args: { from: string; to: string | string[]; subject: string; html: string; replyTo?: string | null; label?: string },
): Promise<{ ok: boolean; error?: string; messageIds: string[] }> {
  const recipients = (Array.isArray(args.to) ? args.to : [args.to])
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean);
  const messageIds: string[] = [];
  try {
    for (const recipient of recipients) {
      const messageId = crypto.randomUUID();
      const { error } = await admin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: recipient,
          from: args.from,
          sender_domain: VERIFIED_SENDER_DOMAIN,
          subject: args.subject,
          html: args.html,
          text: htmlToText(args.html),
          purpose: "transactional",
          label: args.label ?? "internal",
          idempotency_key: messageId,
          ...(args.replyTo ? { reply_to: args.replyTo } : {}),
          queued_at: new Date().toISOString(),
        },
      });
      if (error) throw new Error(error.message);
      messageIds.push(messageId);
    }
    return { ok: true, messageIds };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), messageIds };
  }
}
