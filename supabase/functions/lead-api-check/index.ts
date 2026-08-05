// Prüft die Erreichbarkeit der Lead-API je Plattform-Konto.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadLeadAccounts, leadRequest, safeError } from "../_shared/lead-api.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

  let accountKey: string | undefined;
  try {
    const body = await req.json();
    accountKey = body?.accountKey;
  } catch {
    /* ohne Filter: alle Konten */
  }

  const db = admin();
  const accounts = (await loadLeadAccounts(db, false)).filter(
    (a) => !accountKey || a.account_key === accountKey,
  );

  const results = [];
  for (const account of accounts) {
    if (!account.username || !account.password) {
      results.push({
        accountKey: account.account_key,
        label: account.label,
        ok: false,
        status: 0,
        usedFallback: account.usedFallback,
        message: "Keine Zugangsdaten hinterlegt",
      });
      continue;
    }
    try {
      const { status, body } = await leadRequest(account, "/lead-api/status");
      const ok = status >= 200 && status < 300;
      results.push({
        accountKey: account.account_key,
        label: account.label,
        ok,
        status,
        usedFallback: account.usedFallback,
        message: ok
          ? "Verbindung erfolgreich"
          : status === 401 || status === 403
            ? "Zugangsdaten abgelehnt — Lead-API ggf. nicht freigeschaltet"
            : status === 404
              ? "Lead-API für dieses Konto nicht verfügbar"
              : `Antwort ${status}`,
        detail: ok ? body : undefined,
      });
    } catch (e) {
      results.push({
        accountKey: account.account_key,
        label: account.label,
        ok: false,
        status: 0,
        usedFallback: account.usedFallback,
        message: safeError((e as Error).message),
      });
    }
  }

  return json(200, { ok: true, results });
});
