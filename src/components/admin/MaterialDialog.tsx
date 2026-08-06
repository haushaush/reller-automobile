import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Download,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Maximize2,
  Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MATERIAL_HINTS,
  MATERIAL_LABELS,
  buildCollageBlob,
  safeFileName,
  shareOrDownloadBlob,
  shareOrDownloadUrl,
  uploadCollage,
  type MaterialKind,
} from "@/lib/materials";
import { EXPOSE_ERROR_HINT, generateExposeBlob, logExposeFailure } from "@/lib/exposePdf";
import type { Vehicle } from "@/hooks/useVehicles";
import { resolveVehicleImages } from "@/lib/vehicleImages";

export interface MaterialVehicle {
  id: string;
  title: string;
  brand?: string | null;
  image_urls?: string[] | null;
  custom_image_urls?: string[] | null;
  hidden_image_urls?: string[] | null;
  image_order?: string[] | null;
}

interface MaterialState {
  exists: boolean;
  createdAt: string | null;
  /** Direkt anzeigbare Vorschau (Bild) bzw. Datei-URL. */
  url: string | null;
  /** Storage-Pfad, nur beim Exposé relevant. */
  path: string | null;
}

const EMPTY: MaterialState = { exists: false, createdAt: null, url: null, path: null };

const ICONS: Record<MaterialKind, typeof ImageIcon> = {
  story: ImageIcon,
  expose: FileText,
  collage: LayoutGrid,
};

interface Props {
  vehicle: MaterialVehicle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wird nach dem Erstellen eines Materials aufgerufen. */
  onChanged?: () => void;
}

export default function MaterialDialog({ vehicle, open, onOpenChange, onChanged }: Props) {
  const [state, setState] = useState<Record<MaterialKind, MaterialState>>({
    story: EMPTY,
    expose: EMPTY,
    collage: EMPTY,
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<MaterialKind | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!vehicle) return;
    setLoading(true);
    const [storyRes, exposeRes, collageRes] = await Promise.all([
      supabase
        .from("vehicle_stories")
        .select("story_image_url, generated_at")
        .eq("vehicle_id", vehicle.id)
        .order("generated_at", { ascending: false })
        .limit(1),
      supabase
        .from("vehicle_exposes")
        .select("pdf_url, updated_at")
        .eq("vehicle_id", vehicle.id)
        .limit(1),
      supabase
        .from("vehicle_collages")
        .select("image_url, created_at")
        .eq("vehicle_id", vehicle.id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const story = storyRes.data?.[0];
    const expose = exposeRes.data?.[0];
    const collage = collageRes.data?.[0];

    setState({
      story: story
        ? { exists: true, createdAt: story.generated_at, url: story.story_image_url, path: null }
        : EMPTY,
      expose: expose
        ? { exists: true, createdAt: expose.updated_at, url: null, path: expose.pdf_url }
        : EMPTY,
      collage: collage
        ? { exists: true, createdAt: collage.created_at, url: collage.image_url, path: null }
        : EMPTY,
    });
    setLoading(false);
  }, [vehicle]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!vehicle) return null;

  const baseName = safeFileName(`${vehicle.brand ?? ""}-${vehicle.title}`) || "Fahrzeug";

  const createStory = async () => {
    const { error } = await supabase.functions.invoke("generate-story", {
      body: { vehicleIds: [vehicle.id] },
    });
    if (error) throw new Error(error.message);
  };

  const createExpose = async () => {
    const { data: full, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", vehicle.id)
      .maybeSingle();
    if (error || !full) throw new Error(error?.message ?? "Fahrzeug nicht gefunden");
    try {
      const blob = await generateExposeBlob(full as unknown as Vehicle);
      const path = `exposes/${vehicle.id}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("vehicle-exposes")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      const { data: session } = await supabase.auth.getSession();
      const { error: dbErr } = await supabase.from("vehicle_exposes").upsert(
        {
          vehicle_id: vehicle.id,
          pdf_url: path,
          created_by: session.session?.user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "vehicle_id" },
      );
      if (dbErr) throw dbErr;
    } catch (e) {
      await logExposeFailure(vehicle.id, vehicle.title, e, "admin-materials");
      throw new Error(EXPOSE_ERROR_HINT);
    }
  };

  const createCollage = async () => {
    const images = resolveVehicleImages(vehicle);
    if (images.length === 0) throw new Error("Für dieses Fahrzeug liegen keine Bilder vor");
    const blob = await buildCollageBlob(images);
    await uploadCollage(vehicle.id, blob, baseName);
  };

  const create = async (kind: MaterialKind) => {
    setBusy(kind);
    try {
      if (kind === "story") await createStory();
      else if (kind === "expose") await createExpose();
      else await createCollage();
      toast.success(`${MATERIAL_LABELS[kind]} erstellt`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(`${MATERIAL_LABELS[kind]} konnte nicht erstellt werden`, {
        description: e instanceof Error ? e.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy(null);
    }
  };

  const download = async (kind: MaterialKind) => {
    const item = state[kind];
    setBusy(kind);
    try {
      if (kind === "expose" && item.path) {
        const { data, error } = await supabase.storage
          .from("vehicle-exposes")
          .createSignedUrl(item.path, 3600, { download: `Reller-Expose-${baseName}.pdf` });
        if (error || !data) throw error ?? new Error("Link konnte nicht erzeugt werden");
        const a = document.createElement("a");
        a.href = data.signedUrl;
        a.rel = "noopener noreferrer";
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else if (item.url) {
        const suffix = kind === "story" ? "Story" : "Collage";
        const mode = await shareOrDownloadUrl(item.url, `Reller-${suffix}-${baseName}.jpg`);
        if (mode === "downloaded") toast.success("Datei gespeichert");
      }
    } catch (e) {
      toast.error("Download fehlgeschlagen", {
        description: e instanceof Error ? e.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy(null);
    }
  };

  const openExposePreview = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("vehicle-exposes")
      .createSignedUrl(path, 3600);
    if (error || !data) {
      toast.error("Vorschau nicht möglich", { description: error?.message });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="truncate">{vehicle.title}</DialogTitle>
            <DialogDescription>
              Welches Material möchten Sie ansehen oder erstellen?
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {(Object.keys(MATERIAL_LABELS) as MaterialKind[]).map((kind) => {
                const item = state[kind];
                const Icon = ICONS[kind];
                return (
                  <Card key={kind} className="flex items-start gap-3 p-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                      {item.url ? (
                        <img src={item.url} alt={MATERIAL_LABELS[kind]} className="h-full w-full object-cover" />
                      ) : (
                        <Icon className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{MATERIAL_LABELS[kind]}</span>
                        {item.exists ? (
                          <Badge variant="secondary" className="text-[10px]">Vorhanden</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Noch nicht erstellt
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{MATERIAL_HINTS[kind]}</p>
                      {item.createdAt && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Erstellt am {format(new Date(item.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.exists ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                kind === "expose" && item.path
                                  ? openExposePreview(item.path)
                                  : item.url && setPreview(item.url)
                              }
                            >
                              <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                              Ansehen
                            </Button>
                            <Button size="sm" disabled={busy === kind} onClick={() => download(kind)}>
                              {busy === kind ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              Herunterladen
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy === kind}
                              onClick={() => create(kind)}
                            >
                              Neu erstellen
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" disabled={busy === kind} onClick={() => create(kind)}>
                            {busy === kind ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Plus className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Jetzt erstellen
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl p-2">
          {preview && <img src={preview} alt="Vorschau" className="max-h-[80vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
