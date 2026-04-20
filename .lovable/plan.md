

# Feedback-Runde: Portal-Überarbeitung

11 Feedback-Punkte vom Kunden in sinnvoller Reihenfolge. Plan minimiert Risiko für bestehende Features (Favoriten, Vergleich, Anfrage-Korb).

## 1. Startseite-Redesign (Hub + Gesamt-Übersicht)

`src/pages/Hub.tsx` komplett ersetzen:
- Header zentriert, ohne Paragraph
- 4 schlichte Karten in Grid (2x2 Desktop, 1x4 Mobile): nur Kategorie-Name + kleine graue Counter-Zeile ("56 Fahrzeuge"), subtle Border, Hover-Effekt (Border → primary, leichte Hebung). Keine Bilder, keine Beschreibungen, kein "& Service".
- Direkt darunter: gleiche FilterBar + Vehicle-Grid + Pagination wie auf Kategorie-Seiten (zeigt ALLE Fahrzeuge gemischt).
- Implementation: Inhalt der `AllVehiclesPage`-Logik aus `CategoryPage.tsx` als `<VehicleListGrid>`-Sub-Komponente extrahieren und in Hub einbinden, damit DRY bleibt.

Karten-Texte: "Old- & Youngtimer", "Gebraucht- & Jahreswagen", "Unfallwagen", "Nutzfahrzeuge".

## 2. Oldtimer-Seite final bereinigen

Aktuelles Verhalten geprüft: kein `oldtimer-theme`/`Playfair`/`#c9a961`/Leder-Bild mehr im Code. Der Kunde sieht vermutlich noch eine alte gecachte Version oder Browser-Cache.
- Sicherheitshalber den Playfair-Display-Font aus `index.html` Google-Fonts-URL entfernen, damit er garantiert nirgends mehr verfügbar ist.
- `index.css` und `tailwind.config.ts` final auf Reste durchsuchen und ggf. entfernen.

**Quick-Filter-Tabs (NEU als Ausnahme, im Standard-Style):**
- Auf Oldtimer-Route oberhalb des Grids 3 Tabs: "Alle Klassiker | Oldtimer (30+ Jahre) | Youngtimer (20–30 Jahre)"
- Implementiert via neuem optionalen Prop `quickTabs` in `VehicleListPage`, der `categoryFilter` zur Laufzeit verändert.
- Styling: Standard-Schrift, aktiver Tab mit 2px Red-Underline, kein Italic.

## 3. Kategorie-Header vereinheitlichen

`VehicleListPage.tsx` Header-Block:
- Padding `py-12` statt `py-20`
- `eyebrow` komplett entfernen (Prop bleibt für Rückwärtskompatibilität, wird aber ignoriert)
- Titel pro Kategorie in `categories.ts` aktualisieren: "Old- & Youngtimer" (mit Bindestrich + &), "Gebraucht- & Jahreswagen", "Unfallwagen", "Nutzfahrzeuge".

## 4. Navigation überarbeiten

`Navbar.tsx`:
- Dropdown "Fahrzeuge" entfernen, stattdessen 4 direkte Links für die Kategorien
- Externe Links ("Werkstatt & Services", "Für Unternehmen", "Karriere", "Über Uns") entfernen
- Letzter Eintrag: "← Zurück zur Website" → `https://reller-automobile.de`
- Inhalt zentriert (Logo links, Nav mittig, Actions rechts via 3-Spalten-Layout)
- Mobile-Menü entsprechend anpassen

## 5. Footer

`VehicleListPage`-Footer + Hub-Footer + Detail-/Compare-Pages: zusätzlichen mittigen Link "Zur Hauptwebsite" → `https://reller-automobile.de` ergänzen.

## 6. Smarte Suche (Fuzzy Matching)

Neuer Hook `src/hooks/useFuzzySearch.ts`:
- Library: **Fuse.js** (klein, ~6kB, gut getestet)
- Normalisierung: Leerzeichen, Bindestriche, Sonderzeichen entfernen, lowercase
- Suche in Feldern: `title`, `model_description`, `brand`, `model`
- Threshold 0.4 (~60% Similarity), `ignoreLocation: true`, `useExtendedSearch: false`, alle Wörter unabhängig (Token-basiert)
- Integration: in `VehicleListPage` ersetzt aktuelle `filters.search`-Filterlogik durch Fuse-Resultat (nur wenn Query gesetzt).

## 7. Scroll-Verhalten Fix

`VehicleListPage.tsx`:
- Neuer Ref `filterBarRef` auf den FilterBar-Container
- `goToPage` ruft `useEffect` mit `currentPage`-Dependency, der nach State-Commit scrollt → behebt First-Click-Bug (aktuell scrollt synchron VOR Re-Render).
- Scroll-Logik: `window.scrollTo({ top: filterBarRef.current.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" })` (80px Navbar-Offset).

## 8. Nutzfahrzeuge Herz-Icon

Bug-Analyse: `VehicleCard` zeigt Herz immer, daher liegt Issue evtl. an verkauften Nutzfahrzeugen oder am Carousel-Z-Index. Fix:
- Z-Index der Heart-/Compare-Buttons sicherstellen (`z-30` statt `z-20`), damit sie auch über `ImageCarousel` hinweg klickbar sind.
- Bei verkauften Fahrzeugen Herz im disabled-Look (bleibt sichtbar).

## 9. Detailseite — Anfrage-Button + Bildnavigation

`VehicleDetail.tsx`:
- **Layout-Umbau**: Right-Sidebar bekommt eine neue oberste Karte `VehicleSummaryCard` mit:
  - Title, Brand, Preis (groß, primary)
  - Direkt darunter: prominenter "Jetzt Fahrzeug anfragen" Button (Red, Pill, full-width)
  - Darunter dezent: Exposé-Download + Mobile.de-Link
- Linke Spalte zeigt nur noch Bilder, Specs, Beschreibung (ohne Action-Row).
- **Bild-Pfeile**: Links/Rechts auf Hauptbild halbtransparente runde Buttons (`<` / `>`, 40px, weiß, `bg-black/40`, immer sichtbar). Wechseln `selectedImage` zyklisch.
- **Sticky-Bar Padding-Fix**: `pb-32` auf Hauptcontainer, damit `InquiryBar` am Boden nichts verdeckt.

## 10. Vergleichsseite Hover-Dimming entfernen

`ComparePage.tsx`:
- `hoveredCol`-State + alle `onMouseEnter`/`onMouseLeave` + `isDimmed`/`opacity`-Logik entfernen
- Best-Badges, Layout, Typografie bleiben unverändert

## 11. Performance

- `React.memo` auf `ImageCarousel`, `FilterBar`, `ActiveFilters` (VehicleCard ist bereits memoized)
- `loading="lazy"` auf alle Bilder (ImageCarousel, VehicleDetail-Thumbnails, ComparePage-Bilder)
- **Code-Splitting**: Routen via `React.lazy` + `<Suspense>` in `App.tsx` (außer Hub als Initial-Route)
- **Supabase Selects**: in `useVehicles`/`useVehicle` explizite Spaltenliste statt `select("*")`
- TanStack Query `staleTime: 5 * 60 * 1000` global im `QueryClient`
- Bundle-Audit: ungenutzte UI-Komponenten in `src/components/ui/` werden vom Tree-Shaker entfernt (kein manueller Eingriff nötig); jspdf nur in `DownloadExposeButton` lazy-importieren.

## Technische Reihenfolge

1. `categories.ts` Titel + Hub-Texte
2. `VehicleListPage` Header + Scroll-Fix + Quick-Tabs-Prop + Fuse-Integration
3. `Hub.tsx` neu mit eingebettetem Grid
4. Oldtimer-Cleanup (Font + CSS-Reste)
5. `Navbar.tsx` neu strukturiert
6. Footer-Link in Page-Footers
7. `VehicleCard` Z-Index-Fix
8. `VehicleDetail.tsx` Sidebar-Umbau + Bildpfeile + Padding
9. `ComparePage.tsx` Hover-Logik entfernen
10. Performance-Pass (lazy routes, memo, staleTime, select-Spalten)

## Kompatibilität

- Favoriten / Vergleich / Anfrage-Korb-Contexts unverändert
- TypeScript strict bleibt
- Keine DB-Änderungen nötig
- Fuse.js neu in `package.json`

