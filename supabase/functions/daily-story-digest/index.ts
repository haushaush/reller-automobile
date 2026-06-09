// Daily Story Digest: generates story images for all vehicles added in the
// last 24h and sends a single digest email to the configured story recipients.
//
// Runs hourly via pg_cron. The function checks app_settings on each tick:
//   - daily_digest_enabled (jsonb boolean): on/off switch
//   - daily_digest_hour    (jsonb number):  target send hour in Europe/Berlin
//   - daily_digest_last_sent (jsonb string YYYY-MM-DD): idempotency marker
// Only when the current Berlin hour matches and we haven't sent today, it runs.
// Query param ?force=true bypasses the hour + idempotency checks (for manual tests).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ENABLED_KEY = "daily_digest_enabled";
const HOUR_KEY = "daily_digest_hour";
const LAST_SENT_KEY = "daily_digest_last_sent";

function berlinNowParts() {
  // Returns the current date/hour in Europe/Berlin (handles DST automatically).
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = parseInt(get("hour"), 10);
  return { date, hour };
}

async function loadSetting<T>(
  admin: ReturnType<typeof createClient>,
  key: string,
): Promise<T | null> {
  const { data } = await admin
    .from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const enabled = await loadSetting<boolean>(admin, ENABLED_KEY);
    if (!force && enabled !== true) {
      console.log("daily-story-digest: disabled, skipping");
      return new Response(JSON.stringify({ skipped: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hourSetting = (await loadSetting<number>(admin, HOUR_KEY)) ?? 7;
    const { date: berlinDate, hour: berlinHour } = berlinNowParts();

    if (!force && berlinHour !== hourSetting) {
      console.log(`daily-story-digest: hour mismatch (now=${berlinHour}, target=${hourSetting})`);
      return new Response(JSON.stringify({ skipped: "wrong_hour", berlinHour, target: hourSetting }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastSent = await loadSetting<string>(admin, LAST_SENT_KEY);
    if (!force && lastSent === berlinDate) {
      console.log(`daily-story-digest: already sent today (${berlinDate})`);
      return new Response(JSON.stringify({ skipped: "already_sent_today", date: berlinDate }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: vehicles, error: vehErr } = await admin
      .from("vehicles")
      .select("id, created_at")
      .gte("created_at", since)
      .eq("is_sold", false);

    if (vehErr) {
      console.error("daily-story-digest: vehicles query failed", vehErr);
      return new Response(JSON.stringify({ error: vehErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vehicleIds = (vehicles ?? []).map((v) => v.id);
    console.log(`daily-story-digest: found ${vehicleIds.length} new vehicles since ${since}`);

    if (vehicleIds.length === 0) {
      // Mark as sent so we don't re-check every hour for the rest of the day.
      if (!force) {
        await admin.from("app_settings").upsert(
          { key: LAST_SENT_KEY, value: berlinDate, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      }
      return new Response(JSON.stringify({ sent: 0, reason: "no_new_vehicles", date: berlinDate }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate story images via generate-story (service-role bypass; skip per-vehicle email).
    const adminWithAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    });
    const { data: genData, error: genErr } = await adminWithAuth.functions.invoke("generate-story", {
      body: { vehicleIds, skipDealerEmail: true },
    });
    if (genErr) {
      console.error("daily-story-digest: generate-story failed", genErr);
      return new Response(JSON.stringify({ error: "generate-story failed", details: String(genErr) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const storyIds: string[] = Array.isArray(genData?.storyIds) ? genData.storyIds : [];
    console.log(`daily-story-digest: generated ${storyIds.length} stories`);

    if (storyIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_stories_generated" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: sendData, error: sendErr } = await adminWithAuth.functions.invoke("send-stories-email", {
      body: { storyIds, note: "Neue Fahrzeuge der letzten 24 Stunden" },
    });
    if (sendErr) {
      console.error("daily-story-digest: send-stories-email failed", sendErr);
      return new Response(JSON.stringify({ error: "send-stories-email failed", details: String(sendErr) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!force) {
      await admin.from("app_settings").upsert(
        { key: LAST_SENT_KEY, value: berlinDate, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    }

    console.log(`daily-story-digest: done`, sendData);
    return new Response(JSON.stringify({
      sent: storyIds.length,
      date: berlinDate,
      sendResult: sendData,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("daily-story-digest: fatal", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
