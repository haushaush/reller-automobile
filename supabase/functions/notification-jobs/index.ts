// Cron-Job: erzeugt zeitgesteuerte Ereignisse.
// - täglich 08:00 (Berlin): Erinnerung an Handgriffe, die älter als 7 Tage sind
// - montags 08:00 (Berlin): Zusammenfassung der offenen Datenqualitätsprobleme
import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/mail-config.ts";

const QUALITY_TITLES: Record<string, string> = {
  no_images: "Keine Fotos hinterlegt",
  few_images: "Wenige Fotos",
  no_price: "Kein Preis angegeben",
  price_too_low: "Preis wirkt zu niedrig",
  no_first_registration: "Erstzulassung fehlt",
  invalid_first_registration: "Erstzulassung unstimmig",
  no_mileage: "Kilometerstand fehlt",
  no_description: "Beschreibung fehlt",
  short_description: "Beschreibung sehr kurz",
  no_power: "Leistung fehlt",
  no_fuel: "Kraftstoff fehlt",
  no_gearbox: "Getriebe fehlt",
};

const PLATFORM_LABEL: Record<string, string> = {
  mobile_de: "Mobile.de",
  autoscout24: "AutoScout24",
  kleinanzeigen: "Kleinanzeigen",
};

const ACTION_LABEL: Record<string, string> = {
  end_listing: "Inserat beenden",
  update_price: "Preis anpassen",
  mark_reserved: "Als reserviert kennzeichnen",
  reactivate: "Inserat wieder aktivieren",
};

function berlinWeekday(now: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", weekday: "short" }).format(now);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = serviceClient();
  const now = new Date();
  const summary: Record<string, unknown> = {};

  let mode: string | null = null;
  try {
    const body = await req.json();
    mode = typeof body?.mode === "string" ? body.mode : null;
  } catch { /* cron sendet leeren Body */ }

  try {
    // ---- Offene Handgriffe, älter als 7 Tage ----
    if (!mode || mode === "open_tasks") {
      const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();
      const { data: tasks } = await admin
        .from("listing_tasks")
        .select("id, action, created_at, vehicle_id, listing_id, vehicles(title), listings(platform)")
        .is("done_at", null)
        .is("dismissed_at", null)
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(100);

      if (tasks && tasks.length > 0) {
        const payload = {
          tasks: tasks.map((t: any) => ({
            vehicle: t.vehicles?.title ?? "Fahrzeug",
            platform: PLATFORM_LABEL[t.listings?.platform] ?? t.listings?.platform ?? "—",
            action: ACTION_LABEL[t.action] ?? t.action,
            ageDays: Math.floor((now.getTime() - new Date(t.created_at).getTime()) / 86_400_000),
          })),
        };
        await admin.from("notification_events").insert({ event_type: "open_tasks_reminder", payload });
      }
      summary.open_tasks = tasks?.length ?? 0;
    }

    // ---- Datenqualität, montags ----
    if (mode === "quality" || (!mode && berlinWeekday(now) === "Mon")) {
      const { data: issues } = await admin
        .from("vehicle_quality_issues")
        .select("issue_type")
        .is("resolved_at", null)
        .limit(2000);

      const counts = new Map<string, number>();
      for (const i of (issues ?? []) as any[]) {
        counts.set(i.issue_type, (counts.get(i.issue_type) ?? 0) + 1);
      }
      if (counts.size > 0) {
        const payload = {
          total: issues?.length ?? 0,
          issues: [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => ({ label: QUALITY_TITLES[type] ?? type, count })),
        };
        await admin.from("notification_events").insert({ event_type: "quality_report", payload });
      }
      summary.quality_issues = issues?.length ?? 0;
    }

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notification-jobs failed:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
