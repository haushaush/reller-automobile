import { useCompare } from "@/contexts/CompareContext";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, X, ArrowRight } from "lucide-react";
import type { Vehicle } from "@/hooks/useVehicles";

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
  { label: "Getriebe", icon: "⚙", getValue: (v) => v.gearbox || "–" },
  { label: "Kraftstoff", icon: "⛽", getValue: (v) => v.fuel || "–" },
  { label: "Farbe (außen)", icon: "🎨", getValue: (v) => v.exterior_color || "–" },
  { label: "Farbe (innen)", icon: "🪑", getValue: (v) => v.interior_color || "–" },
  { label: "Karosserie", icon: "🚗", getValue: (v) => v.body_type || "–" },
  { label: "Zustand", icon: "✓", getValue: (v) => v.condition || "–" },
  { label: "Sitze", icon: "💺", getValue: (v) => v.num_seats?.toString() || "–" },
  { label: "Klimaanlage", icon: "❄", getValue: (v) => v.climatisation || "–" },
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
  const navigate = useNavigate();
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  if (selected.length < 2) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <p className="text-muted-foreground text-lg mb-6">
            Bitte wählen Sie mindestens 2 Fahrzeuge zum Vergleichen aus.
          </p>
          <Button onClick={() => navigate("/")} variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
          </Button>
        </div>
      </div>
    );
  }

  const count = selected.length;
  const labelColWidth = count === 2 ? "280px" : count === 3 ? "240px" : "200px";
  const gridTemplate = `${labelColWidth} ${"1fr ".repeat(count).trim()}`;
  const titleSize = count === 2 ? "text-base" : "text-sm";
  const priceSize = count === 2 ? "text-[22px]" : "text-lg";
  const valueSize = count === 2 ? "text-[15px]" : "text-[13px]";

  const ACCENT = "hsl(var(--primary))";

  const isDimmed = (i: number) => hoveredCol !== null && hoveredCol !== i;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto px-4 md:px-8 py-10" style={{ maxWidth: "1400px" }}>
        {/* Header */}
        <div className="flex items-start justify-between mb-10 gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate("/")}
              variant="outline"
              size="sm"
              className="gap-1.5 bg-transparent border-white/10 hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4" /> Zurück
            </Button>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
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
            className="bg-transparent border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Auswahl leeren
          </Button>
        </div>

        {/* Scrollable container */}
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <div style={{ minWidth: count === 2 ? "640px" : count === 3 ? "820px" : "1000px" }}>
            {/* Vehicle header row */}
            <div
              className="grid gap-3 md:gap-4 mb-2"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div /> {/* empty corner */}
              {selected.map((v, i) => {
                const img = v.image_urls?.[0] || "/placeholder.svg";
                return (
                  <div
                    key={v.id}
                    className="transition-opacity duration-300"
                    style={{ opacity: isDimmed(i) ? 0.55 : 1 }}
                    onMouseEnter={() => setHoveredCol(i)}
                    onMouseLeave={() => setHoveredCol(null)}
                  >
                    <div
                      className="relative overflow-hidden group"
                      style={{
                        aspectRatio: "16 / 10",
                        borderRadius: "12px",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <img
                        src={img}
                        alt={v.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(v.id);
                        }}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-destructive text-white flex items-center justify-center transition-colors backdrop-blur-sm"
                        aria-label="Entfernen"
                      >
                        <X className="h-3.5 w-3.5" />
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
            <div className="mt-6 rounded-xl overflow-hidden border border-white/[0.06]">
              {rows.map((row, rowIdx) => {
                const bestSet = getBestIndices(selected, row);
                const altBg = rowIdx % 2 === 1 ? "bg-white/[0.015]" : "bg-transparent";
                return (
                  <div
                    key={row.label}
                    className={`grid gap-3 md:gap-4 ${altBg} hover:bg-white/[0.04] transition-colors group`}
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    <div className="flex items-center gap-2 px-4 py-3.5 text-[13px] uppercase tracking-wider font-medium text-foreground/45">
                      <span className="text-sm opacity-70">{row.icon}</span>
                      {row.label}
                    </div>
                    {selected.map((v, i) => {
                      const isBest = bestSet.has(i);
                      const dimmed = isDimmed(i);
                      return (
                        <div
                          key={v.id}
                          onMouseEnter={() => setHoveredCol(i)}
                          onMouseLeave={() => setHoveredCol(null)}
                          className={`flex items-center gap-2 px-4 py-3.5 ${valueSize} text-foreground transition-all duration-300`}
                          style={{
                            opacity: dimmed ? 0.4 : 1,
                            backgroundColor: isBest ? "rgba(74,222,128,0.04)" : undefined,
                            borderLeft: isBest ? "2px solid rgba(74,222,128,0.3)" : "2px solid transparent",
                            color: isBest ? "#4ade80" : undefined,
                            fontWeight: isBest ? 600 : 400,
                          }}
                        >
                          {isBest && (
                            <span
                              className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded tracking-wider"
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
            <div
              className="grid gap-3 md:gap-4 mt-6"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div />
              {selected.map((v, i) => (
                <button
                  key={v.id}
                  onClick={() => navigate(`/fahrzeug/${v.id}`)}
                  onMouseEnter={() => setHoveredCol(i)}
                  onMouseLeave={() => setHoveredCol(null)}
                  className="flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all duration-300"
                  style={{
                    backgroundColor: "rgba(74,222,128,0.10)",
                    border: "1px solid rgba(74,222,128,0.25)",
                    color: "#4ade80",
                    opacity: isDimmed(i) ? 0.4 : 1,
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(74,222,128,0.18)";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(74,222,128,0.10)";
                  }}
                >
                  Fahrzeug ansehen <ArrowRight className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComparePage;
