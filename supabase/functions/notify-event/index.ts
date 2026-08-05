// Nimmt Ereignisse entgegen und legt sie im Sammelspeicher ab.
// Der Versand erfolgt gebündelt über process-notifications.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serviceClient, loadMailSettings } from "../_shared/mail-config.ts";
import { loadRecipients, sendInternalMail } from "../_shared/internal-mail.ts";
import { renderNotificationEmail, SAMPLE_PAYLOADS } from "../_shared/notification-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_EVENTS = new Set(Object.keys(SAMPLE_PAYLOADS));

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function isAuthorized(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  if (token === SERVICE_KEY) return true;
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await userClient.auth.getClaims(token);
    if (error || !data?.claims?.sub) return false;
    if (data.claims.role === "service_role") return true;
    const admin = serviceClient();
    const { data: role } = await admin
      .from("user_roles").select("role").eq("user_id", data.claims.sub as string).maybeSingle();
    return !!role;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await isAuthorized(req))) return json(401, { error: "Unauthorized" });

  let body: { eventType?: string; payload?: Record<string, unknown>; test?: boolean };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Ungültiger Request-Body" });
  }

  const eventType = String(body.eventType ?? "");
  if (!VALID_EVENTS.has(eventType)) {
    return json(400, { error: `Unbekannter Ereignistyp: ${eventType}` });
  }

  const admin = serviceClient();

  // Testmail: sofort an die hinterlegten Empfänger, ohne Sammelspeicher.
  if (body.test) {
    const recipients = await loadRecipients(admin, eventType);
    if (recipients.length === 0) {
      return json(200, { ok: false, error: "Für dieses Ereignis ist kein Empfänger hinterlegt." });
    }
    const settings = await loadMailSettings(admin);
    const payload = { ...SAMPLE_PAYLOADS[eventType], ...(body.payload ?? {}) };
    const { subject, html } = renderNotificationEmail(eventType, [payload], { test: true });
    const result = await sendInternalMail(
      admin,
      { eventType, subject, html, recipients, metadata: { test: true } },
      settings,
    );
    return json(200, result);
  }

  const { data: setting } = await admin
    .from("notification_settings")
    .select("is_enabled")
    .eq("event_type", eventType)
    .maybeSingle();

  if (setting && setting.is_enabled === false) {
    return json(200, { ok: true, skipped: "deaktiviert" });
  }

  const { error } = await admin.from("notification_events").insert({
    event_type: eventType,
    payload: body.payload ?? {},
  });
  if (error) {
    console.error("notification_events insert failed:", error.message);
    return json(500, { error: error.message });
  }

  return json(200, { ok: true, queued: true });
});
