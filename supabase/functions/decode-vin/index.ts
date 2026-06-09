// Decode a VIN via the auto.dev VIN Decoder API. Admin-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AUTODEV_API_KEY = Deno.env.get("AUTODEV_API_KEY");

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function pickName(obj: unknown): string | null {
  if (!obj) return null;
  if (typeof obj === "string") return obj;
  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if (typeof o.name === "string") return o.name;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing Authorization header" }, 401);
    const token = auth.replace("Bearer ", "");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) return json({ error: "Forbidden" }, 403);

    if (!AUTODEV_API_KEY) return json({ error: "AUTODEV_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const vinRaw = typeof body?.vin === "string" ? body.vin.trim().toUpperCase() : "";
    if (!VIN_RE.test(vinRaw)) {
      return json({ error: "Ungültige FIN: 17 Zeichen, Großbuchstaben, keine I/O/Q." }, 400);
    }

    const url = `https://api.auto.dev/vin/${encodeURIComponent(vinRaw)}?format=json`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${AUTODEV_API_KEY}`,
      },
    });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { /* keep empty */ }

    console.log("AUTODEV STATUS:", res.status);
    console.log("AUTODEV RAW RESPONSE:", JSON.stringify(parsed, null, 2));

    if (!res.ok) {
      console.error("auto.dev error", res.status, text.slice(0, 400));
      const msg = (parsed as { message?: string })?.message || `auto.dev Fehler (${res.status})`;
      return json({ error: msg, _raw: parsed }, res.status === 404 ? 404 : 502);
    }

    const vehicle = (parsed.vehicle ?? {}) as Record<string, unknown>;
    const topMake = typeof parsed.make === "string" ? (parsed.make as string) : null;
    const vehMake = typeof vehicle.make === "string" ? (vehicle.make as string) : null;
    const brand = (vehMake && vehMake.trim()) || (topMake && topMake.trim()) || null;

    const vinValid = parsed.vinValid;
    if (vinValid === false || !brand) {
      return json({
        error: "FIN ungültig oder nicht gefunden, bitte Daten manuell eingeben",
        _raw: parsed,
      });
    }

    const vehModel = typeof vehicle.model === "string" ? (vehicle.model as string).trim() : "";
    const model = vehModel || null;

    let year: number | null = toInt(vehicle.year);
    if (year === null) {
      const yearsArr = parsed.years;
      if (Array.isArray(yearsArr) && yearsArr.length > 0) {
        // can be array of numbers or {year}
        const first = yearsArr[0];
        year = typeof first === "number" ? first : toInt((first as { year?: unknown })?.year);
      }
    }

    const manufacturer = typeof vehicle.manufacturer === "string" ? (vehicle.manufacturer as string) : null;
    const bodyRaw = (typeof vehicle.type === "string" && vehicle.type) ||
      (typeof parsed.type === "string" && parsed.type) || null;
    const bodyType = bodyRaw
      ? bodyRaw
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : null;

    const title = model ? `${brand} ${model}` : brand;

    return json({
      vin: vinRaw,
      brand,
      model,
      model_description: null,
      title,
      year,
      manufacturer,
      body_type: bodyType,
      fuel: null,
      power: null,
      gearbox: null,
      num_seats: null,
      cubic_capacity: null,
      _raw: parsed,
    });
  } catch (err) {
    console.error("decode-vin error", err);
    return json({ error: (err as Error).message || "Unbekannter Fehler" }, 500);
  }
});
