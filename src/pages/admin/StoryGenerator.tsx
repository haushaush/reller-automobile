import { useEffect, useState } from "react";
import { Loader2, Image as ImageIcon, Check, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

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
  price: number | null;
  image_urls: string[] | null;
  is_sold: boolean;
  story?: VehicleStory;
}

type FilterMode = "all" | "with_story" | "without_story";

export default function StoryGenerator() {
  const [vehicles, setVehicles] = useState<VehicleWithStory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("without_story");

  const loadVehicles = async () => {
    setIsLoading(true);
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select("id, title, brand, price, image_urls, is_sold")
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
        ...v,
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

  const filteredVehicles = vehicles.filter((v) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!v.title.toLowerCase().includes(q) && !v.brand?.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filter === "with_story" && !v.story) return false;
    if (filter === "without_story" && v.story) return false;
    return true;
  });

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAllWithoutStory = () => {
    setSelectedIds(new Set(filteredVehicles.filter((v) => !v.story).map((v) => v.id)));
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
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Story-Generator</h1>
        <p className="text-muted-foreground mt-1">
          Erstellt Mockup-Bilder im Story-Format (1080×1920) für WhatsApp/Instagram Stories
        </p>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Suchen nach Marke oder Titel..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
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
      </Card>

      {selectedIds.size > 0 && (
        <Card className="p-4 mb-4 bg-secondary/50">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-medium">
              {selectedIds.size} Fahrzeug{selectedIds.size !== 1 ? "e" : ""} ausgewählt
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Auswahl leeren
              </Button>
              <Button onClick={generateStories} disabled={isGenerating} size="sm">
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Erstelle...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Stories erstellen ({selectedIds.size})
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {filteredVehicles.some((v) => !v.story) && selectedIds.size === 0 && (
        <Button variant="outline" size="sm" onClick={selectAllWithoutStory} className="mb-4">
          Alle ohne Story auswählen
        </Button>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredVehicles.length === 0 ? (
        <Card className="p-12 text-center">
          <ImageIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Keine Fahrzeuge gefunden</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredVehicles.map((vehicle) => (
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
