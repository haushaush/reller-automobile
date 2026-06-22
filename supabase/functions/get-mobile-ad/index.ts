// Fetch a live Mobile.de ad for editing. Admin-only.
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
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      .select("id, status, payload, mobile_ad_id, image_paths")
      .eq("id", draftId).maybeSingle();
    if (dErr || !draft) return json(404, { error: "Entwurf nicht gefunden" });

    const mobileAdId = mobileAdIdIn || draft.mobile_ad_id;
    if (!mobileAdId) return json(400, { error: "Keine Mobile.de-ID vorhanden" });

    console.log(`get-mobile-ad draftId=${draftId} mobileAdId=${mobileAdId}`);
    const res = await fetch(`${API_BASE}/sellers/${SELLER_ID}/ads/${mobileAdId}`, {
      headers: { Authorization: basicAuth(), Accept: MOBILE_MIME },
    });
    const text = await res.text();
    console.log(`Mobile.de GET status=${res.status}`);
    if (!res.ok) {
      console.warn(`Mobile.de GET body=${text.slice(0, 300)}`);
      const msg = res.status === 404
        ? "Inserat bei Mobile.de nicht gefunden"
        : res.status === 401
        ? "Mobile.de Authentifizierung fehlgeschlagen"
        : `Mobile.de Fehler (${res.status})`;
      return json(res.status, { error: msg, status: res.status, details: text.slice(0, 500) });
    }
    let mobileAd: unknown;
    try { mobileAd = JSON.parse(text); } catch { mobileAd = null; }
    return json(200, { success: true, draft, mobileAd });
  } catch (err) {
    console.error("get-mobile-ad fatal:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
