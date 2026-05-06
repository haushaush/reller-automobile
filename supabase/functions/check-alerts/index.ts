import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VehicleAlert {
  id: string;
  email: string;
  name: string;
  brand: string | null;
  category: string | null;
  body_type: string | null;
  max_price: number | null;
  min_year: string | null;
  max_mileage: number | null;
  message: string | null;
  is_active: boolean;
  last_notified_at: string | null;
  created_at: string;
}

interface Vehicle {
  id: string;
  title: string;
  brand: string | null;
  vehicle_category: string | null;
  body_type: string | null;
  price: number | null;
  year: string | null;
  mileage: number | null;
  power: number | null;
  fuel: string | null;
  gearbox: string | null;
  image_urls: string[];
  is_sold: boolean;
  created_at: string;
}

function vehicleMatchesAlert(vehicle: Vehicle, alert: VehicleAlert): boolean {
  if (vehicle.is_sold) return false;

  if (alert.brand && vehicle.brand) {
    if (vehicle.brand.toLowerCase() !== alert.brand.toLowerCase()) return false;
  }

  if (alert.category) {
    if (alert.category.toLowerCase() === "oldtimer") {
      if (!["oldtimer", "youngtimer"].includes((vehicle.vehicle_category || "").toLowerCase())) return false;
    } else {
      if ((vehicle.vehicle_category || "").toLowerCase() !== alert.category.toLowerCase()) return false;
    }
  }

  if (alert.body_type && vehicle.body_type !== alert.body_type) return false;
  if (alert.max_price && vehicle.price && vehicle.price > alert.max_price) return false;

  if (alert.min_year && vehicle.year) {
    const alertYear = parseInt(alert.min_year.substring(0, 4));
    const vehicleYear = parseInt(vehicle.year.substring(0, 4));
    if (!isNaN(alertYear) && !isNaN(vehicleYear) && vehicleYear < alertYear) return false;
  }

  if (alert.max_mileage && vehicle.mileage && vehicle.mileage > alert.max_mileage) return false;

  return true;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function generateAlertEmailHtml(alert: VehicleAlert, vehicles: Vehicle[]): string {
  const cards = vehicles.map((v) => {
    const img = v.image_urls?.[0] ? `<img src="${escapeHtml(v.image_urls[0])}" alt="" style="width:100%;max-width:560px;height:auto;border-radius:8px;display:block;margin-bottom:12px;" />` : "";
    const specs: string[] = [];
    if (v.year) specs.push("EZ " + escapeHtml(v.year));
    if (v.mileage) specs.push(v.mileage.toLocaleString("de-DE") + " km");
    if (v.power) specs.push(Math.round(v.power * 1.36) + " PS");
    if (v.fuel) specs.push(escapeHtml(v.fuel));
    return `
      <div style="border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin-bottom:16px;background:#fafafa;">
        ${img}
        <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(v.brand || "")}</div>
        <div style="font-size:18px;font-weight:600;color:#111;margin:4px 0;">${escapeHtml(v.title)}</div>
        <div style="font-size:20px;font-weight:700;color:#da1b1e;margin:8px 0;">${v.price ? v.price.toLocaleString("de-DE") + " €" : "Auf Anfrage"}</div>
        <div style="font-size:13px;color:#555;">${specs.join(" · ")}</div>
      </div>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:#111;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;">Reller Automobile</h1>
          <p style="color:#ddd;margin:8px 0 0;font-size:14px;">Ihr Suchauftrag hat einen Treffer!</p>
        </td></tr>
        <tr><td style="padding:24px;">
          <h2 style="font-size:18px;color:#111;margin:0 0 12px;">Hallo ${escapeHtml(alert.name)},</h2>
          <p style="font-size:14px;color:#444;line-height:1.5;margin:0 0 20px;">
            wir haben ${vehicles.length === 1 ? "ein neues Fahrzeug" : vehicles.length + " neue Fahrzeuge"} in unserem Bestand,
            ${vehicles.length === 1 ? "das" : "die"} zu Ihrem Suchauftrag passt:
          </p>
          ${cards}
          <p style="font-size:14px;color:#444;margin:24px 0;">
            Interessiert? Schauen Sie sich die Fahrzeuge in unserem Online-Bestand an oder rufen Sie uns direkt an.
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="https://reller-automobile.lovable.app/fahrzeuge" style="background:#da1b1e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;display:inline-block;">Zum Fahrzeugbestand →</a>
          </div>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;" />
          <p style="font-size:12px;color:#777;line-height:1.5;margin:0;">
            Reller Automobile GmbH<br>
            Steinbruchweg 16-22, 33106 Paderborn<br>
            Telefon: 05251 69 42 40<br>
            E-Mail: <a href="mailto:info@reller-automobile.de" style="color:#da1b1e;text-decoration:none;">info@reller-automobile.de</a>
          </p>
          <p style="font-size:11px;color:#999;margin:16px 0 0;line-height:1.5;">
            Sie erhalten diese E-Mail, weil Sie einen Suchauftrag bei uns angelegt haben.
            Wenn Sie keine Benachrichtigungen mehr erhalten möchten, antworten Sie einfach auf diese E-Mail.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function generateDealerNotificationHtml(alert: VehicleAlert, vehicles: Vehicle[]): string {
  const criteria: string[] = [];
  if (alert.brand) criteria.push(`<li><strong>Marke:</strong> ${escapeHtml(alert.brand)}</li>`);
  if (alert.category) criteria.push(`<li><strong>Kategorie:</strong> ${escapeHtml(alert.category)}</li>`);
  if (alert.body_type) criteria.push(`<li><strong>Karosserie:</strong> ${escapeHtml(alert.body_type)}</li>`);
  if (alert.max_price) criteria.push(`<li><strong>Max. Preis:</strong> ${alert.max_price.toLocaleString("de-DE")} €</li>`);
  if (alert.min_year) criteria.push(`<li><strong>Min. Baujahr:</strong> ${escapeHtml(alert.min_year)}</li>`);
  if (alert.max_mileage) criteria.push(`<li><strong>Max. Kilometerstand:</strong> ${alert.max_mileage.toLocaleString("de-DE")} km</li>`);

  const list = vehicles.map((v) =>
    `<li>${escapeHtml(v.title)} — ${v.price ? v.price.toLocaleString("de-DE") + " €" : "Auf Anfrage"}</li>`
  ).join("");

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;">
    <div style="max-width:640px;margin:0 auto;">
      <h2 style="color:#111;">Suchauftrag-Match gefunden</h2>
      <p>Ein automatischer Suchauftrag-Match wurde versendet:</p>
      <div style="background:#f5f5f5;padding:16px;border-radius:6px;margin:16px 0;">
        <p style="margin:4px 0;"><strong>Kunde:</strong> ${escapeHtml(alert.name)}</p>
        <p style="margin:4px 0;"><strong>E-Mail:</strong> ${escapeHtml(alert.email)}</p>
        <p style="margin:4px 0;"><strong>Match-Anzahl:</strong> ${vehicles.length} Fahrzeug(e)</p>
      </div>
      <h3>Suchkriterien</h3>
      <ul>${criteria.join("") || "<li>Keine Filter</li>"}</ul>
      ${alert.message ? `
        <h3>Zusätzliche Nachricht des Kunden</h3>
        <div style="background:#fff8dc;border-left:4px solid #da1b1e;padding:12px;margin:8px 0;white-space:pre-wrap;">${escapeHtml(alert.message)}</div>
      ` : ""}
      <h3>Gefundene Fahrzeuge</h3>
      <ul>${list}</ul>
    </div>
  </body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const resend = new Resend(resendApiKey);

    const { data: alerts, error: alertsError } = await supabase
      .from("vehicle_alerts")
      .select("*")
      .eq("is_active", true);

    if (alertsError) throw alertsError;

    if (!alerts || alerts.length === 0) {
      return new Response(JSON.stringify({ checked: 0, notified: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Checking ${alerts.length} active alerts`);

    const internalEmails = Array.from(new Set([
      Deno.env.get("DEALER_EMAIL_PRIMARY") || "dennis@haushhaush.de",
      Deno.env.get("DEALER_EMAIL_SECONDARY") || "admin@haushhaush.de",
      "verkauf@reller-automobile.de",
    ].filter(Boolean) as string[]));

    const fourHoursMs = 4 * 60 * 60 * 1000;
    const nowMs = Date.now();

    let notifiedCount = 0;

    for (const alert of alerts as VehicleAlert[]) {
      const lastNotifiedMs = alert.last_notified_at ? new Date(alert.last_notified_at).getTime() : 0;
      if (lastNotifiedMs && nowMs - lastNotifiedMs < fourHoursMs) {
        console.log(`Alert ${alert.id} notified <4h ago, skipping`);
        continue;
      }

      const cutoff = alert.last_notified_at || alert.created_at;
      const { data: newVehicles, error: vehErr } = await supabase
        .from("vehicles")
        .select("*")
        .eq("is_sold", false)
        .gt("created_at", cutoff);

      if (vehErr) {
        console.error(`Failed to load vehicles for alert ${alert.id}:`, vehErr);
        continue;
      }
      if (!newVehicles || newVehicles.length === 0) continue;

      const matched = (newVehicles as Vehicle[]).filter((v) => vehicleMatchesAlert(v, alert));
      if (matched.length === 0) continue;

      console.log(`Alert ${alert.id} (${alert.email}): ${matched.length} matches`);

      try {
        const customerResult = await resend.emails.send({
          from: "Reller Automobile <onboarding@resend.dev>",
          to: [alert.email],
          subject: "Neue passende Fahrzeuge zu Ihrem Suchauftrag bei Reller Automobile",
          html: generateAlertEmailHtml(alert, matched),
        });

        if (customerResult.error) {
          console.error(`Customer email failed for ${alert.id}:`, customerResult.error);
          continue;
        }

        if (internalEmails.length > 0) {
          await resend.emails.send({
            from: "Reller Portal <onboarding@resend.dev>",
            to: internalEmails,
            subject: `[Match] Suchauftrag-Treffer für ${alert.name} (${matched.length} Fahrzeug${matched.length > 1 ? "e" : ""})`,
            html: generateDealerNotificationHtml(alert, matched),
          });
        }

        await supabase
          .from("vehicle_alerts")
          .update({ last_notified_at: new Date().toISOString() })
          .eq("id", alert.id);

        notifiedCount++;
        console.log(`Notification sent for alert ${alert.id}`);
      } catch (e) {
        console.error(`Error sending notification for alert ${alert.id}:`, e);
        continue;
      }
    }

    return new Response(
      JSON.stringify({ success: true, checked: alerts.length, notified: notifiedCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Check-alerts error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
