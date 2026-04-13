

## Mobile.de API-Integration mit regelmäßigem Sync

### Überblick
Die statischen Fahrzeugdaten werden durch eine Anbindung an die Mobile.de Seller/Search-API ersetzt. Ein Supabase Edge Function holt regelmäßig die aktuellen Inserate ab und speichert sie in einer Supabase-Datenbank. Das Frontend liest die Daten dann von dort.

### Architektur

```text
Mobile.de API  ──(HTTP Basic Auth)──>  Edge Function (sync-vehicles)
                                            │
                                            ▼
                                     Supabase DB (vehicles table)
                                            │
                                            ▼
                                     Edge Function (get-vehicles)
                                            │
                                            ▼
                                     React Frontend
```

### Voraussetzungen
- **Lovable Cloud aktivieren** (Supabase-Datenbank + Edge Functions)
- **Mobile.de API-Credentials** als Secrets hinterlegen:
  - `MOBILE_DE_USERNAME` -- API-Benutzername
  - `MOBILE_DE_PASSWORD` -- API-Passwort
  - `MOBILE_DE_SELLER_KEY` -- Händler-ID bei Mobile.de

### Schritt 1: Datenbank-Tabelle anlegen
Eine `vehicles`-Tabelle in Supabase mit Spalten passend zur Mobile.de API-Antwort:
- `id` (UUID, Primary Key)
- `mobile_de_id` (text, unique) -- ID des Inserats bei Mobile.de
- `title` (text)
- `category` (text)
- `brand` (text)
- `model` (text)
- `body_type` (text)
- `year` (text)
- `mileage` (integer)
- `price` (integer, optional)
- `currency` (text)
- `image_urls` (text array)
- `description` (text)
- `synced_at` (timestamp)
- RLS aktiviert mit öffentlicher Lesefreigabe

### Schritt 2: Edge Function `sync-vehicles`
- Ruft die Mobile.de Seller-API ab (`https://services.mobile.de/seller-api/sellers/{sellerKey}/ads`)
- HTTP Basic Auth mit den gespeicherten Credentials
- Parst die XML/JSON-Antwort und mappt die Felder auf die DB-Struktur
- Upsert (einfügen/aktualisieren) in die `vehicles`-Tabelle
- Entfernt Fahrzeuge, die nicht mehr in der API-Antwort sind
- Kann manuell oder per externem Cron (z.B. cron-job.org) stündlich aufgerufen werden

### Schritt 3: Frontend-Anpassung
- `src/data/vehicles.ts` wird durch einen API-Aufruf ersetzt
- Neuer Custom Hook `useVehicles()` mit `@tanstack/react-query` zum Laden der Daten aus Supabase
- Die `Vehicle`-Interfaces werden um Preis, Modell und Beschreibung erweitert
- FilterBar und VehicleCard werden an die erweiterten Felder angepasst
- Ladeindikator (Skeleton) während die Daten geladen werden

### Schritt 4: Periodischer Sync
Da Supabase Edge Functions keinen eingebauten Cron haben, gibt es zwei Optionen:
1. **Externer Cron-Service** (z.B. cron-job.org, Easycron) der stündlich die `sync-vehicles`-Funktion aufruft
2. **pg_cron** in Supabase (falls auf dem Plan verfügbar) als DB-basierter Scheduler

### Technische Details
- Mobile.de Seller-API verwendet **HTTP Basic Auth** und liefert **XML**-Antworten
- Die Edge Function parsed XML mit einem Deno-kompatiblen XML-Parser
- Die Supabase-Tabelle wird per Upsert aktualisiert (basierend auf `mobile_de_id`)
- Das Frontend nutzt den Supabase JS-Client für direkte DB-Abfragen mit RLS

