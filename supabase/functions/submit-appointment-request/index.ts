// Öffentliches Terminformular der digitalen Visitenkarten.
// Die Mailadresse des Verkäufers wird ausschließlich serverseitig über den Slug ermittelt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { loadMailSettings, formatFrom, assertSendableAddresses, serviceClient, queueMail } from "../_shared/mail-config.ts";
import { loadRecipients } from "../_shared/internal-mail.ts";
import { emitNotificationEvent } from "../_shared/emit-event.ts";

const RESEND_GATEWAY = "https://connector-gateway.lovable.dev/resend";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://fahrzeuge.reller-automobile.de";

const TIME_SLOT_LABELS: Record<string, string> = {
  morning: "Vormittag",
  afternoon: "Nachmittag",
  evening: "Abends",
  any: "Egal",
};

interface Payload {
  slug?: string;
  name?: string;
  email?: string;
  phone?: string;
  preferredDate?: string;
  preferredTimeSlot?: string;
  message?: string | null;
  vehicleId?: string | null;
  gdprAccepted?: boolean;
  website?: string; // Honigtopf
  elapsedMs?: number;
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) && v.length <= 254;
}

async function hashIp(ip: string): Promise<string> {
  const salt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.slice(0, 16) ?? "reller";
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatDate(value: string): string {
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

async function sendMail(args: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = serviceClient();
  const settings = await loadMailSettings(admin);
  const FROM = formatFrom(settings);
  try {
    await assertSendableAddresses(admin, "submit-appointment-request", {
      from: FROM,
      replyTo: args.replyTo ?? null,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const result = await queueMail(admin, {
    from: FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    replyTo: args.replyTo ?? null,
    label: "appointment-request",
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

interface VehicleRow {
  id: string;
  title: string;
  price: number | null;
  currency: string | null;
  image_urls: string[] | null;
}

function vehicleBlock(v: VehicleRow | null): string {
  if (!v) return "";
  const img = v.image_urls?.[0];
  const price = v.price ? `${v.price.toLocaleString("de-DE")} ${v.currency === "EUR" || !v.currency ? "€" : v.currency}` : "Auf Anfrage";
  return `
    <h2 style="margin:18px 0 10px;font-size:16px;color:#000d14;border-left:3px solid #da1b1e;padding-left:10px;">Fahrzeug</h2>
    <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      ${img ? `<td width="120" style="padding-right:16px;vertical-align:top;"><img src="${escapeHtml(img)}" alt="" width="110" style="display:block;border-radius:6px;width:110px;height:auto;" /></td>` : ""}
      <td style="vertical-align:top;">
        <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#000d14;">${escapeHtml(v.title)}</p>
        <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#da1b1e;">${price}</p>
        <p style="margin:0;font-size:12px;"><a href="${APP_BASE_URL}/fahrzeug/${v.id}" style="color:#da1b1e;text-decoration:none;font-weight:600;">Im Portal ansehen →</a></p>
      </td>
    </tr></table>`;
}

function sellerHtml(args: {
  name: string; email: string; phone: string; date: string; slot: string;
  message: string | null; vehicle: VehicleRow | null; contactName: string; slug: string;
}): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f3f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000d14;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f3f1;padding:30px 16px;"><tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
      <tr><td style="background:#000d14;padding:24px 32px;">
        <p style="margin:0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#dcd8d5;">Visitenkarte · ${escapeHtml(args.contactName)}</p>
        <h1 style="margin:6px 0 0;font-size:22px;color:#ffffff;font-weight:700;">Neue Terminanfrage</h1>
      </td></tr>
      <tr><td style="padding:28px 32px 8px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:14px;color:#333;">
          <tr><td width="150" style="padding:4px 0;color:#888;">Name</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(args.name)}</td></tr>
          <tr><td style="padding:4px 0;color:#888;">Telefon</td><td style="padding:4px 0;"><a href="tel:${escapeHtml(args.phone)}" style="color:#da1b1e;text-decoration:none;">${escapeHtml(args.phone)}</a></td></tr>
          <tr><td style="padding:4px 0;color:#888;">E-Mail</td><td style="padding:4px 0;"><a href="mailto:${escapeHtml(args.email)}" style="color:#da1b1e;text-decoration:none;">${escapeHtml(args.email)}</a></td></tr>
          <tr><td style="padding:4px 0;color:#888;">Wunschtermin</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(args.date)} · ${escapeHtml(args.slot)}</td></tr>
        </table>
        ${args.message ? `<h2 style="margin:18px 0 10px;font-size:16px;border-left:3px solid #da1b1e;padding-left:10px;">Nachricht</h2>
        <div style="background:#f5f3f1;padding:14px 16px;border-radius:6px;font-size:14px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(args.message)}</div>` : ""}
        ${vehicleBlock(args.vehicle)}
      </td></tr>
      <tr><td style="padding:18px 32px;background:#f5f3f1;font-size:11px;color:#888;text-align:center;">
        Über die Visitenkarte /karte/${escapeHtml(args.slug)} · Eingegangen am ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function customerHtml(args: {
  name: string; phone: string; email: string; date: string; slot: string;
  message: string | null; vehicle: VehicleRow | null; contactName: string;
}): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f3f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000d14;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f3f1;padding:30px 16px;"><tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
      <tr><td style="background:#000d14;padding:28px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#dcd8d5;">Reller Automobile</p>
        <h1 style="margin:8px 0 0;font-size:24px;color:#ffffff;font-weight:700;">Ihre Terminanfrage ist da</h1>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333;">Hallo ${escapeHtml(args.name)},</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#333;">
          vielen Dank für Ihre Terminanfrage. <strong>${escapeHtml(args.contactName)}</strong> meldet sich zeitnah persönlich bei Ihnen.
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:14px;color:#333;background:#f5f3f1;border-radius:6px;">
          <tr><td style="padding:16px 18px;">
            <p style="margin:0 0 6px;"><strong>Wunschtermin:</strong> ${escapeHtml(args.date)} · ${escapeHtml(args.slot)}</p>
            <p style="margin:0 0 6px;"><strong>Telefon:</strong> ${escapeHtml(args.phone)}</p>
            <p style="margin:0;"><strong>E-Mail:</strong> ${escapeHtml(args.email)}</p>
            ${args.message ? `<p style="margin:10px 0 0;white-space:pre-wrap;"><strong>Ihre Nachricht:</strong><br>${escapeHtml(args.message)}</p>` : ""}
          </td></tr>
        </table>
        ${vehicleBlock(args.vehicle)}
        <div style="margin-top:24px;font-size:13px;color:#555;line-height:1.6;">
          Reller Automobile GmbH · Steinbruchweg 16-22 · 33106 Paderborn<br>
          Tel: <a href="tel:+4952516942-40" style="color:#555;text-decoration:none;">05251 69 42 40</a>
        </div>
      </td></tr>
      <tr><td style="padding:18px 32px;background:#000d14;font-size:11px;color:#dcd8d5;text-align:center;">
        © Reller Automobile GmbH · <a href="https://reller-automobile.de/impressum" style="color:#dcd8d5;">Impressum</a> · <a href="https://reller-automobile.de/datenschutz" style="color:#dcd8d5;">Datenschutz</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonError(400, "Ungültige Anfrage");
  }

  const adminEarly = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Mailadresse erst auf ausdrücklichen Klick herausgeben (nicht im Seitenquelltext)
  if ((payload as { action?: string }).action === "mailto") {
    const s = (payload.slug ?? "").trim().toLowerCase();
    const { data } = await adminEarly
      .from("sales_contacts")
      .select("email, is_active")
      .eq("slug", s)
      .maybeSingle();
    const row = data as { email: string; is_active: boolean } | null;
    return new Response(
      JSON.stringify({ success: true, email: row?.is_active ? row.email : null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const ok = () =>
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Honigtopf — stillschweigend verwerfen
  if (payload.website && payload.website.trim().length > 0) return ok();
  // Mindestverweildauer
  if (typeof payload.elapsedMs === "number" && payload.elapsedMs < 3000) return ok();

  const slug = (payload.slug ?? "").trim().toLowerCase();
  const name = (payload.name ?? "").trim();
  const email = (payload.email ?? "").trim();
  const phone = (payload.phone ?? "").trim();
  const preferredDate = (payload.preferredDate ?? "").trim();
  const slot = (payload.preferredTimeSlot ?? "").trim();

  if (!slug) return jsonError(400, "Karte unbekannt");
  if (name.length < 2 || name.length > 120) return jsonError(400, "Bitte geben Sie Ihren Namen an.");
  if (!isValidEmail(email)) return jsonError(400, "Bitte geben Sie eine gültige E-Mail-Adresse an.");
  if (phone.length < 5 || phone.length > 40) return jsonError(400, "Bitte geben Sie eine Telefonnummer an.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) return jsonError(400, "Bitte wählen Sie einen Wunschtermin.");
  if (!TIME_SLOT_LABELS[slot]) return jsonError(400, "Bitte wählen Sie eine Tageszeit.");
  if (!payload.gdprAccepted) return jsonError(400, "Bitte stimmen Sie der Datenverarbeitung zu.");
  const message = (payload.message ?? "").trim().slice(0, 2000) || null;

  const admin = adminEarly;

  // Kontakt serverseitig über den Slug bestimmen (auch über Weiterleitungen)
  let { data: contact } = await admin
    .from("sales_contacts")
    .select("id, slug, first_name, last_name, role, email, is_active")
    .eq("slug", slug)
    .maybeSingle();

  if (!contact) {
    const { data: redirect } = await admin
      .from("sales_contact_slug_redirects")
      .select("sales_contact_id")
      .eq("old_slug", slug)
      .maybeSingle();
    if (redirect) {
      const { data: viaRedirect } = await admin
        .from("sales_contacts")
        .select("id, slug, first_name, last_name, role, email, is_active")
        .eq("id", (redirect as { sales_contact_id: string }).sales_contact_id)
        .maybeSingle();
      contact = viaRedirect;
    }
  }

  const c = contact as {
    id: string; slug: string; first_name: string; last_name: string;
    role: string | null; email: string; is_active: boolean;
  } | null;

  if (!c || !c.is_active) return jsonError(404, "Diese Karte ist nicht mehr gültig.");

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const ipHash = ip ? await hashIp(ip) : null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) || null;

  // Begrenzung: 3 Anfragen je IP und Stunde
  if (ipHash) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("appointment_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if ((count ?? 0) >= 3) {
      return jsonError(429, "Zu viele Anfragen. Bitte versuchen Sie es später erneut.");
    }
  }

  let vehicle: VehicleRow | null = null;
  if (payload.vehicleId) {
    const { data } = await admin
      .from("vehicles")
      .select("id, title, price, currency, image_urls")
      .eq("id", payload.vehicleId)
      .maybeSingle();
    vehicle = (data as VehicleRow | null) ?? null;
  }

  // 1) Immer zuerst speichern
  const { data: inserted, error: insErr } = await admin
    .from("appointment_requests")
    .insert({
      sales_contact_id: c.id,
      name,
      email,
      phone,
      preferred_date: preferredDate,
      preferred_time_slot: slot,
      message,
      vehicle_id: vehicle?.id ?? null,
      source_slug: slug,
      ip_hash: ipHash,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("[submit-appointment-request] insert failed:", insErr?.message);
    return jsonError(500, "Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.");
  }
  const requestId = (inserted as { id: string }).id;

  const contactName = `${c.first_name} ${c.last_name}`.trim();
  const dateLabel = formatDate(preferredDate);
  const slotLabel = TIME_SLOT_LABELS[slot];

  // 2) Im Posteingang sichtbar machen
  const { data: lead } = await admin
    .from("leads")
    .insert({
      source: "BUSINESS_CARD",
      lead_type: "appointment",
      status: "IN_PROGRESS",
      buyer_name: name,
      buyer_email: email,
      buyer_phone: phone,
      vehicle_id: vehicle?.id ?? null,
      first_event_at: new Date().toISOString(),
      last_event_at: new Date().toISOString(),
      internal_note: `Visitenkarte: ${contactName}`,
    })
    .select("id")
    .maybeSingle();

  if (lead) {
    const leadId = (lead as { id: string }).id;
    await admin.from("appointment_requests").update({ lead_id: leadId }).eq("id", requestId);
    await admin.from("lead_events").insert({
      lead_id: leadId,
      event_id: `appointment-${requestId}`,
      event_type: "AppointmentRequested",
      occurred_at: new Date().toISOString(),
      payload: {
        data: {
          message: message ?? `Terminwunsch: ${dateLabel}, ${slotLabel}`,
          preferredDate,
          preferredTimeSlot: slot,
          salesContact: contactName,
          sourceSlug: slug,
        },
      },
    });
  }

  await emitNotificationEvent(admin, "inquiry_received", {
    source: "BUSINESS_CARD",
    salesContact: contactName,
    name,
    email,
    phone,
    preferredDate,
    preferredTimeSlot: slotLabel,
    vehicleId: vehicle?.id ?? null,
    appointmentRequestId: requestId,
  });

  // 3) Mails versenden
  const settings = await loadMailSettings(admin);
  const [sellerRes, customerRes] = await Promise.all([
    sendMail({
      to: c.email,
      subject: `Terminanfrage von ${name} — Wunsch: ${dateLabel}, ${slotLabel}`,
      html: sellerHtml({ name, email, phone, date: dateLabel, slot: slotLabel, message, vehicle, contactName, slug }),
      replyTo: email,
    }),
    sendMail({
      to: email,
      subject: "Ihre Terminanfrage bei Reller Automobile",
      html: customerHtml({ name, phone, email, date: dateLabel, slot: slotLabel, message, vehicle, contactName }),
      replyTo: settings.reply_to_customer,
    }),
  ]);

  if (sellerRes.ok) {
    await admin.from("appointment_requests").update({ mail_sent_at: new Date().toISOString() }).eq("id", requestId);
  } else {
    const errorText = sellerRes.error ?? "Unbekannter Fehler";
    console.error("[submit-appointment-request] Verkäufermail fehlgeschlagen");
    await admin.from("appointment_requests").update({ mail_error: errorText }).eq("id", requestId);
    // Warnung an die hinterlegten Empfänger
    try {
      const recipients = await loadRecipients(admin, "inquiry_received");
      const to = recipients.length > 0 ? recipients : [settings.inquiry_inbox];
      await sendMail({
        to,
        subject: "Terminanfrage konnte nicht zugestellt werden",
        html: `<p>Eine Terminanfrage über die Visitenkarte <strong>${escapeHtml(contactName)}</strong> wurde gespeichert,
          die Benachrichtigung an den Verkäufer konnte aber nicht zugestellt werden.</p>
          <p>Anfrage-Nr.: ${escapeHtml(requestId)}<br>Fehler: ${escapeHtml(errorText)}</p>
          <p>Die Anfrage ist im Adminbereich unter „Anfragen“ einsehbar.</p>`,
      });
    } catch (err) {
      console.error("[submit-appointment-request] Warnmail fehlgeschlagen:", err instanceof Error ? err.message : err);
    }
  }
  if (!customerRes.ok) console.error("[submit-appointment-request] Bestätigungsmail fehlgeschlagen");

  return new Response(
    JSON.stringify({
      success: true,
      requestId,
      mailsSent: { seller: sellerRes.ok, customer: customerRes.ok },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
