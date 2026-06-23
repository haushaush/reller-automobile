import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  // Verify caller is admin or editor
  const { data: userRes } = await userClient.auth.getUser();
  const uid = userRes?.user?.id;
  if (!uid) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
  const allowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "editor");
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const emailLogId = body.emailLogId || body.email_log_id;
  if (!emailLogId) {
    return new Response(JSON.stringify({ error: "emailLogId is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: log, error: logErr } = await admin
    .from("email_logs").select("*").eq("id", emailLogId).single();
  if (logErr || !log) {
    return new Response(JSON.stringify({ error: "Log not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const meta = (log.metadata ?? {}) as Record<string, any>;
  const templateName = meta.template_name;
  const templateData = meta.template_data ?? {};
  if (!templateName) {
    return new Response(JSON.stringify({ error: "Original template not retained in log; cannot resend." }), {
      status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const recipients: string[] = (log.recipients ?? []).filter(Boolean);
  if (recipients.length === 0) {
    return new Response(JSON.stringify({ error: "No recipients on original log" }), {
      status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stamp = Date.now();
  const results = await Promise.all(recipients.map((recipient) =>
    admin.functions.invoke("send-transactional-email", {
      body: {
        templateName,
        recipientEmail: recipient,
        idempotencyKey: `resend-${emailLogId}-${stamp}-${recipient}`,
        templateData,
        logContext: {
          mailType: log.mail_type === "manual_resend" ? log.mail_type : `${log.mail_type}_resend`,
          vehicleId: log.vehicle_id,
          mobileAdDraftId: log.mobile_ad_draft_id,
          mobileAdId: log.mobile_ad_id,
          storyId: log.story_id,
          exposePath: log.expose_path,
          metadata: {
            retry_of_email_log_id: emailLogId,
            triggered_by: uid,
            original_mail_type: log.mail_type,
          },
        },
      },
    }).then((r) => ({ recipient, error: r.error ? String(r.error.message ?? r.error) : null }))
  ));

  const failed = results.filter((r) => r.error);
  console.log(`resend-email-log id=${emailLogId} ok=${results.length - failed.length}/${results.length}`);

  return new Response(JSON.stringify({
    ok: failed.length < results.length,
    sent: results.length - failed.length,
    failed,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
