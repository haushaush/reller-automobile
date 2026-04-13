

# Plan: Alle Bilder pro Fahrzeug von Mobile.de laden

## Problem
Die Search-API (`/search-api/search`) liefert nur 1 Hauptbild pro Inserat. Alle Bilder sind nur über den Detail-Endpoint verfügbar.

## Lösung
Die `sync-vehicles` Edge Function erweitern, sodass nach dem Search-Request für jedes Fahrzeug einzeln der Detail-Endpoint aufgerufen wird.

## Änderungen

### `supabase/functions/sync-vehicles/index.ts`
1. Nach dem Parsen der Search-Ergebnisse (100 Ads mit je 1 Bild): Für jedes Fahrzeug einen GET-Request an `https://services.mobile.de/search-api/ad/{mobile_de_id}` senden
2. Aus der Detail-XML alle `<ad:image>`-Blöcke parsen (die bestehende `parseImages`-Funktion funktioniert bereits korrekt dafür)
3. Die `image_urls` im jeweiligen VehicleRow mit den vollständigen Bildern ersetzen
4. Requests mit kleinem Delay (z.B. 100-200ms) oder in Batches von 5-10 parallel ausführen, um die Mobile.de API nicht zu überlasten
5. Fehler bei einzelnen Detail-Requests graceful handlen — das eine Hauptbild aus der Suche behalten falls der Detail-Request fehlschlägt

### Performance-Überlegung
- 100 Fahrzeuge × 1 Detail-Request = 100 zusätzliche API-Calls pro Sync
- Bei Batches von 10 parallel mit 200ms Pause dazwischen: ~2 Sekunden extra
- Edge Function Timeout (max 60s) sollte ausreichen

### Kein DB-Schema-Change nötig
Das `image_urls` Feld ist bereits ein `text[]` Array und kann mehrere URLs aufnehmen.

