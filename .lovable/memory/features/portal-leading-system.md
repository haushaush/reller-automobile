---
name: Portal ist führendes System für Fahrzeuge
description: Architektur-Umkehr — vehicles im Portal ist Quelle der Wahrheit, Mobile.de wird gepusht, Pull-Sync nur noch Abgleich
type: feature
---
Das Portal (Tabelle `vehicles`) ist das führende System, nicht Mobile.de.

- Anlegen/Bearbeiten unter `/admin/fahrzeuge/neu` bzw. `/admin/fahrzeuge/:vehicleId/inserat`; `mobile_ad_drafts` und die alten `/admin/mobile-ad`-Seiten sind entfernt.
- Statusfeld `publish_status`: draft, publishing, published, out_of_sync, publish_error, unpublished.
- Push-Richtung: `publish-mobile-ad`, `update-mobile-ad`, `delete-mobile-ad` arbeiten mit `vehicleId`; jede API-Kommunikation landet in `mobile_push_log`.
- `sync-vehicles` / `sync-accident-vehicles` legen KEINE Fahrzeuge mehr an und überschreiben nichts — sie melden nur Abweichungen in `mobile_reconciliation_issues` (orphan_ad, ad_missing, price_drift, mileage_drift).
- `adopt-mobile-ads` ist die einmalige Bestandsübernahme (dryRun → apply), bedienbar über /admin/sync.
- Löschen bei Mobile.de entfernt das Fahrzeug NICHT im Portal, sondern setzt `publish_status = unpublished`.
