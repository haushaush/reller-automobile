// Lädt die Fotos eines Fahrzeugs einzeln vorab zu Mobile.de hoch und speichert
// die Referenzen am Fahrzeug. Dadurch bleibt der spätere Veröffentlichungsaufruf
// kurz und läuft nicht mehr ins Zeitlimit.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveMobileAccount, basicAuthFor } from "../_shared/platform-accounts.ts";
import { uploadVehicleImages, storeImageRefs } from "../_shared/mobile-images.ts";

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
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) return json(401, { error: "Unauthorized" });
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", claims.claims.sub as string).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { error: "Forbidden" });

    let vehicleId = "";
    try {
      const body = await req.json();
      vehicleId = String(body?.vehicleId ?? "").trim();
    } catch { /* leerer Rumpf */ }
    if (!vehicleId) return json(400, { error: "vehicleId required" });

    const { data: vehicle } = await admin
      .from("vehicles")
      .select("id, mobile_payload")
      .eq("id", vehicleId)
      .maybeSingle();
    if (!vehicle) return json(404, { error: "Fahrzeug nicht gefunden" });

    const payload = ((vehicle as { mobile_payload?: Record<string, unknown> }).mobile_payload ?? {}) as Record<string, unknown>;
    const imagePaths = Array.isArray(payload._imagePaths) ? (payload._imagePaths as string[]) : [];
    const existing = (payload._imageRefs ?? {}) as Record<string, string>;
    if (imagePaths.length === 0) return json(200, { ok: true, uploaded: 0, reused: 0, skipped: [] });

    const account = await resolveMobileAccount(admin, vehicleId);
    if (!account.username || !account.password) {
      return json(500, { error: `Zugangsdaten für das Konto "${account.label}" fehlen` });
    }

    const result = await uploadVehicleImages(admin, basicAuthFor(account), imagePaths, existing);
    await storeImageRefs(admin, vehicleId, result.refs);
    console.log(
      `upload-mobile-images: Fahrzeug=${vehicleId} neu=${result.uploaded} vorhanden=${result.reused} übersprungen=${result.skipped.length}`,
    );

    return json(200, {
      ok: true,
      uploaded: result.uploaded,
      reused: result.reused,
      skipped: result.skipped,
      total: imagePaths.length,
    });
  } catch (err) {
    console.error("upload-mobile-images fatal:", err);
    return json(500, { error: String((err as Error).message || err) });
  }
});
