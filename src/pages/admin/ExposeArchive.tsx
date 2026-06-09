import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import FilterBar, { Filters } from "@/components/FilterBar";
import ActiveFilters from "@/components/ActiveFilters";
import {
  toLabelOptions,
  getBodyTypeLabel,
  getFuelLabel,
  getGearboxLabel,
} from "@/lib/mobileDeLabels";
import { useFuzzySearch } from "@/hooks/useFuzzySearch";
import { calculateRelevanceScore } from "@/lib/relevanceScore";
import type { Vehicle } from "@/hooks/useVehicles";

interface ExposeRow {
  id: string;
  vehicle_id: string;
  pdf_url: string;
  updated_at: string;
}

interface VehicleRow {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  model_description: string | null;
  price: number | null;
  currency: string | null;
  image_urls: string[] | null;
  is_sold: boolean;
  category: string | null;
  body_type: string | null;
  year: string | null;
  mileage: number | null;
  fuel: string | null;
  power: number | null;
  gearbox: string | null;
  exterior_color: string | null;
  creation_date: string | null;
  synced_at: string | null;
  vehicle_category: string | null;
}

const defaultFilters: Filters = {
  search: "",
  category: "all",
  brand: "all",
  bodyType: "all",
  yearFrom: "",
  yearTo: "",
  mileageFrom: "",
  mileageTo: "",
  sort: "newest",
  fuel: "all",
  powerFrom: "",
  powerTo: "",
  gearbox: "all",
  priceFrom: "",
  priceTo: "",
  color: "all",
  status: "available",
  recentOnly: "",
};

const selectFilterKeys: (keyof Filters)[] = [
  "category",
  "brand",
  "bodyType",
  "sort",
  "fuel",
  "gearbox",
  "color",
  "status",
];

export default function ExposeArchive() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [exposeMap, setExposeMap] = useState<Map<string, ExposeRow>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const loadData = useCallback(async () => {
    const [vehiclesRes, exposesRes] = await Promise.all([
      supabase
        .from("vehicles")
        .select(
          "id, title, brand, model, model_description, price, currency, image_urls, is_sold, category, body_type, year, mileage, fuel, power, gearbox, exterior_color, creation_date, synced_at, vehicle_category",
        )
        .order("creation_date", { ascending: false, nullsFirst: false }),
      supabase.from("vehicle_exposes").select("id, vehicle_id, pdf_url, updated_at"),
    ]);

    if (vehiclesRes.error) {
      toast.error("Fahrzeuge konnten nicht geladen werden", {
        description: vehiclesRes.error.message,
      });
      setVehicles([]);
      setIsLoading(false);
      return;
    }

    setVehicles((vehiclesRes.data || []) as VehicleRow[]);
    const map = new Map<string, ExposeRow>();
    (exposesRes.data || []).forEach((e) => map.set(e.vehicle_id, e as ExposeRow));
    setExposeMap(map);
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

  const buildFilename = (v: VehicleRow) => {
    const brand = v.brand?.replace(/[^a-zA-Z0-9]/g, "-") || "Fahrzeug";
    const title = v.title?.substring(0, 40).replace(/[^a-zA-Z0-9]/g, "-") || "Expose";
    return `Reller-Expose-${brand}-${title}.pdf`;
  };

  const triggerBrowserDownload = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateExpose = async (v: VehicleRow) => {
    setBusyId(v.id);
    try {
      const { data: full, error: vErr } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", v.id)
        .maybeSingle();
      if (vErr || !full) {
        toast.error("Fahrzeug konnte nicht geladen werden", { description: vErr?.message });
        return;
      }

      const [{ pdf }, { default: VehicleExpose }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/VehicleExpose"),
      ]);
      const blob = await pdf(<VehicleExpose vehicle={full as unknown as Vehicle} />).toBlob();

      const path = `exposes/${v.id}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("vehicle-exposes")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (uploadError) {
        toast.error("Upload fehlgeschlagen", { description: uploadError.message });
        return;
      }

      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id ?? null;

      const { error: dbError } = await supabase.from("vehicle_exposes").upsert(
        {
          vehicle_id: v.id,
          pdf_url: path,
          created_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "vehicle_id" },
      );
      if (dbError) {
        toast.error("Speichern fehlgeschlagen", { description: dbError.message });
        return;
      }

      const filename = buildFilename(v);
      const signedUrl = await getSignedUrl(path, filename);
      triggerBrowserDownload(signedUrl, filename);
      toast.success("Exposé erzeugt und gespeichert");
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error("Exposé-Erzeugung fehlgeschlagen", {
        description: e instanceof Error ? e.message : "Unbekannter Fehler",
      });
    } finally {
      setBusyId(null);
    }
  };

  const openExpose = async (v: VehicleRow, exp: ExposeRow) => {
    try {
      const url = await getSignedUrl(exp.pdf_url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error("PDF konnte nicht geöffnet werden", {
        description: e instanceof Error ? e.message : "Unbekannter Fehler",
      });
    }
  };

  const downloadExisting = async (v: VehicleRow, exp: ExposeRow) => {
    try {
      const filename = buildFilename(v);
      const url = await getSignedUrl(exp.pdf_url, filename);
      triggerBrowserDownload(url, filename);
      toast.success("Download gestartet");
    } catch (e) {
      toast.error("Download fehlgeschlagen", {
        description: e instanceof Error ? e.message : "Unbekannter Fehler",
      });
    }
  };

  const deleteExpose = async (exp: ExposeRow) => {
    setBusyId(exp.vehicle_id);
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

  // ---------- Derived option lists (identical pattern to StoryGenerator) ----------
  const brands = useMemo(
    () => [...new Set(vehicles.map((v) => v.brand).filter(Boolean) as string[])].sort(),
    [vehicles],
  );
  const bodyTypes = useMemo(
    () => toLabelOptions(vehicles.map((v) => v.body_type), getBodyTypeLabel),
    [vehicles],
  );
  const categories = useMemo(
    () => [...new Set(vehicles.map((v) => v.category).filter(Boolean) as string[])].sort(),
    [vehicles],
  );
  const fuels = useMemo(
    () => toLabelOptions(vehicles.map((v) => v.fuel), getFuelLabel),
    [vehicles],
  );
  const gearboxes = useMemo(
    () => toLabelOptions(vehicles.map((v) => v.gearbox), getGearboxLabel),
    [vehicles],
  );
  const colors = useMemo(
    () => [...new Set(vehicles.map((v) => v.exterior_color).filter(Boolean) as string[])].sort(),
    [vehicles],
  );

  const handleFilterChange = useCallback((key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleRemoveFilter = useCallback((key: keyof Filters) => {
    setFilters((prev) => ({
      ...prev,
      [key]: selectFilterKeys.includes(key) ? (key === "status" ? "available" : "all") : "",
    }));
  }, []);

  const handleResetAll = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  const searched = useFuzzySearch(vehicles as never, filters.search) as VehicleRow[];
  const isSearchActive = filters.search.trim().length >= 2;

  const filtered = useMemo(() => {
    let result = [...searched];

    if (filters.status === "available") result = result.filter((v) => !v.is_sold);
    else if (filters.status === "sold") result = result.filter((v) => v.is_sold);

    if (filters.category !== "all") result = result.filter((v) => v.category === filters.category);
    if (filters.brand !== "all") result = result.filter((v) => v.brand === filters.brand);
    if (filters.bodyType !== "all") result = result.filter((v) => v.body_type === filters.bodyType);
    if (filters.yearFrom) result = result.filter((v) => (v.year || "") >= filters.yearFrom);
    if (filters.yearTo) result = result.filter((v) => (v.year || "") <= filters.yearTo);
    if (filters.mileageFrom)
      result = result.filter((v) => (v.mileage || 0) >= Number(filters.mileageFrom));
    if (filters.mileageTo)
      result = result.filter((v) => (v.mileage || 0) <= Number(filters.mileageTo));
    if (filters.fuel !== "all") result = result.filter((v) => v.fuel === filters.fuel);
    if (filters.gearbox !== "all") result = result.filter((v) => v.gearbox === filters.gearbox);
    if (filters.color !== "all") result = result.filter((v) => v.exterior_color === filters.color);
    if (filters.priceFrom)
      result = result.filter((v) => (v.price || 0) >= Number(filters.priceFrom));
    if (filters.priceTo)
      result = result.filter((v) => (v.price || 0) <= Number(filters.priceTo));
    if (filters.powerFrom) {
      const kwMin = Number(filters.powerFrom) / 1.36;
      result = result.filter((v) => (v.power || 0) >= kwMin);
    }
    if (filters.powerTo) {
      const kwMax = Number(filters.powerTo) / 1.36;
      result = result.filter((v) => (v.power || 0) <= kwMax);
    }

    if (filters.recentOnly) {
      const days = Number(filters.recentOnly);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      result = result.filter((v) => {
        const ref = v.creation_date || v.synced_at;
        if (!ref) return false;
        return new Date(ref) >= cutoff;
      });
    }

    if (isSearchActive) {
      const query = filters.search.trim();
      const scoreMap = new Map<string, number>();
      for (const v of result) scoreMap.set(v.id, calculateRelevanceScore(v as never, query));
      result = result.filter((v) => (scoreMap.get(v.id) || 0) > 0);
      result.sort((a, b) => {
        if (a.is_sold !== b.is_sold) return a.is_sold ? 1 : -1;
        return (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0);
      });
    } else {
      const sortFn = (a: VehicleRow, b: VehicleRow): number => {
        switch (filters.sort) {
          case "year-asc":
            return (a.year || "").localeCompare(b.year || "");
          case "year-desc":
            return (b.year || "").localeCompare(a.year || "");
          case "mileage-asc":
            return (a.mileage || 0) - (b.mileage || 0);
          case "mileage-desc":
            return (b.mileage || 0) - (a.mileage || 0);
          case "price-asc":
            return (a.price || 0) - (b.price || 0);
          case "price-desc":
            return (b.price || 0) - (a.price || 0);
          default:
            return (b.year || "").localeCompare(a.year || "");
        }
      };
      result.sort((a, b) => {
        if (a.is_sold !== b.is_sold) return a.is_sold ? 1 : -1;
        return sortFn(a, b);
      });
    }

    return result;
  }, [filters, searched, isSearchActive]);

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 md:pb-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Exposé-Archiv</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          PDF-Exposés für alle Fahrzeuge erzeugen, öffnen oder löschen
        </p>
      </div>

      <Card className="p-4">
        <FilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          brands={brands}
          bodyTypes={bodyTypes}
          categories={categories}
          fuels={fuels}
          gearboxes={gearboxes}
          colors={colors}
          showCategorySelect={true}
          sortDisabled={isSearchActive}
        />
      </Card>

      <ActiveFilters
        filters={filters}
        onRemove={handleRemoveFilter}
        onResetAll={handleResetAll}
      />

      <p className="text-sm text-muted-foreground">
        {isLoading
          ? "Lade Fahrzeuge..."
          : `${filtered.length} Fahrzeug${filtered.length !== 1 ? "e" : ""} gefunden`}
      </p>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Keine Fahrzeuge gefunden</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const exp = exposeMap.get(v.id);
            const isBusy = busyId === v.id;
            const thumb = v.image_urls?.[0];
            return (
              <Card
                key={v.id}
                className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-14 w-20 rounded-md bg-secondary overflow-hidden flex items-center justify-center flex-shrink-0">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link
                        to={`/fahrzeug/${v.id}`}
                        className="font-medium truncate hover:underline"
                      >
                        {v.title}
                      </Link>
                      {v.is_sold && (
                        <span className="text-xs font-semibold text-destructive flex-shrink-0">
                          Verkauft
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {v.brand && <span>{v.brand}</span>}
                      {v.price != null && (
                        <span>
                          {v.price.toLocaleString("de-DE")} {v.currency || "€"}
                        </span>
                      )}
                      {exp ? (
                        <span>
                          Zuletzt erzeugt{" "}
                          {format(new Date(exp.updated_at), "dd. MMM yyyy, HH:mm", {
                            locale: de,
                          })}
                        </span>
                      ) : (
                        <span className="italic">Noch kein Exposé</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  {exp ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openExpose(v, exp)}
                        className="gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span className="hidden sm:inline">Öffnen</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadExisting(v, exp)}
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />
                        <span className="hidden sm:inline">Download</span>
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => generateExpose(v)}
                        disabled={isBusy}
                        className="gap-2"
                      >
                        {isBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">Neu erzeugen</span>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" disabled={isBusy}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Exposé löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Das gespeicherte PDF wird unwiderruflich gelöscht. Ein neues
                              Exposé kann jederzeit über diesen Tab erzeugt werden.
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
                    </>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => generateExpose(v)}
                      disabled={isBusy}
                      className="gap-2"
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      Exposé herunterladen
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
