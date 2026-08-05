// Prüft, ob die Absender-Domain beim Maildienst verifiziert ist (SPF/DKIM/DMARC).
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serviceClient } from "../_shared/mail-config.ts";

const RESEND_GATEWAY = "https://connector-gateway.lovable.dev/resend";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  if (token === SERVICE_KEY) return true;
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await userClient.auth.getClaims(token);
    if (error || !data?.claims?.sub) return false;
    const admin = serviceClient();
    const { data: role } = await admin
      .from("user_roles").select("role").eq("user_id", data.claims.sub as string).maybeSingle();
    return !!role;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await isAdmin(req))) return json(401, { error: "Unauthorized" });

  let address = "";
  try {
    const body = await req.json();
    address = String(body?.address ?? "");
  } catch { /* optional */ }

  const domain = address.includes("@") ? address.split("@")[1].trim().toLowerCase() : address.trim().toLowerCase();
  if (!domain) return json(400, { error: "Keine Absenderadresse übergeben" });

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!lovableKey || !resendKey) {
    return json(200, {
      domain,
      status: "unknown",
      message: "Der Maildienst ist nicht verbunden — Domainstatus konnte nicht geprüft werden.",
    });
  }

  try {
    const response = await fetch(`${RESEND_GATEWAY}/domains`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
    });
    const text = await response.text();
    if (!response.ok) {
      console.error(`Domain lookup failed [${response.status}]: ${text}`);
      return json(200, {
        domain,
        status: "unknown",
        message: `Domainstatus konnte nicht abgefragt werden (${response.status}).`,
      });
    }
    const parsed = JSON.parse(text) as { data?: Array<{ name: string; status: string; records?: unknown[] }> };
    const entries = parsed.data ?? [];
    const match = entries.find((d) => d.name?.toLowerCase() === domain);

    if (!match) {
      return json(200, {
        domain,
        status: "missing",
        knownDomains: entries.map((d) => d.name),
        message: `Die Domain ${domain} ist beim Maildienst nicht hinterlegt. Mails an externe Empfänger können abgelehnt werden.`,
        requiredRecords: defaultRecords(domain),
      });
    }

    const verified = String(match.status).toLowerCase() === "verified";
    return json(200, {
      domain,
      status: verified ? "verified" : "pending",
      message: verified
        ? `Die Domain ${domain} ist verifiziert (SPF und DKIM aktiv).`
        : `Die Domain ${domain} ist hinterlegt, aber noch nicht verifiziert (Status: ${match.status}).`,
      records: match.records ?? [],
      requiredRecords: verified ? [] : defaultRecords(domain),
    });
  } catch (err) {
    console.error("check-sender-domain failed:", err);
    return json(200, {
      domain,
      status: "unknown",
      message: "Domainstatus konnte nicht geprüft werden.",
    });
  }
});

function defaultRecords(domain: string) {
  return [
    { type: "TXT", name: domain, value: "v=spf1 include:amazonses.com ~all", purpose: "SPF" },
    { type: "TXT", name: `resend._domainkey.${domain}`, value: "(DKIM-Schlüssel aus dem Maildienst übernehmen)", purpose: "DKIM" },
    { type: "TXT", name: `_dmarc.${domain}`, value: "v=DMARC1; p=none;", purpose: "DMARC" },
  ];
}
