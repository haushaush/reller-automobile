// Reiner ABGLEICH der Unfallfahrzeug-Inserate (eigener Mobile.de-Zugang, eigener Scope).
// Legt KEINE Fahrzeuge mehr an und überschreibt keine Felder.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { basicAuth, fetchSellerAds, reconcile, serviceClient } from "../_shared/mobile-reconcile.ts";

const MOBILE_USER = Deno.env.get("MOBILE_DE_ACCIDENT_USERNAME") || "";
const MOBILE_PASS = Deno.env.get("MOBILE_DE_ACCIDENT_PASSWORD") || "";
const SELLER_ID = Deno.env.get("MOBILE_DE_ACCIDENT_SELLER_ID") || "451040";

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
    .insert({ sync_name: "mobile-de-reconcile-accident", started_at: startedAt.toISOString(), status: "running" })
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
      const msg = "Zugangsdaten des Unfallfahrzeug-Kontos fehlen (MOBILE_DE_ACCIDENT_USERNAME / MOBILE_DE_ACCIDENT_PASSWORD)";
      await finish("error", {}, msg);
      return json(500, { error: msg });
    }

    const { ads, pages, error } = await fetchSellerAds(SELLER_ID, basicAuth(MOBILE_USER, MOBILE_PASS));
    if (error && ads.length === 0) {
      await finish("error", { pages_fetched: pages }, error);
      return json(502, { error });
    }

    const result = await reconcile(supabase, ads, "accident");
    console.log(`Accident reconcile done: ${JSON.stringify(result)}`);

    await finish("success", {
      pages_fetched: pages,
      vehicles_total: result.checked,
      quality_issues_found: result.issues,
      stop_reason: error ? `partial: ${error}` : "complete",
    });

    return json(200, { ok: true, mode: "reconcile-only", scope: "accident", pages, ...result });
  } catch (err) {
    const msg = String((err as Error).message || err);
    console.error("sync-accident-vehicles reconcile fatal:", msg);
    await finish("error", {}, msg);
    return json(500, { error: msg });
  }
});
