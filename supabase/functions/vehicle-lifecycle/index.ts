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
  manualListings: { platform: string; adId: string | null; url?: string | null }[];
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
      if (!v) return json(404, { error: "Fahrzeug nicht gefunden" });
      if (v.isSold) {
        return json(400, {
          error:
            "Verkaufte Fahrzeuge können nicht endgültig gelöscht werden – sie sind die Grundlage der Verkaufshistorie. Bitte archivieren.",
        });
      }
      if (!reason || reason.trim().length < 3) {
        return json(400, { error: "Bitte einen Löschgrund angeben" });
      }
      if (confirmTitle !== v.title.trim()) {
        return json(400, { error: "Der eingegebene Fahrzeugtitel stimmt nicht überein" });
      }
      try {
        const messages = await hardDelete(admin, authHeader, v, userId, reason);
        return json(200, {
          results: [
            { vehicleId: v.vehicleId, title: v.title, success: true, message: messages.join(" · ") },
          ],
        });
      } catch (e) {
        return json(200, {
          results: [
            { vehicleId: v.vehicleId, title: v.title, success: false, message: (e as Error).message },
          ],
        });
      }
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
    .select("*")
    .in("id", ids);

  const { data: listings } = await admin
    .from("listings")
    .select("vehicle_id, platform, status, external_ad_id, external_url, account_key")
    .in("vehicle_id", ids);

  const { data: accounts } = await admin
    .from("platform_accounts")
    .select("account_key, label, short_label, platform");

  const { data: inqRows } = await admin
    .from("inquiry_vehicles").select("vehicle_id").in("vehicle_id", ids);
  const { data: leadRows } = await admin
    .from("leads").select("vehicle_id").in("vehicle_id", ids);
  const { data: vinRows } = await admin
    .from("vehicle_private_data").select("vehicle_id, vin").in("vehicle_id", ids);

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
        url: (l.external_url as string | null) ?? null,
      }));

    const inquiryCount = ((inqRows ?? []) as Json[]).filter((r) => r.vehicle_id === id).length;
    const leadCount = ((leadRows ?? []) as Json[]).filter((r) => r.vehicle_id === id).length;
    const vin =
      (((vinRows ?? []) as Json[]).find((r) => r.vehicle_id === id)?.vin as string | null) ?? null;

    // Nur verkaufte Fahrzeuge sind vom endgültigen Löschen ausgenommen.
    // Inserate werden beim Löschen beendet, Anfragen bleiben ohne Fahrzeugbezug bestehen.
    const blockers: string[] = [];
    if (v.is_sold === true) {
      blockers.push("Fahrzeug ist als verkauft markiert – bitte archivieren (Verkaufshistorie)");
    }

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
      _snapshot: { ...v, vin },
    } as VehicleInfo & { _snapshot: Json };
  });
}

/* ---------------------------------------------------------------------------
 * Endgültiges Löschen
 * ------------------------------------------------------------------------- */

function pathFromValue(value: string, bucket: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^\/+/, "");
  try {
    const url = new URL(trimmed);
    const idx = url.pathname.indexOf("/storage/v1/object/");
    if (idx < 0) return null;
    const rest = url.pathname.slice(idx + "/storage/v1/object/".length)
      .replace(/^(public|sign|authenticated)\//, "");
    if (!rest.startsWith(`${bucket}/`)) return null;
    return decodeURIComponent(rest.slice(bucket.length + 1));
  } catch {
    return null;
  }
}

async function listPrefix(admin: Db, bucket: string, prefix: string): Promise<string[]> {
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  return (data ?? []).filter((f) => f.id !== null).map((f) => `${prefix}/${f.name}`);
}

/** Kopiert das erste verfügbare Bild als Beleg in den Bucket „deletion-log“. */
async function copyThumbnail(admin: Db, v: Json, logId: string): Promise<string | null> {
  const candidates = [
    ...(((v.custom_image_urls as string[] | null) ?? [])),
    ...(((v.image_urls as string[] | null) ?? [])),
  ].filter(Boolean);
  const src = candidates[0];
  if (!src) return null;
  try {
    let blob: Blob | null = null;
    const storyPath = pathFromValue(src, "vehicle-stories");
    if (storyPath) {
      const { data } = await admin.storage.from("vehicle-stories").download(storyPath);
      blob = data ?? null;
    }
    if (!blob && /^https?:\/\//i.test(src)) {
      const res = await fetch(src);
      if (res.ok) blob = await res.blob();
    }
    if (!blob) return null;
    const target = `${logId}.jpg`;
    const { error } = await admin.storage
      .from("deletion-log")
      .upload(target, blob, { contentType: blob.type || "image/jpeg", upsert: true });
    if (error) return null;
    return target;
  } catch (e) {
    console.warn("Vorschaubild konnte nicht gesichert werden:", (e as Error).message);
    return null;
  }
}

async function hardDelete(
  admin: Db,
  authHeader: string,
  v: VehicleInfo & { _snapshot?: Json },
  userId: string,
  reason: string,
): Promise<string[]> {
  const snap = (v._snapshot ?? {}) as Json;
  const id = v.vehicleId;
  const messages: string[] = [];
  const payload = (snap.mobile_payload ?? {}) as Json;
  const internalNumber =
    (((payload.vehicle as Json | undefined)?.internalNumber ?? payload.internalNumber) as
      | string
      | null) ?? null;

  // a) Abbild schreiben, bevor irgendetwas entfernt wird
  const { data: logRow, error: logErr } = await admin
    .from("vehicle_deletion_log")
    .insert({
      vehicle_id: id,
      title: v.title,
      brand: snap.brand ?? null,
      model: snap.model ?? null,
      model_description: snap.model_description ?? null,
      vehicle_category: snap.vehicle_category ?? null,
      first_registration: snap.year ?? null,
      mileage: snap.mileage ?? null,
      vin: snap.vin ?? null,
      internal_number: internalNumber,
      price: v.price,
      mobile_ad_ids: v.mobileListings.map((m) => m.adId).filter(Boolean) as string[],
      mobile_ad_refs: v.mobileListings,
      platforms: v.manualListings,
      was_sold: v.isSold,
      was_archived: !!v.archivedAt,
      vehicle_created_at: snap.created_at ?? null,
      action: "deleted",
      reason,
      performed_by: userId,
      snapshot: snap,
    } as never)
    .select("id")
    .single();
  if (logErr || !logRow) throw new Error(`Löschprotokoll konnte nicht geschrieben werden: ${logErr?.message}`);
  const logId = String((logRow as Json).id);

  const thumb = await copyThumbnail(admin, snap, logId);
  if (thumb) {
    await admin.from("vehicle_deletion_log").update({ thumbnail_path: thumb } as never).eq("id", logId);
  }

  // b) Mobile.de beenden — schlägt das fehl, wird abgebrochen
  if (v.mobileListings.length > 0) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-mobile-ad`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ vehicleId: id }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Abbild wieder entfernen — es wurde nichts gelöscht
      if (thumb) await admin.storage.from("deletion-log").remove([thumb]);
      await admin.from("vehicle_deletion_log").delete().eq("id", logId);
      throw new Error(
        `Mobile.de-Inserat konnte nicht beendet werden – nichts gelöscht: ${
          (out as Json)?.error ?? res.status
        }`,
      );
    }
    messages.push(`${v.mobileListings.length} Mobile.de-Inserat(e) beendet`);
  }

  // Aufgaben für manuelle Plattformen — ohne Fahrzeugbezug, mit eigenem Text
  for (const m of v.manualListings) {
    await admin.from("listing_tasks").insert({
      vehicle_id: null,
      listing_id: null,
      action: "end_listing",
      platform: m.platform === "AutoScout24" ? "autoscout24" : "kleinanzeigen",
      ad_title: v.title,
      ad_url: (m as { url?: string | null }).url ?? null,
      reason: `Fahrzeug „${v.title}“ wurde endgültig gelöscht – Inserat auf ${m.platform} bitte selbst beenden${
        m.adId ? ` (Inserat ${m.adId})` : ""
      }.`,
    } as never);
  }
  if (v.manualListings.length) {
    messages.push(`${v.manualListings.length} Aufgabe(n) für manuelle Plattformen erstellt`);
  }

  // c) Dateien im Storage entfernen
  const removed = await removeStorage(admin, id, snap);
  if (removed) messages.push(`${removed} Datei(en) entfernt`);

  // d) Verknüpfungen zu Anfragen lösen (Anfragen selbst bleiben bestehen)
  const { error: linkErr } = await admin.from("inquiry_vehicles").delete().eq("vehicle_id", id);
  if (linkErr) throw new Error(`Anfragen konnten nicht entkoppelt werden: ${linkErr.message}`);
  await admin.from("leads").update({ vehicle_id: null } as never).eq("vehicle_id", id);
  if (v.inquiryCount + v.leadCount > 0) {
    messages.push(`${v.inquiryCount + v.leadCount} Anfrage(n) bleiben ohne Fahrzeugbezug erhalten`);
  }

  // e) Fahrzeugzeile löschen
  const { error: delErr } = await admin.from("vehicles").delete().eq("id", id);
  if (delErr) throw new Error(`Löschen fehlgeschlagen: ${delErr.message}`);

  messages.unshift("Endgültig gelöscht");
  return messages;
}

async function removeStorage(admin: Db, id: string, snap: Json): Promise<number> {
  let count = 0;
  const del = async (bucket: string, paths: string[]) => {
    const unique = [...new Set(paths.filter(Boolean))];
    if (!unique.length) return;
    const { error } = await admin.storage.from(bucket).remove(unique);
    if (error) console.warn(`Storage ${bucket}:`, error.message);
    else count += unique.length;
  };

  try {
    // Eigene Fahrzeugbilder (privat + öffentlich gespiegelt)
    await del("mobile-ad-images", await listPrefix(admin, "mobile-ad-images", `drafts/${id}`));
    await del(
      "vehicle-stories",
      await listPrefix(admin, "vehicle-stories", `custom-vehicle-images/drafts/${id}`),
    );
    const custom = ((snap.custom_image_urls as string[] | null) ?? [])
      .map((u) => pathFromValue(u, "vehicle-stories"))
      .filter(Boolean) as string[];
    await del("vehicle-stories", custom);

    // Storys
    const { data: stories } = await admin
      .from("vehicle_stories").select("story_image_url").eq("vehicle_id", id);
    await del(
      "vehicle-stories",
      ((stories ?? []) as Json[])
        .map((s) => pathFromValue(String(s.story_image_url ?? ""), "vehicle-stories"))
        .filter(Boolean) as string[],
    );

    // Collagen
    const { data: collages } = await admin
      .from("vehicle_collages").select("storage_path, image_url").eq("vehicle_id", id);
    await del(
      "vehicle-stories",
      ((collages ?? []) as Json[])
        .map((c) => pathFromValue(String(c.storage_path ?? c.image_url ?? ""), "vehicle-stories"))
        .filter(Boolean) as string[],
    );

    // Exposés
    const { data: exposes } = await admin
      .from("vehicle_exposes").select("pdf_url").eq("vehicle_id", id);
    await del(
      "vehicle-exposes",
      ((exposes ?? []) as Json[])
        .map((e) => pathFromValue(String(e.pdf_url ?? ""), "vehicle-exposes"))
        .filter(Boolean) as string[],
    );
  } catch (e) {
    console.warn("Storage-Aufräumen unvollständig:", (e as Error).message);
  }
  return count;
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
