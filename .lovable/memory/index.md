# Project Memory

## Core
React SPA, TypeScript, Tailwind, Supabase, TanStack Query.
Client-side filtering/sorting for max performance. Mock data fallback.
Match reller-automobile.de: Black/White (#FAF8F5) theme, Lora/Instrument Sans.
Header/footer copy official site. Nav red CTA: 'Aktueller Fahrzeugbestand'.
Green primary accent, Red (#da1b1e) for status (Sold, Favorites, Hub eyebrow).
Routes: / = Hub (4 categories), /fahrzeuge = all, /fahrzeuge/:slug = bucket.
vehicle_category persisted in DB ('oldtimer'|'youngtimer'|'used'|'accident'|'commercial'). Sync writes it; FE has deriveVehicleCategory fallback.

## Memories
- [Tech Stack & Data](mem://tech/stack) — SPA setup, Supabase, TanStack Query, client-side filtering, mock fallback
- [Vehicle Schema](mem://data/vehicle-schema) — Supabase vehicles table matching Mobile.de Search-API 1:1
- [Branding & Styling](mem://style/branding) — Colors, typography, theme toggling, and logo CSS filters
- [Company Details](mem://company/details) — Reller Automobile GmbH contact, location, and hours for Exposé/Maps
- [Premium Extensions](mem://features/premium-extensions) — Compare 3 cars, PDF Exposé, alerts edge function, price history charts
- [Vehicle Listing](mem://features/vehicle-listing) — Grid, 5-image carousel, sold vehicle styling and sorting, FilterBar
- [Mobile.de Sync](mem://integrations/mobile-de-sync) — 2-stage API sync, batching, soft-deletes (is_sold: true), triggers alerts. Two accounts: main (sync-vehicles) + accident (sync-accident-vehicles, ID prefix 'accident_', secrets MOBILE_DE_ACCIDENT_USERNAME/PASSWORD). Each sync only touches its own vehicle_category scope.
- [Favorites System](mem://features/favorites-system) — LocalStorage, Heart icon animations, context, side drawer
- [Categories & Hub](mem://features/categories-hub) — 4 UI buckets, CATEGORIES def in src/lib/categories.ts, hub page, useVehicleCounts hook
