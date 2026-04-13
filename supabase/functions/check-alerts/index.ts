import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load active alerts
    const { data: alerts, error: alertsError } = await supabase
      .from("vehicle_alerts")
      .select("*")
      .eq("is_active", true);

    if (alertsError) {
      console.error("Error loading alerts:", alertsError);
      return new Response(
        JSON.stringify({ error: "Failed to load alerts" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!alerts || alerts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active alerts", checked: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let triggered = 0;

    for (const alert of alerts) {
      let query = supabase.from("vehicles").select("id, title, brand, price, year, mileage, body_type, category");

      // Filter by criteria
      if (alert.brand) query = query.eq("brand", alert.brand);
      if (alert.category) query = query.eq("category", alert.category);
      if (alert.body_type) query = query.eq("body_type", alert.body_type);
      if (alert.max_price) query = query.lte("price", alert.max_price);
      if (alert.min_year) query = query.gte("year", alert.min_year);
      if (alert.max_mileage) query = query.lte("mileage", alert.max_mileage);

      // Only new vehicles since last notification
      if (alert.last_notified_at) {
        query = query.gt("created_at", alert.last_notified_at);
      }

      const { data: matches, error: matchError } = await query;

      if (matchError) {
        console.error(`Error checking alert ${alert.id}:`, matchError);
        continue;
      }

      if (matches && matches.length > 0) {
        console.log(`Alert ${alert.id} (${alert.email}): ${matches.length} new matches found`);
        matches.forEach((m) => console.log(`  - ${m.title} (${m.price}€)`));
        triggered++;

        // Update last_notified_at
        await supabase
          .from("vehicle_alerts")
          .update({ last_notified_at: new Date().toISOString() })
          .eq("id", alert.id);
      }
    }

    return new Response(
      JSON.stringify({ success: true, checked: alerts.length, triggered }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Check alerts error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
