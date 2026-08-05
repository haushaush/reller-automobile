---
name: Anfragen-Posteingang & Mobile.de Lead-API
description: Gemeinsamer Posteingang aus Portalformular und Mobile.de Lead-API, Cursor-Abruf, Statusrückmeldung, DSGVO-Löschung
type: feature
---
`/admin/anfragen` ist der gemeinsame Posteingang für Portal-Anfragen (`inquiries`) und Leads (`leads` + `lead_events`).

- Abruf: Edge Function `fetch-leads` (Cron alle 10 Min, Lock `mobile-de-leads`), GET `/lead-api/sellers/{sellerId}/events?cursor=`; Cursor je Konto in `platform_accounts.lead_cursor`, erster Lauf mit `0`, Fortschreibung erst nach erfolgreichem Speichern, max. 20 Seiten, `warnings` werden protokolliert.
- Idempotenz über `lead_events.event_id` (Upsert, ignoreDuplicates). Unbekannte Event-Typen werden roh gespeichert.
- Zugangsdaten: `lead_username_secret_name` / `lead_password_secret_name`, sonst Fallback auf die Seller-Secrets desselben Kontos. `lead_api_enabled` schaltet den Abruf frei. Test über `lead-api-check` (Einstellungen → „Verbindung prüfen").
- Antworten ist über die API NICHT möglich — die Oberfläche weist darauf hin und verlinkt zu Mobile.de.
- Statusrückmeldung über `update-lead-status` (IN_PROGRESS, SOLD, NOT_INTERESTED, SPAM). Beim Setzen eines Fahrzeugs auf „verkauft" wird nur NACH Rückfrage im Dialog auf SOLD gemeldet.
- AutoScout24/Sonstige werden über „Anfrage erfassen" von Hand angelegt (source AUTOSCOUT24 / MANUAL).
- Benachrichtigungen: `inquiry_received` für neue Leads, `missed_call` (immer sofort) für verpasste Anrufe.
- Personenbezogene Daten: RLS nur für Admins, keine Kontaktdaten in Logs (`safeError`), Einzellöschung im Detail, automatische Löschung von NOT_INTERESTED/SPAM nach 12 Monaten via `purge_old_leads()` (monatlicher Cron).
