// Proxy for Mobile.de Refdata API. Admin-only.
// Returns normalized JSON arrays of { key, name } for the requested ref list.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOBILE_USER = Deno.env.get("MOBILE_DE_USERNAME")!;
const MOBILE_PASS = Deno.env.get("MOBILE_DE_PASSWORD")!;

const REFDATA_BASE = "https://services.mobile.de/refdata";

type RefItem = { key: string; name: string };

function parseRefdataXml(xml: string): RefItem[] {
  // Mobile.de refdata XML: <reference:item key="Golf"><resource:local-description xml-lang="de">Golf</resource:local-description></reference:item>
  // Also tolerate legacy <value key="..."><local-description>...</local-description></value>.
  const items: RefItem[] = [];
  const itemRe = /<(?:[\w-]+:)?(item|value)\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?\1>/g;
  const keyRe = /\bkey="([^"]+)"/;
  const descRe = /<(?:[\w-]+:)?local-description[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?local-description>/;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const attrs = m[2];
    const body = m[3];
    const k = keyRe.exec(attrs)?.[1];
    if (!k) continue;
    const d = descRe.exec(body)?.[1]?.trim();
    items.push({ key: k, name: d || k });
  }
  return items;
}

async function fetchRef(path: string): Promise<RefItem[]> {
  const url = `${REFDATA_BASE}${path}`;
  const auth = btoa(`${MOBILE_USER}:${MOBILE_PASS}`);
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/xml",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Refdata ${res.status} for ${url}: ${body.slice(0, 300)}`);
    throw new Error(`Refdata ${res.status} for ${url}: ${body.slice(0, 300)}`);
  }
  const xml = await res.text();
  return parseRefdataXml(xml);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Admin auth ────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse request ─────────────────────────────────────────
    const url = new URL(req.url);
    let kind = url.searchParams.get("kind") ?? "";
    let makeKey = url.searchParams.get("make") ?? "";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.kind) kind = String(body.kind);
        if (body?.make) makeKey = String(body.make);
      } catch { /* empty body ok */ }
    }
    if (!kind) {
      return new Response(JSON.stringify({ error: "kind required (makes|models|categories|fuels|gearboxes|vatrates|conditions)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let path = "";
    switch (kind) {
      case "makes":
        path = "/classes/Car/makes";
        break;
      case "models":
        if (!makeKey) {
          return new Response(JSON.stringify({ error: "make required for models" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        path = `/classes/Car/makes/${encodeURIComponent(makeKey)}/models`;
        break;
      case "categories":
        // TODO: confirm exact refdata path for Car categories under https://services.mobile.de/refdata/...
        path = "/classes/Car/categories";
        break;
      case "fuels":
        // TODO: confirm exact refdata path for Car fuels
        path = "/classes/Car/fuels";
        break;
      case "gearboxes":
        // TODO: confirm exact refdata path for Car gearboxes
        path = "/classes/Car/gearboxes";
        break;
      case "vatrates":
        // TODO: confirm exact refdata path for vat rates
        path = "/classes/Car/vat-rates";
        break;
      case "conditions":
        // TODO: confirm exact refdata path for conditions
        path = "/classes/Car/conditions";
        break;
      default:
        return new Response(JSON.stringify({ error: `unknown kind: ${kind}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const items = await fetchRef(path);
    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("mobile-refdata error:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
