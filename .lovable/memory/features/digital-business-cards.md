---
name: Digitale Visitenkarten
description: Persönliche Kartenseiten /karte/{slug} mit QR-Code, Terminformular, Spamschutz und Auswertung
type: feature
---
Verkäufer erhalten gedruckte Visitenkarten mit QR-Code auf `fahrzeuge.reller-automobile.de/karte/{slug}`.

- Daten: `sales_contacts` (Slug, Name, Funktion, E-Mail, Telefon, Mobil, Foto, `buttons` als JSON, aktiv, Reihenfolge, `card_printed_at`), `sales_contact_slug_redirects`, `appointment_requests`, `sales_card_events` (view/click).
- Slug ist die gedruckte Adresse: nach „Als gedruckt markiert" im Admin gesperrt; Änderung legt zwingend eine Weiterleitung an. Gedruckte Karten dürfen nie ins Leere führen.
- Öffentliche Seite `src/pages/SalesCard.tsx`: Foto, Name, Funktion, drei konfigurierbare Schaltflächen, Telefon-/Mail-Link, Impressum/Datenschutz. Inaktive oder unbekannte Karte → freundliche Hinweisseite, keine Fehlerseite.
- Die Verkäufer-Mailadresse steht NICHT im Seitenquelltext: Besucher haben keinen Lesezugriff auf die Spalte `email`; der Mail-Link holt die Adresse erst beim Klick über die Edge Function.
- Edge Function `submit-appointment-request` (verify_jwt=false): Honigtopf, Mindestverweildauer 3 s, 3 Anfragen je IP-Hash und Stunde, serverseitige Prüfung. Reihenfolge: erst speichern, dann Lead + `inquiry_received`, dann Mails. Verkäufermail mit Antwort-an = Kunde, Bestätigungsmail an den Kunden; bei Fehlschlag `mail_error` + Warnmail an die Benachrichtigungsempfänger.
- Posteingang: Terminanfragen erscheinen als Lead mit `source = BUSINESS_CARD` („Visitenkarte"), `lead_type = appointment`, Verkäufername in `internal_note`.
- Admin: Einstellungen → Visitenkarten (`src/pages/admin/SalesContacts.tsx`) mit Foto-Upload (privater Bucket `sales-contact-photos`, signierte Links), Schaltflächen-Konfiguration, QR-Code als PNG/SVG und Auswertung je Zeitraum.
