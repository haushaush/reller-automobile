// Hängende Veröffentlichungen erkennen und auflösen.
// Bricht die Function nach dem Absetzen des Aufrufs ab, bleibt das Fahrzeug auf
// "publishing" stehen, obwohl die Anzeige bei Mobile.de existiert. Diese Prüfung
// liest die Inseratsliste des Kontos und ordnet die Anzeige nachträglich zu.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { basicAuth, fetchSellerAds, type SellerAd } from "./mobile-reconcile.ts";

type Db = ReturnType<typeof createClient>;

export const STUCK_MINUTES = 5;

export interface StuckOutcome {
  vehicleId: string;
  title: string;
  result: "matched" | "failed" | "pending" | "error";
  mobileAdId?: string | null;
  detail?: string;
}

export interface StuckSummary {
  checked: number;
  matched: number;
  failed: number;
  pending: number;
  outcomes: StuckOutcome[];
  errors: string[];
}

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const norm = (v: unknown) =>
  String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const bare = (v: unknown) => String(v ?? "").replace(/^[a-z_]+_/, "");

/** Bewertet, wie gut eine Anzeige zu einem Fahrzeug passt (0 = kein Treffer). */
function scoreAd(vehicle: Record<string, unknown>, ad: SellerAd): number {
  const raw = ad.raw;
  const payload = (vehicle.mobile_payload ?? {}) as Record<string, unknown>;
  let score = 0;

  const vMake = norm(vehicle.brand ?? payload.make);
  const aMake = norm(raw.make);
  if (vMake && aMake) {
    if (vMake === aMake) score += 3;
    else return 0; // andere Marke → nie derselbe Wagen
  }

  const vModel = norm(vehicle.model ?? payload.model);
  const aModel = norm(raw.model);
  if (vModel && aModel) score += vModel === aModel ? 3 : -2;

  const vDesc = norm(vehicle.model_description ?? payload.modelDescription);
  const aDesc = norm(raw.modelDescription);
  if (vDesc && aDesc && vDesc === aDesc) score += 2;

  const vPrice = num(vehicle.price);
  if (vPrice && ad.price) score += Math.abs(vPrice - ad.price) <= 1 ? 3 : -1;

  const vMileage = num(vehicle.mileage);
  if (vMileage !== null && ad.mileage !== null) score += Math.abs(vMileage - ad.mileage) <= 1 ? 2 : -1;

  // Anzeige nach dem Anlegen des Fahrzeugs erstellt → plausibel
  const created = Date.parse(String(raw.creationDate ?? ""));
  const vCreated = Date.parse(String(vehicle.created_at ?? ""));
  if (Number.isFinite(created) && Number.isFinite(vCreated) && Math.abs(created - vCreated) < 6 * 60 * 60 * 1000) {
    score += 2;
  }

  return score;
}

/**
 * Prüft alle Fahrzeuge/Inserate, die länger als `thresholdMinutes` auf
 * "publishing" stehen. Existiert die Anzeige, wird sie nachgetragen,
 * sonst wird auf "publish_error" gesetzt.
 */
export async function resolveStuckPublishing(
  admin: Db,
  options: { thresholdMinutes?: number; vehicleId?: string } = {},
): Promise<StuckSummary> {
  const threshold = options.thresholdMinutes ?? STUCK_MINUTES;
  const summary: StuckSummary = { checked: 0, matched: 0, failed: 0, pending: 0, outcomes: [], errors: [] };

  // 1) Fahrzeuge im Zustand "publishing" — auch solche, deren Listing hängt.
  const { data: vehRows } = await admin
    .from("vehicles")
    .select("id, title, brand, model, model_description, price, mileage, created_at, updated_at, last_pushed_at, publish_status, mobile_ad_id, mobile_payload")
    .eq("publish_status", "publishing");
  const stuckVehicles = ((vehRows ?? []) as Record<string, unknown>[]).filter(
    (v) => !options.vehicleId || v.id === options.vehicleId,
  );

  const { data: listRows } = await admin
    .from("listings")
    .select("id, vehicle_id, account_key, status, external_ad_id, created_at, updated_at")
    .eq("platform", "mobile_de")
    .eq("status", "publishing");
  const stuckListings = ((listRows ?? []) as Record<string, unknown>[]).filter(
    (l) => !options.vehicleId || l.vehicle_id === options.vehicleId,
  );

  const vehicleIds = new Set<string>([
    ...stuckVehicles.map((v) => String(v.id)),
    ...stuckListings.map((l) => String(l.vehicle_id)),
  ]);
  if (vehicleIds.size === 0) return summary;

  // Fehlende Fahrzeugdaten nachladen (Listing hängt, Fahrzeug aber nicht)
  const known = new Map(stuckVehicles.map((v) => [String(v.id), v]));
  const missing = [...vehicleIds].filter((id) => !known.has(id));
  if (missing.length) {
    const { data: extra } = await admin
      .from("vehicles")
      .select("id, title, brand, model, model_description, price, mileage, created_at, updated_at, last_pushed_at, publish_status, mobile_ad_id, mobile_payload")
      .in("id", missing);
    for (const v of (extra ?? []) as Record<string, unknown>[]) known.set(String(v.id), v);
  }

  const listingByVehicle = new Map(stuckListings.map((l) => [String(l.vehicle_id), l]));

  // 2) Zeitgrenze: erst nach `threshold` Minuten gilt der Vorgang als abgebrochen.
  const now = Date.now();
  const candidates = [...known.values()].filter((v) => {
    const listing = listingByVehicle.get(String(v.id));
    const stamps = [v.last_pushed_at, v.updated_at, v.created_at, listing?.updated_at, listing?.created_at]
      .map((s) => Date.parse(String(s ?? "")))
      .filter((n) => Number.isFinite(n));
    const newest = stamps.length ? Math.max(...stamps) : 0;
    if (now - newest < threshold * 60_000) {
      summary.pending++;
      summary.outcomes.push({
        vehicleId: String(v.id),
        title: String(v.title ?? "Fahrzeug"),
        result: "pending",
        detail: "Vorgang läuft noch",
      });
      return false;
    }
    return true;
  });
  summary.checked = candidates.length;
  if (candidates.length === 0) return summary;

  // 3) Konten der betroffenen Fahrzeuge bestimmen und deren Inserate lesen.
  const { data: accountRows } = await admin
    .from("platform_accounts")
    .select("account_key, label, seller_id, username_secret_name, password_secret_name")
    .eq("platform", "mobile_de");
  const accounts = (accountRows ?? []) as Record<string, string>[];
  const secret = (n?: string | null) => (n ? Deno.env.get(n) ?? "" : "");

  const accountOf = (vehicleId: string) => {
    const key = String(listingByVehicle.get(vehicleId)?.account_key ?? "standard");
    return accounts.find((a) => a.account_key === key) ?? accounts.find((a) => a.account_key === "standard") ?? accounts[0];
  };

  const adsByAccount = new Map<string, SellerAd[]>();
  for (const v of candidates) {
    const acc = accountOf(String(v.id));
    if (!acc) continue;
    const key = acc.account_key;
    if (adsByAccount.has(key)) continue;
    const user = secret(acc.username_secret_name) || Deno.env.get("MOBILE_DE_USERNAME") || "";
    const pass = secret(acc.password_secret_name) || Deno.env.get("MOBILE_DE_PASSWORD") || "";
    if (!user || !pass) {
      summary.errors.push(`Zugangsdaten für Konto "${acc.label ?? key}" fehlen`);
      adsByAccount.set(key, []);
      continue;
    }
    const { ads, error } = await fetchSellerAds(String(acc.seller_id ?? "451040"), basicAuth(user, pass));
    if (error) summary.errors.push(`Konto ${acc.label ?? key}: ${error}`);
    adsByAccount.set(key, ads);
  }

  // Bereits vergebene Anzeigen-Nummern nicht doppelt zuordnen
  const { data: linkedRows } = await admin
    .from("vehicles")
    .select("id, mobile_ad_id")
    .not("mobile_ad_id", "is", null);
  const takenAdIds = new Set(
    ((linkedRows ?? []) as Record<string, unknown>[])
      .filter((r) => !vehicleIds.has(String(r.id)))
      .map((r) => bare(r.mobile_ad_id)),
  );

  // 4) Zuordnen oder als abgebrochen kennzeichnen.
  for (const v of candidates) {
    const vehicleId = String(v.id);
    const title = String(v.title ?? "Fahrzeug");
    const acc = accountOf(vehicleId);
    const ads = (adsByAccount.get(String(acc?.account_key ?? "standard")) ?? []).filter(
      (a) => !takenAdIds.has(bare(a.mobileAdId)),
    );

    let best: { ad: SellerAd; score: number } | null = null;
    for (const ad of ads) {
      const score = scoreAd(v, ad);
      if (score >= 6 && (!best || score > best.score)) best = { ad, score };
    }

    try {
      if (best) {
        const nowIso = new Date().toISOString();
        await admin
          .from("vehicles")
          .update({
            publish_status: "published",
            mobile_ad_id: best.ad.mobileAdId,
            published_at: nowIso,
            last_pushed_at: nowIso,
            detail_page_url: best.ad.detailPageUrl ?? null,
            publish_error: null,
            is_sold: false,
          } as never)
          .eq("id", vehicleId);

        const listing = listingByVehicle.get(vehicleId);
        const listingPatch = {
          status: "live",
          external_ad_id: best.ad.mobileAdId,
          external_url: best.ad.detailPageUrl ?? null,
          error_message: null,
          published_at: nowIso,
          account_key: String(acc?.account_key ?? "standard"),
        };
        if (listing) {
          await admin.from("listings").update(listingPatch as never).eq("id", listing.id as string);
        } else {
          await admin.from("listings").insert({
            vehicle_id: vehicleId,
            platform: "mobile_de",
            is_manual: false,
            ...listingPatch,
          } as never);
        }

        await admin.from("mobile_push_log").insert({
          vehicle_id: vehicleId,
          action: "resolve_stuck_publish",
          request_body: { score: best.score } as never,
          response_status: 200,
          response_body: `Anzeige ${best.ad.mobileAdId} nachträglich zugeordnet`,
        } as never);

        takenAdIds.add(bare(best.ad.mobileAdId));
        summary.matched++;
        summary.outcomes.push({ vehicleId, title, result: "matched", mobileAdId: best.ad.mobileAdId });
      } else {
        const msg = "Vorgang abgebrochen, bitte prüfen";
        await admin
          .from("vehicles")
          .update({ publish_status: "publish_error", publish_error: msg } as never)
          .eq("id", vehicleId);
        const listing = listingByVehicle.get(vehicleId);
        if (listing) {
          await admin
            .from("listings")
            .update({ status: "error", error_message: msg } as never)
            .eq("id", listing.id as string);
        }
        await admin.from("mobile_push_log").insert({
          vehicle_id: vehicleId,
          action: "resolve_stuck_publish",
          request_body: null,
          response_status: null,
          response_body: msg,
        } as never);
        summary.failed++;
        summary.outcomes.push({ vehicleId, title, result: "failed", detail: msg });
      }
    } catch (e) {
      const detail = (e as Error).message || String(e);
      summary.errors.push(`${title}: ${detail}`);
      summary.outcomes.push({ vehicleId, title, result: "error", detail });
    }
  }

  console.log(
    `resolveStuckPublishing: geprüft=${summary.checked} zugeordnet=${summary.matched} abgebrochen=${summary.failed} offen=${summary.pending}`,
  );
  return summary;
}
