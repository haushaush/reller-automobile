---
name: Categories & Hub
description: 4 UI buckets, CATEGORIES def in src/lib/categories.ts, hub page, useVehicleCounts hook
type: feature
---

## UI buckets (4 cards on Hub `/`)
- `oldtimer` → db categories `oldtimer` + `youngtimer` (combined)
- `gebrauchtwagen` → db `used`
- `unfallwagen` → db `accident`
- `nutzfahrzeuge` → db `commercial`

Defined in `src/lib/categories.ts` (CATEGORIES array, slug + dbCategories + image + description).

## Routes
- `/` → `Hub.tsx` — 2x2 grid of category cards with counts via `useVehicleCounts`
- `/fahrzeuge/:category` → `CategoryPage.tsx` — calls `VehicleListPage` pre-scoped to one bucket; FilterBar hides Kategorie-Select.
- `/fahrzeuge` → `AllVehiclesPage` (also in CategoryPage.tsx) — all vehicles with Kategorie-Select shown.

## Hooks
- `useVehicleCounts` — TanStack query, 5min staleTime, fires `head: true, count: exact` per bucket in parallel + total.
- `useVehicles` — extended Vehicle interface with `vehicle_category: string | null`.
- `deriveVehicleCategory()` in categories.ts — fallback when DB row has NULL.

## Categorization rules (sync + SQL backfill + FE derive — all match)
1. accident — only set by sync-accident-vehicles
2. commercial — body_type ∈ {Van, Transporter, Kastenwagen, Pritschenwagen, Kleinbus, LKW, Sattelzugmaschine, Kipper} OR category contains "transporter"/"nutzfahrzeug"
3. oldtimer — year ≤ currentYear - 30
4. youngtimer — year ≤ currentYear - 20
5. used — default
