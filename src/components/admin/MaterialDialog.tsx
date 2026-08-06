import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  AlertTriangle,
  Download,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Maximize2,
  Plus,
} from "lucide-react";
import { useIsTouchDevice, saveButtonLabel, saveToastMessage, GALLERY_HINT } from "@/lib/download";
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
  MATERIAL_BUCKETS,
  MATERIAL_HINTS,
  MATERIAL_LABELS,
  buildCollageBlob,
  createSignedMaterialUrl,
  describeStorageError,
  downloadFromUrl,
  materialFileName,
  isImageMaterial,
  safeFileName,
  storagePathFromValue,
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
  model?: string | null;
  image_urls?: string[] | null;
  custom_image_urls?: string[] | null;
  hidden_image_urls?: string[] | null;
  image_order?: string[] | null;
}

interface MaterialState {
  exists: boolean;
  createdAt: string | null;
  /** Storage-Pfad im jeweiligen Bucket. */
  path: string | null;
  /** Signierter Link (60 Minuten), erst nach dem Prüfen gesetzt. */
  signedUrl: string | null;
  /** Datei im Bucket nicht mehr auffindbar. */
  missing: boolean;
}

const EMPTY: MaterialState = {
  exists: false,
  createdAt: null,
  path: null,
  signedUrl: null,
  missing: false,
};

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
  const isTouch = useIsTouchDevice();
  const [preview, setPreview] = useState<{ kind: MaterialKind; url: string } | null>(null);

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
        .select("image_url, storage_path, created_at")
        .eq("vehicle_id", vehicle.id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const story = storyRes.data?.[0];
    const expose = exposeRes.data?.[0];
    const collage = collageRes.data?.[0];

    const raw: Record<MaterialKind, { value: string | null; createdAt: string | null } | null> = {
      story: story ? { value: story.story_image_url, createdAt: story.generated_at } : null,
      expose: expose ? { value: expose.pdf_url, createdAt: expose.updated_at } : null,
      collage: collage
        ? { value: collage.storage_path ?? collage.image_url, createdAt: collage.created_at }
        : null,
    };

    const next = { story: EMPTY, expose: EMPTY, collage: EMPTY } as Record<MaterialKind, MaterialState>;
    await Promise.all(
      (Object.keys(raw) as MaterialKind[]).map(async (kind) => {
        const entry = raw[kind];
        if (!entry) return;
        const path = storagePathFromValue(entry.value, MATERIAL_BUCKETS[kind]);
        if (!path) {
          next[kind] = { exists: true, createdAt: entry.createdAt, path: null, signedUrl: null, missing: true };
          return;
        }
        try {
          const signedUrl = await createSignedMaterialUrl(MATERIAL_BUCKETS[kind], path);
          next[kind] = { exists: true, createdAt: entry.createdAt, path, signedUrl, missing: false };
        } catch {
          next[kind] = { exists: true, createdAt: entry.createdAt, path, signedUrl: null, missing: true };
        }
      }),
    );

    setState(next);
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

  const fileNameFor = (kind: MaterialKind, path: string | null) =>
    materialFileName(kind, { brand: vehicle.brand, model: vehicle.model, fallback: vehicle.title }, path);

  /** Holt einen frischen signierten Link – gespeicherte Links laufen nach 60 Minuten ab. */
  const freshUrl = async (kind: MaterialKind) => {
    const item = state[kind];
    if (!item.path) throw describeStorageError("not found");
    try {
      return await createSignedMaterialUrl(MATERIAL_BUCKETS[kind], item.path);
    } catch (e) {
      const err = describeStorageError(e);
      if (err.missing) setState((s) => ({ ...s, [kind]: { ...s[kind], missing: true, signedUrl: null } }));
      throw err;
    }
  };

  const download = async (kind: MaterialKind) => {
    setBusy(kind);
    try {
      const url = await freshUrl(kind);
      const mode = await downloadFromUrl(url, fileNameFor(kind, state[kind].path));
      const msg = saveToastMessage(mode, isImageMaterial(kind, state[kind].path));
      // Abbruch im Teilen-Dialog ist kein Fehler und bekommt keine Meldung.
      if (msg) toast.success(mode === "downloaded" ? `${MATERIAL_LABELS[kind]} gespeichert` : msg);
    } catch (e) {
      const err = describeStorageError(e);
      toast.error("Download fehlgeschlagen", {
        description: err.message,
        action: { label: "Erneut versuchen", onClick: () => void download(kind) },
      });
    } finally {
      setBusy(null);
    }
  };

  const view = async (kind: MaterialKind) => {
    setBusy(kind);
    try {
      const url = await freshUrl(kind);
      setPreview({ kind, url });
    } catch (e) {
      const err = describeStorageError(e);
      toast.error("Vorschau nicht möglich", {
        description: err.message,
        action: { label: "Erneut versuchen", onClick: () => void view(kind) },
      });
    } finally {
      setBusy(null);
    }
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
                      {kind !== "expose" && item.signedUrl && !item.missing ? (
                        <img
                          src={item.signedUrl}
                          alt={MATERIAL_LABELS[kind]}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Icon className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{MATERIAL_LABELS[kind]}</span>
                        {!item.exists ? (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Noch nicht erstellt
                          </Badge>
                        ) : item.missing ? (
                          <Badge variant="destructive" className="gap-1 text-[10px]">
                            <AlertTriangle className="h-3 w-3" />
                            Nicht mehr vorhanden
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Vorhanden</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{MATERIAL_HINTS[kind]}</p>
                      {item.createdAt && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Erstellt am {format(new Date(item.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
                        </p>
                      )}
                      {item.exists && item.missing && (
                        <p className="mt-0.5 text-xs text-destructive">
                          Die Datei liegt nicht mehr im Speicher. Bitte neu erstellen.
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.exists && !item.missing ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === kind}
                              onClick={() => view(kind)}
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
                              {saveButtonLabel(isImageMaterial(kind, item.path), isTouch)}
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
                            {item.exists && item.missing ? "Neu erstellen" : "Jetzt erstellen"}
                          </Button>
                        )}
                      </div>
                      {isTouch && isImageMaterial(kind, item.path) && item.exists && !item.missing && (
                        <p className="mt-1 text-[11px] text-muted-foreground">{GALLERY_HINT}</p>
                      )}
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
          {preview?.kind === "expose" ? (
            <iframe
              src={preview.url}
              title="PDF-Vorschau"
              className="h-[80vh] w-full rounded border-0"
            />
          ) : (
            preview && (
              <img src={preview.url} alt="Vorschau" className="max-h-[80vh] w-full object-contain" />
            )
          )}
        </DialogContent>
      </Dialog>

    </>
  );
}
