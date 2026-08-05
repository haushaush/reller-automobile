// Holt Anfragen (Leads) von mobile.de über den Cursor-Mechanismus.
// Läuft per Cron alle 10 Minuten. Cursor wird erst nach erfolgreichem Speichern fortgeschrieben.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadLeadAccounts, leadRequest, safeError, type LeadAccount } from "../_shared/lead-api.ts";
import { emitNotificationEvent } from "../_shared/emit-event.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOCK_NAME = "mobile-de-leads";
const MAX_PAGES = 20;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Db = ReturnType<typeof createClient>;
type Payload = Record<string, unknown>;

const MESSAGING_TYPES = new Set([
  "MessagingLeadSubmitted",
  "MessagingLeadResubmitted",
  "BuyerReplied",
  "BuyerPreferencesUpdated",
  "BuyerSearchBehaviourAdded",
]);

function obj(value: unknown): Payload {
  return value && typeof value === "object" ? (value as Payload) : {};
}

function str(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function leadTypeFor(eventType: string): string {
  if (eventType === "LeasingLeadSubmitted") return "leasing";
  if (eventType === "PhoneCallReceived") return "phone_call";
  if (MESSAGING_TYPES.has(eventType)) return "messaging";
  return "messaging";
}

function buyerName(buyer: Payload): string | null {
  const full = str(buyer.name, buyer.fullName);
  if (full) return full;
  const first = str(buyer.firstName, buyer.givenName);
  const last = str(buyer.lastName, buyer.familyName, buyer.surname);
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || null;
}

function isMissedCall(data: Payload): boolean {
  const call = obj(data.call ?? data.phoneCall);
  const status = String(call.status ?? call.result ?? data.callStatus ?? "").toUpperCase();
  if (call.missed === true || data.missed === true) return true;
  if (call.answered === false) return true;
  return status.includes("MISSED") || status.includes("NO_ANSWER") || status.includes("NOT_ANSWERED");
}

async function resolveVehicleId(
  db: Db,
  mobileAdId: string | null,
  internalNumber: string | null,
): Promise<string | null> {
  if (mobileAdId) {
    const { data: listing } = await db
      .from("listings")
      .select("vehicle_id")
      .eq("external_ad_id", mobileAdId)
      .maybeSingle();
    if (listing?.vehicle_id) return listing.vehicle_id as string;

    const { data: vehicle } = await db
      .from("vehicles")
      .select("id")
      .or(`mobile_ad_id.eq.${mobileAdId},mobile_de_id.eq.${mobileAdId}`)
      .maybeSingle();
    if (vehicle?.id) return vehicle.id as string;
  }
  if (internalNumber) {
    const { data: byInternal } = await db
      .from("vehicles")
      .select("id")
      .eq("mobile_de_id", internalNumber)
      .maybeSingle();
    if (byInternal?.id) return byInternal.id as string;
  }
  return null;
}

async function processEvent(db: Db, account: LeadAccount, rawEvent: Payload): Promise<{
  stored: boolean;
  missedCall: boolean;
  newLead: boolean;
  lead?: Payload;
}> {
  const eventId = str(rawEvent.eventId, rawEvent.id, rawEvent.uuid);
  if (!eventId) return { stored: false, missedCall: false, newLead: false };

  const eventType = str(rawEvent.eventType, rawEvent.type) ?? "Unknown";
  const occurredAt = str(rawEvent.occurredAt, rawEvent.createdAt, rawEvent.timestamp) ??
    new Date().toISOString();
  const data = obj(rawEvent.data ?? rawEvent.payload);
  const leadObj = obj(data.lead);
  const buyer = obj(data.buyer ?? leadObj.buyer);
  const vehicle = obj(data.vehicle ?? leadObj.vehicle);

  const externalLeadId = str(leadObj.leadId, leadObj.id, data.leadId, rawEvent.leadId) ??
    `event:${eventId}`;
  const mobileAdId = str(vehicle.mobileAdId, vehicle.adId);
  const internalNumber = str(vehicle.internalNumber, vehicle.customerNumber);
  const source = (str(leadObj.source, data.source) ?? "MOBILE").toUpperCase();

  const { data: existing } = await db
    .from("leads")
    .select("id, vehicle_id, buyer_name, buyer_email, buyer_phone, first_event_at, status")
    .eq("lead_id", externalLeadId)
    .maybeSingle();

  const vehicleId = existing?.vehicle_id ??
    (await resolveVehicleId(db, mobileAdId, internalNumber));

  let leadRowId: string;
  let newLead = false;

  if (existing) {
    leadRowId = existing.id as string;
    await db
      .from("leads")
      .update({
        vehicle_id: vehicleId,
        mobile_ad_id: mobileAdId ?? undefined,
        buyer_name: buyerName(buyer) ?? existing.buyer_name,
        buyer_email: str(buyer.email, buyer.emailAddress) ?? existing.buyer_email,
        buyer_phone: str(buyer.phone, buyer.phoneNumber, buyer.maskedPhoneNumber) ??
          existing.buyer_phone,
        last_event_at: occurredAt,
      })
      .eq("id", leadRowId);
  } else {
    const insertRow = {
      lead_id: externalLeadId,
      platform_account_id: account.id,
      source,
      lead_type: leadTypeFor(eventType),
      status: "IN_PROGRESS",
      vehicle_id: vehicleId,
      mobile_ad_id: mobileAdId,
      buyer_name: buyerName(buyer),
      buyer_email: str(buyer.email, buyer.emailAddress),
      buyer_phone: str(buyer.phone, buyer.phoneNumber, buyer.maskedPhoneNumber),
      buyer_identifier: str(buyer.buyerIdentifier, buyer.identifier, buyer.id),
      first_event_at: occurredAt,
      last_event_at: occurredAt,
    };
    const { data: created, error } = await db
      .from("leads")
      .insert(insertRow)
      .select("id")
      .maybeSingle();
    if (error || !created) {
      // Parallelität: Lead wurde zwischenzeitlich angelegt
      const { data: retry } = await db
        .from("leads")
        .select("id")
        .eq("lead_id", externalLeadId)
        .maybeSingle();
      if (!retry) throw new Error(`Lead konnte nicht angelegt werden: ${safeError(error?.message ?? "")}`);
      leadRowId = retry.id as string;
    } else {
      leadRowId = created.id as string;
      newLead = true;
    }
  }

  const { error: eventError } = await db
    .from("lead_events")
    .upsert(
      {
        lead_id: leadRowId,
        event_id: eventId,
        event_type: eventType,
        occurred_at: occurredAt,
        payload: rawEvent,
      },
      { onConflict: "event_id", ignoreDuplicates: true },
    );
  if (eventError) throw new Error(`Ereignis konnte nicht gespeichert werden: ${safeError(eventError.message)}`);

  const missed = eventType === "PhoneCallReceived" && isMissedCall(data);

  return {
    stored: true,
    missedCall: missed,
    newLead,
    lead: {
      leadRowId,
      source,
      eventType,
      vehicleId,
      mobileAdId,
    },
  };
}

async function runAccount(db: Db, account: LeadAccount) {
  const summary = {
    account: account.account_key,
    pages: 0,
    events: 0,
    newLeads: 0,
    missedCalls: 0,
    warnings: [] as string[],
    error: null as string | null,
  };

  let cursor = account.lead_cursor ?? "0";
  const notifications: { type: string; payload: Payload }[] = [];

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const path = `/lead-api/sellers/${encodeURIComponent(account.seller_id ?? "")}/events?cursor=${encodeURIComponent(cursor)}`;
      const { status, body, raw } = await leadRequest(account, path);
      if (status < 200 || status >= 300) {
        throw new Error(`Abruf fehlgeschlagen (${status}): ${safeError(raw)}`);
      }
      summary.pages++;

      const payload = obj(body);
      const events = Array.isArray(payload.events)
        ? (payload.events as Payload[])
        : Array.isArray(payload.items)
          ? (payload.items as Payload[])
          : [];
      const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
      for (const w of warnings) {
        const text = typeof w === "string" ? w : JSON.stringify(w);
        summary.warnings.push(safeError(text));
        console.warn(`lead-api warning [${account.account_key}]: ${safeError(text)}`);
      }

      for (const rawEvent of events) {
        const result = await processEvent(db, account, obj(rawEvent));
        if (!result.stored) continue;
        summary.events++;
        if (result.newLead) {
          summary.newLeads++;
          notifications.push({ type: "inquiry_received", payload: result.lead ?? {} });
        }
        if (result.missedCall) {
          summary.missedCalls++;
          notifications.push({ type: "missed_call", payload: result.lead ?? {} });
        }
      }

      const nextCursor = str(payload.nextCursor, payload.cursor);
      // Cursor erst nach erfolgreichem Speichern der Seite fortschreiben
      if (nextCursor && nextCursor !== cursor) {
        cursor = nextCursor;
        await db.from("platform_accounts").update({ lead_cursor: cursor }).eq("id", account.id);
      } else {
        break;
      }
      if (events.length === 0) break;
    }
  } catch (e) {
    summary.error = safeError((e as Error).message);
    console.error(`fetch-leads [${account.account_key}] abgebrochen: ${summary.error}`);
  }

  // Benachrichtigungen erst nach dem Durchlauf — mit Fahrzeugtitel, ohne Kontaktdaten im Log
  for (const n of notifications) {
    let title = "Fahrzeug unbekannt";
    const vehicleId = n.payload.vehicleId as string | null;
    if (vehicleId) {
      const { data: v } = await db.from("vehicles").select("title").eq("id", vehicleId).maybeSingle();
      if (v?.title) title = v.title as string;
    }
    const { data: lead } = await db
      .from("leads")
      .select("id, buyer_name, buyer_email, buyer_phone, source, lead_type")
      .eq("id", n.payload.leadRowId as string)
      .maybeSingle();
    await emitNotificationEvent(db, n.type, {
      name: lead?.buyer_name ?? "Interessent",
      email: lead?.buyer_email ?? "—",
      phone: lead?.buyer_phone ?? "—",
      vehicles: [title],
      source: lead?.source ?? "MOBILE",
      leadId: n.payload.leadRowId,
      message: n.type === "missed_call" ? "Verpasster Anruf" : "Neue Anfrage über die Lead-Schnittstelle",
    });
  }

  return summary;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const startedAt = new Date();

  await db.from("sync_locks").upsert(
    { lock_name: LOCK_NAME, locked_at: new Date(0).toISOString(), locked_until: new Date(0).toISOString() },
    { onConflict: "lock_name", ignoreDuplicates: true },
  );
  const { data: lockRow, error: lockError } = await db
    .from("sync_locks")
    .update({
      locked_at: startedAt.toISOString(),
      locked_until: new Date(startedAt.getTime() + 9 * 60_000).toISOString(),
    })
    .eq("lock_name", LOCK_NAME)
    .lte("locked_until", startedAt.toISOString())
    .select("lock_name")
    .maybeSingle();
  if (lockError) return json(500, { error: `Lock fehlgeschlagen: ${lockError.message}` });
  if (!lockRow) return json(200, { ok: true, skipped: true, reason: "Abruf läuft bereits" });

  try {
    const accounts = await loadLeadAccounts(db, true);
    const results = [];
    for (const account of accounts) {
      if (!account.seller_id || !account.username || !account.password) {
        results.push({ account: account.account_key, error: "Zugangsdaten oder Verkäufer-ID fehlen" });
        continue;
      }
      results.push(await runAccount(db, account));
    }
    return json(200, { ok: true, accounts: results });
  } catch (e) {
    return json(500, { error: safeError((e as Error).message) });
  } finally {
    await db.from("sync_locks").upsert(
      { lock_name: LOCK_NAME, locked_at: startedAt.toISOString(), locked_until: new Date(0).toISOString() },
      { onConflict: "lock_name" },
    );
  }
});
