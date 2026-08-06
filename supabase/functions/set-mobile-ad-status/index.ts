// Überträgt den Portal-Status (verfügbar / reserviert / verkauft) an Mobile.de.
// Verfügbar  → PUT der VOLLSTÄNDIGEN Anzeige mit reserved=false
// Reserviert → PUT der VOLLSTÄNDIGEN Anzeige mit reserved=true
// Verkauft   → DELETE der Anzeige, Listing auf "ended"
// Jeder Versuch wird in mobile_push_log protokolliert. Fehler sind niemals still.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { stripECarFields } from "../_shared/mobile-ecar.ts";
import {
  resolveMobileAccount,
  syncMobileListing,
  type PlatformAccount,
} from "../_shared/platform-accounts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const API_BASE = "https://services.mobile.de/seller-api";
const MOBILE_MIME = "application/vnd.de.mobile.api+json";

type Target = "available" | "reserved" | "sold";

/** Die Seller-API verträgt keine parallelen Aufrufe zur selben Anzeige. */
const adChains = new Map<string, Promise<unknown>>();
function withAdLock<T>(adKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = adChains.get(adKey) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  adChains.set(adKey, run.catch(() => undefined));
  return run;
}

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
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", claimsData.claims.sub as string).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { error: "Forbidden" });

    let vehicleId: string | undefined;
    let target: Target | undefined;
    let note: string | null = null;
    try {
      const body = await req.json();
      vehicleId = body?.vehicleId;
      target = body?.target;
      note = typeof body?.note === "string" ? body.note : null;
    } catch { /* leer */ }
    if (!vehicleId) return json(400, { error: "vehicleId required" });
    if (target !== "available" && target !== "reserved" && target !== "sold") {
      return json(400, { error: "target muss available, reserved oder sold sein" });
    }

    const { data: vehicle } = await admin
      .from("vehicles")
      .select("id, title, mobile_ad_id, publish_status, is_test")
      .eq("id", vehicleId).maybeSingle();
    if (!vehicle) return json(404, { error: "Fahrzeug nicht gefunden" });

    const { data: listingRow } = await admin
      .from("listings")
      .select("id, status, external_ad_id, account_key")
      .eq("vehicle_id", vehicleId).eq("platform", "mobile_de").maybeSingle();
    const listing = listingRow as
      | { id: string; status: string; external_ad_id: string | null; account_key: string | null }
      | null;

    const account: PlatformAccount = await resolveMobileAccount(admin, vehicleId);
    const basicAuth = () => `Basic ${btoa(`${account.username}:${account.password}`)}`;
    const sellerId = account.seller_id;

    const adId = String(
      (vehicle as { mobile_ad_id?: string }).mobile_ad_id || listing?.external_ad_id || "",
    ).replace(/^accident_/, "");
    const listingLive = listing?.status === "live" || listing?.status === "publishing";
    const shouldPush = !!adId && (listingLive || target === "sold") && vehicle.is_test !== true;

    const nowIso = new Date().toISOString();
    const patch =
      target === "sold"
        ? { is_sold: true, sold_at: nowIso, reserved_at: null, reserved_note: null }
        : target === "reserved"
          ? { is_sold: false, sold_at: null, reserved_at: nowIso, reserved_note: note }
          : { is_sold: false, sold_at: null, reserved_at: null, reserved_note: null };

    // 1) Portalstatus wird IMMER gesetzt — auch wenn die Übertragung scheitert.
    const { error: patchErr } = await admin
      .from("vehicles").update(patch as never).eq("id", vehicleId);
    if (patchErr) return json(500, { error: `Portalstatus konnte nicht gesetzt werden: ${patchErr.message}` });

    const logPush = async (
      action: string, requestBody: unknown, status: number | null, responseBody: string,
    ) => {
      try {
        await admin.from("mobile_push_log").insert({
          vehicle_id: vehicleId,
          action,
          request_body: (requestBody ?? null) as never,
          response_status: status,
          response_body: String(responseBody).slice(0, 5000),
        });
      } catch (e) { console.warn("mobile_push_log:", (e as Error).message); }
    };

    if (!shouldPush) {
      const reason = !adId
        ? "Kein Mobile.de-Inserat vorhanden"
        : vehicle.is_test === true
          ? "Testfahrzeug — keine Übertragung"
          : "Inserat auf Mobile.de ist nicht aktiv";
      await logPush(`status-${target}`, { target, adId: adId || null }, null, reason);
      return json(200, { ok: true, pushed: false, skipped: true, reason, target });
    }

    const markFailed = async (message: string) => {
      await admin.from("vehicles").update({
        publish_status: "out_of_sync",
        publish_error: message.slice(0, 2000),
      } as never).eq("id", vehicleId);
      await syncMobileListing(admin, vehicleId!, {
        status: "error",
        error_message: `Änderung noch nicht an Mobile.de übertragen: ${message}`.slice(0, 2000),
        account_key: account.account_key,
      });
    };

    return await withAdLock(`${sellerId}:${adId}`, async () => {
      const url = `${API_BASE}/sellers/${sellerId}/ads/${adId}`;

      // ── Verkauft: Anzeige löschen ────────────────────────────────────
      if (target === "sold") {
        const res = await fetch(url, {
          method: "DELETE",
          headers: { Authorization: basicAuth(), Accept: MOBILE_MIME },
        });
        const text = await res.text();
        await logPush("status-sold", { adId }, res.status, text);
        const ok = res.status === 200 || res.status === 204 || res.status === 404;
        if (!ok) {
          const msg = `Mobile.de Fehler beim Beenden (${res.status})`;
          await markFailed(msg);
          return json(200, { ok: false, pushed: false, target, error: msg, details: text.slice(0, 500) });
        }
        await admin.from("vehicles").update({
          publish_status: "unpublished",
          publish_error: null,
          last_pushed_at: new Date().toISOString(),
        } as never).eq("id", vehicleId);
        await syncMobileListing(admin, vehicleId!, {
          status: "ended", external_ad_id: adId, error_message: null,
          account_key: account.account_key,
        });
        return json(200, { ok: true, pushed: true, target, mobileAdId: adId });
      }

      // ── Verfügbar / Reserviert: vollständige Anzeige zurückschreiben ──
      const getRes = await fetch(url, {
        headers: { Authorization: basicAuth(), Accept: MOBILE_MIME },
      });
      const getText = await getRes.text();
      if (!getRes.ok) {
        const msg = `Anzeige konnte nicht geladen werden (${getRes.status})`;
        await logPush(`status-${target}`, { adId, step: "GET" }, getRes.status, getText);
        await markFailed(msg);
        return json(200, { ok: false, pushed: false, target, error: msg, details: getText.slice(0, 500) });
      }
      let ad: Record<string, unknown> = {};
      try { ad = JSON.parse(getText) as Record<string, unknown>; } catch { /* leer */ }

      const full: Record<string, unknown> = { ...ad, reserved: target === "reserved" };
      // Elektro-Felder nur bei elektrischem/hybridem Antrieb zurückschreiben
      const removedECar = stripECarFields(full, full.fuel);
      if (removedECar.length) {
        console.log(`Elektro-Felder entfernt (Antrieb ${String(full.fuel ?? "?")}): ${removedECar.join(", ")}`);
      }
      // Bilder niemals leeren: fehlt das Feld, bleiben sie unverändert.
      if (!Array.isArray(full.images) || (full.images as unknown[]).length === 0) {
        delete full.images;
      }
      for (const k of Object.keys(full)) if (full[k] === undefined) delete full[k];

      const putRes = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: basicAuth(),
          Accept: MOBILE_MIME,
          "Content-Type": MOBILE_MIME,
        },
        body: JSON.stringify(full),
      });
      const putText = await putRes.text();
      await logPush(`status-${target}`, full, putRes.status, putText);
      if (!(putRes.status >= 200 && putRes.status < 300)) {
        let details: unknown = putText;
        try { details = JSON.parse(putText); } catch { /* Text behalten */ }
        const msg = `Mobile.de hat die Statusänderung abgelehnt (${putRes.status})`;
        await markFailed(msg);
        return json(200, { ok: false, pushed: false, target, error: msg, details });
      }

      await admin.from("vehicles").update({
        publish_status: "published",
        publish_error: null,
        last_pushed_at: new Date().toISOString(),
      } as never).eq("id", vehicleId);
      await syncMobileListing(admin, vehicleId!, {
        status: "live", external_ad_id: adId, error_message: null,
        account_key: account.account_key,
      });
      return json(200, { ok: true, pushed: true, target, mobileAdId: adId, reserved: target === "reserved" });
    });
  } catch (err) {
    console.error("set-mobile-ad-status fatal:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
