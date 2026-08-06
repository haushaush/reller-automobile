import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2, SkipForward, Ban } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import ReconciliationPanel from "@/components/admin/ReconciliationPanel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

/** Verständliche Bezeichnungen für die Zustände eines Laufs */
const RUN_STATUS_LABELS: Record<string, string> = {
  success: "Erfolgreich",
  success_with_warning: "Erfolgreich, mit Hinweis",
  failed: "Fehlgeschlagen",
  running: "Läuft gerade",
  skipped: "Übersprungen",
  aborted: "Abgebrochen",
};

/** Verständliche Bezeichnungen für die einzelnen Abläufe */
const RUN_NAME_LABELS: Record<string, string> = {
  "mobile-de-reconcile": "Abgleich mit Mobile.de",
  "mobile-de-reconcile-accident": "Abgleich Unfallfahrzeuge",
  "sync-vehicles": "Abgleich mit Mobile.de",
  "sync-accident-vehicles": "Abgleich Unfallfahrzeuge",
};

function runName(name: string) {
  return RUN_NAME_LABELS[name] ?? name;
}

interface SyncLog {
  id: string;
  sync_name: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  vehicles_total: number | null;
  vehicles_added: number | null;
  vehicles_updated: number | null;
  vehicles_unchanged: number | null;
  vehicles_marked_sold: number | null;
  pages_fetched: number | null;
  page_size: number | null;
  mobile_total_results: number | null;
  quality_issues_found: number | null;
  price_changes: number | null;
  stop_reason: string | null;
  status: string | null;
  error_message: string | null;
}

interface PriceChangeRow {
  id: string;
  vehicle_id: string;
  price: number | null;
  currency: string | null;
  recorded_at: string;
}

interface RecentVehicle {
  id: string;
  title: string;
  brand: string | null;
  price: number | null;
  synced_at: string;
  created_at: string;
  modification_date: string | null;
  is_sold: boolean;
}

export default function SyncStatus() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [visibleLogs, setVisibleLogs] = useState(10);
  const [recentlyUpdated, setRecentlyUpdated] = useState<RecentVehicle[]>([]);
  const [newVehicles, setNewVehicles] = useState<RecentVehicle[]>([]);
  const [priceChanges, setPriceChanges] = useState<PriceChangeRow[]>([]);
  const [priceVehicles, setPriceVehicles] = useState<Record<string, { title: string; brand: string | null }>>({});
  const [stats, setStats] = useState({
    added24h: 0,
    sold24h: 0,
    lastSync: null as string | null,
    openIssues: 0,
    errorIssues: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);

  const loadData = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [logsRes, updatedRes, newRes, addedRes, soldRes, issuesRes, errorIssuesRes, priceRes] = await Promise.all([
      supabase.from("sync_logs").select("*").order("started_at", { ascending: false }).limit(100),
      supabase
        .from("vehicles")
        .select("id, title, brand, price, synced_at, created_at, modification_date, is_sold")
        .order("synced_at", { ascending: false })
        .limit(15),
      supabase
        .from("vehicles")
        .select("id, title, brand, price, synced_at, created_at, modification_date, is_sold")
        .gte("created_at", since)
        .eq("is_sold", false)
        .or("source.eq.mobile_de,source.is.null")
        .order("created_at", { ascending: false })
        .limit(15),
      supabase.from("vehicles").select("*", { count: "exact", head: true }).gte("created_at", since),
      supabase
        .from("vehicles")
        .select("*", { count: "exact", head: true })
        .eq("is_sold", true)
        .gte("sold_at", since),
      supabase.from("vehicle_quality_issues").select("*", { count: "exact", head: true }).is("resolved_at", null),
      supabase
        .from("vehicle_quality_issues")
        .select("*", { count: "exact", head: true })
        .is("resolved_at", null)
        .eq("severity", "error"),
      supabase
        .from("vehicle_price_history")
        .select("id, vehicle_id, price, currency, recorded_at")
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .limit(15),
    ]);

    setLogs((logsRes.data as SyncLog[]) || []);
    setRecentlyUpdated((updatedRes.data as RecentVehicle[]) || []);
    setNewVehicles((newRes.data as RecentVehicle[]) || []);

    const priceRows = (priceRes.data as PriceChangeRow[]) || [];
    setPriceChanges(priceRows);
    const priceIds = [...new Set(priceRows.map((p) => p.vehicle_id))];
    if (priceIds.length > 0) {
      const { data: pv } = await supabase.from("vehicles").select("id, title, brand").in("id", priceIds);
      const map: Record<string, { title: string; brand: string | null }> = {};
      for (const v of pv || []) map[v.id] = { title: v.title, brand: v.brand };
      setPriceVehicles(map);
    } else {
      setPriceVehicles({});
    }

    setStats({
      added24h: addedRes.count || 0,
      sold24h: soldRes.count || 0,
      lastSync: logsRes.data?.[0]?.started_at ?? null,
      openIssues: issuesRes.count || 0,
      errorIssues: errorIssuesRes.count || 0,
    });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const triggerSync = async () => {
    setIsTriggering(true);
    const { data, error } = await supabase.functions.invoke("sync-vehicles");
    setIsTriggering(false);
    const payload = (data ?? {}) as { error?: string; authError?: boolean };
    const isAuth =
      payload.authError === true ||
      /401|Auth fehlgeschlagen|Zugangsdaten/i.test(payload.error ?? "") ||
      /401|non-2xx/i.test(error?.message ?? "");
    if (error || payload.error) {
      const description = isAuth
        ? "Abgleich fehlgeschlagen: Die Zugangsdaten zu Mobile.de bitte prüfen."
        : payload.error || error?.message || "Unbekannter Fehler";
      toast.error("Abgleich fehlgeschlagen", { description });
      setTimeout(loadData, 1500);
      return;
    }
    toast.success("Abgleich gestartet");
    setTimeout(loadData, 2000);
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "success_with_warning":
        return <CheckCircle2 className="h-4 w-4 text-amber-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "skipped":
        return <SkipForward className="h-4 w-4 text-muted-foreground" />;
      case "aborted":
        return <Ban className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const renderVehicle = (v: RecentVehicle, timestamp: string) => (
    <div key={v.id} className="flex items-start justify-between gap-3 pb-3 border-b border-border last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase text-muted-foreground">{v.brand}</div>
        <div className="text-sm font-medium truncate">{v.title}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: de })}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-medium">
          {v.price ? `${v.price.toLocaleString("de-DE")} €` : "—"}
        </div>
        {v.is_sold && (
          <Badge variant="destructive" className="mt-1 text-xs">
            Verkauft
          </Badge>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Status-Log</h1>
          <p className="text-muted-foreground mt-1">
            Zeigt, ob der Abgleich mit Mobile.de erfolgreich gelaufen ist
          </p>
        </div>
        <Button onClick={triggerSync} disabled={isTriggering}>
          {isTriggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Abgleich jetzt starten
        </Button>
      </div>

      <ReconciliationPanel />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Letzter Abgleich</div>
          <div className="text-lg font-semibold mt-2">
            {stats.lastSync
              ? formatDistanceToNow(new Date(stats.lastSync), { addSuffix: true, locale: de })
              : "Noch nie"}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Neu aufgenommen (24 Std.)</div>
          <div className="text-2xl font-semibold mt-2 text-green-600">+{stats.added24h}</div>
          
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Als verkauft markiert (24 Std.)</div>
          <div className="text-2xl font-semibold mt-2">{stats.sold24h}</div>
          
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Fahrzeuge mit fehlenden Angaben</div>
          <div className="text-2xl font-semibold mt-2">{stats.openIssues}</div>
          <div className="text-xs text-muted-foreground mt-1">
            davon {stats.errorIssues} dringend ·{" "}
            <Link to="/admin/einstellungen/datenqualitaet" className="underline">
              Details
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-4">
            Verlauf der Abgleiche
            {logs.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {logs.length} Meldungen
              </span>
            )}
          </h2>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Es wurde noch kein Abgleich ausgeführt.</p>
          ) : (
            <div className="space-y-3">
              {logs.slice(0, visibleLogs).map((log) => {
                const hasCounts =
                  log.vehicles_total != null ||
                  log.vehicles_added != null ||
                  log.vehicles_updated != null ||
                  log.vehicles_marked_sold != null;
                const pages = log.pages_fetched;
                const pageSize = log.page_size;
                const mobileTotal = log.mobile_total_results;
                const paginationCapWarning =
                  pages != null &&
                  pages === 1 &&
                  pageSize != null &&
                  log.vehicles_total != null &&
                  log.vehicles_total === pageSize;
                return (
                  <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
                    <div className="mt-0.5">{getStatusIcon(log.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{runName(log.sync_name)}</span>
                        <Badge variant="outline" className="text-xs">
                          {RUN_STATUS_LABELS[log.status ?? ""] ?? "Unbekannt"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(log.started_at), { addSuffix: true, locale: de })}
                        {log.duration_ms ? ` · Dauer ${formatDuration(log.duration_ms)}` : ""}
                      </div>
                      {hasCounts && (
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                          <span className="text-green-600">{log.vehicles_added ?? 0} neu</span>
                          <span>·</span>
                          <span>{log.vehicles_updated ?? 0} aktualisiert</span>
                          <span>·</span>
                          <span className="text-destructive">
                            {log.vehicles_marked_sold ?? 0} verkauft
                          </span>
                        </div>
                      )}
                      {log.status === "success_with_warning" && (
                        <p className="text-xs text-amber-600 mt-1">
                          Hinweis: Es wurden vorsichtshalber keine Fahrzeuge als verkauft markiert,
                          weil nicht alle Daten geladen werden konnten.
                        </p>
                      )}
                      {log.status === "failed" && (
                        <p className="text-xs text-destructive mt-1">
                          Der Abgleich konnte nicht abgeschlossen werden. Bitte später erneut starten.
                        </p>
                      )}

                      <Collapsible>
                        <CollapsibleTrigger className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          <ChevronDown className="h-3 w-3" />
                          Technische Details
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-1 space-y-0.5 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                          <div>Vorgang: {log.sync_name}</div>
                          <div>Zustand: {log.status ?? "—"}</div>
                          <div>Gelesene Datensätze: {log.vehicles_total ?? 0}</div>
                          {log.vehicles_unchanged != null && (
                            <div>Unverändert: {log.vehicles_unchanged}</div>
                          )}
                          {pages != null && <div>Geladene Seiten: {pages}</div>}
                          {mobileTotal != null && <div>Treffer bei Mobile.de: {mobileTotal}</div>}
                          {log.price_changes != null && (
                            <div>Preisänderungen: {log.price_changes}</div>
                          )}
                          {log.quality_issues_found != null && (
                            <div>Gefundene Datenlücken: {log.quality_issues_found}</div>
                          )}
                          {log.stop_reason && <div>Abbruchgrund: {log.stop_reason}</div>}
                          {paginationCapWarning && (
                            <div className="text-amber-600">
                              Es wurden genau {pageSize} Fahrzeuge geladen – möglicherweise fehlen
                              weitere.
                            </div>
                          )}
                          {log.error_message && (
                            <div className="text-destructive break-words">{log.error_message}</div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </div>
                );

              })}
              {logs.length > visibleLogs && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setVisibleLogs((n) => n + 10)}
                >
                  Weitere anzeigen ({logs.length - visibleLogs} übrig)
                </Button>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-lg font-semibold">Neue Fahrzeuge (24 Std.)</h2>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Fahrzeuge, die in den letzten 24 Stunden neu aufgenommen wurden.
            </p>
            {newVehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine neuen Fahrzeuge in den letzten 24 Stunden.</p>
            ) : (
              <div className="space-y-3 max-h-[240px] overflow-y-auto">
                {newVehicles.map((v) => renderVehicle(v, v.created_at))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold">Zuletzt aktualisierte Fahrzeuge</h2>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Diese Fahrzeuge wurden beim letzten Abgleich aktualisiert – sie sind nicht zwingend neu.
            </p>
            {recentlyUpdated.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Fahrzeuge</p>
            ) : (
              <div className="space-y-3 max-h-[240px] overflow-y-auto">
                {recentlyUpdated.map((v) => renderVehicle(v, v.synced_at))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold">Preisänderungen (24 Std.)</h2>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Preise, die sich in den letzten 24 Stunden geändert haben.
            </p>
            {priceChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Preisänderungen in den letzten 24 Stunden.</p>
            ) : (
              <div className="space-y-3 max-h-[240px] overflow-y-auto">
                {priceChanges.map((p) => {
                  const v = priceVehicles[p.vehicle_id];
                  return (
                    <div
                      key={p.id}
                      className="flex items-start justify-between gap-3 pb-3 border-b border-border last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        {v && <div className="text-xs uppercase text-muted-foreground">{v.brand}</div>}
                        <div className="text-sm font-medium truncate">
                          {v ? (
                            <Link to={`/fahrzeug/${p.vehicle_id}`} className="hover:underline">
                              {v.title}
                            </Link>
                          ) : (
                            `Fahrzeug ${p.vehicle_id.slice(0, 8)}…`
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(p.recorded_at), { addSuffix: true, locale: de })}
                        </div>
                      </div>
                      <div className="text-sm font-medium shrink-0">
                        {p.price != null ? `${p.price.toLocaleString("de-DE")} ${p.currency ?? "EUR"}` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
