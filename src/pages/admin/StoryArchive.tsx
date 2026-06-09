import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import { Download, RefreshCw, Send, Image as ImageIcon, Loader2, Trash2, Maximize2, Check } from "lucide-react";
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

interface VehicleData {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  model_description: string | null;
  price: number | null;
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

interface StoryWithVehicle {
  id: string;
  story_image_url: string;
  generated_at: string;
  sent_to_dealer: boolean;
  vehicle_id: string;
  vehicle: VehicleData | null;
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

export default function StoryArchive() {
  const [stories, setStories] = useState<StoryWithVehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);

  const loadData = useCallback(async () => {
    const { data: storiesData, error: storiesError } = await supabase
      .from("vehicle_stories")
      .select("*")
      .order("generated_at", { ascending: false });

    if (storiesError) {
      toast.error("Stories konnten nicht geladen werden", {
        description: storiesError.message,
      });
      setStories([]);
      setIsLoading(false);
      return;
    }

    if (!storiesData || storiesData.length === 0) {
      setStories([]);
      setIsLoading(false);
      return;
    }

    const vehicleIds = Array.from(new Set(storiesData.map((s) => s.vehicle_id)));
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select(
        "id, title, brand, model, model_description, price, is_sold, category, body_type, year, mileage, fuel, power, gearbox, exterior_color, creation_date, synced_at, vehicle_category",
      )
      .in("id", vehicleIds);

    const vehiclesMap = new Map(
      (vehiclesData || []).map((v) => [v.id, v as VehicleData]),
    );

    const combined: StoryWithVehicle[] = storiesData.map((s) => ({
      id: s.id,
      story_image_url: s.story_image_url,
      generated_at: s.generated_at,
      sent_to_dealer: s.sent_to_dealer,
      vehicle_id: s.vehicle_id,
      vehicle: vehiclesMap.get(s.vehicle_id) ?? null,
    }));

    setStories(combined);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("vehicle_stories_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicle_stories" },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const downloadStory = async (story: StoryWithVehicle, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();

    try {
      const pathMatch = story.story_image_url.match(/\/vehicle-stories\/(.+?)(\?|$)/);
      if (!pathMatch) throw new Error("File-Path nicht extrahierbar");
      const filePath = decodeURIComponent(pathMatch[1]);

      const brand = story.vehicle?.brand?.replace(/[^a-zA-Z0-9]/g, "-") || "Fahrzeug";
      const title =
        story.vehicle?.title?.substring(0, 40).replace(/[^a-zA-Z0-9]/g, "-") || "Story";
      // Detect extension from storage path (jpg for new stories, png for legacy)
      const ext = filePath.toLowerCase().endsWith(".jpg") || filePath.toLowerCase().endsWith(".jpeg") ? "jpg" : "png";
      const mime = ext === "jpg" ? "image/jpeg" : "image/png";
      const filename = `Reller-Story-${brand}-${title}.${ext}`;

      const { data: pubData } = supabase.storage
        .from("vehicle-stories")
        .getPublicUrl(filePath);
      const publicUrl = pubData.publicUrl;

      // Mobile: use Web Share API with file → opens native share sheet
      // ("In Fotos sichern" on iOS, "Speichern" on Android)
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile && typeof navigator.share === "function") {
        try {
          const response = await fetch(publicUrl);
          const blob = await response.blob();
          const file = new File([blob], filename, { type: mime });
          // Check if files can be shared (iOS/Android Chrome)
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: filename });
            toast.success('Tippe „In Fotos sichern", um das Bild in die Galerie zu speichern');
            return;
          }
        } catch (shareErr) {
          // User cancelled or share failed — fall through to download
          if ((shareErr as Error)?.name === "AbortError") return;
          console.warn("Web Share failed, falling back to download:", shareErr);
        }
      }

      // Desktop / fallback: direct download via Content-Disposition
      const { data } = supabase.storage
        .from("vehicle-stories")
        .getPublicUrl(filePath, { download: filename });
      const downloadUrl = data.publicUrl;

      const newTab = window.open(downloadUrl, "_blank", "noopener,noreferrer");
      if (newTab) {
        toast.success("Download gestartet");
        return;
      }

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Download gestartet");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Download fehlgeschlagen", {
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    }
  };

  const deleteStory = async (story: StoryWithVehicle) => {
    setBusyId(story.id);
    try {
      const fileName = story.story_image_url.split("/vehicle-stories/")[1];
      if (fileName) {
        const { error: storageError } = await supabase.storage
          .from("vehicle-stories")
          .remove([fileName]);
        if (storageError) console.error("Storage delete failed:", storageError);
      }
      const { error: dbError } = await supabase
        .from("vehicle_stories")
        .delete()
        .eq("id", story.id);
      if (dbError) {
        toast.error("Story konnte nicht gelöscht werden", { description: dbError.message });
        return;
      }
      toast.success("Story gelöscht");
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error("Fehler beim Löschen");
    } finally {
      setBusyId(null);
    }
  };

  const deleteSelectedStories = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const storiesToDelete = stories.filter((s) => selectedIds.has(s.id));
    let successCount = 0;
    let failCount = 0;
    const toastId = toast.loading(
      `Lösche ${storiesToDelete.length} Stor${storiesToDelete.length === 1 ? "y" : "ies"}...`
    );

    for (const story of storiesToDelete) {
      try {
        const fileName = story.story_image_url.split("/vehicle-stories/")[1];
        if (fileName) {
          await supabase.storage.from("vehicle-stories").remove([fileName]);
        }
        const { error } = await supabase
          .from("vehicle_stories")
          .delete()
          .eq("id", story.id);
        if (error) failCount++;
        else successCount++;
      } catch (e) {
        failCount++;
        console.error(`Failed to delete story ${story.id}:`, e);
      }
    }

    toast.dismiss(toastId);
    if (failCount === 0) {
      toast.success(`${successCount} Stor${successCount === 1 ? "y" : "ies"} gelöscht`);
    } else {
      toast.error(`${successCount} gelöscht, ${failCount} fehlgeschlagen`, {
        description: "Konsole für Details prüfen",
      });
    }
    setSelectedIds(new Set());
    setBulkDeleting(false);
    await loadData();
  };

  const sendSelectedStories = async () => {
    if (selectedIds.size === 0) return;
    setBulkSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setBulkSending(false);
      toast.error("Nicht angemeldet", { description: "Bitte erneut einloggen." });
      return;
    }
    const { data, error } = await supabase.functions.invoke("send-stories-email", {
      body: { storyIds: Array.from(selectedIds) },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setBulkSending(false);
    if (error) {
      toast.error("Versand fehlgeschlagen", { description: error.message });
      return;
    }
    const sent = (data as { sent?: number; recipient?: string } | null)?.sent ?? 0;
    const recipient = (data as { recipient?: string } | null)?.recipient ?? "info@reller-automobile.de";
    toast.success(`${sent} Stor${sent === 1 ? "y" : "ies"} an ${recipient} versendet`);
    setSelectedIds(new Set());
    await loadData();
  };

  const regenerateStory = async (vehicleId: string) => {
    setBusyId(vehicleId);
    await supabase.from("vehicle_stories").delete().eq("vehicle_id", vehicleId);
    const { error } = await supabase.functions.invoke("generate-story", {
      body: { vehicleIds: [vehicleId] },
    });
    setBusyId(null);
    if (error) {
      toast.error("Neu-Generierung fehlgeschlagen", { description: error.message });
      return;
    }
    toast.success("Story neu generiert");
    loadData();
  };

  const resendEmail = async (vehicleId: string) => {
    setBusyId(vehicleId);
    const { error } = await supabase.functions.invoke("generate-story", {
      body: { vehicleIds: [vehicleId], forceResend: true },
    });
    setBusyId(null);
    if (error) {
      toast.error("Versand fehlgeschlagen", { description: error.message });
      return;
    }
    toast.success("E-Mail erneut versendet");
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  // ----- FilterBar wiring (identical pattern to StoryGenerator) -----
  const vehiclesList = useMemo(
    () =>
      stories
        .map((s) => s.vehicle)
        .filter((v): v is VehicleData => v !== null),
    [stories],
  );

  const brands = useMemo(
    () => [...new Set(vehiclesList.map((v) => v.brand).filter(Boolean) as string[])].sort(),
    [vehiclesList],
  );
  const bodyTypes = useMemo(
    () => toLabelOptions(vehiclesList.map((v) => v.body_type), getBodyTypeLabel),
    [vehiclesList],
  );
  const categories = useMemo(
    () => [...new Set(vehiclesList.map((v) => v.category).filter(Boolean) as string[])].sort(),
    [vehiclesList],
  );
  const fuels = useMemo(
    () => toLabelOptions(vehiclesList.map((v) => v.fuel), getFuelLabel),
    [vehiclesList],
  );
  const gearboxes = useMemo(
    () => toLabelOptions(vehiclesList.map((v) => v.gearbox), getGearboxLabel),
    [vehiclesList],
  );
  const colors = useMemo(
    () => [...new Set(vehiclesList.map((v) => v.exterior_color).filter(Boolean) as string[])].sort(),
    [vehiclesList],
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

  const searched = useFuzzySearch(vehiclesList as never, filters.search) as VehicleData[];
  const isSearchActive = filters.search.trim().length >= 2;

  const filteredVehicles = useMemo(() => {
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
      const sortFn = (a: VehicleData, b: VehicleData): number => {
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

  const filtered = useMemo(() => {
    const order = new Map<string, number>();
    filteredVehicles.forEach((v, i) => order.set(v.id, i));
    return stories
      .filter((s) => order.has(s.vehicle_id))
      .sort((a, b) => (order.get(a.vehicle_id)! - order.get(b.vehicle_id)!));
  }, [stories, filteredVehicles]);

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filtered.length;

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 md:pb-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Story-Archiv</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Alle generierten Story-Mockups ansehen und herunterladen
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


      {!isLoading && filtered.length > 0 && (
        <Card
          className={`flex items-center justify-between gap-3 z-30 bg-card/95 backdrop-blur ${
            selectedIds.size > 0
              ? "fixed bottom-20 md:bottom-6 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-2xl p-4 shadow-2xl border-2 border-primary"
              : "sticky top-2 p-3"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Checkbox
              checked={allSelected}
              ref={(el) => {
                if (el) (el as unknown as HTMLInputElement).indeterminate = someSelected;
              }}
              onCheckedChange={(checked) => {
                if (checked) setSelectedIds(new Set(filtered.map((s) => s.id)));
                else setSelectedIds(new Set());
              }}
              className="h-5 w-5"
            />
            <span className={`truncate ${selectedIds.size > 0 ? "text-base font-semibold" : "text-sm text-muted-foreground"}`}>
              {selectedIds.size === 0
                ? `${filtered.length} Stor${filtered.length === 1 ? "y" : "ies"}`
                : `${selectedIds.size} ausgewählt`}
            </span>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden h-11 w-11"
                onClick={() => setSelectedIds(new Set())}
                title="Auswahl aufheben"
              >
                <span className="text-xl leading-none">×</span>
              </Button>
              <Button variant="ghost" size="sm" className="hidden md:inline-flex h-11" onClick={() => setSelectedIds(new Set())}>
                Aufheben
              </Button>
              <Button size="default" onClick={sendSelectedStories} disabled={bulkSending} className="h-11 px-4">
                {bulkSending ? (
                  <Loader2 className="h-4 w-4 animate-spin md:mr-2" />
                ) : (
                  <Send className="h-4 w-4 md:mr-2" />
                )}
                <span className="hidden md:inline">Versenden ({selectedIds.size})</span>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="default" disabled={bulkDeleting} className="h-11 px-4">
                    {bulkDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin md:mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 md:mr-2" />
                    )}
                    <span className="hidden md:inline">Löschen ({selectedIds.size})</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {selectedIds.size} Stor{selectedIds.size === 1 ? "y" : "ies"} löschen?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Die ausgewählten Stories werden unwiderruflich gelöscht. Die
                      Original-Fahrzeuge bleiben unverändert und Stories können jederzeit neu
                      generiert werden.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={deleteSelectedStories}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Alle löschen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </Card>
      )}

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Keine Stories gefunden</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {filtered.map((story) => {
            const isSelected = selectedIds.has(story.id);
            return (
            <Card
              key={story.id}
              role="button"
              tabIndex={0}
              onClick={() => toggleSelection(story.id)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  toggleSelection(story.id);
                }
              }}
              className={`overflow-hidden relative cursor-pointer transition-all select-none ${
                isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:border-primary/40"
              }`}
            >
              <div className="absolute top-2 left-2 z-10 pointer-events-none">
                <div
                  className={`flex items-center justify-center h-6 w-6 rounded-md border-2 transition-colors ${
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-background/90 backdrop-blur-sm border-border"
                  }`}
                >
                  {isSelected && <Check className="h-4 w-4" />}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxImage(story.story_image_url);
                }}
                title="Bild vergrößern"
                className="absolute top-2 right-2 z-10 h-9 w-9 rounded-md bg-background/90 backdrop-blur-sm border border-border flex items-center justify-center hover:bg-background transition-colors"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <div className="block w-full aspect-[9/16] bg-muted">
                <img
                  src={story.story_image_url}
                  alt={story.vehicle?.title || ""}
                  className="w-full h-full object-cover pointer-events-none"
                  loading="lazy"
                />
              </div>
              <div className="p-3 space-y-2">
                <div className="text-xs uppercase text-muted-foreground">{story.vehicle?.brand}</div>
                <div className="font-medium text-sm line-clamp-2">{story.vehicle?.title}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(story.generated_at), "dd.MM.yyyy HH:mm", { locale: de })}
                </div>
                <div className="flex gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={(e) => {
                      console.log("DOWNLOAD BUTTON CLICKED for story:", story.id);
                      downloadStory(story, e);
                    }}
                    title="Herunterladen"
                    type="button"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => regenerateStory(story.vehicle_id)}
                    disabled={busyId === story.vehicle_id}
                    title="Neu generieren"
                  >
                    {busyId === story.vehicle_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => resendEmail(story.vehicle_id)}
                    disabled={busyId === story.vehicle_id}
                    title="E-Mail erneut senden"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={busyId === story.id}
                        title="Löschen"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                      >
                        {busyId === story.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Story löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Die Story für „{story.vehicle?.title}" wird unwiderruflich gelöscht.
                          Du kannst sie aber jederzeit neu generieren, solange das Fahrzeug noch
                          verfügbar ist.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteStory(story)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Löschen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </Card>
          );})}
        </div>
      )}

      <Dialog open={!!lightboxImage} onOpenChange={(o) => !o && setLightboxImage(null)}>
        <DialogContent className="max-w-md p-0 bg-transparent border-0">
          {lightboxImage && (
            <img src={lightboxImage} alt="Story" className="w-full h-auto rounded-md" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
