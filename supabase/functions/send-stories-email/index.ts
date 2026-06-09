// Sends one email with selected stories to info@reller-automobile.de via Lovable Emails.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RECIPIENTS = (Deno.env.get("STORY_EMAIL_RECIPIENT") || "info@reller-automobile.de,digital@haushhaush.de")
  .split(",").map((e) => e.trim()).filter(Boolean);

interface RequestBody {
  storyIds: string[];
  note?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // Service-role bypass: internal callers (cron, daily-story-digest) skip the admin check.
    if (token !== SUPABASE_SERVICE_ROLE_KEY) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claimsData.claims.sub as string;
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const adminWithAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: {
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      },
    });

    const body = (await req.json()) as RequestBody;
    if (!Array.isArray(body.storyIds) || body.storyIds.length === 0) {
      return new Response(JSON.stringify({ error: "storyIds required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: stories } = await admin
      .from("vehicle_stories")
      .select("id, story_image_url, vehicle_id")
      .in("id", body.storyIds);

    if (!stories || stories.length === 0) {
      return new Response(JSON.stringify({ error: "No stories found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vehicleIds = Array.from(new Set(stories.map((s) => s.vehicle_id)));
    const { data: vehicles } = await admin
      .from("vehicles").select("id, title, brand, price").in("id", vehicleIds);
    const vMap = new Map((vehicles ?? []).map((v) => [v.id, v]));

    const storiesPayload = stories.map((s) => {
      const v = vMap.get(s.vehicle_id);
      return {
        imageUrl: s.story_image_url,
        title: v?.title ?? "Fahrzeug",
        brand: v?.brand ?? "",
        price: v?.price ? `${Number(v.price).toLocaleString("de-DE")} €` : "Auf Anfrage",
      };
    });

    const baseKey = `stories-digest-${stories.map((s) => s.id).sort().join("-")}`;

    const results = await Promise.all(
      RECIPIENTS.map((recipient) =>
        adminWithAuth.functions.invoke("send-transactional-email", {
          body: {
            templateName: "stories-digest",
            recipientEmail: recipient,
            idempotencyKey: `${baseKey}-${recipient}`,
            templateData: {
              stories: storiesPayload,
              note: body.note?.trim() || undefined,
              count: storiesPayload.length,
            },
          },
        }).then((r) => ({ recipient, error: r.error }))
      )
    );

    const failed = results.filter((r) => r.error);
    if (failed.length === RECIPIENTS.length) {
      console.error("send-transactional-email failed for all:", failed);
      return new Response(JSON.stringify({ error: "Email send failed", details: failed.map((f) => String(f.error)) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (failed.length > 0) {
      console.error("send-transactional-email partial failure:", failed);
    }

    const nowIso = new Date().toISOString();
    await admin
      .from("vehicle_stories")
      .update({ sent_to_dealer: true, sent_at: nowIso })
      .in("id", stories.map((s) => s.id));

    return new Response(JSON.stringify({ sent: stories.length, recipients: RECIPIENTS, failed: failed.map((f) => f.recipient) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
