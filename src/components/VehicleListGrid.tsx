import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useVehicles, Vehicle } from "@/hooks/useVehicles";
import { vehicles as staticVehicles } from "@/data/vehicles";
import { deriveVehicleCategory, VehicleCategoryKey } from "@/lib/categories";
import { useFuzzySearch } from "@/hooks/useFuzzySearch";
import { calculateRelevanceScore } from "@/lib/relevanceScore";
import VehicleCard from "@/components/VehicleCard";
import FilterBar, { Filters } from "@/components/FilterBar";
import ActiveFilters from "@/components/ActiveFilters";
import VehicleAlertDialog from "@/components/VehicleAlertDialog";
import CategoryQuickTabs, { QuickTabOption } from "@/components/CategoryQuickTabs";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  toLabelOptions,
  getBodyTypeLabel,
  getFuelLabel,
  getGearboxLabel,
} from "@/lib/mobileDeLabels";

const ITEMS_PER_PAGE = 8;

const defaultFilters: Filters = {
  search: "",
  category: "all",
  brand: "all",
  bodyType: "all",
  yearFrom: "",
  yearTo: "",
  mileageFrom: "",
  mileageTo: "",
  sort: "newest",
  fuel: "all",
  powerFrom: "",
  powerTo: "",
  gearbox: "all",
  priceFrom: "",
  priceTo: "",
  color: "all",
  status: "available",
};

const selectFilterKeys: (keyof Filters)[] = [
  "category",
  "brand",
  "bodyType",
  "sort",
  "fuel",
  "gearbox",
  "color",
  "status",
];

function mapStaticVehicles(statics: typeof staticVehicles): Vehicle[] {
  return statics.map((v) => ({
    id: String(v.id),
    mobile_de_id: String(v.id),
    title: v.title,
    category: v.category,
    brand: v.brand,
    model: null,
    model_description: null,
    body_type: v.bodyType,
    year: v.year,
    mileage: v.mileage,
    price: null,
    currency: "EUR",
    price_type: null,
    vatable: null,
    image_urls: [v.image],
    description: null,
    exterior_color: null,
    fuel: null,
    power: null,
    gearbox: null,
    climatisation: null,
    num_seats: null,
    cubic_capacity: null,
    condition: null,
    usage_type: null,
    interior_color: null,
    interior_type: null,
    damage_unrepaired: null,
    detail_page_url: null,
    creation_date: null,
    modification_date: null,
    seller_city: null,
    seller_zipcode: null,
    is_sold: false,
    sold_at: null,
    synced_at: new Date().toISOString(),
    vehicle_category: null,
  }));
}

export interface VehicleListGridProps {
  /** Pre-filter to a subset of vehicle_category values (UI bucket). Empty/undefined = all */
  categoryFilter?: VehicleCategoryKey[];
  /** Show the "Kategorie" select inside FilterBar */
  showCategorySelect?: boolean;
  /** Optional quick-tabs above the grid (e.g. Oldtimer / Youngtimer) */
  quickTabs?: QuickTabOption[];
}

/**
 * The reusable Filter + Grid + Pagination block used by Hub and CategoryPage.
 * Encapsulates filtering state, fuzzy search, scroll-to-top on pagination, etc.
 */
const VehicleListGrid = ({
  categoryFilter,
  showCategorySelect = false,
  quickTabs,
}: VehicleListGridProps) => {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTabKey, setActiveTabKey] = useState<string>(
    quickTabs && quickTabs.length > 0 ? quickTabs[0].key : ""
  );
  const filterBarRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);

  const { data: dbVehicles, isLoading, isError } = useVehicles();

  const allVehicles = useMemo(() => {
    if (dbVehicles && dbVehicles.length > 0) return dbVehicles;
    return mapStaticVehicles(staticVehicles);
  }, [dbVehicles]);

  // Resolve effective category filter (quick-tab overrides outer prop)
  const effectiveCategoryFilter = useMemo<VehicleCategoryKey[] | undefined>(() => {
    if (quickTabs && activeTabKey) {
      const tab = quickTabs.find((t) => t.key === activeTabKey);
      if (tab) return tab.value;
    }
    return categoryFilter;
  }, [quickTabs, activeTabKey, categoryFilter]);

  const scopedVehicles = useMemo(() => {
    if (!effectiveCategoryFilter || effectiveCategoryFilter.length === 0) return allVehicles;
    const allowed = new Set<string>(effectiveCategoryFilter);
    return allVehicles.filter((v) => {
      const cat =
        (v.vehicle_category as VehicleCategoryKey | null) ??
        deriveVehicleCategory({
          body_type: v.body_type,
          category: v.category,
          year: v.year,
        });
      return allowed.has(cat);
    });
  }, [allVehicles, effectiveCategoryFilter]);

  const brands = useMemo(
    () => [...new Set(scopedVehicles.map((v) => v.brand).filter(Boolean) as string[])].sort(),
    [scopedVehicles]
  );
  const bodyTypes = useMemo(
    () => toLabelOptions(scopedVehicles.map((v) => v.body_type), getBodyTypeLabel),
    [scopedVehicles]
  );
  const categories = useMemo(
    () => [...new Set(scopedVehicles.map((v) => v.category).filter(Boolean) as string[])].sort(),
    [scopedVehicles]
  );
  const fuels = useMemo(
    () => toLabelOptions(scopedVehicles.map((v) => v.fuel), getFuelLabel),
    [scopedVehicles]
  );
  const gearboxes = useMemo(
    () => toLabelOptions(scopedVehicles.map((v) => v.gearbox), getGearboxLabel),
    [scopedVehicles]
  );
  const colors = useMemo(
    () =>
      [...new Set(scopedVehicles.map((v) => v.exterior_color).filter(Boolean) as string[])].sort(),
    [scopedVehicles]
  );

  const soldCount = useMemo(() => scopedVehicles.filter((v) => v.is_sold).length, [scopedVehicles]);

  const handleFilterChange = useCallback((key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }, []);

  const handleRemoveFilter = useCallback((key: keyof Filters) => {
    setFilters((prev) => ({
      ...prev,
      [key]: selectFilterKeys.includes(key) ? (key === "status" ? "available" : "all") : "",
    }));
    setCurrentPage(1);
  }, []);

  const handleResetAll = useCallback(() => {
    setFilters(defaultFilters);
    setCurrentPage(1);
  }, []);

  // Apply fuzzy search BEFORE the rest of the filters
  const searched = useFuzzySearch(scopedVehicles, filters.search);
  const isSearchActive = filters.search.trim().length >= 2;

  const filtered = useMemo(() => {
    let result = [...searched];

    if (filters.status === "available") result = result.filter((v) => !v.is_sold);
    else if (filters.status === "sold") result = result.filter((v) => v.is_sold);

    if (filters.category !== "all") result = result.filter((v) => v.category === filters.category);
    if (filters.brand !== "all") result = result.filter((v) => v.brand === filters.brand);
    if (filters.bodyType !== "all") result = result.filter((v) => v.body_type === filters.bodyType);
    if (filters.yearFrom) result = result.filter((v) => (v.year || "") >= filters.yearFrom);
    if (filters.yearTo) result = result.filter((v) => (v.year || "") <= filters.yearTo);
    if (filters.mileageFrom)
      result = result.filter((v) => (v.mileage || 0) >= Number(filters.mileageFrom));
    if (filters.mileageTo)
      result = result.filter((v) => (v.mileage || 0) <= Number(filters.mileageTo));
    if (filters.fuel !== "all") result = result.filter((v) => v.fuel === filters.fuel);
    if (filters.gearbox !== "all") result = result.filter((v) => v.gearbox === filters.gearbox);
    if (filters.color !== "all") result = result.filter((v) => v.exterior_color === filters.color);
    if (filters.priceFrom)
      result = result.filter((v) => (v.price || 0) >= Number(filters.priceFrom));
    if (filters.priceTo)
      result = result.filter((v) => (v.price || 0) <= Number(filters.priceTo));
    if (filters.powerFrom) {
      const kwMin = Number(filters.powerFrom) / 1.36;
      result = result.filter((v) => (v.power || 0) >= kwMin);
    }
    if (filters.powerTo) {
      const kwMax = Number(filters.powerTo) / 1.36;
      result = result.filter((v) => (v.power || 0) <= kwMax);
    }

    // When a search query is active → ALWAYS sort by relevance (ignoring user-sort).
    if (isSearchActive) {
      const query = filters.search.trim();
      const scoreMap = new Map<string, number>();
      for (const v of result) scoreMap.set(v.id, calculateRelevanceScore(v, query));

      // Drop zero-score items (fuse may have surfaced weak matches)
      result = result.filter((v) => (scoreMap.get(v.id) || 0) > 0);

      result.sort((a, b) => {
        if (a.is_sold !== b.is_sold) return a.is_sold ? 1 : -1;
        return (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0);
      });

      return result;
    }

    const sortFn = (a: Vehicle, b: Vehicle): number => {
      switch (filters.sort) {
        case "year-asc":
          return (a.year || "").localeCompare(b.year || "");
        case "year-desc":
          return (b.year || "").localeCompare(a.year || "");
        case "mileage-asc":
          return (a.mileage || 0) - (b.mileage || 0);
        case "mileage-desc":
          return (b.mileage || 0) - (a.mileage || 0);
        case "price-asc":
          return (a.price || 0) - (b.price || 0);
        case "price-desc":
          return (b.price || 0) - (a.price || 0);
        default:
          return (b.year || "").localeCompare(a.year || "");
      }
    };

    result.sort((a, b) => {
      if (a.is_sold !== b.is_sold) return a.is_sold ? 1 : -1;
      return sortFn(a, b);
    });

    return result;
  }, [filters, searched, isSearchActive]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Scroll AFTER state commit so first click works reliably
  useEffect(() => {
    if (!shouldScrollRef.current) return;
    shouldScrollRef.current = false;
    const el = filterBarRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: "smooth" });
  }, [currentPage]);

  const goToPage = (page: number) => {
    shouldScrollRef.current = true;
    setCurrentPage(page);
  };

  return (
    <div>
      {quickTabs && quickTabs.length > 0 && (
        <CategoryQuickTabs
          options={quickTabs}
          activeKey={activeTabKey}
          onSelect={(opt) => {
            setActiveTabKey(opt.key);
            setCurrentPage(1);
          }}
        />
      )}

      <div ref={filterBarRef} className="mb-6 scroll-mt-20">
        <FilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          brands={brands}
          bodyTypes={bodyTypes}
          categories={categories}
          fuels={fuels}
          gearboxes={gearboxes}
          colors={colors}
          showCategorySelect={showCategorySelect}
          sortDisabled={isSearchActive}
        />
        {isSearchActive && (
          <p className="mt-2 text-xs italic text-muted-foreground">
            Ergebnisse nach Relevanz sortiert
          </p>
        )}
      </div>

      <div className="flex items-center justify-between mb-6">
        <ActiveFilters
          filters={filters}
          onRemove={handleRemoveFilter}
          onResetAll={handleResetAll}
        />
        <VehicleAlertDialog brands={brands} bodyTypes={bodyTypes} />
      </div>

      <div className="flex items-center justify-between mb-6">
        <p
          className="text-sm text-muted-foreground"
          style={{ fontFamily: "'Instrument Sans', sans-serif" }}
        >
          {isLoading ? "Lade Fahrzeuge..." : `${filtered.length} Fahrzeuge gefunden`}
        </p>
        {isError && (
          <p className="text-sm text-destructive">Fehler beim Laden – zeige Beispieldaten</p>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl overflow-hidden bg-card border border-border">
              <Skeleton className="w-full aspect-video" />
              <div className="p-5 space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {paginated.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
          {paginated.length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-16 text-lg">
              Keine Fahrzeuge gefunden.
            </p>
          )}
        </div>
      )}

      {filtered.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="gap-1 border-border text-foreground hover:bg-secondary"
          >
            <ChevronLeft className="h-4 w-4" /> Zurück
          </Button>
          <span className="text-sm text-muted-foreground">
            Seite {currentPage} von {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="gap-1 border-border text-foreground hover:bg-secondary"
          >
            Nächste <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {soldCount > 0 && filters.status !== "sold" && (
        <div className="mt-8 text-center">
          <button
            onClick={() => handleFilterChange("status", "sold")}
            className="text-sm text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
          >
            {soldCount} Fahrzeuge kürzlich verkauft
          </button>
        </div>
      )}
    </div>
  );
};

export default VehicleListGrid;
