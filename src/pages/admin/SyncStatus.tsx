import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2, SkipForward } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

interface SyncLog {
  id: string;
  sync_name: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  vehicles_total: number | null;
  vehicles_added: number | null;
  vehicles_updated: number | null;
  vehicles_marked_sold: number | null;
  status: string | null;
  error_message: string | null;
}

interface RecentVehicle {
  id: string;
  title: string;
  brand: string | null;
  price: number | null;
  synced_at: string;
  modification_date: string | null;
  is_sold: boolean;
}

export default function SyncStatus() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [recentVehicles, setRecentVehicles] = useState<RecentVehicle[]>([]);
  const [stats, setStats] = useState({ added24h: 0, sold24h: 0, lastSync: null as string | null });
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);

  const loadData = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [logsRes, vehiclesRes, addedRes, soldRes] = await Promise.all([
      supabase.from("sync_logs").select("*").order("started_at", { ascending: false }).limit(20),
      supabase
        .from("vehicles")
        .select("id, title, brand, price, synced_at, modification_date, is_sold")
        .order("synced_at", { ascending: false })
        .limit(15),
      supabase.from("vehicles").select("*", { count: "exact", head: true }).gte("created_at", since),
      supabase
        .from("vehicles")
        .select("*", { count: "exact", head: true })
        .eq("is_sold", true)
        .gte("sold_at", since),
    ]);

    setLogs((logsRes.data as SyncLog[]) || []);
    setRecentVehicles((vehiclesRes.data as RecentVehicle[]) || []);
    setStats({
      added24h: addedRes.count || 0,
      sold24h: soldRes.count || 0,
      lastSync: logsRes.data?.[0]?.started_at ?? null,
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
    const { error } = await supabase.functions.invoke("sync-vehicles");
    setIsTriggering(false);
    if (error) {
      toast.error("Sync fehlgeschlagen", { description: error.message });
      return;
    }
    toast.success("Sync gestartet");
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
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "skipped":
        return <SkipForward className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sync-Status</h1>
          <p className="text-muted-foreground mt-1">Mobile.de-Synchronisation und letzte Updates</p>
        </div>
        <Button onClick={triggerSync} disabled={isTriggering}>
          {isTriggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sync jetzt starten
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Letzter Sync</div>
          <div className="text-lg font-semibold mt-2">
            {stats.lastSync
              ? formatDistanceToNow(new Date(stats.lastSync), { addSuffix: true, locale: de })
              : "Noch nie"}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Neu (24h)</div>
          <div className="text-2xl font-semibold mt-2 text-green-600">+{stats.added24h}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Verkauft (24h)</div>
          <div className="text-2xl font-semibold mt-2">{stats.sold24h}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-4">Sync-Verlauf</h2>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Sync-Läufe</p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
                  <div className="mt-0.5">{getStatusIcon(log.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{log.sync_name}</span>
                      <Badge variant="outline" className="text-xs">
                        {log.status ?? "—"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(log.started_at), { addSuffix: true, locale: de })}
                      {log.duration_ms ? ` · ${formatDuration(log.duration_ms)}` : ""}
                      {log.vehicles_total != null ? ` · ${log.vehicles_total} Fahrzeuge` : ""}
                      {log.vehicles_added ? ` · +${log.vehicles_added} neu` : ""}
                      {log.vehicles_updated ? ` · ${log.vehicles_updated} upd.` : ""}
                      {log.vehicles_marked_sold ? ` · ${log.vehicles_marked_sold} verkauft` : ""}
                    </div>
                    {log.error_message && (
                      <p className="text-xs text-destructive mt-1 break-words">{log.error_message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-4">Zuletzt synchronisierte Fahrzeuge</h2>
          {recentVehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Fahrzeuge</p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {recentVehicles.map((v) => (
                <div key={v.id} className="flex items-start justify-between gap-3 pb-3 border-b border-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs uppercase text-muted-foreground">{v.brand}</div>
                    <div className="text-sm font-medium truncate">{v.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(v.synced_at), { addSuffix: true, locale: de })}
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
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
