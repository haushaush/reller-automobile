import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

interface Alert {
  id: string;
  email: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  body_type: string | null;
  max_price: number | null;
  min_year: string | null;
  max_mileage: number | null;
  message: string | null;
  is_active: boolean;
  created_at: string;
  last_notified_at: string | null;
}

export default function AlertsAdmin() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  const loadData = useCallback(async () => {
    const { data } = await supabase
      .from("vehicle_alerts")
      .select("*")
      .order("created_at", { ascending: false });
    setAlerts((data as Alert[]) || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const i = setInterval(loadData, 60000);
    return () => clearInterval(i);
  }, [loadData]);

  const toggleAlert = async (id: string, currentActive: boolean) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_active: !currentActive } : a)));
    await supabase.from("vehicle_alerts").update({ is_active: !currentActive }).eq("id", id);
  };

  const deleteAlert = async (id: string) => {
    if (!confirm("Suchauftrag wirklich löschen?")) return;
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    await supabase.from("vehicle_alerts").delete().eq("id", id);
  };

  const triggerCheck = async () => {
    const { error } = await supabase.functions.invoke("check-alerts");
    if (error) {
      toast.error("Prüfung fehlgeschlagen", { description: error.message });
      return;
    }
    toast.success("Prüfung gestartet");
    setTimeout(loadData, 2000);
  };

  const filtered = alerts.filter((a) => {
    if (filter === "active") return a.is_active;
    if (filter === "inactive") return !a.is_active;
    return true;
  });

  const renderCriteria = (a: Alert) => {
    const chips: string[] = [];
    if (a.brand) chips.push(a.brand);
    if (a.category) chips.push(a.category);
    if (a.body_type) chips.push(a.body_type);
    if (a.max_price) chips.push(`max. ${a.max_price.toLocaleString("de-DE")} €`);
    if (a.min_year) chips.push(`ab ${a.min_year}`);
    if (a.max_mileage) chips.push(`max. ${a.max_mileage.toLocaleString("de-DE")} km`);
    return chips;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Suchaufträge</h1>
          <p className="text-muted-foreground mt-1">Vehicle Alerts verwalten</p>
        </div>
        <Button onClick={triggerCheck} variant="outline">
          <RefreshCw className="h-4 w-4" /> Alle jetzt prüfen
        </Button>
      </div>

      <Card className="p-4">
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="inactive">Inaktiv</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Keine Suchaufträge gefunden</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const chips = renderCriteria(a);
            return (
              <Card key={a.id} className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className="font-semibold">{a.name || a.email}</h3>
                      <Badge variant={a.is_active ? "default" : "outline"}>
                        {a.is_active ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mb-3">
                      {a.email} ·{" "}
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: de })}
                      {a.last_notified_at && (
                        <>
                          {" "}
                          · zuletzt benachrichtigt{" "}
                          {formatDistanceToNow(new Date(a.last_notified_at), {
                            addSuffix: true,
                            locale: de,
                          })}
                        </>
                      )}
                    </div>
                    {chips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {chips.map((c, i) => (
                          <Badge key={i} variant="secondary" className="font-normal">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {a.message && (
                      <p className="mt-2 text-sm bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md p-3">
                        <span className="font-medium">Freitext: </span>
                        {a.message}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={a.is_active}
                        onCheckedChange={() => toggleAlert(a.id, a.is_active)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteAlert(a.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
