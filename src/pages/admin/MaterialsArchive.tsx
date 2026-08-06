import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { Download, FileText, Image as ImageIcon, LayoutGrid, Loader2, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MATERIAL_BUCKETS,
  MATERIAL_LABELS,
  createSignedMaterialUrl,
  describeStorageError,
  downloadFromUrl,
  materialFileName,
  storagePathFromValue,
  type MaterialKind,
} from "@/lib/materials";

interface MaterialRow {
  key: string;
  kind: MaterialKind;
  vehicleId: string;
  vehicleTitle: string;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  createdAt: string;
  /** Storage-Pfad im Bucket der jeweiligen Materialart. */
  path: string | null;
}


const ICONS: Record<MaterialKind, typeof ImageIcon> = {
  story: ImageIcon,
  expose: FileText,
  collage: LayoutGrid,
};

export default function MaterialsArchive({ embedded = false }: { embedded?: boolean } = {}) {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<MaterialKind | "all">("all");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [stories, exposes, collages] = await Promise.all([
      supabase
        .from("vehicle_stories")
        .select("id, vehicle_id, story_image_url, generated_at")
        .order("generated_at", { ascending: false }),
      supabase
        .from("vehicle_exposes")
        .select("id, vehicle_id, pdf_url, updated_at")
        .order("updated_at", { ascending: false }),
      supabase
        .from("vehicle_collages")
        .select("id, vehicle_id, image_url, storage_path, created_at")
        .order("created_at", { ascending: false }),
    ]);

    const ids = [
      ...new Set([
        ...(stories.data ?? []).map((r) => r.vehicle_id),
        ...(exposes.data ?? []).map((r) => r.vehicle_id),
        ...(collages.data ?? []).map((r) => r.vehicle_id),
      ]),
    ];
    const vehicles = new Map<string, { title: string; brand: string | null; model: string | null }>();
    if (ids.length > 0) {
      const { data: vs } = await supabase
        .from("vehicles")
        .select("id, title, brand, model")
        .in("id", ids);
      for (const v of vs ?? []) {
        vehicles.set(v.id, { title: v.title, brand: v.brand, model: v.model });
      }
    }
    const info = (vehicleId: string) =>
      vehicles.get(vehicleId) ?? { title: "Fahrzeug", brand: null, model: null };

    const all: MaterialRow[] = [
      ...(stories.data ?? []).map((s) => ({
        key: `story-${s.id}`,
        kind: "story" as const,
        vehicleId: s.vehicle_id,
        vehicleTitle: info(s.vehicle_id).title,
        vehicleBrand: info(s.vehicle_id).brand,
        vehicleModel: info(s.vehicle_id).model,
        createdAt: s.generated_at,
        path: storagePathFromValue(s.story_image_url, MATERIAL_BUCKETS.story),
      })),
      ...(exposes.data ?? []).map((e) => ({
        key: `expose-${e.id}`,
        kind: "expose" as const,
        vehicleId: e.vehicle_id,
        vehicleTitle: info(e.vehicle_id).title,
        vehicleBrand: info(e.vehicle_id).brand,
        vehicleModel: info(e.vehicle_id).model,
        createdAt: e.updated_at,
        path: storagePathFromValue(e.pdf_url, MATERIAL_BUCKETS.expose),
      })),
      ...(collages.data ?? []).map((c) => ({
        key: `collage-${c.id}`,
        kind: "collage" as const,
        vehicleId: c.vehicle_id,
        vehicleTitle: info(c.vehicle_id).title,
        vehicleBrand: info(c.vehicle_id).brand,
        vehicleModel: info(c.vehicle_id).model,
        createdAt: c.created_at,
        path: storagePathFromValue(c.storage_path ?? c.image_url, MATERIAL_BUCKETS.collage),
      })),
    ];

    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setRows(all);
    setLoading(false);
  }, []);


  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (kind === "all" || r.kind === kind) &&
        (q.length === 0 || r.vehicleTitle.toLowerCase().includes(q)),
    );
  }, [rows, kind, search]);

  const signRow = async (row: MaterialRow) => {
    if (!row.path) throw describeStorageError("not found");
    return createSignedMaterialUrl(MATERIAL_BUCKETS[row.kind], row.path);
  };

  const open = async (row: MaterialRow) => {
    setBusy(row.key);
    try {
      const url = await signRow(row);
      setPreview({ kind: row.kind, url });
    } catch (e) {
      const err = describeStorageError(e);
      toast.error("Vorschau nicht möglich", {
        description: err.message,
        action: { label: "Erneut versuchen", onClick: () => void open(row) },
      });
    } finally {
      setBusy(null);
    }
  };

  const download = async (row: MaterialRow) => {
    setBusy(row.key);
    try {
      const url = await signRow(row);
      const name = materialFileName(
        row.kind,
        { brand: row.vehicleBrand, model: row.vehicleModel, fallback: row.vehicleTitle },
        row.path,
      );
      const mode = await downloadFromUrl(url, name);
      toast.success(mode === "shared" ? "Datei geteilt" : "Datei gespeichert");
    } catch (e) {
      const err = describeStorageError(e);
      toast.error("Download fehlgeschlagen", {
        description: err.message,
        action: { label: "Erneut versuchen", onClick: () => void download(row) },
      });
    } finally {
      setBusy(null);
    }
  };


  return (
    <div>
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Gespeicherte Materialien</h1>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Fahrzeug suchen…"
          className="max-w-xs"
        />
        <Select value={kind} onValueChange={(v) => setKind(v as MaterialKind | "all")}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Arten</SelectItem>
            <SelectItem value="story">{MATERIAL_LABELS.story}</SelectItem>
            <SelectItem value="expose">{MATERIAL_LABELS.expose}</SelectItem>
            <SelectItem value="collage">{MATERIAL_LABELS.collage}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Noch keine Materialien vorhanden
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const Icon = ICONS[row.kind];
            return (
              <Card key={row.key} className="flex items-center gap-4 p-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                  {row.url ? (
                    <img src={row.url} alt={row.vehicleTitle} className="h-full w-full object-cover" />
                  ) : (
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{row.vehicleTitle}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {MATERIAL_LABELS[row.kind]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(row.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => open(row)}>
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" disabled={busy === row.key} onClick={() => download(row)}>
                    {busy === row.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl p-2">
          {preview && (
            <img src={preview} alt="Vorschau" className="max-h-[80vh] w-full object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
