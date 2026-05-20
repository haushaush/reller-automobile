// Sends a single email with multiple selected stories to info@reller-automobile.de.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const RECIPIENT = Deno.env.get("STORY_EMAIL_RECIPIENT") || "info@reller-automobile.de";

interface RequestBody {
  storyIds: string[];
  note?: string;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!Array.isArray(body.storyIds) || body.storyIds.length === 0) {
      return new Response(JSON.stringify({ error: "storyIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: stories } = await admin
      .from("vehicle_stories")
      .select("id, story_image_url, vehicle_id")
      .in("id", body.storyIds);

    if (!stories || stories.length === 0) {
      return new Response(JSON.stringify({ error: "No stories found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vehicleIds = Array.from(new Set(stories.map((s) => s.vehicle_id)));
    const { data: vehicles } = await admin
      .from("vehicles")
      .select("id, title, brand, price")
      .in("id", vehicleIds);
    const vMap = new Map((vehicles ?? []).map((v) => [v.id, v]));

    const count = stories.length;
    const note = body.note?.trim();

    const items = stories
      .map((s) => {
        const v = vMap.get(s.vehicle_id);
        const title = escapeHtml(v?.title ?? "Fahrzeug");
        const brand = escapeHtml(v?.brand ?? "");
        const price = v?.price ? `${v.price.toLocaleString("de-DE")} €` : "Auf Anfrage";
        return `
          <div style="margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid #eee;">
            <div style="font-size:12px; color:#777; text-transform:uppercase;">${brand}</div>
            <div style="font-size:16px; font-weight:600; margin:4px 0;">${title}</div>
            <div style="font-size:14px; color:#444; margin-bottom:8px;">${price}</div>
            <a href="${s.story_image_url}" target="_blank" style="display:inline-block;">
              <img src="${s.story_image_url}" alt="${title}" style="max-width:240px; border-radius:12px; display:block;" />
            </a>
            <div style="margin-top:8px;"><a href="${s.story_image_url}">Story-Bild öffnen</a></div>
          </div>`;
      })
      .join("");

    const html = `
      <div style="font-family: Arial, sans-serif; color:#222; max-width:640px;">
        <h2 style="margin:0 0 12px;">${count} neue Stor${count === 1 ? "y" : "ies"} bereit</h2>
        <p style="margin:0 0 16px; color:#555;">
          ${count === 1 ? "Eine ausgewählte Story" : `${count} ausgewählte Stories`} aus dem Reller Story-Archiv:
        </p>
        ${note ? `<p style="margin:0 0 20px; padding:12px; background:#f7f7f5; border-left:3px solid #999;">${escapeHtml(note)}</p>` : ""}
        ${items}
        <p style="margin-top:24px; font-size:12px; color:#888;">
          Automatisch versendet aus dem Reller Story-Archiv.
        </p>
      </div>
    `;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Reller Portal <noreply@reller-automobile.de>",
        to: [RECIPIENT],
        subject: `${count} neue Stor${count === 1 ? "y" : "ies"} – Reller Story-Archiv`,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("Resend failed:", errText);
      return new Response(JSON.stringify({ error: "Email send failed", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nowIso = new Date().toISOString();
    await admin
      .from("vehicle_stories")
      .update({ sent_to_dealer: true, sent_at: nowIso })
      .in("id", stories.map((s) => s.id));

    return new Response(JSON.stringify({ sent: stories.length, recipient: RECIPIENT }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
