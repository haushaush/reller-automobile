// Archivieren, Zurückholen und endgültiges Löschen von Fahrzeugen.
// Archivieren beendet zuvor alle Mobile.de-Inserate; schlägt das fehl, wird NICHT archiviert.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_BATCH = 25;

type Json = Record<string, unknown>;

interface VehicleInfo {
  vehicleId: string;
  title: string;
  price: number | null;
  isSold: boolean;
  archivedAt: string | null;
  mobileListings: { accountLabel: string; adId: string | null }[];
  manualListings: { platform: string; adId: string | null }[];
  inquiryCount: number;
  leadCount: number;
  canDelete: boolean;
  blockers: string[];
}

const PLATFORM_LABELS: Record<string, string> = {
  mobile_de: "Mobile.de",
  autoscout24: "AutoScout24",
  kleinanzeigen: "Kleinanzeigen",
};

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
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json(401, { error: "Unauthorized" });
    const userId = claims.claims.sub as string;

    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { error: "Nur Administratoren dürfen diese Aktion ausführen" });

    const body = (await req.json().catch(() => ({}))) as Json;
    const action = String(body.action ?? "");
    const vehicleIds = (Array.isArray(body.vehicleIds) ? body.vehicleIds : []).map(String);
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : null;

    if (!vehicleIds.length) return json(400, { error: "vehicleIds required" });
    if (vehicleIds.length > MAX_BATCH) {
      return json(400, { error: `Höchstens ${MAX_BATCH} Fahrzeuge je Vorgang` });
    }

    const info = await collectInfo(admin, vehicleIds);

    if (action === "preview") return json(200, { vehicles: info });

    if (action === "archive") {
      const results: { vehicleId: string; title: string; success: boolean; message: string }[] = [];
      for (const v of info) {
        if (v.archivedAt) {
          results.push({ vehicleId: v.vehicleId, title: v.title, success: true, message: "War bereits archiviert" });
          continue;
        }
        try {
          const msgs = await archiveOne(admin, authHeader, v, userId, reason);
          results.push({ vehicleId: v.vehicleId, title: v.title, success: true, message: msgs.join(" · ") });
        } catch (e) {
          results.push({
            vehicleId: v.vehicleId, title: v.title, success: false,
            message: (e as Error).message,
          });
        }
      }
      return json(200, { results });
    }

    if (action === "restore") {
      const results = [];
      for (const v of info) {
        const { error } = await admin.from("vehicles").update({
          archived_at: null, archived_by: null, archive_reason: null,
          publish_status: "draft",
        } as never).eq("id", v.vehicleId);
        results.push({
          vehicleId: v.vehicleId, title: v.title, success: !error,
          message: error ? error.message : "Zurückgeholt — als Entwurf, Inserate wurden nicht neu veröffentlicht",
        });
        if (!error) await writeLog(admin, v, "restored", reason, userId);
      }
      return json(200, { results });
    }

    if (action === "delete") {
      if (vehicleIds.length !== 1) return json(400, { error: "Endgültiges Löschen ist nur einzeln möglich" });
      const v = info[0];
      const confirmTitle = String(body.confirmTitle ?? "").trim();
      if (!v.canDelete) {
        return json(400, { error: `Löschen nicht möglich: ${v.blockers.join(" · ")}` });
      }
      if (confirmTitle !== v.title.trim()) {
        return json(400, { error: "Der eingegebene Fahrzeugtitel stimmt nicht überein" });
      }
      await writeLog(admin, v, "deleted", reason, userId);
      const { error } = await admin.from("vehicles").delete().eq("id", v.vehicleId);
      if (error) return json(500, { error: `Löschen fehlgeschlagen: ${error.message}` });
      return json(200, {
        results: [{ vehicleId: v.vehicleId, title: v.title, success: true, message: "Endgültig gelöscht" }],
      });
    }

    return json(400, { error: "Unbekannte Aktion" });
  } catch (err) {
    console.error("vehicle-lifecycle fatal:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

type Db = ReturnType<typeof createClient>;

async function collectInfo(admin: Db, ids: string[]): Promise<VehicleInfo[]> {
  const { data: vehicles } = await admin
    .from("vehicles")
    .select("id, title, price, currency, is_sold, sold_at, archived_at, mobile_ad_id, brand, model, year, mileage, vehicle_category, mobile_de_id")
    .in("id", ids);

  const { data: listings } = await admin
    .from("listings")
    .select("vehicle_id, platform, status, external_ad_id, account_key")
    .in("vehicle_id", ids);

  const { data: accounts } = await admin
    .from("platform_accounts")
    .select("account_key, label, short_label, platform");

  const { data: inqRows } = await admin
    .from("inquiry_vehicles").select("vehicle_id").in("vehicle_id", ids);
  const { data: leadRows } = await admin
    .from("leads").select("vehicle_id").in("vehicle_id", ids);

  const accountLabel = (key: string | null) => {
    const a = (accounts ?? []).find((x) => (x as Json).account_key === key) as Json | undefined;
    return (a?.short_label as string) || (a?.label as string) || key || "Mobile.de";
  };

  return (vehicles ?? []).map((raw) => {
    const v = raw as Json;
    const id = String(v.id);
    const rows = ((listings ?? []) as Json[]).filter((l) => l.vehicle_id === id);
    const liveMobile = rows.filter(
      (l) => l.platform === "mobile_de" && ["live", "publishing", "draft", "error", "paused"].includes(String(l.status)),
    );
    const mobileAdId = v.mobile_ad_id ? String(v.mobile_ad_id) : null;
    const mobileListings = liveMobile.length
      ? liveMobile.map((l) => ({
          accountLabel: accountLabel(l.account_key as string | null),
          adId: (l.external_ad_id as string | null) ?? mobileAdId,
        }))
      : mobileAdId
      ? [{ accountLabel: "Mobile.de", adId: mobileAdId }]
      : [];

    const manualListings = rows
      .filter((l) => l.platform !== "mobile_de" && l.status === "live")
      .map((l) => ({
        platform: PLATFORM_LABELS[String(l.platform)] ?? String(l.platform),
        adId: (l.external_ad_id as string | null) ?? null,
      }));

    const inquiryCount = ((inqRows ?? []) as Json[]).filter((r) => r.vehicle_id === id).length;
    const leadCount = ((leadRows ?? []) as Json[]).filter((r) => r.vehicle_id === id).length;
    const anyLive = rows.some((l) => l.status === "live");

    const blockers: string[] = [];
    if (inquiryCount + leadCount > 0) blockers.push(`${inquiryCount + leadCount} Anfrage(n)/Lead(s) zugeordnet`);
    if (v.is_sold === true) blockers.push("Fahrzeug ist als verkauft markiert (Verkaufshistorie bleibt erhalten)");
    if (anyLive) blockers.push("Es besteht noch ein aktives Inserat");

    return {
      vehicleId: id,
      title: String(v.title ?? ""),
      price: (v.price as number | null) ?? null,
      isSold: v.is_sold === true,
      archivedAt: (v.archived_at as string | null) ?? null,
      mobileListings,
      manualListings,
      inquiryCount,
      leadCount,
      canDelete: blockers.length === 0,
      blockers,
      _snapshot: v,
    } as VehicleInfo & { _snapshot: Json };
  });
}

async function writeLog(
  admin: Db, v: VehicleInfo, action: string, reason: string | null, userId: string,
) {
  const snapshot = ((v as unknown as { _snapshot?: Json })._snapshot ?? {}) as Json;
  const { error } = await admin.from("vehicle_deletion_log").insert({
    vehicle_id: v.vehicleId,
    title: v.title,
    mobile_ad_ids: v.mobileListings.map((m) => m.adId).filter(Boolean) as string[],
    price: v.price,
    action,
    reason,
    performed_by: userId,
    snapshot,
  } as never);
  if (error) console.warn("deletion log insert failed:", error.message);
}

async function archiveOne(
  admin: Db,
  authHeader: string,
  v: VehicleInfo & { _snapshot?: Json },
  userId: string,
  reason: string | null,
): Promise<string[]> {
  const messages: string[] = [];

  // 1) Mobile.de-Inserate beenden — bei Fehler wird nicht archiviert
  if (v.mobileListings.length > 0) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-mobile-ad`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ vehicleId: v.vehicleId }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        `Mobile.de-Inserat konnte nicht beendet werden – nicht archiviert: ${
          (payload as Json)?.error ?? res.status
        }`,
      );
    }
    messages.push("Mobile.de-Inserat beendet");
  }

  // 2) Aufgaben für manuelle Plattformen
  for (const m of v.manualListings) {
    await admin.from("listing_tasks").insert({
      vehicle_id: v.vehicleId,
      action: "end_listing",
      reason: `Fahrzeug archiviert – Inserat auf ${m.platform} bitte selbst beenden${
        m.adId ? ` (Inserat ${m.adId})` : ""
      }`,
    } as never);
  }
  if (v.manualListings.length) {
    messages.push(`${v.manualListings.length} Aufgabe(n) für manuelle Plattformen erstellt`);
  }

  // 3) Offene Aufgaben schließen, die gegenstandslos werden
  await admin.from("listing_tasks")
    .update({ dismissed_at: new Date().toISOString() } as never)
    .eq("vehicle_id", v.vehicleId)
    .is("done_at", null)
    .is("dismissed_at", null)
    .neq("action", "end_listing");

  // 4) Offene Abgleichs- und Datenqualitätsmeldungen schließen
  const now = new Date().toISOString();
  await admin.from("mobile_reconciliation_issues")
    .update({ resolved_at: now } as never)
    .eq("vehicle_id", v.vehicleId).is("resolved_at", null);
  await admin.from("vehicle_quality_issues")
    .update({ resolved_at: now } as never)
    .eq("vehicle_id", v.vehicleId).is("resolved_at", null);

  // 5) Fahrzeug archivieren
  const { error } = await admin.from("vehicles").update({
    archived_at: now,
    archived_by: userId,
    archive_reason: reason,
  } as never).eq("id", v.vehicleId);
  if (error) throw new Error(`Archivieren fehlgeschlagen: ${error.message}`);

  await writeLog(admin, v, "archived", reason, userId);
  messages.unshift("Archiviert");
  return messages;
}
