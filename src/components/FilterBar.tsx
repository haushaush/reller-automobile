import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";

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

interface FilterBarProps {
  filters: Filters;
  onFilterChange: (key: keyof Filters, value: string) => void;
  brands: string[];
  bodyTypes: string[];
  categories?: string[];
  fuels?: string[];
  gearboxes?: string[];
  colors?: string[];
  /** Show the "Kategorie" select. Hidden by default since most pages are pre-scoped via the route. */
  showCategorySelect?: boolean;
}

const FilterBar = ({ filters, onFilterChange, brands, bodyTypes, categories, fuels, gearboxes, colors, showCategorySelect = false }: FilterBarProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Fahrzeug suchen..."
          value={filters.search}
          onChange={(e) => onFilterChange("search", e.target.value)}
          className="pl-10 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${showCategorySelect ? "lg:grid-cols-6" : "lg:grid-cols-5"} gap-3`}>
        {showCategorySelect && (
          <Select value={filters.category} onValueChange={(v) => onFilterChange("category", v)}>
            <SelectTrigger className="bg-secondary border-border text-foreground">
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
          <SelectTrigger className="bg-secondary border-border text-foreground">
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
          <SelectTrigger className="bg-secondary border-border text-foreground">
            <SelectValue placeholder="Karosserieform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Karosserieformen</SelectItem>
            {bodyTypes.map((bt) => (
              <SelectItem key={bt} value={bt}>{bt}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Baujahr von"
          value={filters.yearFrom}
          onChange={(e) => onFilterChange("yearFrom", e.target.value)}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
        />
        <Input
          placeholder="Baujahr bis"
          value={filters.yearTo}
          onChange={(e) => onFilterChange("yearTo", e.target.value)}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
        />

        <Select value={filters.sort} onValueChange={(v) => onFilterChange("sort", v)}>
          <SelectTrigger className="bg-secondary border-border text-foreground">
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

      {/* Toggle advanced filters */}
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

      {/* Advanced filters row */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 overflow-hidden transition-all duration-300 ${
          showAdvanced ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <Select value={filters.fuel} onValueChange={(v) => onFilterChange("fuel", v)}>
          <SelectTrigger className="bg-secondary border-border text-foreground">
            <SelectValue placeholder="Kraftstoff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kraftstoffe</SelectItem>
            {(fuels || []).map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          placeholder="PS von"
          value={filters.powerFrom}
          onChange={(e) => onFilterChange("powerFrom", e.target.value)}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
        />
        <Input
          type="number"
          placeholder="PS bis"
          value={filters.powerTo}
          onChange={(e) => onFilterChange("powerTo", e.target.value)}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
        />

        <Select value={filters.gearbox} onValueChange={(v) => onFilterChange("gearbox", v)}>
          <SelectTrigger className="bg-secondary border-border text-foreground">
            <SelectValue placeholder="Getriebe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Getriebe</SelectItem>
            {(gearboxes || []).map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          placeholder="Preis von €"
          value={filters.priceFrom}
          onChange={(e) => onFilterChange("priceFrom", e.target.value)}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
        />
        <Input
          type="number"
          placeholder="Preis bis €"
          value={filters.priceTo}
          onChange={(e) => onFilterChange("priceTo", e.target.value)}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
        />

        <Select value={filters.color} onValueChange={(v) => onFilterChange("color", v)}>
          <SelectTrigger className="bg-secondary border-border text-foreground">
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
          <SelectTrigger className="bg-secondary border-border text-foreground">
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
};

export default FilterBar;
