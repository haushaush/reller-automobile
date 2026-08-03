// Reiner ABGLEICH mit Mobile.de (Seller-API). Legt KEINE Fahrzeuge mehr an und
// überschreibt keine Felder — das Portal ist das führende System.
// Läuft stündlich; Ergebnisse landen in mobile_reconciliation_issues.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  API_BASE, basicAuth, fetchSellerAds, reconcile, serviceClient,
} from "../_shared/mobile-reconcile.ts";

const SELLER_ID = "451040";
const MOBILE_USER =
  Deno.env.get("MOBILE_DE_SELLER_USERNAME") || Deno.env.get("MOBILE_DE_USERNAME") || "";
const MOBILE_PASS =
  Deno.env.get("MOBILE_DE_SELLER_PASSWORD") || Deno.env.get("MOBILE_DE_PASSWORD") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const supabase = serviceClient();
  const startedAt = new Date();
  const { data: logRow } = await supabase
    .from("sync_logs")
    .insert({ sync_name: "mobile-de-reconcile", started_at: startedAt.toISOString(), status: "running" })
    .select("id")
    .maybeSingle();
  const logId = logRow?.id as string | undefined;

  const finish = async (status: string, extra: Record<string, unknown>, errorMessage?: string) => {
    if (!logId) return;
    const completed = new Date();
    await supabase.from("sync_logs").update({
      completed_at: completed.toISOString(),
      duration_ms: completed.getTime() - startedAt.getTime(),
      status,
      error_message: errorMessage ?? null,
      ...extra,
    }).eq("id", logId);
  };

  try {
    if (!MOBILE_USER || !MOBILE_PASS) {
      await finish("error", {}, "Mobile.de Seller-API Zugangsdaten fehlen");
      return json(500, { error: "Mobile.de Seller-API Zugangsdaten fehlen" });
    }

    console.log(`Reconcile start against ${API_BASE}/sellers/${SELLER_ID}/ads`);
    const { ads, pages, error } = await fetchSellerAds(SELLER_ID, basicAuth(MOBILE_USER, MOBILE_PASS));
    if (error && ads.length === 0) {
      await finish("error", { pages_fetched: pages }, error);
      return json(502, { error });
    }

    const result = await reconcile(supabase, ads, "search");
    console.log(`Reconcile done: ${JSON.stringify(result)}`);

    await finish("success", {
      pages_fetched: pages,
      vehicles_total: result.checked,
      quality_issues_found: result.issues,
      stop_reason: error ? `partial: ${error}` : "complete",
    });

    return json(200, { ok: true, mode: "reconcile-only", pages, ...result });
  } catch (err) {
    const msg = String((err as Error).message || err);
    console.error("sync-vehicles reconcile fatal:", msg);
    await finish("error", {}, msg);
    return json(500, { error: msg });
  }
});
