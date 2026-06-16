import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type RangeKey = "all" | "12m" | "30d" | "14d";

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "all", label: "Gesamt", days: null },
  { key: "12m", label: "Letzte 12 Monate", days: 365 },
  { key: "30d", label: "Letzte 30 Tage", days: 30 },
  { key: "14d", label: "Letzte 14 Tage", days: 14 },
];

interface SoldRow {
  price: number | null;
  sold_at: string | null;
}

const formatEuro = (n: number | null) => {
  if (n === null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
};

const formatInt = (n: number | null) => {
  if (n === null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE").format(n);
};

const SalesStats = () => {
  const [range, setRange] = useState<RangeKey>("all");
  const [sold, setSold] = useState<SoldRow[] | null>(null);
  const [inStock, setInStock] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: soldData }, { count: stockCount }] = await Promise.all([
        supabase
          .from("vehicles")
          .select("price, sold_at")
          .eq("is_sold", true)
          .not("sold_at", "is", null),
        supabase
          .from("vehicles")
          .select("id", { count: "exact", head: true })
          .eq("is_sold", false),
      ]);
      if (cancelled) return;
      setSold((soldData as SoldRow[]) ?? []);
      setInStock(stockCount ?? 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { count, total, avg } = useMemo(() => {
    if (!sold) return { count: 0, total: 0, avg: null as number | null };
    const cfg = RANGES.find((r) => r.key === range)!;
    const cutoff = cfg.days
      ? Date.now() - cfg.days * 24 * 60 * 60 * 1000
      : null;
    const filtered = sold.filter((r) => {
      if (!cutoff) return true;
      const t = r.sold_at ? Date.parse(r.sold_at) : NaN;
      return Number.isFinite(t) && t >= cutoff;
    });
    const c = filtered.length;
    const t = filtered.reduce((sum, r) => sum + (r.price ?? 0), 0);
    return { count: c, total: t, avg: c > 0 ? t / c : null };
  }, [sold, range]);

  const cards = [
    {
      label: "Verkaufte Fahrzeuge",
      value: loading ? "…" : formatInt(count),
    },
    {
      label: "Verkaufswert",
      value: loading ? "…" : count > 0 ? formatEuro(total) : "—",
    },
    {
      label: "Aktuell im Bestand",
      value: loading ? "…" : formatInt(inStock),
    },
    {
      label: "Ø Verkaufspreis",
      value: loading ? "…" : formatEuro(avg),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2 justify-center mb-5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={cn(
              "px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors",
              range === r.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:border-primary",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-border bg-card px-5 py-5 sm:py-6 text-center min-h-[88px] flex flex-col items-center justify-center"
          >
            <div className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
              {c.value}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              {c.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SalesStats;
