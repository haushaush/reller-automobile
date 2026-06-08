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

    const url = `https://auto.dev/api/vin/${encodeURIComponent(vinRaw)}?apikey=${encodeURIComponent(AUTODEV_API_KEY)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { /* keep empty */ }

    if (!res.ok) {
      console.error("auto.dev error", res.status, text.slice(0, 400));
      const msg = (parsed as { message?: string })?.message || `auto.dev Fehler (${res.status})`;
      return json({ error: msg }, res.status === 404 ? 404 : 502);
    }

    const brand = pickName(parsed.make);
    const model = pickName(parsed.model);
    const modelDesc = pickName(parsed.trim) || (parsed as { trimDescription?: string }).trimDescription || null;

    let year: number | null = null;
    const yearsArr = parsed.years as Array<{ year?: number }> | undefined;
    if (Array.isArray(yearsArr) && yearsArr.length > 0) {
      year = toInt(yearsArr[0]?.year);
    } else if ((parsed as { year?: unknown }).year !== undefined) {
      year = toInt((parsed as { year?: unknown }).year);
    }

    const engine = (parsed.engine ?? {}) as Record<string, unknown>;
    const transmission = (parsed.transmission ?? {}) as Record<string, unknown>;
    const categories = (parsed.categories ?? {}) as Record<string, unknown>;

    const fuel = pickName(engine.type) || (typeof engine.fuelType === "string" ? engine.fuelType as string : null);
    // power: auto.dev gives horsepower; convert to kW (1 kW ≈ 1.35962 hp)
    const hp = toInt(engine.horsepower);
    const powerKw = hp !== null ? Math.round(hp / 1.35962) : null;

    const gearbox = pickName(transmission.transmissionType) || pickName(transmission.type) || null;
    const bodyType = pickName(categories.vehicleStyle) || pickName(categories.primaryBodyType) || null;
    const numSeats = toInt((parsed as { numOfDoors?: unknown; standardSeating?: unknown }).standardSeating);
    const cubicCapacity = toInt(engine.displacement) || toInt(engine.size);

    return json({
      vin: vinRaw,
      brand,
      model,
      model_description: modelDesc,
      title: brand && (modelDesc || model) ? `${brand} ${modelDesc || model}` : null,
      year,
      fuel,
      power: powerKw,
      gearbox,
      body_type: bodyType,
      num_seats: numSeats,
      cubic_capacity: cubicCapacity,
    });
  } catch (err) {
    console.error("decode-vin error", err);
    return json({ error: (err as Error).message || "Unbekannter Fehler" }, 500);
  }
});
