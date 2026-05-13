import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Download, RefreshCw, Send, Image as ImageIcon, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

interface StoryWithVehicle {
  id: string;
  story_image_url: string;
  generated_at: string;
  sent_to_dealer: boolean;
  vehicle_id: string;
  vehicle: {
    id: string;
    title: string;
    brand: string | null;
    price: number | null;
  } | null;
}

export default function StoryArchive() {
  const [stories, setStories] = useState<StoryWithVehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
      .select("id, title, brand, price")
      .in("id", vehicleIds);

    const vehiclesMap = new Map((vehiclesData || []).map((v) => [v.id, v]));

    const combined: StoryWithVehicle[] = storiesData.map((s) => ({
      ...s,
      vehicle:
        vehiclesMap.get(s.vehicle_id) ?? {
          id: s.vehicle_id,
          title: "Fahrzeug nicht mehr verfügbar",
          brand: null,
          price: null,
        },
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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const downloadUrl = `${supabaseUrl}/functions/v1/download-story?storyId=${story.id}`;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Bitte erneut anmelden");
        return;
      }

      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`Download fehlgeschlagen: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+?)"/);
      const filename = filenameMatch?.[1] || "Reller-Story.png";

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);

      toast.success("Download gestartet");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Download fehlgeschlagen", {
        description: (error as Error)?.message,
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

  const filtered = stories.filter((s) => {
    if (!s.vehicle) return true;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !s.vehicle.title.toLowerCase().includes(q) &&
        !(s.vehicle.brand?.toLowerCase().includes(q) ?? false)
      ) {
        return false;
      }
    }
    if (dateFilter !== "all") {
      const generated = new Date(s.generated_at).getTime();
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      if (dateFilter === "today" && generated < now - day) return false;
      if (dateFilter === "week" && generated < now - 7 * day) return false;
      if (dateFilter === "month" && generated < now - 30 * day) return false;
    }
    return true;
  });

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filtered.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Story-Archiv</h1>
        <p className="text-muted-foreground mt-1">
          Alle generierten Story-Mockups ansehen und herunterladen
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Fahrzeug suchen…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-full sm:w-48">
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

      {!isLoading && filtered.length > 0 && (
        <Card className="p-3 flex items-center justify-between gap-3 sticky top-2 z-10 bg-card/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={allSelected}
              ref={(el) => {
                if (el) (el as unknown as HTMLInputElement).indeterminate = someSelected;
              }}
              onCheckedChange={(checked) => {
                if (checked) setSelectedIds(new Set(filtered.map((s) => s.id)));
                else setSelectedIds(new Set());
              }}
            />
            <span className="text-sm text-muted-foreground">
              {selectedIds.size === 0
                ? `${filtered.length} Stor${filtered.length === 1 ? "y" : "ies"}`
                : `${selectedIds.size} von ${filtered.length} ausgewählt`}
            </span>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Auswahl aufheben
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={bulkDeleting}>
                    {bulkDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    {selectedIds.size} löschen
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((story) => (
            <Card key={story.id} className="overflow-hidden relative">
              <div className="absolute top-2 left-2 z-10">
                <Checkbox
                  checked={selectedIds.has(story.id)}
                  onCheckedChange={() => toggleSelection(story.id)}
                  className="bg-background/90 backdrop-blur-sm border-2 h-5 w-5"
                />
              </div>
              <button
                type="button"
                onClick={() => setLightboxImage(story.story_image_url)}
                className="block w-full aspect-[9/16] bg-muted"
              >
                <img
                  src={story.story_image_url}
                  alt={story.vehicle?.title || ""}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
              <div className="p-3 space-y-2">
                <div className="text-xs uppercase text-muted-foreground">{story.vehicle?.brand}</div>
                <div className="font-medium text-sm line-clamp-2">{story.vehicle?.title}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(story.generated_at), "dd.MM.yyyy HH:mm", { locale: de })}
                </div>
                <div className="flex gap-1.5 pt-1">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={(e) => downloadStory(story, e)}
                    title="Download"
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
          ))}
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
