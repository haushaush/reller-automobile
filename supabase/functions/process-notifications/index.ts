// Cron: bündelt offene Ereignisse zu möglichst wenigen Mails.
// - digest_mode "immediate": Ereignisse desselben Typs werden bis zu 5 Minuten gesammelt.
// - digest_mode "daily": alle Ereignisse des Tages gehen um 18 Uhr (Berlin) raus.
import { corsHeaders } from "../_shared/cors.ts";
import { loadMailSettings, serviceClient } from "../_shared/mail-config.ts";
import { loadRecipients, sendInternalMail } from "../_shared/internal-mail.ts";
import { renderNotificationEmail } from "../_shared/notification-templates.ts";

const QUIET_PERIOD_MS = 60_000; // nach 1 Minute Ruhe wird gesendet
const MAX_WAIT_MS = 5 * 60_000; // spätestens nach 5 Minuten
const MAX_AGE_MS = 24 * 60 * 60_000; // Notbremse gegen Endlos-Retries

function berlinHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false })
      .format(now),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = serviceClient();
  const now = new Date();
  const results: Record<string, unknown>[] = [];

  try {
    const { data: pending, error } = await admin
      .from("notification_events")
      .select("id, event_type, payload, created_at")
      .is("sent_at", null)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settingsRows } = await admin
      .from("notification_settings")
      .select("event_type, is_enabled, digest_mode");
    const settingsMap = new Map((settingsRows ?? []).map((s: any) => [s.event_type, s]));
    const mailSettings = await loadMailSettings(admin);

    const groups = new Map<string, any[]>();
    for (const ev of pending as any[]) {
      const list = groups.get(ev.event_type) ?? [];
      list.push(ev);
      groups.set(ev.event_type, list);
    }

    for (const [eventType, events] of groups) {
      const setting: any = settingsMap.get(eventType);
      const ids = events.map((e) => e.id);

      if (setting && setting.is_enabled === false) {
        await admin.from("notification_events")
          .update({ sent_at: now.toISOString(), send_error: "Benachrichtigung deaktiviert" })
          .in("id", ids);
        continue;
      }

      const oldest = new Date(events[0].created_at).getTime();
      const newest = new Date(events[events.length - 1].created_at).getTime();
      const age = now.getTime() - oldest;
      const quiet = now.getTime() - newest;
      const daily = setting?.digest_mode === "daily";

      const due = daily
        ? berlinHour(now) >= 18
        : quiet >= QUIET_PERIOD_MS || age >= MAX_WAIT_MS;

      if (!due && age < MAX_AGE_MS) continue;

      const recipients = await loadRecipients(admin, eventType);
      if (recipients.length === 0) {
        await admin.from("notification_events")
          .update({ sent_at: now.toISOString(), send_error: "Kein Empfänger hinterlegt" })
          .in("id", ids);
        results.push({ eventType, skipped: "kein Empfänger" });
        continue;
      }

      const { subject, html } = renderNotificationEmail(
        eventType,
        events.map((e) => e.payload ?? {}),
        { digest: daily },
      );
      const sendResult = await sendInternalMail(
        admin,
        { eventType, subject, html, recipients, metadata: { batch_size: events.length } },
        mailSettings,
      );

      if (sendResult.ok) {
        await admin.from("notification_events")
          .update({ sent_at: now.toISOString(), send_error: null }).in("id", ids);
      } else if (age >= MAX_AGE_MS) {
        await admin.from("notification_events")
          .update({ sent_at: now.toISOString(), send_error: sendResult.error ?? "Versand fehlgeschlagen" })
          .in("id", ids);
      } else {
        await admin.from("notification_events")
          .update({ send_error: sendResult.error ?? "Versand fehlgeschlagen" }).in("id", ids);
      }
      results.push({ eventType, count: events.length, ok: sendResult.ok, error: sendResult.error });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-notifications failed:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
