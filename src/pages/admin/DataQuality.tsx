import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Info, XCircle, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

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
  mobile_de_id: string;
  is_sold: boolean;
}

const ISSUE_LABELS: Record<string, string> = {
  missing_images: "Keine Bilder",
  missing_price: "Kein Preis",
  missing_mileage: "Keine Laufleistung",
  missing_year: "Keine Erstzulassung",
  missing_fuel: "Kein Kraftstoff",
  missing_gearbox: "Kein Getriebe",
  missing_power: "Keine Leistung",
  missing_body_type: "Keine Karosserieform",
  implausible_price: "Unplausibler Preis",
  implausible_mileage: "Unplausible Laufleistung",
  implausible_year: "Unplausible Erstzulassung",
  missing_description: "Keine Beschreibung",
  stale: "Lange nicht aktualisiert",
};

function severityIcon(severity: string) {
  if (severity === "error") return <XCircle className="h-4 w-4 text-destructive" />;
  if (severity === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

export default function DataQuality() {
  const [issues, setIssues] = useState<QualityIssueRow[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, VehicleLite>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

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
        .select("id, title, brand, mobile_de_id, is_sold")
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

  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0 };
    for (const i of issues) {
      if (i.severity === "error") c.error++;
      else if (i.severity === "warning") c.warning++;
      else c.info++;
    }
    return c;
  }, [issues]);

  const types = useMemo(() => [...new Set(issues.map((i) => i.issue_type))].sort(), [issues]);

  const filtered = useMemo(
    () =>
      issues.filter(
        (i) =>
          (severityFilter === "all" || i.severity === severityFilter) &&
          (typeFilter === "all" || i.issue_type === typeFilter)
      ),
    [issues, severityFilter, typeFilter]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Datenqualität</h1>
          <p className="text-muted-foreground mt-1">
            Offene Auffälligkeiten im Fahrzeugbestand, ermittelt beim letzten Sync-Lauf.
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Aktualisieren
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Fehler</div>
          <div className="text-2xl font-semibold mt-2 text-destructive">{counts.error}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Warnungen</div>
          <div className="text-2xl font-semibold mt-2 text-amber-600">{counts.warning}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Hinweise</div>
          <div className="text-2xl font-semibold mt-2">{counts.info}</div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {["all", "error", "warning", "info"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={severityFilter === s ? "default" : "outline"}
              onClick={() => setSeverityFilter(s)}
            >
              {s === "all" ? "Alle" : s === "error" ? "Fehler" : s === "warning" ? "Warnungen" : "Hinweise"}
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <Button
            size="sm"
            variant={typeFilter === "all" ? "default" : "outline"}
            onClick={() => setTypeFilter("all")}
          >
            Alle Typen
          </Button>
          {types.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={typeFilter === t ? "default" : "outline"}
              onClick={() => setTypeFilter(t)}
            >
              {ISSUE_LABELS[t] ?? t}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine offenen Auffälligkeiten.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((issue) => {
              const v = vehicles[issue.vehicle_id];
              return (
                <div
                  key={issue.id}
                  className="flex items-start gap-3 pb-3 border-b border-border last:border-0"
                >
                  <div className="mt-0.5">{severityIcon(issue.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {ISSUE_LABELS[issue.issue_type] ?? issue.issue_type}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {issue.severity}
                      </Badge>
                      {v?.is_sold && (
                        <Badge variant="destructive" className="text-xs">
                          Verkauft
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm mt-1 truncate">
                      {v ? (
                        <Link to={`/fahrzeug/${issue.vehicle_id}`} className="hover:underline">
                          {v.brand ? `${v.brand} · ` : ""}
                          {v.title}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Fahrzeug {issue.vehicle_id.slice(0, 8)}…</span>
                      )}
                    </div>
                    {issue.detail && (
                      <div className="text-xs text-muted-foreground mt-1 break-words">{issue.detail}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(issue.detected_at), { addSuffix: true, locale: de })}
                      {v?.mobile_de_id ? ` · ${v.mobile_de_id}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
