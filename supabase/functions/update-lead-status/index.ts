// Meldet den Status einer Anfrage an mobile.de zurück und pflegt ihn lokal.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { toLeadAccount, leadRequest, safeError } from "../_shared/lead-api.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID = new Set(["IN_PROGRESS", "SOLD", "NOT_INTERESTED", "SPAM"]);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  if (token === SERVICE_KEY) return true;
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await userClient.auth.getClaims(token);
    if (error || !data?.claims?.sub) return false;
    const { data: role } = await admin()
      .from("user_roles")
      .select("role")
      .eq("user_id", data.claims.sub as string)
      .eq("role", "admin")
      .maybeSingle();
    return !!role;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await isAdmin(req))) return json(401, { error: "Nicht berechtigt" });

  let body: { leadIds?: string[]; newStatus?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Ungültiger Request-Body" });
  }

  const newStatus = String(body.newStatus ?? "");
  const leadIds = (body.leadIds ?? []).filter((id) => typeof id === "string");
  if (!VALID.has(newStatus)) return json(400, { error: "Unbekannter Status" });
  if (leadIds.length === 0) return json(400, { error: "Keine Anfrage angegeben" });

  const db = admin();
  const occurredAt = new Date().toISOString();
  const results: { id: string; ok: boolean; remote: boolean; message?: string }[] = [];

  for (const id of leadIds) {
    const { data: lead } = await db
      .from("leads")
      .select("id, lead_id, source, platform_account_id")
      .eq("id", id)
      .maybeSingle();
    if (!lead) {
      results.push({ id, ok: false, remote: false, message: "Anfrage nicht gefunden" });
      continue;
    }

    let remoteOk = false;
    let message: string | undefined;

    const isRemote = !!lead.lead_id && !String(lead.lead_id).startsWith("event:") &&
      lead.source !== "MANUAL" && lead.source !== "AUTOSCOUT24";

    if (isRemote && lead.platform_account_id) {
      const { data: row } = await db
        .from("platform_accounts")
        .select("*")
        .eq("id", lead.platform_account_id as string)
        .maybeSingle();
      if (row) {
        const account = toLeadAccount(row as Record<string, unknown>);
        try {
          const { status, raw } = await leadRequest(
            account,
            `/lead-api/sellers/${encodeURIComponent(account.seller_id ?? "")}/leads/${encodeURIComponent(String(lead.lead_id))}/status`,
            { method: "POST", body: JSON.stringify({ newStatus, occurredAt }) },
          );
          remoteOk = status >= 200 && status < 300;
          if (!remoteOk) message = `Mobile.de meldet ${status}: ${safeError(raw)}`;
        } catch (e) {
          message = safeError((e as Error).message);
        }
      }
    }

    const { error } = await db.from("leads").update({ status: newStatus }).eq("id", id);
    results.push({
      id,
      ok: !error,
      remote: remoteOk,
      message: error ? safeError(error.message) : message,
    });
  }

  return json(200, { ok: results.every((r) => r.ok), results });
});
