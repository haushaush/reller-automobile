// Create a new auth user with a role (admin or seller). Admin-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ROLES = new Set(["admin", "seller"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const role = typeof body?.role === "string" ? body.role : "";

    if (!EMAIL_RE.test(email)) return json({ error: "Ungültige E-Mail-Adresse." }, 400);
    if (password.length < 8) return json({ error: "Passwort muss mind. 8 Zeichen haben." }, 400);
    if (!ALLOWED_ROLES.has(role)) return json({ error: "Ungültige Rolle." }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      const msg = createErr?.message || "Fehler beim Anlegen des Users.";
      const status = /already|exists|registered/i.test(msg) ? 409 : 400;
      return json({ error: msg }, status);
    }

    const { error: roleErr } = await admin.from("user_roles").insert({
      user_id: created.user.id,
      role,
      granted_by: userData.user.id,
    });
    if (roleErr) {
      // rollback auth user
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return json({ error: `Rolle konnte nicht zugewiesen werden: ${roleErr.message}` }, 500);
    }

    return json({
      ok: true,
      user: { id: created.user.id, email: created.user.email, role },
    });
  } catch (err) {
    console.error("admin-create-user error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
