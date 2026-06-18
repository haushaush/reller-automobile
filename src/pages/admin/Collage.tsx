import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Images as ImagesIcon,
  Loader2,
  Share2,
} from "lucide-react";
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

const FETCH_IMAGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-image`;

function safeName(v: VehicleRow) {
  const parts = [v.brand, v.model].filter(Boolean).join("-");
  const slug = (parts || v.title || "Fahrzeug")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "Fahrzeug";
}

function extFromMime(mime: string, fallbackUrl: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  const m = fallbackUrl.split("?")[0].match(/\.(jpe?g|png|webp|gif)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

async function loadImage(url: string): Promise<Blob> {
  // Try direct first
  try {
    const r = await fetch(url, { mode: "cors" });
    if (r.ok) return await r.blob();
  } catch {
    /* fall through */
  }
  // Proxy fallback
  const r = await fetch(`${FETCH_IMAGE_URL}?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error(`Bild konnte nicht geladen werden (${r.status})`);
  return await r.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

interface SelectedImage {
  vehicleId: string;
  url: string;
  index: number;
}

export default function Collage() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // key: `${vehicleId}::${url}`
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "zip" | "pdf" | "share" | "single">(null);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => {
    try {
      const probe = new File(["x"], "probe.txt", { type: "text/plain" });
      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
      if (typeof nav !== "undefined" && nav.canShare && nav.canShare({ files: [probe] })) {
        setCanShareFiles(true);
      }
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select(
          "id, title, brand, model, model_description, price, currency, image_urls, is_sold, category, body_type, year, mileage, fuel, power, gearbox, exterior_color, creation_date, synced_at, vehicle_category",
        )
        .order("creation_date", { ascending: false, nullsFirst: false });
      if (error) {
        toast.error("Fahrzeuge konnten nicht geladen werden", {
          description: error.message,
        });
        setVehicles([]);
      } else {
        setVehicles((data || []) as VehicleRow[]);
      }
      setIsLoading(false);
    })();
  }, []);

  // ---------- derived option lists ----------
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
  const handleResetAll = useCallback(() => setFilters(defaultFilters), []);

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
          case "year-asc": return (a.year || "").localeCompare(b.year || "");
          case "year-desc": return (b.year || "").localeCompare(a.year || "");
          case "mileage-asc": return (a.mileage || 0) - (b.mileage || 0);
          case "mileage-desc": return (b.mileage || 0) - (a.mileage || 0);
          case "price-asc": return (a.price || 0) - (b.price || 0);
          case "price-desc": return (b.price || 0) - (a.price || 0);
          default: return (b.year || "").localeCompare(a.year || "");
        }
      };
      result.sort((a, b) => {
        if (a.is_sold !== b.is_sold) return a.is_sold ? 1 : -1;
        return sortFn(a, b);
      });
    }
    return result;
  }, [filters, searched, isSearchActive]);

  const keyOf = (vid: string, url: string) => `${vid}::${url}`;

  const toggleImage = (vid: string, url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyOf(vid, url);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const toggleAllForVehicle = (v: VehicleRow, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      (v.image_urls || []).forEach((u) => {
        const k = keyOf(v.id, u);
        if (on) next.add(k);
        else next.delete(k);
      });
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collectSelectedImages = (): SelectedImage[] => {
    const items: SelectedImage[] = [];
    for (const v of vehicles) {
      const urls = v.image_urls || [];
      urls.forEach((url, i) => {
        if (selected.has(keyOf(v.id, url))) {
          items.push({ vehicleId: v.id, url, index: i });
        }
      });
    }
    return items;
  };

  const clearSelection = () => setSelected(new Set());

  const downloadZip = async () => {
    const items = collectSelectedImages();
    if (items.length === 0) {
      toast.error("Keine Bilder ausgewählt");
      return;
    }
    setBusy("zip");
    setProgress({ done: 0, total: items.length });
    try {
      const [{ default: JSZip }, { saveAs }] = await Promise.all([
        import("jszip"),
        import("file-saver"),
      ]);
      const zip = new JSZip();
      const vmap = new Map(vehicles.map((v) => [v.id, v]));
      const usedNames = new Set<string>();
      let failed = 0;
      let done = 0;
      const counters = new Map<string, number>();

      for (const item of items) {
        const v = vmap.get(item.vehicleId);
        try {
          const blob = await loadImage(item.url);
          const ext = extFromMime(blob.type, item.url);
          const base = v ? safeName(v) : "Fahrzeug";
          const n = (counters.get(item.vehicleId) || 0) + 1;
          counters.set(item.vehicleId, n);
          let name = `${base}-${n}.${ext}`;
          let dedup = 1;
          while (usedNames.has(name)) {
            name = `${base}-${n}-${++dedup}.${ext}`;
          }
          usedNames.add(name);
          zip.file(name, blob);
        } catch (e) {
          console.warn("Image fetch failed", item.url, e);
          failed++;
        }
        done++;
        setProgress({ done, total: items.length });
      }

      if (zip.files && Object.keys(zip.files).length === 0) {
        toast.error("Kein Bild konnte geladen werden");
        return;
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const ts = new Date().toISOString().slice(0, 10);
      saveAs(blob, `Reller-Collage-${ts}.zip`);
      if (failed > 0) {
        toast.warning(`ZIP erstellt — ${failed} Bild(er) fehlgeschlagen`);
      } else {
        toast.success("ZIP heruntergeladen");
      }
    } catch (e) {
      console.error(e);
      toast.error("ZIP-Erstellung fehlgeschlagen", {
        description: e instanceof Error ? e.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy(null);
      setProgress({ done: 0, total: 0 });
    }
  };

  const downloadPdf = async () => {
    const items = collectSelectedImages();
    if (items.length === 0) {
      toast.error("Keine Bilder ausgewählt");
      return;
    }
    setBusy("pdf");
    setProgress({ done: 0, total: items.length });
    try {
      const [{ Document, Page, Image: PdfImage, View, Text, StyleSheet, pdf }] = await Promise.all([
        import("@react-pdf/renderer"),
      ]);
      const { saveAs } = await import("file-saver");
      const vmap = new Map(vehicles.map((v) => [v.id, v]));

      const loaded: { dataUrl: string; vehicle?: VehicleRow }[] = [];
      let failed = 0;
      let done = 0;
      for (const item of items) {
        try {
          const blob = await loadImage(item.url);
          const dataUrl = await blobToDataUrl(blob);
          loaded.push({ dataUrl, vehicle: vmap.get(item.vehicleId) });
        } catch (e) {
          console.warn("PDF image fetch failed", item.url, e);
          failed++;
        }
        done++;
        setProgress({ done, total: items.length });
      }
      if (loaded.length === 0) {
        toast.error("Kein Bild konnte geladen werden");
        return;
      }

      const styles = StyleSheet.create({
        page: {
          padding: 24,
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        },
        title: {
          fontSize: 11,
          marginBottom: 8,
          color: "#333",
        },
        img: {
          maxWidth: "100%",
          maxHeight: "90%",
          objectFit: "contain",
        },
      });

      const doc = (
        <Document>
          {loaded.map((it, i) => (
            <Page key={i} size="A4" orientation="landscape" style={styles.page}>
              {it.vehicle && (
                <Text style={styles.title}>{it.vehicle.title}</Text>
              )}
              <PdfImage src={it.dataUrl} style={styles.img} />
            </Page>
          ))}
        </Document>
      );

      const blob = await pdf(doc).toBlob();
      const ts = new Date().toISOString().slice(0, 10);
      saveAs(blob, `Reller-Collage-${ts}.pdf`);
      if (failed > 0) {
        toast.warning(`PDF erstellt — ${failed} Bild(er) fehlgeschlagen`);
      } else {
        toast.success("PDF heruntergeladen");
      }
    } catch (e) {
      console.error(e);
      toast.error("PDF-Erstellung fehlgeschlagen", {
        description: e instanceof Error ? e.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy(null);
      setProgress({ done: 0, total: 0 });
    }
  };

  const selectedCount = selected.size;
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 md:pb-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Collage</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Fahrzeugbilder auswählen und als ZIP oder PDF herunterladen
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

      <div className="sticky top-0 z-20 -mx-4 sm:mx-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-y sm:border sm:rounded-md px-4 sm:px-4 py-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground flex-1 min-w-[140px]">
          {isLoading
            ? "Lade Fahrzeuge..."
            : `${filtered.length} Fahrzeug${filtered.length !== 1 ? "e" : ""} • ${selectedCount} Bild${selectedCount !== 1 ? "er" : ""} ausgewählt`}
        </p>
        {selectedCount > 0 && !busy && (
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            Auswahl leeren
          </Button>
        )}
        <Button
          onClick={downloadZip}
          disabled={selectedCount === 0 || busy !== null}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          {busy === "zip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          ZIP ({selectedCount})
        </Button>
        <Button
          onClick={downloadPdf}
          disabled={selectedCount === 0 || busy !== null}
          size="sm"
          className="gap-2"
        >
          {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          PDF ({selectedCount})
        </Button>
      </div>

      {busy && progress.total > 0 && (
        <div className="space-y-1">
          <Progress value={progressPct} />
          <p className="text-xs text-muted-foreground">
            {progress.done} / {progress.total} Bilder verarbeitet
          </p>
        </div>
      )}

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <ImagesIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Keine Fahrzeuge gefunden</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const urls = v.image_urls || [];
            const isOpen = expanded.has(v.id);
            const selectedForV = urls.filter((u) => selected.has(keyOf(v.id, u))).length;
            const allOn = urls.length > 0 && selectedForV === urls.length;
            return (
              <Card key={v.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleExpand(v.id)}
                  className="w-full p-3 sm:p-4 flex items-center gap-3 text-left hover:bg-secondary/40 transition-colors"
                >
                  <div className="h-14 w-20 rounded-md bg-secondary overflow-hidden flex items-center justify-center flex-shrink-0">
                    {urls[0] ? (
                      <img src={urls[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <ImagesIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{v.title}</span>
                      {v.is_sold && (
                        <span className="text-xs font-semibold text-destructive flex-shrink-0">
                          Verkauft
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {urls.length} Bild{urls.length !== 1 ? "er" : ""}
                      {selectedForV > 0 && ` • ${selectedForV} ausgewählt`}
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="border-t p-3 sm:p-4 space-y-3">
                    {urls.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Keine Bilder vorhanden.</p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`all-${v.id}`}
                            checked={allOn}
                            onCheckedChange={(c) => toggleAllForVehicle(v, !!c)}
                          />
                          <label
                            htmlFor={`all-${v.id}`}
                            className="text-xs font-medium cursor-pointer select-none"
                          >
                            Alle {urls.length} Bilder {allOn ? "abwählen" : "auswählen"}
                          </label>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                          {urls.map((url, idx) => {
                            const k = keyOf(v.id, url);
                            const isSel = selected.has(k);
                            return (
                              <button
                                key={k}
                                type="button"
                                onClick={() => toggleImage(v.id, url)}
                                className={`relative aspect-[4/3] rounded-md overflow-hidden border-2 transition-all ${
                                  isSel
                                    ? "border-primary ring-2 ring-primary/40"
                                    : "border-transparent hover:border-border"
                                }`}
                              >
                                <img
                                  src={url}
                                  alt={`${v.title} ${idx + 1}`}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                                <span className="absolute top-1.5 left-1.5 bg-background/90 rounded p-0.5">
                                  <Checkbox checked={isSel} onCheckedChange={() => toggleImage(v.id, url)} />
                                </span>
                                <span className="absolute bottom-1 right-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-background/80 text-foreground">
                                  {idx + 1}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
