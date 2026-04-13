

## Fahrzeug-Listing-Seite für Reller Automobile

### Überblick
Eine elegante, premium Single Page Application für ein Oldtimer-Autohaus mit dunklem Leder-Design, Filterung, Suche, Sortierung und Pagination.

### Design & Styling
- Dunkler Espresso-Hintergrund (#2C1810) mit warmem, edlem Farbschema
- Playfair Display (Google Font) für Überschriften, elegante Serif-Optik
- Braune Fahrzeugkarten mit weißer Typografie und subtilen Schatten
- Hover-Zoom auf Fahrzeugbildern, smooth Animationen bei Filteränderungen

### Komponenten-Struktur
1. **Header-Section** — Zentrierter Textbereich mit Caps-Subline, Hauptüberschrift und Untertitel
2. **FilterBar** — Dropdowns für Kategorie, Marke, Karosserieform, Baujahr-Bereich, KM-Bereich + Suchfeld + Sortierung
3. **ActiveFilters** — Tags/Chips mit X zum Entfernen + "Alle zurücksetzen"
4. **VehicleGrid** — 2-Spalten (Desktop) / 1-Spalte (Mobile) mit animierten Karten
5. **VehicleCard** — Bild (16:9 mit Hover-Zoom), Titel, 3 Detail-Zeilen mit ">" Prefix
6. **Pagination** — Zurück/Nächste, "Seite X von Y", "X Fahrzeuge gefunden", Smooth Scroll

### Daten
- JSON-Array mit 12 Beispielfahrzeugen (Mix Oldtimer/Gebrauchtwagen)
- Marken: BMW, Fiat, Auto Union, Austin-Healey, Mercedes-Benz, Porsche, VW, Jaguar etc.
- Platzhalter-Bilder von Unsplash (Oldtimer-Fotos)

### Funktionalität
- Echtzeit-Filterung und Suche via useState/useMemo
- Sofortige Anwendung ohne Submit-Button
- Sortierung nach Baujahr/Kilometerstand
- Pagination mit 4 Fahrzeugen pro Seite, konfigurierbarer Page-Size
- Responsive Design für Desktop, Tablet, Mobile

