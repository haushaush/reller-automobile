import { usePriceHistory } from "@/hooks/usePriceHistory";
import { useVehicles } from "@/hooks/useVehicles";
import type { Vehicle } from "@/hooks/useVehicles";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useMemo } from "react";

interface PriceHistoryWidgetProps {
  vehicle: Vehicle;
}

const PriceHistoryWidget = ({ vehicle }: PriceHistoryWidgetProps) => {
  const { data: history } = usePriceHistory(vehicle.id);
  const { data: allVehicles } = useVehicles();

  const chartData = useMemo(() => {
    if (!history) return [];
    return history.map((h) => ({
      date: new Date(h.recorded_at).toLocaleDateString("de-DE"),
      price: h.price,
    }));
  }, [history]);

  const marketComparison = useMemo(() => {
    if (!allVehicles || !vehicle.brand || !vehicle.price) return null;
    const yearNum = vehicle.year ? parseInt(vehicle.year) : null;
    const similar = allVehicles.filter((v) => {
      if (v.id === vehicle.id) return false;
      if (v.brand !== vehicle.brand) return false;
      if (!v.price) return false;
      if (yearNum && v.year) {
        const diff = Math.abs(parseInt(v.year) - yearNum);
        if (diff > 3) return false;
      }
      return true;
    });
    if (similar.length === 0) return null;
    const avg = Math.round(similar.reduce((s, v) => s + (v.price || 0), 0) / similar.length);
    return { avg, count: similar.length, diff: vehicle.price - avg };
  }, [allVehicles, vehicle]);

  const formattedPrice = vehicle.price
    ? vehicle.price.toLocaleString("de-DE") + " " + (vehicle.currency || "€")
    : null;

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">Preisentwicklung</h3>

      <div className="flex items-baseline gap-3 mb-4">
        {formattedPrice && (
          <span className="text-2xl font-bold text-primary">{formattedPrice}</span>
        )}
      </div>

      {chartData.length > 1 ? (
        <div className="h-48 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(0 0% 60%)" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(0 0% 60%)" }}
                tickFormatter={(v: number) => v.toLocaleString("de-DE")}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(0 0% 8%)",
                  border: "1px solid hsl(0 0% 18%)",
                  borderRadius: 8,
                  color: "white",
                }}
                formatter={(v: number) => [v.toLocaleString("de-DE") + " €", "Preis"]}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="hsl(0 72% 51%)"
                strokeWidth={2}
                dot={{ fill: "hsl(0 72% 51%)", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-4">
          Preis seit Einstellung unverändert
        </p>
      )}

      {marketComparison && (
        <div className="pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground mb-1">
            Durchschnittspreis ähnlicher {vehicle.brand}-Fahrzeuge ({marketComparison.count} Fahrzeuge):
          </p>
          <div className="flex items-center gap-2">
            <span className="text-foreground font-semibold">
              {marketComparison.avg.toLocaleString("de-DE")} €
            </span>
            {marketComparison.diff < 0 ? (
              <span className="flex items-center gap-1 text-green-400 text-sm">
                <TrendingDown className="h-4 w-4" />
                {Math.abs(marketComparison.diff).toLocaleString("de-DE")} € unter Durchschnitt
              </span>
            ) : marketComparison.diff > 0 ? (
              <span className="flex items-center gap-1 text-red-400 text-sm">
                <TrendingUp className="h-4 w-4" />
                {marketComparison.diff.toLocaleString("de-DE")} € über Durchschnitt
              </span>
            ) : (
              <span className="text-muted-foreground text-sm">Im Durchschnitt</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceHistoryWidget;
