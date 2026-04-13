

# Implementierungsplan: 6 Features für Reller Automobile

## Übersicht

Sechs Features werden implementiert: Fahrzeug-Vergleich, Preishistorie mit Detailseite, PDF-Exposé, Google Maps, Suchauftrag-Alerts und Dark/Light Mode Toggle. Die Umsetzung erfolgt in logischer Reihenfolge, da mehrere Features eine Fahrzeug-Detailseite benötigen.

---

## Feature 6: Dark/Light Mode Toggle (Grundlage)
Wird zuerst gebaut, damit alle weiteren Features direkt in beiden Modi funktionieren.

- **`src/index.css`**: Light-Mode CSS-Variablen unter `.light` hinzufügen (warmes Weiß #FAF8F5, weiße Cards, dunkler Text, gleiches Primary-Grün)
- **`src/hooks/useTheme.ts`**: Hook mit localStorage-Persistenz, `prefers-color-scheme`-Fallback, Default = dark. Toggelt `dark`/`light` Klasse auf `<html>`
- **`src/components/ThemeToggle.tsx`**: Sun/Moon Icon-Button
- **`src/components/Navbar.tsx`**: ThemeToggle in die Navbar integrieren
- **`src/index.css`**: `transition: background-color 200ms, color 200ms` auf body

## Feature 2 (Teilschritt): Fahrzeug-Detailseite
Wird als Basis für Preishistorie, PDF, Maps benötigt.

- **Route**: `/fahrzeug/:id` in `App.tsx`
- **`src/pages/VehicleDetail.tsx`**: Seite mit Bildergalerie (großes Hauptbild + Thumbnails), allen technischen Daten in 2-Spalten-Layout, Beschreibungstext
- **`src/hooks/useVehicle.ts`**: Einzelnes Fahrzeug per ID laden
- **`src/components/VehicleCard.tsx`**: Link zur Detailseite ergänzen (klick auf Karte navigiert)

## Feature 1: Fahrzeug-Vergleichsfunktion

- **`src/contexts/CompareContext.tsx`**: React Context mit State für bis zu 3 Fahrzeug-IDs, add/remove/clear Funktionen
- **`App.tsx`**: CompareProvider wrappen
- **`src/components/VehicleCard.tsx`**: Scales-Icon-Button "Vergleichen" hinzufügen, aktive Auswahl = primary Border/Glow
- **`src/components/CompareBar.tsx`**: Sticky Bottom-Bar mit Thumbnails, Zähler, "Vergleichen"- und "Leeren"-Button, erscheint bei ≥2 Auswahl
- **Route**: `/vergleich` in `App.tsx`
- **`src/pages/ComparePage.tsx`**: Vergleichstabelle — Spalten = Fahrzeuge (Bild oben), Zeilen = Titel, Preis, Baujahr, KM, PS (kW×1.36), Hubraum, Getriebe, Kraftstoff, Farbe, Karosserie, Zustand, Sitze, Klima. Bester numerischer Wert pro Zeile grün hinterlegt. Mobile: horizontal scrollbar.

## Feature 2 (komplett): Preishistorie / Marktvergleich

- **DB-Migration**: Neue Tabelle `price_history` (id UUID, vehicle_id FK, price integer, recorded_at timestamptz default now()). RLS: public SELECT, kein INSERT/UPDATE/DELETE für anon.
- **`supabase/functions/sync-vehicles/index.ts`**: Nach Upsert für jedes Fahrzeug prüfen ob letzter `price_history`-Eintrag existiert und sich der Preis geändert hat. Falls ja oder erster Eintrag: INSERT in `price_history`.
- **`src/hooks/usePriceHistory.ts`**: Hook der `price_history` für eine vehicle_id lädt
- **`src/components/PriceHistoryWidget.tsx`**: Recharts-Linien-Chart (primary-Farbe) bei >1 Datenpunkt, sonst Text "Preis seit Einstellung unverändert". Aktueller Preis prominent. Marktvergleich: Durchschnittspreis gleicher Marke ±3 Jahre aus DB berechnen, Pfeil grün (unter Schnitt) oder rot (über Schnitt).
- Integration auf `VehicleDetail.tsx`

## Feature 3: PDF-Exposé Generator

- **Dependency**: `@react-pdf/renderer` installieren
- **`src/components/VehicleExpose.tsx`**: React-PDF Dokument-Komponente:
  - Seite 1: Header (Reller Automobile GmbH, Adresse, Tel, E-Mail), Hauptbild, Titel, Preis
  - Seite 2: Weitere Bilder (4-6 Grid), technische Daten (2-Spalten-Tabelle), Beschreibung
  - Footer: Disclaimer + Firmendaten + Datum
  - Weißer Hintergrund, Primary als Akzent
- **`src/components/DownloadExposeButton.tsx`**: Button auf Detailseite, nutzt `@react-pdf/renderer`'s `pdf()` + `blob()` für clientseitigen Download. Dateiname: `[Marke]-[Modell]-Exposé.pdf`

## Feature 4: Google Maps Integration

- **`src/components/DealerLocation.tsx`**: Komponente mit:
  - Info-Block: "Besichtigung & Probefahrt", Adresse, Telefon (tel:-Link), E-Mail (mailto:-Link), Öffnungszeiten
  - Google Maps iframe (Embed API, kein API-Key nötig) mit festen Koordinaten 51.7148, 8.7538
  - "Route planen" Button → Google Maps Directions URL
- Integration auf `VehicleDetail.tsx`

## Feature 5: Fahrzeug-Alert / Suchauftrag

- **DB-Migration**: Neue Tabelle `vehicle_alerts` (id UUID, email text NOT NULL, name text, brand text, category text, body_type text, max_price integer, min_year text, max_mileage integer, is_active boolean default true, created_at timestamptz, last_notified_at timestamptz). RLS: anon kann INSERT, sonst nichts. Service_role voll.
- **`src/components/VehicleAlertDialog.tsx`**: Modal/Sheet mit Formular (Name, E-Mail, Marke-Dropdown, Kategorie, Karosserie, Max-Preis, Min-Baujahr, Max-KM, Datenschutz-Checkbox). Validierung mit Zod. Submit → Supabase INSERT → Success-Toast.
- **`src/components/FilterBar.tsx`** oder Index: Button "Suchauftrag erstellen" hinzufügen
- **`supabase/functions/check-alerts/index.ts`**: Edge Function die aktive Alerts gegen neue Fahrzeuge prüft, Matches loggt, `last_notified_at` updated
- **`supabase/functions/sync-vehicles/index.ts`**: Am Ende `check-alerts` aufrufen

---

## Technische Details

```text
Neue Dateien:
├── src/contexts/CompareContext.tsx
├── src/hooks/useTheme.ts
├── src/hooks/useVehicle.ts
├── src/hooks/usePriceHistory.ts
├── src/pages/VehicleDetail.tsx
├── src/pages/ComparePage.tsx
├── src/components/ThemeToggle.tsx
├── src/components/CompareBar.tsx
├── src/components/PriceHistoryWidget.tsx
├── src/components/VehicleExpose.tsx
├── src/components/DownloadExposeButton.tsx
├── src/components/DealerLocation.tsx
├── src/components/VehicleAlertDialog.tsx
└── supabase/functions/check-alerts/index.ts

Geänderte Dateien:
├── src/index.css (Light-Mode Variablen, Transition)
├── src/App.tsx (Routen, CompareProvider)
├── src/components/Navbar.tsx (ThemeToggle)
├── src/components/VehicleCard.tsx (Link + Vergleich-Button)
├── src/components/FilterBar.tsx (Suchauftrag-Button)
└── supabase/functions/sync-vehicles/index.ts (price_history + check-alerts)

DB-Migrationen:
├── price_history Tabelle + RLS
└── vehicle_alerts Tabelle + RLS

Neue Dependency:
└── @react-pdf/renderer
```

