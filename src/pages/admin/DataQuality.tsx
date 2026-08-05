import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Info, XCircle, RefreshCw, CheckCircle2, Pencil } from "lucide-react";
import {
  resolveQualityMessage,
  URGENCY,
  URGENCY_ORDER,
  type UrgencyKey,
} from "@/lib/dataQualityMessages";

interface QualityIssueRow {
  id: string;
  vehicle_id: string;
  issue_type: string;
  severity: string;
  detail: string | null;
  detected_at: string;
}

interface VehicleLite {
  id: string;
  title: string;
  brand: string | null;
  is_sold: boolean;
}

function urgencyIcon(urgency: UrgencyKey) {
  if (urgency === "must") return <XCircle className="h-4 w-4 text-destructive" />;
  if (urgency === "should") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

export default function DataQuality() {
  const [issues, setIssues] = useState<QualityIssueRow[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, VehicleLite>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | UrgencyKey>("all");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const { data: issueRows } = await supabase
      .from("vehicle_quality_issues")
      .select("id, vehicle_id, issue_type, severity, detail, detected_at")
      .is("resolved_at", null)
      .order("detected_at", { ascending: false })
      .limit(500);

    const rows = (issueRows as QualityIssueRow[]) || [];
    setIssues(rows);

    const ids = [...new Set(rows.map((r) => r.vehicle_id))];
    if (ids.length > 0) {
      const { data: vehicleRows } = await supabase
        .from("vehicles")
        .select("id, title, brand, is_sold")
        .in("id", ids);
      const map: Record<string, VehicleLite> = {};
      for (const v of (vehicleRows as VehicleLite[]) || []) map[v.id] = v;
      setVehicles(map);
    } else {
      setVehicles({});
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const enriched = useMemo(
    () =>
      issues.map((i) => ({
        ...i,
        message: resolveQualityMessage(i.issue_type, i.severity, i.detail),
      })),
    [issues],
  );

  const grouped = useMemo(() => {
    const g: Record<UrgencyKey, typeof enriched> = { must: [], should: [], hint: [] };
    for (const i of enriched) g[i.message.urgency].push(i);
    return g;
  }, [enriched]);

  const affectedVehicles = useMemo(
    () => new Set(issues.map((i) => i.vehicle_id)).size,
    [issues],
  );

  const summary = (() => {
    if (isLoading) return "Wird geprüft …";
    if (affectedVehicles === 0) return "Alles in Ordnung – kein Fahrzeug braucht Ihre Aufmerksamkeit.";
    const mustCount = new Set(grouped.must.map((i) => i.vehicle_id)).size;
    const base =
      affectedVehicles === 1
        ? "1 Fahrzeug braucht Ihre Aufmerksamkeit"
        : `${affectedVehicles} Fahrzeuge brauchen Ihre Aufmerksamkeit`;
    return mustCount > 0
      ? `${base} – bei ${mustCount} davon ist es dringend.`
      : `${base}.`;
  })();

  const visibleGroups = URGENCY_ORDER.filter(
    (u) => (filter === "all" || filter === u) && grouped[u].length > 0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Datenqualität</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Fahrzeuge, bei denen Fotos, Preis oder wichtige Angaben fehlen
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Neu laden
        </Button>
      </div>

      <Card className="flex items-start gap-3 p-5">
        {affectedVehicles === 0 && !isLoading ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
        )}
        <div>
          <p className="text-base font-medium">{summary}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Je vollständiger ein Fahrzeug erfasst ist, desto häufiger wird es angesehen und
            angefragt.
          </p>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          Alles anzeigen ({enriched.length})
        </Button>
        {URGENCY_ORDER.map((u) => (
          <Button
            key={u}
            size="sm"
            variant={filter === u ? "default" : "outline"}
            onClick={() => setFilter(u)}
          >
            {URGENCY[u].label} ({grouped[u].length})
          </Button>
        ))}
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : visibleGroups.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Hier ist gerade nichts zu tun.</p>
        </Card>
      ) : (
        visibleGroups.map((u) => (
          <section key={u} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {URGENCY[u].label}{" "}
                <span className="text-muted-foreground">({grouped[u].length})</span>
              </h2>
              <p className="text-sm text-muted-foreground">{URGENCY[u].description}</p>
            </div>
            <Card className="divide-y divide-border">
              {grouped[u].map((issue) => {
                const v = vehicles[issue.vehicle_id];
                return (
                  <div
                    key={issue.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5">{urgencyIcon(u)}</div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{issue.message.title}</span>
                          {v?.is_sold && (
                            <Badge variant="outline" className="text-xs">
                              Verkauft
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {issue.message.advice}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {v
                            ? `${v.brand ? `${v.brand} · ` : ""}${v.title}`
                            : "Fahrzeug nicht gefunden"}
                        </p>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link to={`/admin/fahrzeuge/${issue.vehicle_id}`}>
                        <Pencil className="h-4 w-4" />
                        Fahrzeug bearbeiten
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
