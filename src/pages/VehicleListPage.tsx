import { useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useVehicles, Vehicle } from "@/hooks/useVehicles";
import { vehicles as staticVehicles } from "@/data/vehicles";
import { deriveVehicleCategory, VehicleCategoryKey } from "@/lib/categories";
import VehicleCard from "@/components/VehicleCard";
import FilterBar, { Filters } from "@/components/FilterBar";
import ActiveFilters from "@/components/ActiveFilters";
import VehicleAlertDialog from "@/components/VehicleAlertDialog";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronRight as Chevron } from "lucide-react";
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

export interface VehicleListPageProps {
  /** Page title shown in the header */
  title: string;
  /** Eyebrow shown above the title */
  eyebrow?: string;
  /** Optional breadcrumb segments — last item is current page (no link) */
  breadcrumbs?: { label: string; to?: string }[];
  /** Pre-filter to a subset of vehicle_category values (UI bucket). Empty/undefined = all */
  categoryFilter?: VehicleCategoryKey[];
  /** Show the "Kategorie" select inside FilterBar (only useful on /fahrzeuge) */
  showCategorySelect?: boolean;
}

const VehicleListPage = ({
  title,
  eyebrow,
  breadcrumbs,
  categoryFilter,
  showCategorySelect = false,
}: VehicleListPageProps) => {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  const { data: dbVehicles, isLoading, isError } = useVehicles();

  const allVehicles = useMemo(() => {
    if (dbVehicles && dbVehicles.length > 0) return dbVehicles;
    return mapStaticVehicles(staticVehicles);
  }, [dbVehicles]);

  // Pre-filter by route category bucket
  const scopedVehicles = useMemo(() => {
    if (!categoryFilter || categoryFilter.length === 0) return allVehicles;
    const allowed = new Set<string>(categoryFilter);
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
  }, [allVehicles, categoryFilter]);

  const brands = useMemo(
    () => [...new Set(scopedVehicles.map((v) => v.brand).filter(Boolean) as string[])].sort(),
    [scopedVehicles]
  );
  const bodyTypes = useMemo(
    () => [...new Set(scopedVehicles.map((v) => v.body_type).filter(Boolean) as string[])].sort(),
    [scopedVehicles]
  );
  const categories = useMemo(
    () => [...new Set(scopedVehicles.map((v) => v.category).filter(Boolean) as string[])].sort(),
    [scopedVehicles]
  );
  const fuels = useMemo(
    () => [...new Set(scopedVehicles.map((v) => v.fuel).filter(Boolean) as string[])].sort(),
    [scopedVehicles]
  );
  const gearboxes = useMemo(
    () => [...new Set(scopedVehicles.map((v) => v.gearbox).filter(Boolean) as string[])].sort(),
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

  const filtered = useMemo(() => {
    let result = [...scopedVehicles];

    if (filters.status === "available") result = result.filter((v) => !v.is_sold);
    else if (filters.status === "sold") result = result.filter((v) => v.is_sold);

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((v) => v.title.toLowerCase().includes(q));
    }
    if (filters.category !== "all") result = result.filter((v) => v.category === filters.category);
    if (filters.brand !== "all") result = result.filter((v) => v.brand === filters.brand);
    if (filters.bodyType !== "all") result = result.filter((v) => v.body_type === filters.bodyType);
    if (filters.yearFrom) result = result.filter((v) => (v.year || "") >= filters.yearFrom);
    if (filters.yearTo) result = result.filter((v) => (v.year || "") <= filters.yearTo);
    if (filters.mileageFrom) result = result.filter((v) => (v.mileage || 0) >= Number(filters.mileageFrom));
    if (filters.mileageTo) result = result.filter((v) => (v.mileage || 0) <= Number(filters.mileageTo));
    if (filters.fuel !== "all") result = result.filter((v) => v.fuel === filters.fuel);
    if (filters.gearbox !== "all") result = result.filter((v) => v.gearbox === filters.gearbox);
    if (filters.color !== "all") result = result.filter((v) => v.exterior_color === filters.color);
    if (filters.priceFrom) result = result.filter((v) => (v.price || 0) >= Number(filters.priceFrom));
    if (filters.priceTo) result = result.filter((v) => (v.price || 0) <= Number(filters.priceTo));
    if (filters.powerFrom) {
      const kwMin = Number(filters.powerFrom) / 1.36;
      result = result.filter((v) => (v.power || 0) >= kwMin);
    }
    if (filters.powerTo) {
      const kwMax = Number(filters.powerTo) / 1.36;
      result = result.filter((v) => (v.power || 0) <= kwMax);
    }

    const sortFn = (a: Vehicle, b: Vehicle): number => {
      switch (filters.sort) {
        case "year-asc": return (a.year || "").localeCompare(b.year || "");
        case "year-desc": return (b.year || "").localeCompare(a.year || "");
        case "mileage-asc": return (a.mileage || 0) - (b.mileage || 0);
        case "mileage-desc": return (b.mileage || 0) - (a.mileage || 0);
        case "price-asc": return (a.price || 0) - (b.price || 0);
        case "price-desc": return (b.price || 0) - (a.price || 0);
        default: return (b.year || "").localeCompare(a.year || "");
      }
    };

    result.sort((a, b) => {
      if (a.is_sold !== b.is_sold) return a.is_sold ? 1 : -1;
      return sortFn(a, b);
    });

    return result;
  }, [filters, scopedVehicles]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const goToPage = (page: number) => {
    setCurrentPage(page);
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <header className="px-4 pt-12 md:pt-16 max-w-7xl mx-auto">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6 flex-wrap"
            style={{ fontFamily: "'Instrument Sans', sans-serif" }}
          >
            {breadcrumbs.map((bc, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {bc.to ? (
                  <Link to={bc.to} className="hover:text-foreground transition-colors">
                    {bc.label}
                  </Link>
                ) : (
                  <span className="text-foreground">{bc.label}</span>
                )}
                {i < breadcrumbs.length - 1 && <Chevron className="h-3.5 w-3.5 opacity-60" />}
              </span>
            ))}
          </nav>
        )}

        <div className="py-12 md:py-20 text-center max-w-3xl mx-auto">
          {eyebrow && (
            <p className="text-xs tracking-[0.25em] uppercase text-primary font-medium mb-5">
              {eyebrow}
            </p>
          )}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight">
            {title}
          </h1>
        </div>
      </header>

      <main id="fahrzeuge" className="max-w-7xl mx-auto px-4 pb-20">
        <div className="mb-6">
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
          />
        </div>

        <div className="flex items-center justify-between mb-6">
          <ActiveFilters filters={filters} onRemove={handleRemoveFilter} onResetAll={handleResetAll} />
          <VehicleAlertDialog brands={brands} bodyTypes={bodyTypes} />
        </div>

        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>
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
      </main>

      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>
            © {new Date().getFullYear()} Reller Automobile. Alle Rechte vorbehalten.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>
            <a href="https://reller-automobile.de/impressum" className="hover:text-foreground transition-colors">Impressum</a>
            <a href="https://reller-automobile.de/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default VehicleListPage;
