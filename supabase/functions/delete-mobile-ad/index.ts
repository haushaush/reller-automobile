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

    let draftId: string | undefined;
    let mobileAdIdIn: string | undefined;
    try {
      const body = await req.json();
      draftId = body?.draftId;
      mobileAdIdIn = body?.mobileAdId;
    } catch { /* empty */ }
    if (!draftId) return json(400, { error: "draftId required" });

    const { data: draft, error: dErr } = await admin
      .from("mobile_ad_drafts")
      .select("id, status, mobile_ad_id, payload")
      .eq("id", draftId).maybeSingle();
    if (dErr || !draft) return json(404, { error: "Entwurf nicht gefunden" });
    if (draft.status !== "published" && draft.status !== "published_with_warning") {
      return json(400, { error: `Status ist "${draft.status}" – nur veröffentlichte Inserate können live gelöscht werden.` });
    }

    const mobileAdId = String(draft.mobile_ad_id || mobileAdIdIn || "");
    if (!mobileAdId) {
      return json(400, { error: "Keine Mobile.de-ID vorhanden" });
    }

    console.log(`delete-mobile-ad draftId=${draftId} mobileAdId=${mobileAdId}`);

    const delRes = await fetch(`${API_BASE}/sellers/${SELLER_ID}/ads/${mobileAdId}`, {
      method: "DELETE",
      headers: { Authorization: basicAuth(), Accept: MOBILE_MIME },
    });
    const delText = await delRes.text();
    const status = delRes.status;
    console.log(`Mobile.de DELETE status=${status}`);

    const ok = status === 200 || status === 204;
    const alreadyGone = status === 404;
    if (!ok && !alreadyGone) {
      console.warn(`Mobile.de DELETE body=${delText.slice(0, 300)}`);
      const msg = status === 401
        ? "Mobile.de Authentifizierung fehlgeschlagen"
        : status === 403
        ? "Mobile.de hat das Löschen verweigert"
        : `Mobile.de Fehler beim Löschen (${status})`;
      await admin.from("mobile_ad_drafts")
        .update({ error_message: msg.slice(0, 2000) })
        .eq("id", draftId);
      return json(status, { error: msg, status, details: delText.slice(0, 500) });
    }

    // Lokal als gelöscht markieren
    const { error: updErr } = await admin.from("mobile_ad_drafts")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", draftId);
    if (updErr) {
      console.error("Local mark-deleted failed:", updErr.message);
      return json(500, { error: `Mobile.de gelöscht, lokal jedoch fehlgeschlagen: ${updErr.message}` });
    }
    console.log(`local draftId=${draftId} marked status=deleted`);

    // Optional: verknüpftes Vehicle weich als verkauft markieren (nur bei sicherem Match)
    try {
      const payload = (draft.payload && typeof draft.payload === "object") ? draft.payload as Record<string, unknown> : {};
      const linkedVehicleId = typeof payload._linkedVehicleId === "string" ? payload._linkedVehicleId : null;
      let vehicleSoftMarked = false;
      if (linkedVehicleId) {
        const { error: vErr } = await admin.from("vehicles")
          .update({ is_sold: true, sold_at: new Date().toISOString() })
          .eq("id", linkedVehicleId);
        if (!vErr) vehicleSoftMarked = true;
        else console.warn("vehicle soft-mark by id failed:", vErr.message);
      } else if (mobileAdId) {
        const { error: vErr } = await admin.from("vehicles")
          .update({ is_sold: true, sold_at: new Date().toISOString() })
          .eq("mobile_de_id", mobileAdId);
        if (!vErr) vehicleSoftMarked = true;
        else console.warn("vehicle soft-mark by mobile_de_id failed:", vErr.message);
      }
      console.log(`vehicle soft-marked=${vehicleSoftMarked}`);
    } catch (e) {
      console.warn("vehicle soft-mark error:", (e as Error).message);
    }

    return json(200, {
      success: true,
      mobileAdId,
      alreadyGone,
      message: alreadyGone
        ? "Inserat war bei Mobile.de bereits gelöscht – lokal als gelöscht markiert."
        : "Inserat wurde bei Mobile.de gelöscht.",
    });
  } catch (err) {
    console.error("delete-mobile-ad fatal:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
