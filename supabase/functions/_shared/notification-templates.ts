// Schlichte, gut lesbare interne Benachrichtigungen im Reller-Branding.
export const PORTAL_BASE = "https://fahrzeuge.reller-automobile.de";

export const EVENT_LABELS: Record<string, string> = {
  inquiry_received: "Neue Kundenanfrage",
  vehicle_sold: "Fahrzeug als verkauft markiert",
  vehicle_published: "Fahrzeug veröffentlicht",
  publish_failed: "Veröffentlichung fehlgeschlagen",
  story_generated: "Neue Story erzeugt",
  expose_created: "Exposé erstellt",
  quality_report: "Wöchentliche Datenqualität",
  open_tasks_reminder: "Offene Handgriffe",
};

export const EVENT_DESCRIPTIONS: Record<string, string> = {
  inquiry_received: "Sobald ein Kunde das Anfrageformular abschickt.",
  vehicle_sold: "Sobald ein Fahrzeug im Portal auf verkauft gesetzt wird.",
  vehicle_published: "Sobald ein Inserat erfolgreich bei Mobile.de erschienen ist.",
  publish_failed: "Wenn eine Veröffentlichung mit einem Fehler abbricht.",
  story_generated: "Sobald ein neues Story-Bild für WhatsApp erzeugt wurde.",
  expose_created: "Sobald ein Fahrzeug-PDF erstellt wurde.",
  quality_report: "Jeden Montag: Fahrzeuge mit fehlenden oder unsauberen Angaben.",
  open_tasks_reminder: "Täglich, wenn Handgriffe länger als 7 Tage offen sind.",
};

function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function euro(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

type Row = [string, string];

function rows(list: Row[]): string {
  return list
    .filter(([, v]) => v && v !== "—")
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;font-size:13px;white-space:nowrap;vertical-align:top;">${esc(k)}</td>` +
        `<td style="padding:4px 0;color:#111;font-size:13px;">${v}</td></tr>`,
    )
    .join("");
}

function card(heading: string, body: string): string {
  return `<div style="border:1px solid #e5e1dd;border-radius:8px;padding:16px;margin:0 0 12px;background:#ffffff;">
    <div style="font-size:15px;font-weight:600;color:#111;margin:0 0 8px;">${esc(heading)}</div>
    ${body}
  </div>`;
}

function list(items: string[]): string {
  if (items.length === 0) return "—";
  return `<ul style="margin:0;padding-left:18px;">${items.map((i) => `<li style="margin:2px 0;">${esc(i)}</li>`).join("")}</ul>`;
}

type Payload = Record<string, any>;

function renderEvent(eventType: string, p: Payload): string {
  switch (eventType) {
    case "vehicle_sold":
      return card(p.title || "Fahrzeug", rows([
        ["Verkaufspreis", euro(p.price)],
        ["Standtage", p.standDays != null ? `${p.standDays} Tage` : "—"],
        ["Automatisch beendet", list(p.endedListings ?? [])],
        ["Von Hand beenden", list(p.manualListings ?? [])],
      ]));
    case "publish_failed":
      return card(p.title || "Fahrzeug", rows([
        ["Plattform", esc(p.platform ?? "Mobile.de")],
        ["Konto", esc(p.account ?? "—")],
        ["Fehler", `<span style="color:#b3261e;">${esc(p.error ?? "Unbekannter Fehler")}</span>`],
      ]));
    case "vehicle_published":
      return card(p.title || "Fahrzeug", rows([
        ["Plattform", esc(p.platform ?? "Mobile.de")],
        ["Konto", esc(p.account ?? "—")],
        ["Inserat", p.url ? `<a href="${esc(p.url)}" style="color:#111;">Anzeige öffnen</a>` : "—"],
      ]));
    case "story_generated":
      return card(p.title || "Fahrzeug", rows([
        ["Story", p.storyUrl ? `<a href="${esc(p.storyUrl)}" style="color:#111;">Bild öffnen</a>` : "erzeugt"],
      ]));
    case "expose_created":
      return card(p.title || "Fahrzeug", rows([
        ["Exposé", p.exposeUrl ? `<a href="${esc(p.exposeUrl)}" style="color:#111;">PDF öffnen</a>` : "erstellt"],
      ]));
    case "inquiry_received":
      return card(`${p.name ?? "Anfrage"}`, rows([
        ["E-Mail", esc(p.email ?? "—")],
        ["Telefon", esc(p.phone ?? "—")],
        ["Fahrzeuge", list(p.vehicles ?? [])],
        ["Nachricht", esc(p.message ?? "—")],
      ]));
    case "open_tasks_reminder":
      return card("Offene Handgriffe", list(
        (p.tasks ?? []).map((t: Payload) =>
          `${t.vehicle ?? "Fahrzeug"} — ${t.platform ?? ""}: ${t.action ?? ""}${t.ageDays ? ` (seit ${t.ageDays} Tagen)` : ""}`
        ),
      ));
    case "quality_report":
      return card("Datenqualität", rows([
        ["Offene Punkte", esc(p.total ?? 0)],
        ["Details", list((p.issues ?? []).map((i: Payload) => `${i.label}: ${i.count}`))],
      ]));
    default:
      return card(EVENT_LABELS[eventType] ?? eventType, `<pre style="font-size:12px;color:#444;white-space:pre-wrap;margin:0;">${esc(JSON.stringify(p, null, 2))}</pre>`);
  }
}

export function renderNotificationEmail(
  eventType: string,
  events: Payload[],
  options?: { digest?: boolean; test?: boolean; ctaPath?: string },
): { subject: string; html: string } {
  const label = EVENT_LABELS[eventType] ?? eventType;
  const count = events.length;
  const prefix = options?.test ? "[Testmail] " : "";
  const subject = count > 1
    ? `${prefix}${label} — ${count} Vorgänge`
    : `${prefix}${label}`;

  const ctaPath = options?.ctaPath ?? defaultCtaPath(eventType);
  const body = events.map((e) => renderEvent(eventType, e ?? {})).join("");

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
    <div style="background:#111111;color:#ffffff;padding:20px 24px;border-radius:8px 8px 0 0;">
      <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.7;">Reller Automobile</div>
      <div style="font-size:20px;font-weight:600;margin-top:4px;">${esc(label)}</div>
      ${options?.digest ? '<div style="font-size:13px;opacity:.7;margin-top:4px;">Tageszusammenfassung</div>' : ""}
      ${options?.test ? '<div style="font-size:13px;opacity:.7;margin-top:4px;">Dies ist eine Testmail.</div>' : ""}
    </div>
    <div style="background:#faf8f5;padding:20px 24px;border:1px solid #e5e1dd;border-top:none;border-radius:0 0 8px 8px;">
      <p style="margin:0 0 16px;font-size:14px;color:#444;">
        ${count > 1 ? `${count} Vorgänge` : "1 Vorgang"} · ${esc(new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }))} Uhr
      </p>
      ${body}
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${esc(PORTAL_BASE + ctaPath)}"
           style="display:inline-block;background:#c8102e;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:600;">
          Im Portal öffnen
        </a>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#8a8a8a;text-align:center;">
        Interne Betriebsmeldung des Fahrzeugportals — kein Newsletter.
      </p>
    </div>
  </div>
</body></html>`;

  return { subject, html };
}

function defaultCtaPath(eventType: string): string {
  switch (eventType) {
    case "inquiry_received": return "/admin/anfragen";
    case "open_tasks_reminder": return "/admin/zu-erledigen";
    case "quality_report": return "/admin/einstellungen/datenqualitaet";
    case "story_generated": return "/admin/storys";
    case "expose_created": return "/admin/expose-archiv";
    default: return "/admin/fahrzeuge";
  }
}

export const SAMPLE_PAYLOADS: Record<string, Payload> = {
  inquiry_received: { name: "Max Mustermann", email: "max@example.de", phone: "0170 1234567", vehicles: ["BMW 320d Touring"], message: "Ist das Fahrzeug noch verfügbar?" },
  vehicle_sold: { title: "BMW 320d Touring", price: 24900, standDays: 42, endedListings: ["Mobile.de"], manualListings: ["AutoScout24", "Kleinanzeigen"] },
  vehicle_published: { title: "BMW 320d Touring", platform: "Mobile.de", account: "Reller Gebrauchtwagen", url: "https://www.mobile.de/" },
  publish_failed: { title: "BMW 320d Touring", platform: "Mobile.de", account: "Reller Gebrauchtwagen", error: "Preis liegt außerhalb des gültigen Bereichs" },
  story_generated: { title: "BMW 320d Touring", storyUrl: PORTAL_BASE + "/admin/storys" },
  expose_created: { title: "BMW 320d Touring", exposeUrl: PORTAL_BASE + "/admin/expose-archiv" },
  quality_report: { total: 3, issues: [{ label: "Fotos fehlen", count: 2 }, { label: "Preis fehlt", count: 1 }] },
  open_tasks_reminder: { tasks: [{ vehicle: "BMW 320d Touring", platform: "AutoScout24", action: "Inserat beenden", ageDays: 9 }] },
};
