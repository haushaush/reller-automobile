// Reiner ABGLEICH der Unfallfahrzeug-Inserate (eigener Mobile.de-Zugang, eigener Scope).
// Legt KEINE Fahrzeuge mehr an und überschreibt keine Felder.
import { corsHeaders } from "../_shared/cors.ts";
import { basicAuth, fetchSellerAds, reconcile, serviceClient } from "../_shared/mobile-reconcile.ts";

const MOBILE_USER = Deno.env.get("MOBILE_DE_ACCIDENT_USERNAME") || "";
const MOBILE_PASS = Deno.env.get("MOBILE_DE_ACCIDENT_PASSWORD") || "";
const SELLER_ID = Deno.env.get("MOBILE_DE_ACCIDENT_SELLER_ID") || "451040";
const LOCK_NAME = "mobile-de-reconcile-accident";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const supabase = serviceClient();
  const startedAt = new Date();
  const { error: ensureLockError } = await supabase.from("sync_locks").upsert({
    lock_name: LOCK_NAME, locked_at: new Date(0).toISOString(), locked_until: new Date(0).toISOString(),
  }, { onConflict: "lock_name", ignoreDuplicates: true });
  if (ensureLockError) return json(500, { error: `Unfall-Reconcile-Lock konnte nicht angelegt werden: ${ensureLockError.message}` });
  const { data: lockRow, error: lockError } = await supabase.from("sync_locks")
    .update({ locked_at: startedAt.toISOString(), locked_until: new Date(startedAt.getTime() + 10 * 60_000).toISOString() })
    .eq("lock_name", LOCK_NAME).lte("locked_until", startedAt.toISOString()).select("lock_name").maybeSingle();
  if (lockError) return json(500, { error: `Reconcile-Lock fehlgeschlagen: ${lockError.message}` });
  if (!lockRow) return json(200, { ok: true, skipped: true, reason: "Unfall-Reconcile läuft bereits" });

  const { error: staleError } = await supabase.from("sync_logs").update({
    status: "aborted", completed_at: startedAt.toISOString(), error_message: "Lauf ohne Abschluss beendet",
  }).eq("status", "running").lt("started_at", new Date(startedAt.getTime() - 15 * 60_000).toISOString());
  if (staleError) console.error("Stale accident reconcile cleanup failed:", staleError.message);

  const { data: logRow, error: logInsertError } = await supabase
    .from("sync_logs")
    .insert({ sync_name: "mobile-de-reconcile-accident", started_at: startedAt.toISOString(), status: "running" })
    .select("id")
    .maybeSingle();
  if (logInsertError) console.error("Failed to create accident reconcile log:", logInsertError.message);
  const logId = logRow?.id as string | undefined;

  let finalStatus = "failed";
  let finalExtra: Record<string, unknown> = {};
  let finalError: string | undefined;
  const finish = async () => {
    if (!logId) return;
    const completed = new Date();
    const { error } = await supabase.from("sync_logs").update({
      completed_at: completed.toISOString(),
      duration_ms: completed.getTime() - startedAt.getTime(),
      status: finalStatus,
      error_message: finalError ?? null,
      ...finalExtra,
    }).eq("id", logId);
    if (error) console.error(`Failed to finalize accident sync log ${logId}:`, error.message);
  };

  try {
    if (!MOBILE_USER || !MOBILE_PASS) {
      const msg = "Zugangsdaten des Unfallfahrzeug-Kontos fehlen (MOBILE_DE_ACCIDENT_USERNAME / MOBILE_DE_ACCIDENT_PASSWORD)";
      finalError = msg;
      return json(500, { error: msg });
    }

    const { ads, pages, error, rootKeys } = await fetchSellerAds(SELLER_ID, basicAuth(MOBILE_USER, MOBILE_PASS));
    finalExtra = { pages_fetched: pages, vehicles_total: ads.length };
    if (ads.length === 0) {
      finalStatus = "skipped";
      finalError = `Keine Unfall-Inserate gelesen (Root-Keys: ${rootKeys.join(", ") || "keine"})${error ? `; ${error}` : ""}`;
      return json(200, { ok: true, skipped: true, error: finalError });
    }

    const { count: publishedCount, error: countError } = await supabase
      .from("vehicles").select("id", { count: "exact", head: true }).eq("publish_status", "published");
    if (countError) throw countError;
    const suspiciouslySmall = (publishedCount ?? 0) > 0 && ads.length < (publishedCount ?? 0) * 0.5;
    const result = await reconcile(supabase, ads, "accident", {
      accountKey: "unfall",
      claimLegacyVehicles: false,
      allowUnpublish: !suspiciouslySmall,
    });
    console.log(`Accident reconcile done: ${JSON.stringify(result)}`);

    finalStatus = suspiciouslySmall || error ? "success_with_warning" : "success";
    finalError = suspiciouslySmall
      ? `Seller-API lieferte nur ${ads.length} von ${publishedCount ?? 0} erwarteten Inseraten; Statusänderungen wurden übersprungen.`
      : error;
    finalExtra = {
      pages_fetched: pages,
      vehicles_total: result.checked,
      quality_issues_found: result.issues,
      stop_reason: suspiciouslySmall ? "partial-result-protection" : error ? `partial: ${error}` : "complete",
    };

    return json(200, { ok: true, mode: "reconcile-only", scope: "accident", pages, ...result });
  } catch (err) {
    const msg = String((err as Error).message || err);
    console.error("sync-accident-vehicles reconcile fatal:", msg);
    finalStatus = "failed";
    finalError = msg;
    return json(500, { error: msg });
  } finally {
    await finish();
    const { error: releaseError } = await supabase.from("sync_locks").upsert({
      lock_name: LOCK_NAME, locked_at: startedAt.toISOString(), locked_until: new Date(0).toISOString(),
    }, { onConflict: "lock_name" });
    if (releaseError) console.error("Failed to release accident reconcile lock:", releaseError.message);
  }
});
