import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

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
}

interface FilterBarProps {
  filters: Filters;
  onFilterChange: (key: keyof Filters, value: string) => void;
  brands: string[];
  bodyTypes: string[];
}

const FilterBar = ({ filters, onFilterChange, brands, bodyTypes }: FilterBarProps) => {
  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Fahrzeug suchen..."
          value={filters.search}
          onChange={(e) => onFilterChange("search", e.target.value)}
          className="pl-10 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Filter dropdowns */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Select value={filters.category} onValueChange={(v) => onFilterChange("category", v)}>
          <SelectTrigger className="bg-secondary border-border text-foreground">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kategorien</SelectItem>
            <SelectItem value="Oldtimer">Oldtimer</SelectItem>
            <SelectItem value="Gebrauchtwagen">Gebrauchtwagen</SelectItem>
          </SelectContent>
        </Select>

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
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default FilterBar;
