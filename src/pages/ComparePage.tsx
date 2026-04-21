import { useCompare } from "@/contexts/CompareContext";
import { useInquiry } from "@/contexts/InquiryContext";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, X, ArrowRight } from "lucide-react";
import type { Vehicle } from "@/hooks/useVehicles";
import {
  getBodyTypeLabel,
  getFuelLabel,
  getGearboxLabel,
  getClimatisationLabel,
  getConditionLabel,
} from "@/lib/mobileDeLabels";

function formatPrice(v: Vehicle): string {
  if (!v.price) return "Auf Anfrage";
  return v.price.toLocaleString("de-DE") + " " + (v.currency || "€");
}

function formatMileage(v: Vehicle): string {
  if (v.mileage == null) return "–";
  return v.mileage.toLocaleString("de-DE") + " km";
}

function formatPower(v: Vehicle): string {
  if (!v.power) return "–";
  const ps = Math.round(v.power * 1.36);
  return `${v.power} kW (${ps} PS)`;
}

function formatCubicCapacity(v: Vehicle): string {
  if (!v.cubic_capacity) return "–";
  return v.cubic_capacity.toLocaleString("de-DE") + " cm³";
}

function formatYear(v: Vehicle): string {
  if (!v.year) return "–";
  return v.year.substring(0, 4);
}

type BestMode = "min" | "max" | null;

interface RowDef {
  label: string;
  icon: string;
  getValue: (v: Vehicle) => string;
  getNumeric?: (v: Vehicle) => number | null;
  best?: BestMode;
}

const rows: RowDef[] = [
  { label: "Preis", icon: "€", getValue: formatPrice, getNumeric: (v) => v.price ?? null, best: "min" },
  { label: "Baujahr", icon: "📅", getValue: formatYear },
  { label: "Kilometerstand", icon: "🛣", getValue: formatMileage, getNumeric: (v) => v.mileage ?? null, best: "min" },
  { label: "Leistung", icon: "⚡", getValue: formatPower, getNumeric: (v) => v.power ?? null, best: "max" },
  { label: "Hubraum", icon: "🔧", getValue: formatCubicCapacity },
  { label: "Getriebe", icon: "⚙", getValue: (v) => getGearboxLabel(v.gearbox) },
  { label: "Kraftstoff", icon: "⛽", getValue: (v) => getFuelLabel(v.fuel) },
  { label: "Farbe (außen)", icon: "🎨", getValue: (v) => v.exterior_color || "–" },
  { label: "Farbe (innen)", icon: "🪑", getValue: (v) => v.interior_color || "–" },
  { label: "Karosserie", icon: "🚗", getValue: (v) => getBodyTypeLabel(v.body_type) },
  { label: "Zustand", icon: "✓", getValue: (v) => getConditionLabel(v.condition) },
  { label: "Sitze", icon: "💺", getValue: (v) => v.num_seats?.toString() || "–" },
  { label: "Klimaanlage", icon: "❄", getValue: (v) => getClimatisationLabel(v.climatisation) },
];

function getBestIndices(vehicles: Vehicle[], row: RowDef): Set<number> {
  const result = new Set<number>();
  if (!row.best || !row.getNumeric) return result;
  const values = vehicles.map((v) => row.getNumeric!(v));
  const valid = values.filter((x): x is number => x != null && x > 0);
  if (valid.length < 2) return result;
  const target = row.best === "min" ? Math.min(...valid) : Math.max(...valid);
  values.forEach((val, i) => {
    if (val === target) result.add(i);
  });
  return result;
}

const ComparePage = () => {
  const { selected, remove, clear } = useCompare();
  const { inquiryList } = useInquiry();
  const navigate = useNavigate();

  // FloatingActionBar hides its compare section on /vergleich, so only the
  // inquiry section can overlap content here. Reserve space when active.
  const stickyPadding = inquiryList.length > 0 ? "pb-40 md:pb-32" : "pb-12";

  if (selected.length < 2) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className={`max-w-7xl mx-auto px-4 py-20 text-center flex-1 ${stickyPadding}`}>
          <p className="text-muted-foreground text-lg mb-6">
            Bitte wählen Sie mindestens 2 Fahrzeuge zum Vergleichen aus.
          </p>
          <Button onClick={() => navigate("/")} variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
          </Button>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const count = selected.length;
  // Mobile-first column widths: label column smaller, vehicle cols min 220px
  const labelColWidthDesktop = count === 2 ? "260px" : count === 3 ? "220px" : "180px";
  const labelColWidthMobile = "120px";
  const vehicleColMinMobile = "220px";
  const titleSize = count === 2 ? "text-base" : "text-sm";
  const priceSize = count === 2 ? "text-[20px] sm:text-[22px]" : "text-base sm:text-lg";
  const valueSize = count === 2 ? "text-[14px] sm:text-[15px]" : "text-[12px] sm:text-[13px]";

  const ACCENT = "hsl(var(--primary))";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div
        className={`mx-auto px-4 sm:px-6 lg:px-8 pt-6 md:pt-10 transition-[padding] duration-300 ${stickyPadding}`}
        style={{ maxWidth: "1400px" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6 md:mb-10 gap-3 flex-wrap">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <Button
              onClick={() => navigate(-1)}
              variant="outline"
              size="sm"
              className="gap-1.5 min-h-[44px] shrink-0"
            >
              <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Zurück</span>
            </Button>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight">
                Fahrzeugvergleich
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {count} Fahrzeuge im Vergleich
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clear();
              navigate("/");
            }}
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive min-h-[44px]"
          >
            Auswahl leeren
          </Button>
        </div>

        {/* Scroll hint for mobile when 3+ vehicles */}
        {count >= 3 && (
          <p className="md:hidden text-xs text-muted-foreground italic mb-3 text-center">
            ← Nach rechts wischen für weitere Fahrzeuge →
          </p>
        )}

        {/* Scrollable container with sticky label column */}
        <div className="overflow-x-auto -mx-4 px-0 md:mx-0">
          <div
            className="compare-grid"
            style={{
              minWidth: count === 2 ? "560px" : count === 3 ? "780px" : "980px",
              ["--label-col" as string]: labelColWidthMobile,
              ["--label-col-md" as string]: labelColWidthDesktop,
              ["--vehicle-col" as string]: vehicleColMinMobile,
            }}
          >
            {/* Vehicle header row */}
            <div className="compare-row mb-2">
              <div className="compare-label-cell" /> {/* empty corner */}
              {selected.map((v) => {
                const img = v.image_urls?.[0] || "/placeholder.svg";
                return (
                  <div key={v.id} className="px-3 md:px-0">
                    <div
                      className="relative overflow-hidden group"
                      style={{
                        aspectRatio: "16 / 10",
                        borderRadius: "12px",
                        border: "1px solid hsl(var(--border))",
                      }}
                    >
                      <img
                        src={img}
                        alt={v.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(v.id);
                        }}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-destructive text-white flex items-center justify-center transition-colors backdrop-blur-sm"
                        aria-label="Entfernen"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <p
                      className={`${titleSize} font-semibold text-foreground leading-tight mt-3 line-clamp-2`}
                    >
                      {v.title}
                    </p>
                    <p
                      className={`${priceSize} font-bold mt-1.5`}
                      style={{ color: ACCENT }}
                    >
                      {formatPrice(v)}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Spec rows */}
            <div className="mt-6 rounded-xl overflow-hidden border border-border">
              {rows.map((row, rowIdx) => {
                const bestSet = getBestIndices(selected, row);
                const altBg = rowIdx % 2 === 1 ? "bg-muted/20" : "bg-card";
                return (
                  <div key={row.label} className={`compare-row ${altBg}`}>
                    <div
                      className={`compare-label-cell flex items-center gap-2 px-3 md:px-4 py-3 md:py-3.5 text-[11px] md:text-[13px] uppercase tracking-wider font-medium text-muted-foreground border-r border-border ${altBg}`}
                    >
                      <span className="text-sm opacity-70 hidden sm:inline">{row.icon}</span>
                      <span className="truncate">{row.label}</span>
                    </div>
                    {selected.map((v, i) => {
                      const isBest = bestSet.has(i);
                      return (
                        <div
                          key={v.id}
                          className={`flex items-center gap-2 px-3 md:px-4 py-3 md:py-3.5 ${valueSize} text-foreground`}
                          style={{
                            backgroundColor: isBest ? "rgba(74,222,128,0.04)" : undefined,
                            borderLeft: isBest
                              ? "2px solid rgba(74,222,128,0.3)"
                              : "2px solid transparent",
                            color: isBest ? "#4ade80" : undefined,
                            fontWeight: isBest ? 600 : 400,
                          }}
                        >
                          {isBest && (
                            <span
                              className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded tracking-wider shrink-0"
                              style={{
                                backgroundColor: "rgba(74,222,128,0.15)",
                                color: "#4ade80",
                              }}
                            >
                              Best
                            </span>
                          )}
                          <span className="truncate">{row.getValue(v)}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Footer CTAs */}
            <div className="compare-row mt-6">
              <div className="compare-label-cell" />
              {selected.map((v) => (
                <div key={v.id} className="px-3 md:px-0">
                  <button
                    onClick={() => navigate(`/fahrzeug/${v.id}`)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-colors bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px]"
                  >
                    Fahrzeug ansehen <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Inline grid styles — sticky left label column */}
      <style>{`
        .compare-grid .compare-row {
          display: grid;
          grid-template-columns: var(--label-col) repeat(${count}, minmax(var(--vehicle-col), 1fr));
          gap: 0.75rem;
        }
        @media (min-width: 768px) {
          .compare-grid .compare-row {
            grid-template-columns: var(--label-col-md) repeat(${count}, 1fr);
            gap: 1rem;
          }
        }
        .compare-grid .compare-label-cell {
          position: sticky;
          left: 0;
          z-index: 5;
        }
      `}</style>
      <SiteFooter />
    </div>
  );
};

export default ComparePage;
