import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Filters } from "@/components/FilterBar";

interface ActiveFiltersProps {
  filters: Filters;
  onRemove: (key: keyof Filters) => void;
  onResetAll: () => void;
}

const filterLabels: Partial<Record<keyof Filters, string>> = {
  category: "Kategorie",
  brand: "Marke",
  bodyType: "Karosserieform",
  yearFrom: "Baujahr ab",
  yearTo: "Baujahr bis",
  search: "Suche",
  fuel: "Kraftstoff",
  powerFrom: "PS ab",
  powerTo: "PS bis",
  gearbox: "Getriebe",
  priceFrom: "Preis ab",
  priceTo: "Preis bis",
  color: "Farbe",
  status: "Status",
};

const selectFilters: (keyof Filters)[] = ["category", "brand", "bodyType", "fuel", "gearbox", "color", "status"];

const ActiveFilters = memo(({ filters, onRemove, onResetAll }: ActiveFiltersProps) => {
  const activeKeys = (Object.keys(filterLabels) as (keyof Filters)[]).filter((key) => {
    const v = filters[key];
    if (!v) return false;
    if (selectFilters.includes(key)) return v !== "all" && v !== "available";
    return true;
  });

  if (activeKeys.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {activeKeys.map((key) => (
        <Badge
          key={key}
          variant="secondary"
          className="gap-1 px-3 py-1.5 text-xs bg-primary/20 text-primary border-primary/30 hover:bg-primary/30 cursor-pointer"
          onClick={() => onRemove(key)}
        >
          {filterLabels[key]}: {filters[key]}
          <X className="h-3 w-3" />
        </Badge>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={onResetAll}
        className="text-muted-foreground hover:text-foreground text-xs"
      >
        Alle Filter zurücksetzen
      </Button>
    </div>
  );
});

ActiveFilters.displayName = "ActiveFilters";
export default ActiveFilters;
