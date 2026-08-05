// Interne Betriebs-Mails: kein Abmeldelink, keine Suppression-Prüfung.
// Kundenmails laufen weiterhin über die Queue (send-transactional-email).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertSendableAddresses, formatFrom, loadMailSettings, type MailSettings } from "./mail-config.ts";

const RESEND_GATEWAY = "https://connector-gateway.lovable.dev/resend";

type Admin = ReturnType<typeof createClient>;

export interface InternalMailInput {
  eventType: string;
  subject: string;
  html: string;
  recipients: string[];
  metadata?: Record<string, unknown>;
  vehicleId?: string | null;
}

export interface InternalMailResult {
  ok: boolean;
  error?: string;
  emailLogId?: string | null;
  recipients: string[];
}

export async function sendInternalMail(
  admin: Admin,
  input: InternalMailInput,
  settingsInput?: MailSettings,
): Promise<InternalMailResult> {
  const settings = settingsInput ?? (await loadMailSettings(admin));
  const recipients = Array.from(
    new Set(input.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  );
  if (recipients.length === 0) {
    return { ok: false, error: "Keine Empfänger hinterlegt", recipients };
  }

  const from = formatFrom(settings);
  const replyTo = settings.reply_to_internal || undefined;

  // Harte Regel: info@ niemals als Absender/Antwortadresse.
  try {
    await assertSendableAddresses(admin, `internal:${input.eventType}`, { from, replyTo });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEmail(admin, input, recipients, "failed", message, settings);
    return { ok: false, error: message, recipients };
  }

  const emailLogId = await logEmail(admin, input, recipients, "sending", null, settings);

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!lovableKey || !resendKey) {
    const message = "Mailversand nicht konfiguriert (LOVABLE_API_KEY/RESEND_API_KEY fehlt)";
    await updateLog(admin, emailLogId, { status: "failed", error_message: message });
    return { ok: false, error: message, emailLogId, recipients };
  }

  try {
    const response = await fetch(`${RESEND_GATEWAY}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: input.subject,
        html: input.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      const message = `Versand fehlgeschlagen [${response.status}]: ${bodyText}`.slice(0, 1000);
      console.error("sendInternalMail failed:", message);
      await updateLog(admin, emailLogId, { status: "failed", error_message: message });
      return { ok: false, error: message, emailLogId, recipients };
    }
    let providerId: string | null = null;
    try {
      providerId = (JSON.parse(bodyText) as { id?: string }).id ?? null;
    } catch { /* ignore */ }
    await updateLog(admin, emailLogId, {
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_message_id: providerId,
    });
    return { ok: true, emailLogId, recipients };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateLog(admin, emailLogId, { status: "failed", error_message: message.slice(0, 1000) });
    return { ok: false, error: message, emailLogId, recipients };
  }
}

async function logEmail(
  admin: Admin,
  input: InternalMailInput,
  recipients: string[],
  status: string,
  errorMessage: string | null,
  settings: MailSettings,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("email_logs")
      .insert({
        mail_type: `notification:${input.eventType}`,
        event_type: input.eventType,
        audience: "internal",
        status,
        recipients,
        subject: input.subject,
        vehicle_id: input.vehicleId ?? null,
        provider: "resend-gateway",
        error_message: errorMessage,
        metadata: {
          ...(input.metadata ?? {}),
          from: formatFrom(settings),
          internal: true,
          suppression_bypassed: true,
        },
      })
      .select("id")
      .single();
    if (error) {
      console.error("email_logs insert failed:", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error("email_logs insert threw:", err);
    return null;
  }
}

async function updateLog(admin: Admin, id: string | null, patch: Record<string, unknown>) {
  if (!id) return;
  try {
    await admin.from("email_logs").update(patch).eq("id", id);
  } catch (err) {
    console.error("email_logs update failed:", err);
  }
}

export async function loadRecipients(admin: Admin, eventType: string): Promise<string[]> {
  const { data } = await admin
    .from("notification_recipients")
    .select("email")
    .eq("event_type", eventType)
    .eq("is_active", true);
  return (data ?? []).map((r: { email: string }) => r.email);
}
