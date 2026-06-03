import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Image as ImageIcon, Check, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

interface VehicleStory {
  id: string;
  vehicle_id: string;
  story_image_url: string;
  generated_at: string;
  sent_to_dealer: boolean;
}

interface VehicleWithStory {
  id: string;
  title: string;
  brand: string | null;
  model_description: string | null;
  price: number | null;
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
  story?: VehicleStory;
}

type FilterMode = "all" | "with_story" | "without_story";

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

export default function StoryGenerator() {
  const [vehicles, setVehicles] = useState<VehicleWithStory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("without_story");
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const loadVehicles = async () => {
    setIsLoading(true);
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select(
        "id, title, brand, model_description, price, image_urls, is_sold, category, body_type, year, mileage, fuel, power, gearbox, exterior_color, creation_date, synced_at, vehicle_category",
      )
      .eq("is_sold", false)
      .order("created_at", { ascending: false })
      .limit(200);

    const { data: storiesData } = await supabase
      .from("vehicle_stories")
      .select("id, vehicle_id, story_image_url, generated_at, sent_to_dealer");

    const storiesMap = new Map<string, VehicleStory>(
      (storiesData ?? []).map((s) => [s.vehicle_id, s as VehicleStory]),
    );

    setVehicles(
      (vehiclesData ?? []).map((v) => ({
        ...(v as Omit<VehicleWithStory, "story">),
        story: storiesMap.get(v.id),
      })),
    );
    setIsLoading(false);
  };

  useEffect(() => {
    loadVehicles();

    const channel = supabase
      .channel("story_generator_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicle_stories" },
        () => {
          loadVehicles();
        },
      )
      .subscribe();

    const handleFocus = () => loadVehicles();
    window.addEventListener("focus", handleFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

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

  const searched = useFuzzySearch(vehicles as never, filters.search) as VehicleWithStory[];
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
      const sortFn = (a: VehicleWithStory, b: VehicleWithStory): number => {
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

    // Story-Status-Filter ZUSÄTZLICH anwenden
    if (filter === "with_story") result = result.filter((v) => v.story);
    else if (filter === "without_story") result = result.filter((v) => !v.story);

    return result;
  }, [filters, searched, isSearchActive, filter]);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAllWithoutStory = () => {
    setSelectedIds(new Set(filtered.filter((v) => !v.story).map((v) => v.id)));
  };

  const generateStories = async () => {
    if (selectedIds.size === 0) {
      toast.error("Bitte mindestens ein Fahrzeug auswählen");
      return;
    }
    setIsGenerating(true);
    const { data, error } = await supabase.functions.invoke("generate-story", {
      body: { vehicleIds: Array.from(selectedIds) },
    });
    setIsGenerating(false);
    if (error) {
      toast.error("Story-Generierung fehlgeschlagen", { description: error.message });
      return;
    }
    const generated = (data as { generated?: number } | null)?.generated ?? 0;
    toast.success(`${generated} Story${generated !== 1 ? "s" : ""} erstellt`);
    setSelectedIds(new Set());
    await loadVehicles();
  };

  return (
    <div className="pb-40 md:pb-24">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Story-Generator</h1>
        <p className="text-muted-foreground mt-1">
          Erstellt Mockup-Bilder im Story-Format (1080×1920) für WhatsApp/Instagram Stories
        </p>
      </div>

      <Card className="p-4 mb-4">
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

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <ActiveFilters
          filters={filters}
          onRemove={handleRemoveFilter}
          onResetAll={handleResetAll}
        />
        <div className="flex gap-2">
          <Button
            variant={filter === "without_story" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("without_story")}
          >
            Ohne Story
          </Button>
          <Button
            variant={filter === "with_story" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("with_story")}
          >
            Mit Story
          </Button>
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            Alle
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <Card className="fixed bottom-20 md:bottom-6 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-2xl z-30 p-4 shadow-2xl border-2 border-primary bg-card/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-base font-semibold">
              {selectedIds.size} Fahrzeug{selectedIds.size !== 1 ? "e" : ""} ausgewählt
            </p>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="ghost" size="default" className="h-11" onClick={() => setSelectedIds(new Set())}>
                Aufheben
              </Button>
              <Button onClick={generateStories} disabled={isGenerating} size="default" className="h-11 px-4">
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Erstelle...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" /> Stories erstellen ({selectedIds.size})
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {filtered.some((v) => !v.story) && selectedIds.size === 0 && (
        <Button variant="outline" size="sm" onClick={selectAllWithoutStory} className="mb-4">
          Alle ohne Story auswählen
        </Button>
      )}

      <p className="text-sm text-muted-foreground mb-4">
        {isLoading ? "Lade Fahrzeuge..." : `${filtered.length} Fahrzeug${filtered.length !== 1 ? "e" : ""} gefunden`}
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <ImageIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Keine Fahrzeuge gefunden</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((vehicle) => (
            <Card key={vehicle.id} className="p-4">
              <div className="flex items-start gap-4">
                {!vehicle.story && (
                  <Checkbox
                    checked={selectedIds.has(vehicle.id)}
                    onCheckedChange={() => toggleSelection(vehicle.id)}
                    className="mt-1"
                  />
                )}
                {vehicle.image_urls?.[0] && (
                  <img
                    src={vehicle.image_urls[0]}
                    alt={vehicle.title}
                    className="w-24 h-16 object-cover rounded shrink-0"
                    loading="lazy"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">{vehicle.brand}</div>
                  <div className="font-medium truncate">{vehicle.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {vehicle.price ? `${vehicle.price.toLocaleString("de-DE")} €` : "Auf Anfrage"}
                  </div>
                  {vehicle.story && (
                    <div className="flex items-center gap-3 mt-2">
                      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <Check className="h-3 w-3" /> Story erstellt
                      </span>
                      <a
                        href={vehicle.story.story_image_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Ansehen <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
