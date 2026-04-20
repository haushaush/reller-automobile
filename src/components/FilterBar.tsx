import { memo, useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Search, SlidersHorizontal, ChevronDown, ChevronUp, X } from "lucide-react";

export interface Filters {
  search: string;
  category: string;
  brand: string;
  bodyType: string;
  yearFrom: string;
  yearTo: string;
  mileageFrom: string;
  mileageTo: string;
  sort: string;
  fuel: string;
  powerFrom: string;
  powerTo: string;
  gearbox: string;
  priceFrom: string;
  priceTo: string;
  color: string;
  status: string;
}

/** Filter-Option mit Raw-Wert (für interne Logik) und lesbarem Label (für Anzeige). */
export interface LabeledOption {
  raw: string;
  label: string;
}

interface FilterBarProps {
  filters: Filters;
  onFilterChange: (key: keyof Filters, value: string) => void;
  brands: string[];
  /** Karosserieformen — als `{raw,label}` für lesbare Mobile.de-Übersetzungen. */
  bodyTypes: LabeledOption[];
  categories?: string[];
  /** Kraftstoffe — als `{raw,label}`. */
  fuels?: LabeledOption[];
  /** Getriebe — als `{raw,label}`. */
  gearboxes?: LabeledOption[];
  colors?: string[];
  /** Show the "Kategorie" select. Hidden by default since most pages are pre-scoped via the route. */
  showCategorySelect?: boolean;
  /** When true, disables the sort dropdown (used while a search query forces relevance sort). */
  sortDisabled?: boolean;
}

/** Count how many filters (other than search/sort) are non-default. */
function countActiveFilters(f: Filters): number {
  let c = 0;
  if (f.category !== "all") c++;
  if (f.brand !== "all") c++;
  if (f.bodyType !== "all") c++;
  if (f.yearFrom) c++;
  if (f.yearTo) c++;
  if (f.fuel !== "all") c++;
  if (f.powerFrom) c++;
  if (f.powerTo) c++;
  if (f.gearbox !== "all") c++;
  if (f.priceFrom) c++;
  if (f.priceTo) c++;
  if (f.color !== "all") c++;
  if (f.status !== "available") c++;
  return c;
}

const FilterBar = memo(({ filters, onFilterChange, brands, bodyTypes, categories, fuels, gearboxes, colors, showCategorySelect = false, sortDisabled = false }: FilterBarProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);

  // The full filter form, reused inside the mobile bottom-sheet
  const renderFilterFields = (compact = false) => (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div
        className={
          compact
            ? "grid grid-cols-1 gap-3"
            : `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${showCategorySelect ? "lg:grid-cols-6" : "lg:grid-cols-5"} gap-3`
        }
      >
        {showCategorySelect && (
          <Select value={filters.category} onValueChange={(v) => onFilterChange("category", v)}>
            <SelectTrigger className="bg-secondary border-border text-foreground min-h-[44px]">
              <SelectValue placeholder="Kategorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kategorien</SelectItem>
              {(categories || ["Oldtimer", "Gebrauchtwagen"]).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={filters.brand} onValueChange={(v) => onFilterChange("brand", v)}>
          <SelectTrigger className="bg-secondary border-border text-foreground min-h-[44px]">
            <SelectValue placeholder="Marke" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Marken</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.bodyType} onValueChange={(v) => onFilterChange("bodyType", v)}>
          <SelectTrigger className="bg-secondary border-border text-foreground min-h-[44px]">
            <SelectValue placeholder="Karosserieform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Karosserieformen</SelectItem>
            {bodyTypes.map((bt) => (
              <SelectItem key={bt.raw} value={bt.raw}>{bt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Baujahr von"
          value={filters.yearFrom}
          onChange={(e) => onFilterChange("yearFrom", e.target.value)}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground min-h-[44px]"
        />
        <Input
          placeholder="Baujahr bis"
          value={filters.yearTo}
          onChange={(e) => onFilterChange("yearTo", e.target.value)}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground min-h-[44px]"
        />

        <Select
          value={filters.sort}
          onValueChange={(v) => onFilterChange("sort", v)}
          disabled={sortDisabled}
        >
          <SelectTrigger
            className={`bg-secondary border-border text-foreground min-h-[44px] ${sortDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
            title={sortDisabled ? "Während einer Suche wird nach Relevanz sortiert" : undefined}
          >
            <SelectValue placeholder="Sortierung" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Neueste zuerst</SelectItem>
            <SelectItem value="year-asc">Baujahr aufsteigend</SelectItem>
            <SelectItem value="year-desc">Baujahr absteigend</SelectItem>
            <SelectItem value="mileage-asc">KM aufsteigend</SelectItem>
            <SelectItem value="mileage-desc">KM absteigend</SelectItem>
            <SelectItem value="price-asc">Preis aufsteigend</SelectItem>
            <SelectItem value="price-desc">Preis absteigend</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Toggle advanced filters (desktop) — in compact/sheet mode always shown */}
      {!compact && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-muted-foreground hover:text-foreground text-xs gap-1.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Erweiterte Filter
          {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
      )}

      <div
        className={
          compact
            ? "grid grid-cols-1 gap-3"
            : `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 overflow-hidden transition-all duration-300 ${
                showAdvanced ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
              }`
        }
      >
        <Select value={filters.fuel} onValueChange={(v) => onFilterChange("fuel", v)}>
          <SelectTrigger className="bg-secondary border-border text-foreground min-h-[44px]">
            <SelectValue placeholder="Kraftstoff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kraftstoffe</SelectItem>
            {(fuels || []).map((f) => (
              <SelectItem key={f.raw} value={f.raw}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          placeholder="PS von"
          value={filters.powerFrom}
          onChange={(e) => onFilterChange("powerFrom", e.target.value)}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground min-h-[44px]"
        />
        <Input
          type="number"
          placeholder="PS bis"
          value={filters.powerTo}
          onChange={(e) => onFilterChange("powerTo", e.target.value)}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground min-h-[44px]"
        />

        <Select value={filters.gearbox} onValueChange={(v) => onFilterChange("gearbox", v)}>
          <SelectTrigger className="bg-secondary border-border text-foreground min-h-[44px]">
            <SelectValue placeholder="Getriebe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Getriebe</SelectItem>
            {(gearboxes || []).map((g) => (
              <SelectItem key={g.raw} value={g.raw}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          placeholder="Preis von €"
          value={filters.priceFrom}
          onChange={(e) => onFilterChange("priceFrom", e.target.value)}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground min-h-[44px]"
        />
        <Input
          type="number"
          placeholder="Preis bis €"
          value={filters.priceTo}
          onChange={(e) => onFilterChange("priceTo", e.target.value)}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground min-h-[44px]"
        />

        <Select value={filters.color} onValueChange={(v) => onFilterChange("color", v)}>
          <SelectTrigger className="bg-secondary border-border text-foreground min-h-[44px]">
            <SelectValue placeholder="Farbe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Farben</SelectItem>
            {(colors || []).map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.status} onValueChange={(v) => onFilterChange("status", v)}>
          <SelectTrigger className="bg-secondary border-border text-foreground min-h-[44px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="available">Verfügbar</SelectItem>
            <SelectItem value="sold">Verkauft</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Search bar — always visible */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Fahrzeug suchen..."
            value={filters.search}
            onChange={(e) => onFilterChange("search", e.target.value)}
            className="pl-10 bg-secondary border-border text-foreground placeholder:text-muted-foreground min-h-[44px]"
          />
        </div>

        {/* Mobile: bottom-sheet trigger */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="md:hidden gap-1.5 min-h-[44px] shrink-0 relative"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filter
              {activeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-5 min-w-5 flex items-center justify-center px-1">
                  {activeCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="h-[88vh] flex flex-col p-0"
          >
            <SheetHeader className="px-5 py-4 border-b border-border">
              <SheetTitle className="text-left flex items-center justify-between">
                <span>Filter {activeCount > 0 && `(${activeCount} aktiv)`}</span>
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {renderFilterFields(true)}
            </div>
            <div
              className="border-t border-border p-4 bg-background"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
              <Button
                onClick={() => setSheetOpen(false)}
                className="w-full min-h-[48px] font-semibold"
                size="lg"
              >
                Filter anwenden
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop / tablet: inline filters */}
      <div className="hidden md:block">{renderFilterFields(false)}</div>
    </div>
  );
});

FilterBar.displayName = "FilterBar";
export default FilterBar;
