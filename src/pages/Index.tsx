import { useState, useMemo, useRef, useCallback } from "react";
import { vehicles } from "@/data/vehicles";
import VehicleCard from "@/components/VehicleCard";
import FilterBar, { Filters } from "@/components/FilterBar";
import ActiveFilters from "@/components/ActiveFilters";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

const Index = () => {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  const brands = useMemo(() => [...new Set(vehicles.map((v) => v.brand))].sort(), []);
  const bodyTypes = useMemo(() => [...new Set(vehicles.map((v) => v.bodyType))].sort(), []);

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
    let result = [...vehicles];

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
      result = result.filter((v) => v.bodyType === filters.bodyType);
    }
    if (filters.yearFrom) {
      result = result.filter((v) => v.year >= filters.yearFrom);
    }
    if (filters.yearTo) {
      result = result.filter((v) => v.year <= filters.yearTo);
    }
    if (filters.mileageFrom) {
      result = result.filter((v) => v.mileage >= Number(filters.mileageFrom));
    }
    if (filters.mileageTo) {
      result = result.filter((v) => v.mileage <= Number(filters.mileageTo));
    }

    // Sort
    switch (filters.sort) {
      case "year-asc":
        result.sort((a, b) => a.year.localeCompare(b.year));
        break;
      case "year-desc":
        result.sort((a, b) => b.year.localeCompare(a.year));
        break;
      case "mileage-asc":
        result.sort((a, b) => a.mileage - b.mileage);
        break;
      case "mileage-desc":
        result.sort((a, b) => b.mileage - a.mileage);
        break;
      default: // newest
        result.sort((a, b) => b.year.localeCompare(a.year));
    }

    return result;
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const goToPage = (page: number) => {
    setCurrentPage(page);
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 pb-20">
        {/* Filters */}
        <div className="mb-6">
          <FilterBar
            filters={filters}
            onFilterChange={handleFilterChange}
            brands={brands}
            bodyTypes={bodyTypes}
          />
        </div>

        {/* Active Filters */}
        <div className="mb-6">
          <ActiveFilters filters={filters} onRemove={handleRemoveFilter} onResetAll={handleResetAll} />
        </div>

        {/* Results info */}
        <p className="text-sm text-muted-foreground mb-6">
          {filtered.length} Fahrzeuge gefunden
        </p>

        {/* Grid */}
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

        {/* Pagination */}
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
