import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useVehicles, Vehicle } from "@/hooks/useVehicles";
import { vehicles as staticVehicles } from "@/data/vehicles";
import { deriveVehicleCategory, VehicleCategoryKey } from "@/lib/categories";
import OldtimerCard from "@/components/OldtimerCard";
import FilterBar, { Filters } from "@/components/FilterBar";
import ActiveFilters from "@/components/ActiveFilters";
import VehicleAlertDialog from "@/components/VehicleAlertDialog";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronRight as Chevron } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const ITEMS_PER_PAGE = 4;
const LEATHER_BG =
  "https://cdn.prod.website-files.com/68ac6a6666d9a072cb65c7ce/68ad865732c90975228bd803_ChatGPT%20Image%20Aug%2026%2C%202025%2C%2012_02_58%20PM.avif";
const GOLD = "#c9a961";
const TEXT_WARM = "#f5f1ed";
const TEXT_MUTED = "#dcd8d5";

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

type SubTab = "all" | "oldtimer" | "youngtimer";

const OldtimerPage = () => {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [subTab, setSubTab] = useState<SubTab>("all");
  const gridRef = useRef<HTMLDivElement>(null);

  const { data: dbVehicles, isLoading, isError } = useVehicles();

  // Preload leather background image
  useEffect(() => {
    const img = new Image();
    img.src = LEATHER_BG;
  }, []);

  const allVehicles = useMemo(() => {
    if (dbVehicles && dbVehicles.length > 0) return dbVehicles;
    return mapStaticVehicles(staticVehicles);
  }, [dbVehicles]);

  // Pre-filter to oldtimer + youngtimer
  const scopedVehicles = useMemo(() => {
    const allowed = new Set<VehicleCategoryKey>(["oldtimer", "youngtimer"]);
    return allVehicles
      .map((v) => ({
        v,
        cat:
          (v.vehicle_category as VehicleCategoryKey | null) ??
          deriveVehicleCategory({
            body_type: v.body_type,
            category: v.category,
            year: v.year,
          }),
      }))
      .filter(({ cat }) => allowed.has(cat))
      .filter(({ cat }) => {
        if (subTab === "all") return true;
        return cat === subTab;
      })
      .map(({ v }) => v);
  }, [allVehicles, subTab]);

  const brands = useMemo(
    () => [...new Set(scopedVehicles.map((v) => v.brand).filter(Boolean) as string[])].sort(),
    [scopedVehicles]
  );
  const bodyTypes = useMemo(
    () => [...new Set(scopedVehicles.map((v) => v.body_type).filter(Boolean) as string[])].sort(),
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
    () => [...new Set(scopedVehicles.map((v) => v.exterior_color).filter(Boolean) as string[])].sort(),
    [scopedVehicles]
  );

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

  const tabs: { key: SubTab; label: string }[] = [
    { key: "all", label: "Alle Klassiker" },
    { key: "oldtimer", label: "Oldtimer (30+ Jahre)" },
    { key: "youngtimer", label: "Youngtimer (20–30 Jahre)" },
  ];

  return (
    <div
      className="oldtimer-route min-h-screen relative"
      style={{
        backgroundImage: `url('${LEATHER_BG}')`,
        backgroundSize: "cover",
        backgroundAttachment: "fixed",
        backgroundPosition: "center",
      }}
    >
      {/* Dark overlay for contrast */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 8, 5, 0.4)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div className="relative z-10">
        <Navbar />

        {/* Hero header */}
        <header className="px-4 max-w-7xl mx-auto text-center" style={{ paddingTop: "120px", paddingBottom: "80px" }}>
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="flex items-center justify-center gap-1.5 text-sm mb-10 flex-wrap"
            style={{ fontFamily: "'DM Sans', sans-serif", color: TEXT_MUTED, opacity: 0.7 }}
          >
            <Link to="/" className="hover:opacity-100 transition-opacity">Home</Link>
            <Chevron className="h-3.5 w-3.5 opacity-60" />
            <span style={{ color: TEXT_WARM }}>Oldtimer & Youngtimer</span>
          </nav>

          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "11px",
              fontWeight: 500,
              color: TEXT_MUTED,
              opacity: 0.8,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              marginBottom: "32px",
            }}
          >
            Restauriert mit Leidenschaft, geprüft für die Zukunft.
          </p>

          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 500,
              color: TEXT_WARM,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              marginBottom: "28px",
            }}
            className="text-[36px] md:text-[56px]"
          >
            Wir sind Experten für
            <br />
            Automobile mit Geschichte
          </h1>

          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "15px",
              fontWeight: 400,
              color: TEXT_MUTED,
              opacity: 0.7,
              lineHeight: 1.6,
              maxWidth: "580px",
              margin: "0 auto",
            }}
          >
            Oldtimer mit Expertise gefunden, geprüft & restauriert um Automobilgeschichte für die nachfolgende Generation zu erhalten.
          </p>
        </header>

        <main id="fahrzeuge" className="mx-auto px-4 pb-20" style={{ maxWidth: "1200px" }}>
          {/* Sub-tabs */}
          <div className="flex items-center justify-center gap-8 mb-10 flex-wrap">
            {tabs.map((t) => {
              const active = subTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    setSubTab(t.key);
                    setCurrentPage(1);
                  }}
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: "16px",
                    fontStyle: active ? "italic" : "normal",
                    color: active ? TEXT_WARM : TEXT_MUTED,
                    opacity: active ? 1 : 0.6,
                    paddingBottom: "6px",
                    borderBottom: active ? `2px solid ${GOLD}` : "2px solid transparent",
                    transition: "all 200ms ease",
                    background: "transparent",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* FilterBar wrapper styled */}
          <div
            className="mb-6 p-4 rounded-xl"
            style={{
              background: "rgba(35, 22, 15, 0.6)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(201, 169, 97, 0.15)",
            }}
          >
            <FilterBar
              filters={filters}
              onFilterChange={handleFilterChange}
              brands={brands}
              bodyTypes={bodyTypes}
              fuels={fuels}
              gearboxes={gearboxes}
              colors={colors}
              showCategorySelect={false}
            />
          </div>

          <div className="flex items-center justify-between mb-6">
            <ActiveFilters filters={filters} onRemove={handleRemoveFilter} onResetAll={handleResetAll} />
            <VehicleAlertDialog brands={brands} bodyTypes={bodyTypes} />
          </div>

          <div className="flex items-center justify-between mb-6">
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: TEXT_MUTED, opacity: 0.8 }}>
              {isLoading ? "Lade Fahrzeuge..." : `${filtered.length} Fahrzeuge gefunden`}
            </p>
            {isError && (
              <p className="text-sm text-destructive">Fehler beim Laden – zeige Beispieldaten</p>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 mb-10" style={{ gap: "32px" }}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    background: "rgba(35, 22, 15, 0.85)",
                    border: "1px solid rgba(201, 169, 97, 0.2)",
                    borderRadius: "12px",
                    overflow: "hidden",
                  }}
                >
                  <Skeleton className="w-full aspect-video" />
                  <div className="p-6 space-y-3">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 mb-10" style={{ gap: "32px" }}>
              {paginated.map((vehicle) => (
                <OldtimerCard key={vehicle.id} vehicle={vehicle} />
              ))}
              {paginated.length === 0 && (
                <p
                  className="col-span-full text-center py-16"
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: "18px",
                    fontStyle: "italic",
                    color: TEXT_MUTED,
                    opacity: 0.7,
                  }}
                >
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
                className="gap-1"
                style={{
                  background: "rgba(35, 22, 15, 0.6)",
                  border: `1px solid rgba(201, 169, 97, 0.4)`,
                  color: TEXT_WARM,
                  fontFamily: "'Playfair Display', serif",
                  fontStyle: "italic",
                }}
              >
                <ChevronLeft className="h-4 w-4" /> Zurück
              </Button>
              <span
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: "14px",
                  color: GOLD,
                }}
              >
                Seite {currentPage} von {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="gap-1"
                style={{
                  background: "rgba(35, 22, 15, 0.6)",
                  border: `1px solid rgba(201, 169, 97, 0.4)`,
                  color: TEXT_WARM,
                  fontFamily: "'Playfair Display', serif",
                  fontStyle: "italic",
                }}
              >
                Nächste <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </main>

        <footer
          className="py-8 px-4"
          style={{
            borderTop: "1px solid rgba(201, 169, 97, 0.2)",
            background: "rgba(15, 8, 5, 0.4)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: TEXT_MUTED, opacity: 0.7 }}>
              © {new Date().getFullYear()} Reller Automobile. Alle Rechte vorbehalten.
            </p>
            <div className="flex items-center gap-6" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: TEXT_MUTED, opacity: 0.7 }}>
              <a href="https://reller-automobile.de/impressum" className="hover:opacity-100 transition-opacity" style={{ color: GOLD }}>Impressum</a>
              <a href="https://reller-automobile.de/datenschutz" className="hover:opacity-100 transition-opacity" style={{ color: GOLD }}>Datenschutz</a>
            </div>
          </div>
        </footer>
      </div>

      {/* Scoped overrides for navbar + filterbar gold accents on this route */}
      <style>{`
        .oldtimer-route nav.sticky {
          background: rgba(15, 8, 5, 0.5) !important;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom-color: rgba(201, 169, 97, 0.2) !important;
        }
        .oldtimer-route input:focus-visible,
        .oldtimer-route button:focus-visible,
        .oldtimer-route [role="combobox"]:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px ${GOLD}66 !important;
          border-color: ${GOLD} !important;
        }
      `}</style>
    </div>
  );
};

export default OldtimerPage;
