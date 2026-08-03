// Delete a Mobile.de ad (live) and mark the local draft as deleted. Admin-only.
// Images and search-sync untouched.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOBILE_USER =
  Deno.env.get("MOBILE_DE_SELLER_USERNAME") || Deno.env.get("MOBILE_DE_USERNAME") || "";
const MOBILE_PASS =
  Deno.env.get("MOBILE_DE_SELLER_PASSWORD") || Deno.env.get("MOBILE_DE_PASSWORD") || "";

const SELLER_ID = "451040";
const API_BASE = "https://services.mobile.de/seller-api";
const MOBILE_MIME = "application/vnd.de.mobile.api+json";
const basicAuth = () => `Basic ${btoa(`${MOBILE_USER}:${MOBILE_PASS}`)}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json(401, { error: "Unauthorized" });
    const userId = claimsData.claims.sub as string;
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { error: "Forbidden" });

    let vehicleId: string | undefined;
    let mobileAdIdIn: string | undefined;
    let markSold = false;
    try {
      const body = await req.json();
      vehicleId = body?.vehicleId;
      mobileAdIdIn = body?.mobileAdId;
      markSold = body?.markSold === true;
    } catch { /* empty */ }
    if (!vehicleId) return json(400, { error: "vehicleId required" });

    const { data: vehicle, error: dErr } = await admin
      .from("vehicles")
      .select("id, publish_status, mobile_ad_id")
      .eq("id", vehicleId).maybeSingle();
    if (dErr || !vehicle) return json(404, { error: "Fahrzeug nicht gefunden" });

    const mobileAdId = String(vehicle.mobile_ad_id || mobileAdIdIn || "");
    const logPush = async (status: number | null, responseBody: string) => {
      try {
        await admin.from("mobile_push_log").insert({
          vehicle_id: vehicleId, action: markSold ? "delete-sold" : "delete",
          request_body: { mobileAdId } as never,
          response_status: status, response_body: responseBody.slice(0, 5000),
        });
      } catch (e) { console.warn("mobile_push_log insert failed:", (e as Error).message); }
    };

    const soldPatch = markSold
      ? { is_sold: true, sold_at: new Date().toISOString(), reserved_at: null, reserved_note: null }
      : {};

    if (!mobileAdId) {
      // Nie veröffentlicht: nur lokalen Status setzen
      await admin.from("vehicles").update({
        publish_status: "unpublished", publish_error: null, ...soldPatch,
      } as never).eq("id", vehicleId);
      await logPush(null, "kein Mobile.de-Inserat vorhanden");
      return json(200, {
        success: true, mobileAdId: null, alreadyGone: true,
        message: "Es existierte kein Mobile.de-Inserat – Fahrzeug wurde lokal auf „zurückgezogen“ gesetzt.",
      });
    }

    console.log(`delete-mobile-ad vehicleId=${vehicleId} mobileAdId=${mobileAdId}`);

    const delRes = await fetch(`${API_BASE}/sellers/${SELLER_ID}/ads/${mobileAdId}`, {
      method: "DELETE",
      headers: { Authorization: basicAuth(), Accept: MOBILE_MIME },
    });
    const delText = await delRes.text();
    const status = delRes.status;
    console.log(`Mobile.de DELETE status=${status}`);
    await logPush(status, delText);

    const ok = status === 200 || status === 204;
    const alreadyGone = status === 404;
    if (!ok && !alreadyGone) {
      console.warn(`Mobile.de DELETE body=${delText.slice(0, 300)}`);
      const msg = status === 401
        ? "Mobile.de Authentifizierung fehlgeschlagen"
        : status === 403
        ? "Mobile.de hat das Löschen verweigert"
        : `Mobile.de Fehler beim Löschen (${status})`;
      await admin.from("vehicles")
        .update({ publish_error: msg.slice(0, 2000) } as never)
        .eq("id", vehicleId);
      return json(status, { error: msg, status, details: delText.slice(0, 500) });
    }

    const { error: updErr } = await admin.from("vehicles")
      .update({
        publish_status: "unpublished",
        publish_error: null,
        published_at: null,
        last_pushed_at: new Date().toISOString(),
        ...soldPatch,
      } as never)
      .eq("id", vehicleId);
    if (updErr) {
      console.error("Local status update failed:", updErr.message);
      return json(500, { error: `Mobile.de gelöscht, lokal jedoch fehlgeschlagen: ${updErr.message}` });
    }
    console.log(`vehicle=${vehicleId} publish_status=unpublished markSold=${markSold}`);

    return json(200, {
      success: true,
      mobileAdId,
      alreadyGone,
      message: alreadyGone
        ? "Inserat war bei Mobile.de bereits gelöscht – Fahrzeug im Portal auf „zurückgezogen“ gesetzt."
        : "Inserat wurde bei Mobile.de gelöscht. Das Fahrzeug bleibt im Portal erhalten.",
    });
  } catch (err) {
    console.error("delete-mobile-ad fatal:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
