import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_GATEWAY = "https://connector-gateway.lovable.dev/resend";
const FROM = "Reller Portal <onboarding@resend.dev>";
const DEALER_EMAIL_PRIMARY = Deno.env.get("DEALER_EMAIL_PRIMARY") || "dennis@haushhaush.de";
const DEALER_EMAIL_SECONDARY = Deno.env.get("DEALER_EMAIL_SECONDARY") || "admin@haushhaush.de";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://reller-automobile.lovable.app";

interface ContactInput {
  salutation?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  preferredContact?: "email" | "phone" | "both";
  gdprAccepted: boolean;
}

interface InquiryPayload {
  contact: ContactInput;
  vehicleIds: string[];
  message?: string | null;
  website?: string; // honeypot
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

function formatPrice(price: number | null, currency: string | null): string {
  if (!price) return "Auf Anfrage";
  const symbol = !currency || currency.toUpperCase() === "EUR" ? "€" : currency;
  return `${price.toLocaleString("de-DE")} ${symbol}`;
}

function preferredContactLabel(v: string | undefined | null): string {
  if (v === "phone") return "Telefon";
  if (v === "both") return "E-Mail & Telefon";
  return "E-Mail";
}

const FUEL_LABELS: Record<string, string> = {
  Petrol: "Benzin", Diesel: "Diesel", Electric: "Elektro", Electricity: "Elektro",
  Hybrid: "Hybrid", HybridPetrol: "Hybrid (Benzin)", HybridDiesel: "Hybrid (Diesel)",
  PluginHybrid: "Plug-in-Hybrid", PluginHybridPetrol: "Plug-in-Hybrid (Benzin)",
  PluginHybridDiesel: "Plug-in-Hybrid (Diesel)", LPG: "Autogas (LPG)", CNG: "Erdgas (CNG)",
  Hydrogen: "Wasserstoff", Ethanol: "Ethanol", Other: "Sonstige",
};
const GEARBOX_LABELS: Record<string, string> = {
  Automatic: "Automatik", AutomaticGear: "Automatik",
  Manual: "Schaltgetriebe", ManualGear: "Schaltgetriebe",
  SemiAutomatic: "Halbautomatik", SemiautomaticGear: "Halbautomatik",
};
function fuelLabel(v: string): string {
  return FUEL_LABELS[v] ?? v.replace(/([A-Z])/g, " $1").trim();
}
function gearboxLabel(v: string): string {
  return GEARBOX_LABELS[v] ?? v.replace(/([A-Z])/g, " $1").trim();
}

interface VehicleRow {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  year: string | null;
  mileage: number | null;
  power: number | null;
  fuel: string | null;
  gearbox: string | null;
  price: number | null;
  currency: string | null;
  image_urls: string[] | null;
  detail_page_url: string | null;
}

function dealerEmailHtml(contact: ContactInput, vehicles: VehicleRow[], message: string | null, inquiryId: string): string {
  const vehicleBlocks = vehicles
    .map((v) => {
      const img = v.image_urls?.[0];
      const ps = v.power ? Math.round(v.power * 1.36) : null;
      const specs = [
        v.year ? `EZ ${escapeHtml(v.year)}` : null,
        v.mileage != null ? `${v.mileage.toLocaleString("de-DE")} km` : null,
        ps ? `${ps} PS` : null,
        v.fuel ? escapeHtml(fuelLabel(v.fuel)) : null,
        v.gearbox ? escapeHtml(gearboxLabel(v.gearbox)) : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #e5e5e5;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                ${img ? `<td width="120" style="padding-right:16px;vertical-align:top;"><img src="${escapeHtml(img)}" alt="" width="110" style="display:block;border-radius:6px;width:110px;height:auto;" /></td>` : ""}
                <td style="vertical-align:top;">
                  <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;">${escapeHtml(v.brand || "")}</p>
                  <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#000d14;line-height:1.3;">${escapeHtml(v.title)}</p>
                  <p style="margin:0 0 8px;font-size:13px;color:#666;">${specs}</p>
                  <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#da1b1e;">${formatPrice(v.price, v.currency)}</p>
                  <p style="margin:0;font-size:12px;">
                    <a href="${APP_BASE_URL}/fahrzeug/${v.id}" style="color:#da1b1e;text-decoration:none;font-weight:600;">Im Portal ansehen →</a>
                    ${v.detail_page_url ? `&nbsp;&nbsp;<a href="${escapeHtml(v.detail_page_url)}" style="color:#888;text-decoration:none;">Mobile.de</a>` : ""}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f3f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000d14;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f3f1;padding:30px 16px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#000d14;padding:24px 32px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#dcd8d5;">Reller Automobile · Portal</p>
          <h1 style="margin:6px 0 0;font-size:22px;color:#ffffff;font-weight:700;">Neue Fahrzeuganfrage</h1>
        </td></tr>
        <tr><td style="padding:28px 32px 8px;">
          <h2 style="margin:0 0 14px;font-size:16px;color:#000d14;border-left:3px solid #da1b1e;padding-left:10px;">Kontaktdaten</h2>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:14px;color:#333;">
            <tr><td width="160" style="padding:4px 0;color:#888;">Name</td><td style="padding:4px 0;font-weight:600;">${escapeHtml([contact.salutation, contact.firstName, contact.lastName].filter(Boolean).join(" "))}</td></tr>
            <tr><td style="padding:4px 0;color:#888;">E-Mail</td><td style="padding:4px 0;"><a href="mailto:${escapeHtml(contact.email)}" style="color:#da1b1e;text-decoration:none;">${escapeHtml(contact.email)}</a></td></tr>
            ${contact.phone ? `<tr><td style="padding:4px 0;color:#888;">Telefon</td><td style="padding:4px 0;"><a href="tel:${escapeHtml(contact.phone)}" style="color:#da1b1e;text-decoration:none;">${escapeHtml(contact.phone)}</a></td></tr>` : ""}
            <tr><td style="padding:4px 0;color:#888;">Bevorzugter Kontakt</td><td style="padding:4px 0;">${preferredContactLabel(contact.preferredContact)}</td></tr>
          </table>
        </td></tr>
        ${message ? `<tr><td style="padding:8px 32px 0;">
          <h2 style="margin:18px 0 10px;font-size:16px;color:#000d14;border-left:3px solid #da1b1e;padding-left:10px;">Nachricht</h2>
          <div style="background:#f5f3f1;padding:14px 16px;border-radius:6px;font-size:14px;line-height:1.5;color:#333;white-space:pre-wrap;">${escapeHtml(message)}</div>
        </td></tr>` : ""}
        <tr><td style="padding:8px 32px 24px;">
          <h2 style="margin:18px 0 6px;font-size:16px;color:#000d14;border-left:3px solid #da1b1e;padding-left:10px;">${vehicles.length} angefragte${vehicles.length === 1 ? "s Fahrzeug" : " Fahrzeuge"}</h2>
          <table cellpadding="0" cellspacing="0" border="0" width="100%">${vehicleBlocks}</table>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f5f3f1;font-size:11px;color:#888;text-align:center;">
          Anfrage-ID: ${escapeHtml(inquiryId)}<br>
          Eingegangen am ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function customerEmailHtml(contact: ContactInput, vehicles: VehicleRow[]): string {
  const vehicleBlocks = vehicles
    .map((v) => {
      const img = v.image_urls?.[0];
      return `
        <tr><td style="padding:12px 0;border-bottom:1px solid #e5e5e5;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            ${img ? `<td width="100" style="padding-right:14px;vertical-align:top;"><img src="${escapeHtml(img)}" alt="" width="90" style="display:block;border-radius:6px;width:90px;height:auto;" /></td>` : ""}
            <td style="vertical-align:top;">
              <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;">${escapeHtml(v.brand || "")}</p>
              <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#000d14;line-height:1.3;">${escapeHtml(v.title)}</p>
              <p style="margin:0;font-size:15px;font-weight:700;color:#da1b1e;">${formatPrice(v.price, v.currency)}</p>
            </td>
          </tr></table>
        </td></tr>`;
    })
    .join("");

  const greeting = contact.salutation && contact.lastName
    ? `Sehr geehrte${contact.salutation === "Frau" ? "" : "r"} ${contact.salutation} ${contact.lastName}`
    : `Hallo ${contact.firstName}`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f3f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000d14;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f3f1;padding:30px 16px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#000d14;padding:28px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#dcd8d5;">Reller Automobile</p>
          <h1 style="margin:8px 0 0;font-size:24px;color:#ffffff;font-weight:700;">Vielen Dank für Ihre Anfrage</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333;">${escapeHtml(greeting)},</p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333;">
            wir haben Ihre Anfrage erhalten und werden uns <strong>innerhalb von 24 Stunden</strong> persönlich bei Ihnen melden.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#333;">
            Bei dringenden Rückfragen erreichen Sie uns direkt unter <a href="tel:+4952516942-40" style="color:#da1b1e;text-decoration:none;font-weight:600;">05251 69 42 40</a>.
          </p>

          <h2 style="margin:0 0 12px;font-size:15px;color:#000d14;border-left:3px solid #da1b1e;padding-left:10px;">
            Ihre angefragten Fahrzeuge
          </h2>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">${vehicleBlocks}</table>

          <div style="background:#f5f3f1;padding:18px 20px;border-radius:6px;margin-top:8px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#000d14;">Reller Automobile GmbH</p>
            <p style="margin:0 0 4px;font-size:13px;color:#555;line-height:1.5;">Steinbruchweg 16-22 · 33106 Paderborn</p>
            <p style="margin:0 0 4px;font-size:13px;color:#555;">Tel: <a href="tel:+4952516942-40" style="color:#555;text-decoration:none;">05251 69 42 40</a></p>
            <p style="margin:0 0 8px;font-size:13px;color:#555;">E-Mail: <a href="mailto:info@reller-automobile.de" style="color:#555;text-decoration:none;">info@reller-automobile.de</a></p>
            <p style="margin:8px 0 0;font-size:12px;color:#888;">Mo-Fr 08:00-18:00 · Sa 09:00-13:00</p>
          </div>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#000d14;font-size:11px;color:#dcd8d5;text-align:center;">
          © Reller Automobile GmbH · <a href="https://reller-automobile.de/impressum" style="color:#dcd8d5;text-decoration:underline;">Impressum</a> · <a href="https://reller-automobile.de/datenschutz" style="color:#dcd8d5;text-decoration:underline;">Datenschutz</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendResendMail(args: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  bcc?: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!lovableKey) return { ok: false, error: "LOVABLE_API_KEY not configured" };
  if (!resendKey) return { ok: false, error: "RESEND_API_KEY not configured" };

  const body: Record<string, unknown> = {
    from: FROM,
    to: [args.to],
    subject: args.subject,
    html: args.html,
  };
  if (args.replyTo) body.reply_to = args.replyTo;
  if (args.bcc && args.bcc.length > 0) body.bcc = args.bcc;

  const res = await fetch(`${RESEND_GATEWAY}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    return { ok: false, error: `Resend ${res.status}: ${txt}` };
  }
  await res.text();
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  let payload: InquiryPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  // Honeypot — silent success to confuse bots
  if (payload.website && payload.website.trim().length > 0) {
    console.log("[send-inquiry] honeypot triggered, silently dropping");
    return new Response(JSON.stringify({ success: true, inquiryId: "dropped" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { contact, vehicleIds, message } = payload;

  // Server-side validation
  if (!contact || typeof contact !== "object") return jsonError(400, "Kontaktdaten fehlen");
  if (!contact.firstName?.trim() || contact.firstName.length > 100) return jsonError(400, "Vorname ungültig");
  if (!contact.lastName?.trim() || contact.lastName.length > 100) return jsonError(400, "Nachname ungültig");
  if (!contact.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) || contact.email.length > 255) {
    return jsonError(400, "Ungültige E-Mail-Adresse");
  }
  if (contact.phone && contact.phone.length > 50) return jsonError(400, "Telefonnummer zu lang");
  if (!contact.gdprAccepted) return jsonError(400, "Datenschutz muss akzeptiert werden");
  if (!Array.isArray(vehicleIds) || vehicleIds.length === 0 || vehicleIds.length > 10) {
    return jsonError(400, "Bitte wählen Sie 1 bis 10 Fahrzeuge");
  }
  if (message && message.length > 2000) return jsonError(400, "Nachricht zu lang");

  // Capture IP / UA
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "";
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) || "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Rate limit: max 5 inquiries per IP per hour
  if (ip) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= 5) {
      return jsonError(429, "Zu viele Anfragen. Bitte versuchen Sie es später erneut.");
    }
  }

  // Load vehicles
  const { data: vehicles, error: vehErr } = await supabase
    .from("vehicles")
    .select("*")
    .in("id", vehicleIds);

  if (vehErr || !vehicles || vehicles.length === 0) {
    return jsonError(400, "Fahrzeuge konnten nicht geladen werden");
  }

  // Insert inquiry
  const { data: inquiry, error: insErr } = await supabase
    .from("inquiries")
    .insert({
      salutation: contact.salutation || null,
      first_name: contact.firstName.trim(),
      last_name: contact.lastName.trim(),
      email: contact.email.trim(),
      phone: contact.phone?.trim() || null,
      message: message?.trim() || null,
      preferred_contact: contact.preferredContact || "email",
      gdpr_accepted: true,
      ip_address: ip || null,
      user_agent: userAgent || null,
    })
    .select()
    .single();

  if (insErr || !inquiry) {
    console.error("[send-inquiry] insert inquiry failed:", insErr);
    return jsonError(500, "Speichern der Anfrage fehlgeschlagen");
  }

  // Insert junctions with snapshot
  const { error: junErr } = await supabase.from("inquiry_vehicles").insert(
    vehicles.map((v) => ({
      inquiry_id: inquiry.id,
      vehicle_id: v.id,
      vehicle_snapshot: v,
    }))
  );
  if (junErr) {
    console.error("[send-inquiry] insert junctions failed:", junErr);
    // Continue: emails are still useful
  }

  // Send mails
  const subjectDealer = `Neue Fahrzeuganfrage von ${contact.firstName} ${contact.lastName} (${vehicles.length} Fahrzeug${vehicles.length === 1 ? "" : "e"})`;
  const dealerHtml = dealerEmailHtml(contact, vehicles as VehicleRow[], message ?? null, inquiry.id);
  const customerHtml = customerEmailHtml(contact, vehicles as VehicleRow[]);

  const [dealerRes, customerRes] = await Promise.all([
    sendResendMail({
      to: DEALER_EMAIL,
      subject: subjectDealer,
      html: dealerHtml,
      replyTo: contact.email,
      bcc: INTERNAL_MONITORING_EMAIL ? [INTERNAL_MONITORING_EMAIL] : undefined,
    }),
    sendResendMail({
      to: contact.email,
      subject: "Ihre Anfrage bei Reller Automobile",
      html: customerHtml,
    }),
  ]);

  if (!dealerRes.ok) console.error("[send-inquiry] dealer mail failed:", dealerRes.error);
  if (!customerRes.ok) console.error("[send-inquiry] customer mail failed:", customerRes.error);

  return new Response(
    JSON.stringify({
      success: true,
      inquiryId: inquiry.id,
      mailsSent: { dealer: dealerRes.ok, customer: customerRes.ok },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
