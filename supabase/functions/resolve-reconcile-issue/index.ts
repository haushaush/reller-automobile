// Löst eine Abweichungsmeldung (price_drift / mileage_drift) in eine der beiden
// Richtungen auf: Portalwert zu Mobile.de schieben ODER Mobile.de-Wert ins Portal
// übernehmen. Admin-only. Es wird immer nur das betroffene Feld angefasst.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveMobileAccount, basicAuthFor } from "../_shared/platform-accounts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_BASE = "https://services.mobile.de/seller-api";
const MOBILE_MIME = "application/vnd.de.mobile.api+json";

const ALLOWED_PRICE_KEYS = new Set([
  "consumerPriceGross", "consumerPriceNet", "dealerPriceGross", "dealerPriceNet",
  "vatRate", "type", "currency",
]);

function bareAdId(id: string): string {
  return id.replace(/^[a-z_]+_/, "");
}

/** Zieht "Portal X / Mobile.de Y" als Zahlen aus dem Meldungstext. */
function parseValues(detail: string | null): { portal?: number; mobile?: number } {
  if (!detail) return {};
  const m = detail.match(/Portal\s+([\d.,]+)[^/]*\/\s*Mobile\.de\s+([\d.,]+)/);
  if (!m) return {};
  const toNum = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
  const portal = toNum(m[1]);
  const mobile = toNum(m[2]);
  return {
    portal: Number.isFinite(portal) ? portal : undefined,
    mobile: Number.isFinite(mobile) ? mobile : undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Nicht angemeldet" });
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) return json(401, { error: "Nicht angemeldet" });
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", claims.claims.sub as string).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { error: "Keine Berechtigung" });

    const body = await req.json().catch(() => ({}));
    const issueId: string | undefined = body?.issueId;
    const direction: string | undefined = body?.direction;
    if (!issueId || (direction !== "to_mobile" && direction !== "to_portal")) {
      return json(400, { error: "issueId und direction (to_mobile|to_portal) erforderlich" });
    }

    const { data: issue } = await admin
      .from("mobile_reconciliation_issues")
      .select("id, vehicle_id, mobile_ad_id, issue_type, detail, resolved_at")
      .eq("id", issueId).maybeSingle();
    if (!issue) return json(404, { error: "Meldung nicht gefunden" });
    if ((issue as { resolved_at: string | null }).resolved_at) {
      return json(400, { error: "Meldung ist bereits erledigt" });
    }

    const type = (issue as { issue_type: string }).issue_type;
    const field = type === "price_drift" ? "price" : type === "mileage_drift" ? "mileage" : null;
    if (!field) return json(400, { error: "Diese Meldung lässt sich nicht automatisch auflösen" });

    const values = parseValues((issue as { detail: string | null }).detail);
    if (values.portal === undefined || values.mobile === undefined) {
      return json(400, { error: "Werte konnten aus der Meldung nicht gelesen werden" });
    }

    const vehicleId = (issue as { vehicle_id: string | null }).vehicle_id;
    if (!vehicleId) return json(400, { error: "Zur Meldung gibt es kein Fahrzeug im Portal" });

    const closeIssue = async (note: string) => {
      await admin.from("mobile_reconciliation_issues").update({
        resolved_at: new Date().toISOString(),
        detail: `${(issue as { detail: string | null }).detail ?? ""} · ${note}`,
      } as never).eq("id", issueId);
    };

    // ── Richtung B: Mobile.de-Wert ins Portal übernehmen (kein Push) ───────
    if (direction === "to_portal") {
      const patch: Record<string, number> = { [field]: Math.round(values.mobile) };
      const { error: uErr } = await admin.from("vehicles").update(patch as never).eq("id", vehicleId);
      if (uErr) return json(500, { error: `Portal konnte nicht aktualisiert werden: ${uErr.message}` });
      if (field === "price") {
        await admin.from("vehicle_price_history").insert({
          vehicle_id: vehicleId, price: Math.round(values.mobile), currency: "EUR",
        } as never);
      }
      await closeIssue("Mobile.de-Wert ins Portal übernommen");
      return json(200, { ok: true, direction, field, newValue: Math.round(values.mobile) });
    }

    // ── Richtung A: Portalwert zu Mobile.de übertragen ─────────────────────
    const adIdRaw = (issue as { mobile_ad_id: string | null }).mobile_ad_id;
    if (!adIdRaw) return json(400, { error: "Zur Meldung gibt es keine Anzeigen-Nummer" });
    const adId = bareAdId(adIdRaw);

    const account = await resolveMobileAccount(admin, vehicleId);
    if (!account.username || !account.password) {
      return json(500, { error: `Zugangsdaten für das Konto "${account.label}" fehlen` });
    }
    const auth = basicAuthFor(account);

    const getRes = await fetch(`${API_BASE}/sellers/${account.seller_id}/ads/${adId}`, {
      headers: { Authorization: auth, Accept: MOBILE_MIME },
    });
    const getText = await getRes.text();
    if (!getRes.ok) {
      return json(getRes.status, {
        error: `Inserat konnte bei Mobile.de nicht geladen werden (${getRes.status})`,
        details: getText.slice(0, 400),
      });
    }
    let ad: Record<string, unknown> = {};
    try { ad = JSON.parse(getText); } catch { /* leer */ }

    if (field === "price") {
      const cur = (ad.price && typeof ad.price === "object" ? ad.price : {}) as Record<string, unknown>;
      const vat = cur.vatRate ?? "19.00";
      const clean: Record<string, unknown> = {
        consumerPriceGross: Math.round(values.portal).toFixed(2),
        currency: "EUR",
        vatRate: typeof vat === "number" ? vat.toFixed(2) : String(vat),
        type: (typeof cur.type === "string" && cur.type) || "FIXED",
      };
      for (const k of Object.keys(clean)) if (!ALLOWED_PRICE_KEYS.has(k)) delete clean[k];
      ad.price = clean;
    } else {
      ad.mileage = Math.round(values.portal);
    }
    delete (ad as Record<string, unknown>).vehicle;

    const putRes = await fetch(`${API_BASE}/sellers/${account.seller_id}/ads/${adId}`, {
      method: "PUT",
      headers: { Authorization: auth, Accept: MOBILE_MIME, "Content-Type": MOBILE_MIME },
      body: JSON.stringify(ad),
    });
    const putText = await putRes.text();
    await admin.from("mobile_push_log").insert({
      vehicle_id: vehicleId,
      action: `reconcile-${field}-to-mobile`,
      request_body: { [field]: Math.round(values.portal) } as never,
      response_status: putRes.status,
      response_body: putText.slice(0, 2000),
    } as never);

    if (putRes.status !== 200 && putRes.status !== 204) {
      return json(putRes.status, {
        error: "Mobile.de hat die Änderung abgelehnt",
        details: putText.slice(0, 500),
      });
    }

    await closeIssue("Portalwert zu Mobile.de übertragen");
    return json(200, { ok: true, direction, field, newValue: Math.round(values.portal) });
  } catch (err) {
    console.error("resolve-reconcile-issue:", err);
    return json(500, { error: String((err as Error).message || err) });
  }
});
