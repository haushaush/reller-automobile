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
  // Mobile.de refdata XML: <reference:item key="DIESEL">
  //   <resource:local-description xml-lang="de">Diesel</resource:local-description>
  //   <resource:local-description xml-lang="en">Diesel</resource:local-description>
  // </reference:item>
  // Also tolerate legacy <value key="..."><local-description>...</local-description></value>.
  const items: RefItem[] = [];
  const itemRe = /<(?:[\w-]+:)?(item|value)\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?\1>/g;
  const keyRe = /\bkey="([^"]+)"/;
  const descAllRe = /<(?:[\w-]+:)?local-description\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?local-description>/g;
  const langRe = /\bxml-lang="([^"]+)"/;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const attrs = m[2];
    const body = m[3];
    const k = keyRe.exec(attrs)?.[1];
    if (!k) continue;
    let de: string | undefined;
    let firstAny: string | undefined;
    let dm: RegExpExecArray | null;
    descAllRe.lastIndex = 0;
    while ((dm = descAllRe.exec(body)) !== null) {
      const lang = langRe.exec(dm[1])?.[1];
      const text = dm[2].trim();
      if (!text) continue;
      if (firstAny === undefined) firstAny = text;
      if (lang === "de") { de = text; break; }
    }
    items.push({ key: k, name: de ?? firstAny ?? k });
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
      return new Response(JSON.stringify({ error: "kind required (makes|models|categories|fuels|gearboxes|vatrates)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fixed category list (confirmed common values for Car class)
    if (kind === "categories") {
      const catItems: RefItem[] = [
        { key: "Cabrio", name: "Cabrio/Roadster" },
        { key: "SmallCar", name: "Kleinwagen" },
        { key: "EstateCar", name: "Kombi" },
        { key: "Limousine", name: "Limousine" },
        { key: "SportsCar", name: "Sportwagen/Coupé" },
        { key: "Van", name: "Van/Kleinbus" },
        { key: "OffRoad", name: "SUV/Geländewagen" },
        { key: "OtherCar", name: "Andere" },
      ];
      return new Response(JSON.stringify({ items: catItems }), {
        status: 200,
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
      case "fuels":
        path = "/fuels";
        break;
      case "gearboxes":
        path = "/gearboxes";
        break;
      case "vatrates":
        path = "/sites/GERMANY/vatrates";
        break;
      case "exterior-colors":
        path = "/colors";
        break;
      case "climatisations":
        path = "/climatisations";
        break;
      case "emission-classes":
        path = "/emission-classes";
        break;
      case "emission-stickers":
        path = "/emission-stickers";
        break;
      case "drive-types":
        path = "/drive-types";
        break;
      case "parking-assistants":
        path = "/parking-assistants";
        break;
      default:
        return new Response(JSON.stringify({ error: `unknown kind: ${kind}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    let items = await fetchRef(path);

    if (kind === "vatrates") {
      // vatrates haben nur key (z.B. "19.00"), keine local-description.
      // Label als "<key> %", auf sinnvolle DE-Werte filtern, OTHER (Differenzbesteuerung) sicherstellen.
      const keep = new Set(["19.00", "0.00", "OTHER"]);
      items = items
        .filter((i) => keep.has(i.key))
        .map((i) => ({
          key: i.key,
          name: i.key === "OTHER" ? "Differenzbesteuert" : `${i.key} %`,
        }));
      if (!items.some((i) => i.key === "OTHER")) {
        items.push({ key: "OTHER", name: "Differenzbesteuert" });
      }
    }

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
