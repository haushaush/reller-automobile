import { useCompare } from "@/contexts/CompareContext";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { Vehicle } from "@/hooks/useVehicles";

function formatPrice(v: Vehicle) {
  if (!v.price) return "–";
  return v.price.toLocaleString("de-DE") + " " + (v.currency || "€");
}

function formatMileage(v: Vehicle) {
  if (!v.mileage) return "–";
  return v.mileage.toLocaleString("de-DE") + " km";
}

function formatPS(v: Vehicle) {
  if (!v.power) return "–";
  const ps = Math.round(v.power * 1.36);
  return `${v.power} kW (${ps} PS)`;
}

function formatCubicCapacity(v: Vehicle) {
  if (!v.cubic_capacity) return "–";
  return v.cubic_capacity.toLocaleString("de-DE") + " cm³";
}

interface RowDef {
  label: string;
  getValue: (v: Vehicle) => string;
  numeric?: boolean;
  lowerIsBetter?: boolean;
}

const rows: RowDef[] = [
  { label: "Preis", getValue: formatPrice, numeric: true, lowerIsBetter: true },
  { label: "Baujahr", getValue: (v) => v.year || "–" },
  { label: "Kilometerstand", getValue: formatMileage, numeric: true, lowerIsBetter: true },
  { label: "Leistung", getValue: formatPS },
  { label: "Hubraum", getValue: formatCubicCapacity },
  { label: "Getriebe", getValue: (v) => v.gearbox || "–" },
  { label: "Kraftstoff", getValue: (v) => v.fuel || "–" },
  { label: "Farbe (außen)", getValue: (v) => v.exterior_color || "–" },
  { label: "Farbe (innen)", getValue: (v) => v.interior_color || "–" },
  { label: "Karosserie", getValue: (v) => v.body_type || "–" },
  { label: "Zustand", getValue: (v) => v.condition || "–" },
  { label: "Sitze", getValue: (v) => v.num_seats?.toString() || "–" },
  { label: "Klimaanlage", getValue: (v) => v.climatisation || "–" },
];

function getBestIndex(vehicles: Vehicle[], row: RowDef): number | null {
  if (!row.numeric || !row.lowerIsBetter) return null;
  let bestIdx: number | null = null;
  let bestVal = Infinity;
  vehicles.forEach((v, i) => {
    let val: number | null = null;
    if (row.label === "Preis") val = v.price;
    if (row.label === "Kilometerstand") val = v.mileage;
    if (val !== null && val < bestVal) {
      bestVal = val;
      bestIdx = i;
    }
  });
  return bestIdx;
}

const ComparePage = () => {
  const { selected, clear } = useCompare();
  const navigate = useNavigate();

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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button onClick={() => navigate("/")} variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Zurück
            </Button>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Fahrzeugvergleich</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => { clear(); navigate("/"); }}>
            Auswahl leeren
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground w-40"></th>
                {selected.map((v) => {
                  const img = v.image_urls?.[0] || "/placeholder.svg";
                  return (
                    <th key={v.id} className="p-3 text-left">
                      <img
                        src={img}
                        alt={v.title}
                        className="w-full h-32 object-cover rounded-lg mb-3"
                      />
                      <p className="font-semibold text-foreground text-sm leading-tight">{v.title}</p>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const bestIdx = getBestIndex(selected, row);
                return (
                  <tr key={row.label} className="border-t border-border">
                    <td className="p-3 text-sm font-medium text-muted-foreground">{row.label}</td>
                    {selected.map((v, i) => (
                      <td
                        key={v.id}
                        className={`p-3 text-sm text-foreground ${i === bestIdx ? "bg-green-500/10 text-green-400 font-semibold" : ""}`}
                      >
                        {row.getValue(v)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ComparePage;
