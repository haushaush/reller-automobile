// Prüft hängende Veröffentlichungen und ordnet vorhandene Anzeigen nachträglich zu.
// Wird beim Öffnen der Fahrzeugliste, beim Abgleich und über die Schaltfläche
// "Status prüfen" aufgerufen.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveStuckPublishing, STUCK_MINUTES } from "../_shared/stuck-publishing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Dienstaufrufe (Abgleich/Cron) nutzen den Service-Schlüssel direkt.
    const isService = token === SUPABASE_SERVICE_ROLE_KEY;
    if (!isService) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claims?.claims?.sub) return json(401, { error: "Unauthorized" });
      const { data: roleRow } = await admin
        .from("user_roles").select("role")
        .eq("user_id", claims.claims.sub as string).eq("role", "admin").maybeSingle();
      if (!roleRow) return json(403, { error: "Forbidden" });
    }

    let thresholdMinutes = STUCK_MINUTES;
    let vehicleId: string | undefined;
    try {
      const body = await req.json();
      if (typeof body?.thresholdMinutes === "number" && body.thresholdMinutes >= 0) {
        thresholdMinutes = body.thresholdMinutes;
      }
      if (typeof body?.vehicleId === "string" && body.vehicleId.trim()) vehicleId = body.vehicleId.trim();
    } catch { /* Standardwerte */ }

    const summary = await resolveStuckPublishing(admin, { thresholdMinutes, vehicleId });
    return json(200, { ok: true, ...summary });
  } catch (err) {
    console.error("resolve-stuck-publishing fatal:", err);
    return json(500, { error: String((err as Error).message || err) });
  }
});
