import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Download, FileText, Loader2, Trash2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

interface ExposeWithVehicle {
  id: string;
  vehicle_id: string;
  pdf_url: string;
  created_at: string;
  updated_at: string;
  vehicle: {
    id: string;
    title: string;
    brand: string | null;
    price: number | null;
  } | null;
}

export default function ExposeArchive() {
  const [exposes, setExposes] = useState<ExposeWithVehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const { data, error } = await supabase
      .from("vehicle_exposes")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      toast.error("Exposés konnten nicht geladen werden", { description: error.message });
      setExposes([]);
      setIsLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setExposes([]);
      setIsLoading(false);
      return;
    }

    const vehicleIds = Array.from(new Set(data.map((e) => e.vehicle_id)));
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select("id, title, brand, price")
      .in("id", vehicleIds);

    const map = new Map((vehiclesData || []).map((v) => [v.id, v]));
    setExposes(
      data.map((e) => ({
        ...e,
        vehicle:
          map.get(e.vehicle_id) ?? {
            id: e.vehicle_id,
            title: "Fahrzeug nicht mehr verfügbar",
            brand: null,
            price: null,
          },
      })),
    );
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("vehicle_exposes_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicle_exposes" },
        () => loadData(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const getSignedUrl = async (path: string, download?: string) => {
    const { data, error } = await supabase.storage
      .from("vehicle-exposes")
      .createSignedUrl(path, 60 * 60, download ? { download } : undefined);
    if (error || !data) throw error || new Error("Signed URL fehlgeschlagen");
    return data.signedUrl;
  };

  const openExpose = async (exp: ExposeWithVehicle) => {
    try {
      const url = await getSignedUrl(exp.pdf_url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error("PDF konnte nicht geöffnet werden", {
        description: e instanceof Error ? e.message : "Unbekannter Fehler",
      });
    }
  };

  const downloadExpose = async (exp: ExposeWithVehicle) => {
    try {
      const brand = exp.vehicle?.brand?.replace(/[^a-zA-Z0-9]/g, "-") || "Fahrzeug";
      const title =
        exp.vehicle?.title?.substring(0, 40).replace(/[^a-zA-Z0-9]/g, "-") || "Expose";
      const filename = `Reller-Expose-${brand}-${title}.pdf`;
      const url = await getSignedUrl(exp.pdf_url, filename);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Download gestartet");
    } catch (e) {
      toast.error("Download fehlgeschlagen", {
        description: e instanceof Error ? e.message : "Unbekannter Fehler",
      });
    }
  };

  const deleteExpose = async (exp: ExposeWithVehicle) => {
    setBusyId(exp.id);
    try {
      const { error: storageError } = await supabase.storage
        .from("vehicle-exposes")
        .remove([exp.pdf_url]);
      if (storageError) console.warn("Storage delete failed:", storageError);

      const { error: dbError } = await supabase
        .from("vehicle_exposes")
        .delete()
        .eq("id", exp.id);
      if (dbError) {
        toast.error("Exposé konnte nicht gelöscht werden", { description: dbError.message });
        return;
      }
      toast.success("Exposé gelöscht");
      await loadData();
    } finally {
      setBusyId(null);
    }
  };

  const filtered = exposes.filter((e) => {
    if (searchQuery && e.vehicle) {
      const q = searchQuery.toLowerCase();
      if (
        !e.vehicle.title.toLowerCase().includes(q) &&
        !(e.vehicle.brand?.toLowerCase().includes(q) ?? false)
      ) {
        return false;
      }
    }
    if (dateFilter !== "all") {
      const t = new Date(e.updated_at).getTime();
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      if (dateFilter === "today" && t < now - day) return false;
      if (dateFilter === "week" && t < now - 7 * day) return false;
      if (dateFilter === "month" && t < now - 30 * day) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 md:pb-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Exposé-Archiv</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Pro Fahrzeug genau ein gespeichertes PDF-Exposé
        </p>
      </div>

      <Card className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Input
            placeholder="Fahrzeug suchen…"
            value={searchQuery}
            onChange={(ev) => setSearchQuery(ev.target.value)}
            className="flex-1 h-11 sm:h-10"
          />
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-full sm:w-48 h-11 sm:h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Zeiträume</SelectItem>
              <SelectItem value="today">Heute</SelectItem>
              <SelectItem value="week">Letzte 7 Tage</SelectItem>
              <SelectItem value="month">Letzter Monat</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Keine Exposés gefunden</p>
          <p className="text-xs text-muted-foreground mt-2">
            Exposés werden archiviert, sobald ein Admin „PDF-Exposé herunterladen" auf einer
            Fahrzeug-Detailseite drückt.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((exp) => (
            <Card key={exp.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-10 w-10 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {exp.vehicle && exp.vehicle.title !== "Fahrzeug nicht mehr verfügbar" ? (
                      <Link
                        to={`/fahrzeug/${exp.vehicle_id}`}
                        className="font-medium truncate hover:underline"
                      >
                        {exp.vehicle.title}
                      </Link>
                    ) : (
                      <span className="font-medium truncate text-muted-foreground">
                        {exp.vehicle?.title}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {exp.vehicle?.brand && <span>{exp.vehicle.brand}</span>}
                    {exp.vehicle?.price != null && (
                      <span>{exp.vehicle.price.toLocaleString("de-DE")} €</span>
                    )}
                    <span>
                      Aktualisiert{" "}
                      {format(new Date(exp.updated_at), "dd. MMM yyyy, HH:mm", { locale: de })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" onClick={() => openExpose(exp)} className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  <span className="hidden sm:inline">Öffnen</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadExpose(exp)} className="gap-2">
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={busyId === exp.id}>
                      {busyId === exp.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Exposé löschen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Das gespeicherte PDF wird unwiderruflich gelöscht. Ein neues Exposé kann
                        jederzeit über die Fahrzeug-Detailseite erzeugt werden.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteExpose(exp)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Löschen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
