import { useState, useMemo, useRef, useCallback } from "react";
import { useVehicles, Vehicle } from "@/hooks/useVehicles";
import { vehicles as staticVehicles } from "@/data/vehicles";
import VehicleCard from "@/components/VehicleCard";
import FilterBar, { Filters } from "@/components/FilterBar";
import ActiveFilters from "@/components/ActiveFilters";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const ITEMS_PER_PAGE = 4;

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
};

// Map static vehicles to the DB Vehicle shape for fallback
function mapStaticVehicles(statics: typeof staticVehicles): Vehicle[] {
  return statics.map((v) => ({
    id: String(v.id),
    mobile_de_id: String(v.id),
    title: v.title,
    category: v.category,
    brand: v.brand,
    model: null,
    body_type: v.bodyType,
    year: v.year,
    mileage: v.mileage,
    price: null,
    currency: "EUR",
    image_urls: [v.image],
    description: null,
    synced_at: new Date().toISOString(),
  }));
}

const Index = () => {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  const { data: dbVehicles, isLoading, isError } = useVehicles();

  // Use DB data if available, fallback to static
  const allVehicles = useMemo(() => {
    if (dbVehicles && dbVehicles.length > 0) return dbVehicles;
    return mapStaticVehicles(staticVehicles);
  }, [dbVehicles]);

  const brands = useMemo(() => [...new Set(allVehicles.map((v) => v.brand).filter(Boolean) as string[])].sort(), [allVehicles]);
  const bodyTypes = useMemo(() => [...new Set(allVehicles.map((v) => v.body_type).filter(Boolean) as string[])].sort(), [allVehicles]);
  const categories = useMemo(() => [...new Set(allVehicles.map((v) => v.category).filter(Boolean) as string[])].sort(), [allVehicles]);

  const handleFilterChange = useCallback((key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }, []);

  const handleRemoveFilter = useCallback((key: keyof Filters) => {
    setFilters((prev) => ({
      ...prev,
      [key]: key === "category" || key === "brand" || key === "bodyType" || key === "sort" ? "all" : "",
    }));
    setCurrentPage(1);
  }, []);

  const handleResetAll = useCallback(() => {
    setFilters(defaultFilters);
    setCurrentPage(1);
  }, []);

  const filtered = useMemo(() => {
    let result = [...allVehicles];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((v) => v.title.toLowerCase().includes(q));
    }
    if (filters.category !== "all") {
      result = result.filter((v) => v.category === filters.category);
    }
    if (filters.brand !== "all") {
      result = result.filter((v) => v.brand === filters.brand);
    }
    if (filters.bodyType !== "all") {
      result = result.filter((v) => v.body_type === filters.bodyType);
    }
    if (filters.yearFrom) {
      result = result.filter((v) => (v.year || "") >= filters.yearFrom);
    }
    if (filters.yearTo) {
      result = result.filter((v) => (v.year || "") <= filters.yearTo);
    }
    if (filters.mileageFrom) {
      result = result.filter((v) => (v.mileage || 0) >= Number(filters.mileageFrom));
    }
    if (filters.mileageTo) {
      result = result.filter((v) => (v.mileage || 0) <= Number(filters.mileageTo));
    }

    switch (filters.sort) {
      case "year-asc":
        result.sort((a, b) => (a.year || "").localeCompare(b.year || ""));
        break;
      case "year-desc":
        result.sort((a, b) => (b.year || "").localeCompare(a.year || ""));
        break;
      case "mileage-asc":
        result.sort((a, b) => (a.mileage || 0) - (b.mileage || 0));
        break;
      case "mileage-desc":
        result.sort((a, b) => (b.mileage || 0) - (a.mileage || 0));
        break;
      case "price-asc":
        result.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case "price-desc":
        result.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      default:
        result.sort((a, b) => (b.year || "").localeCompare(a.year || ""));
    }

    return result;
  }, [filters, allVehicles]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const goToPage = (page: number) => {
    setCurrentPage(page);
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="py-16 md:py-24 px-4 text-center max-w-4xl mx-auto">
        <p className="text-xs tracking-[0.3em] uppercase text-primary mb-6 font-medium">
          Restauriert mit Leidenschaft, geprüft für die Zukunft.
        </p>
        <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
          Wir sind Experten für Automobile mit Geschichte
        </h1>
        <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
          Oldtimer mit Expertise gefunden, geprüft & restauriert um Automobilgeschichte für die nachfolgende Generation zu erhalten
        </p>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-20">
        <div className="mb-6">
          <FilterBar
            filters={filters}
            onFilterChange={handleFilterChange}
            brands={brands}
            bodyTypes={bodyTypes}
            categories={categories}
          />
        </div>

        <div className="mb-6">
          <ActiveFilters filters={filters} onRemove={handleRemoveFilter} onResetAll={handleResetAll} />
        </div>

        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Lade Fahrzeuge..." : `${filtered.length} Fahrzeuge gefunden`}
          </p>
          {isError && (
            <p className="text-sm text-destructive">Fehler beim Laden – zeige Beispieldaten</p>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-lg overflow-hidden">
                <Skeleton className="w-full aspect-video" />
                <div className="p-5 space-y-3" style={{ backgroundColor: 'hsl(20, 30%, 18%)' }}>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
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
      </main>
    </div>
  );
};

export default Index;
