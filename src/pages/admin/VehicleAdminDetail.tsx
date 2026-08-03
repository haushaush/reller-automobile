import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  RotateCcw,
  Save,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logVehicleAudit } from "@/lib/vehicleAudit";
import { resolveVehicleImages } from "@/lib/vehicleImages";
import { VEHICLE_CATEGORY_OPTIONS } from "./VehiclesAdmin";
import VehicleCard from "@/components/VehicleCard";
import type { Vehicle } from "@/hooks/useVehicles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CUSTOM_IMAGE_BUCKET = "vehicle-stories";
const CUSTOM_IMAGE_PREFIX = "custom-vehicle-images";

type FieldType = "text" | "textarea" | "number" | "category";

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
}

const FIELDS: FieldDef[] = [
  { key: "title", label: "Titel", type: "text" },
  { key: "model_description", label: "Modellbeschreibung", type: "text" },
  { key: "description", label: "Beschreibung", type: "textarea" },
  { key: "price", label: "Preis (€)", type: "number" },
  { key: "price_type", label: "Preistyp", type: "text" },
  { key: "vehicle_category", label: "Kategorie", type: "category" },
  { key: "year", label: "Erstzulassung", type: "text" },
  { key: "mileage", label: "Kilometerstand", type: "number" },
  { key: "power", label: "Leistung (kW)", type: "number" },
  { key: "fuel", label: "Kraftstoff", type: "text" },
  { key: "gearbox", label: "Getriebe", type: "text" },
  { key: "exterior_color", label: "Außenfarbe", type: "text" },
  { key: "interior_color", label: "Innenfarbe", type: "text" },
  { key: "num_seats", label: "Sitzanzahl", type: "number" },
  { key: "cubic_capacity", label: "Hubraum (cm³)", type: "number" },
  { key: "condition", label: "Zustand", type: "text" },
];

type VehicleRow = Record<string, unknown> & {
  id: string;
  title: string;
  source: string | null;
  is_sold: boolean;
  reserved_at: string | null;
  reserved_note: string | null;
  is_featured: boolean;
  image_urls: string[] | null;
  custom_image_urls: string[] | null;
  hidden_image_urls: string[] | null;
  image_order: string[] | null;
  manual_overrides: Record<string, unknown> | null;
};

interface OverrideMeta {
  original_value?: unknown;
  overridden_at?: string;
}

function overrideMeta(overrides: Record<string, unknown> | null, key: string): OverrideMeta | null {
  if (!overrides) return null;
  const raw = overrides[key];
  if (raw === undefined || raw === null || raw === false) return null;
  if (typeof raw === "object") return raw as OverrideMeta;
  return {};
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("de-DE");
  return String(value);
}

export default function VehicleAdminDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<Record<string, unknown>>({});
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [customImages, setCustomImages] = useState<string[]>([]);
  const [reservedNote, setReservedNote] = useState("");
  const [isReserved, setIsReserved] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["admin-vehicle", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as unknown as VehicleRow | null;
    },
    enabled: !!id,
  });

  const { data: auditRows } = useQuery({
    queryKey: ["vehicle-audit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_audit_log")
        .select("*")
        .eq("vehicle_id", id!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!vehicle) return;
    const next: Record<string, unknown> = {};
    for (const f of FIELDS) next[f.key] = vehicle[f.key] ?? null;
    setForm(next);
    setOverrides((vehicle.manual_overrides as Record<string, unknown>) ?? {});
    setHidden(vehicle.hidden_image_urls ?? []);
    setCustomImages(vehicle.custom_image_urls ?? []);
    setIsReserved(!!vehicle.reserved_at);
    setReservedNote(vehicle.reserved_note ?? "");
    setIsFeatured(!!vehicle.is_featured);
    setOrder(
      resolveVehicleImages({
        image_urls: vehicle.image_urls,
        custom_image_urls: vehicle.custom_image_urls,
        hidden_image_urls: [],
        image_order: vehicle.image_order,
      }),
    );
  }, [vehicle]);

  const isMobileDe = (vehicle?.source ?? "mobile_de") === "mobile_de";

  const allImages = useMemo(() => {
    const base = [...(vehicle?.image_urls ?? []), ...customImages];
    const unique = Array.from(new Set(base));
    const rank = new Map(order.map((u, i) => [u, i]));
    return unique.sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));
  }, [vehicle?.image_urls, customImages, order]);

  const previewVehicle = useMemo(() => {
    if (!vehicle) return null;
    return {
      ...(vehicle as unknown as Vehicle),
      ...form,
      image_urls: allImages.filter((u) => !hidden.includes(u)),
      is_sold: vehicle.is_sold,
    } as Vehicle;
  }, [vehicle, form, allImages, hidden]);

  const toggleOverride = (key: string, enabled: boolean) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (enabled) {
        next[key] = {
          original_value: vehicle ? (vehicle[key] ?? null) : null,
          overridden_at: new Date().toISOString(),
        };
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const resetToMobileValue = (key: string) => {
    const meta = overrideMeta(overrides, key);
    setForm((f) => ({ ...f, [key]: meta?.original_value ?? null }));
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    toast.success("Auf Mobile.de-Wert zurückgesetzt (noch nicht gespeichert)");
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !id) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${CUSTOM_IMAGE_PREFIX}/${id}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage
          .from(CUSTOM_IMAGE_BUCKET)
          .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (error) {
          toast.error(`Upload fehlgeschlagen: ${file.name}`);
          continue;
        }
        const { data } = supabase.storage.from(CUSTOM_IMAGE_BUCKET).getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      if (uploaded.length > 0) {
        setCustomImages((prev) => [...prev, ...uploaded]);
        setOrder((prev) => [...prev, ...uploaded]);
        toast.success(`${uploaded.length} Bild(er) hochgeladen`);
      }
    } finally {
      setUploading(false);
    }
  };

  const moveImage = (from: number, to: number) => {
    setOrder(() => {
      const list = [...allImages];
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      return list;
    });
  };

  const handleSave = async () => {
    if (!vehicle || !id) return;
    setIsSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      const auditEntries: { action: string; field: string; oldValue: unknown; newValue: unknown }[] = [];

      for (const f of FIELDS) {
        const isOverridden = !!overrideMeta(overrides, f.key);
        if (isMobileDe && !isOverridden) continue;
        const oldValue = vehicle[f.key] ?? null;
        const newValue = form[f.key] ?? null;
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          patch[f.key] = newValue;
          auditEntries.push({ action: "update_field", field: f.key, oldValue, newValue });
        }
      }

      patch.manual_overrides = overrides;
      patch.hidden_image_urls = hidden;
      patch.custom_image_urls = customImages;
      patch.image_order = allImages;

      const wasReserved = !!vehicle.reserved_at;
      if (isReserved !== wasReserved || reservedNote !== (vehicle.reserved_note ?? "")) {
        patch.reserved_at = isReserved ? vehicle.reserved_at ?? new Date().toISOString() : null;
        patch.reserved_note = isReserved ? reservedNote || null : null;
        auditEntries.push({
          action: isReserved ? "reserve" : "unreserve",
          field: "reserved_at",
          oldValue: vehicle.reserved_at,
          newValue: patch.reserved_at,
        });
      }
      if (isFeatured !== !!vehicle.is_featured) {
        patch.is_featured = isFeatured;
        auditEntries.push({
          action: "feature",
          field: "is_featured",
          oldValue: vehicle.is_featured,
          newValue: isFeatured,
        });
      }

      const { error } = await supabase
        .from("vehicles")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;

      await logVehicleAudit(id, auditEntries.length > 0 ? auditEntries : [
        { action: "update", field: null, oldValue: null, newValue: "Bilder/Overrides aktualisiert" },
      ]);

      toast.success("Fahrzeug gespeichert");
      queryClient.invalidateQueries({ queryKey: ["admin-vehicle", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-audit", id] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    } catch (e) {
      toast.error(`Speichern fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="h-6 w-6 animate-spin inline" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Fahrzeug nicht gefunden.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/fahrzeuge")}>
          Zurück zur Liste
        </Button>
      </div>
    );
  }

  const renderField = (f: FieldDef) => {
    const meta = overrideMeta(overrides, f.key);
    const isOverridden = !!meta;
    const locked = isMobileDe && !isOverridden;
    const value = form[f.key];

    const onChange = (v: unknown) => setForm((prev) => ({ ...prev, [f.key]: v }));

    return (
      <div key={f.key} className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm">
            {f.label}
            {locked && (
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                (Mobile.de – schreibgeschützt)
              </span>
            )}
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">manuell überschreiben</span>
            <Switch
              checked={isOverridden}
              onCheckedChange={(c) => toggleOverride(f.key, c)}
              aria-label={`${f.label} manuell überschreiben`}
            />
          </div>
        </div>

        {f.type === "textarea" ? (
          <Textarea
            value={(value as string) ?? ""}
            disabled={locked}
            rows={5}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : f.type === "category" ? (
          <Select
            value={(value as string) ?? ""}
            disabled={locked}
            onValueChange={(v) => onChange(v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Kategorie wählen" />
            </SelectTrigger>
            <SelectContent>
              {VEHICLE_CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            type={f.type === "number" ? "number" : "text"}
            value={value === null || value === undefined ? "" : String(value)}
            disabled={locked}
            onChange={(e) =>
              onChange(
                f.type === "number"
                  ? e.target.value === ""
                    ? null
                    : Number(e.target.value)
                  : e.target.value,
              )
            }
          />
        )}

        {isOverridden && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-secondary/60 px-2 py-1.5">
            <Badge variant="outline" className="text-[10px]">
              Mobile.de-Wert
            </Badge>
            <span className="text-xs text-muted-foreground truncate max-w-[60%]">
              {displayValue(meta?.original_value)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => resetToMobileValue(f.key)}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              zurücksetzen
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/admin/fahrzeuge"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Zurück zur Fahrzeugliste
          </Link>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-1 line-clamp-2">
            {vehicle.title}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">{isMobileDe ? "Mobile.de" : "Manuell"}</Badge>
            {vehicle.is_sold ? (
              <Badge variant="destructive">Verkauft</Badge>
            ) : vehicle.reserved_at ? (
              <Badge className="bg-amber-500 text-white hover:bg-amber-500">Reserviert</Badge>
            ) : (
              <Badge variant="secondary">Verfügbar</Badge>
            )}
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Speichern
        </Button>
      </div>

      <Tabs defaultValue="data" className="mt-6">
        <TabsList>
          <TabsTrigger value="data">Fahrzeugdaten</TabsTrigger>
          <TabsTrigger value="images">Bilder</TabsTrigger>
          <TabsTrigger value="history">Änderungsverlauf</TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
            <Card className="p-4 sm:p-6 space-y-5">
              {isMobileDe && (
                <p className="text-xs text-muted-foreground">
                  Dieses Fahrzeug stammt aus dem Mobile.de-Sync. Felder sind schreibgeschützt, bis
                  „manuell überschreiben" aktiviert wird — danach fasst der Sync das Feld nicht mehr an.
                </p>
              )}
              {FIELDS.map(renderField)}

              <div className="border-t border-border pt-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm">Reserviert</Label>
                    <p className="text-xs text-muted-foreground">
                      Bleibt im Frontend sichtbar, erhält aber ein eigenes Badge.
                    </p>
                  </div>
                  <Switch checked={isReserved} onCheckedChange={setIsReserved} />
                </div>
                {isReserved && (
                  <Input
                    value={reservedNote}
                    onChange={(e) => setReservedNote(e.target.value)}
                    placeholder="Notiz zur Reservierung (intern)"
                  />
                )}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm">Auf Startseite hervorheben</Label>
                  </div>
                  <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
                </div>
              </div>
            </Card>

            <div className="lg:sticky lg:top-6 self-start">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Live-Vorschau
              </p>
              {previewVehicle && <VehicleCard vehicle={previewVehicle} />}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="images" className="mt-4">
          <Card className="p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="text-sm text-muted-foreground">
                Reihenfolge per Drag-and-Drop ändern, Bilder ausblenden oder eigene Bilder hochladen.
                Der Sync überschreibt Reihenfolge und eigene Uploads nicht.
              </p>
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleUpload(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button asChild variant="outline" size="sm" disabled={uploading}>
                  <span>
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Bilder hochladen
                  </span>
                </Button>
              </label>
            </div>

            {allImages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Keine Bilder vorhanden.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {allImages.map((url, index) => {
                  const isHidden = hidden.includes(url);
                  const isCustom = customImages.includes(url);
                  return (
                    <div
                      key={url}
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragIndex !== null && dragIndex !== index) moveImage(dragIndex, index);
                        setDragIndex(null);
                      }}
                      className={`relative rounded-lg overflow-hidden border ${
                        isHidden ? "opacity-40 border-dashed" : "border-border"
                      }`}
                    >
                      <img src={url} alt="" className="w-full aspect-[4/3] object-cover" />
                      <div className="absolute top-1 left-1 flex items-center gap-1">
                        <span className="bg-background/85 rounded px-1.5 py-0.5 text-[10px] font-medium">
                          {index + 1}
                        </span>
                        {isCustom && (
                          <span className="bg-primary text-primary-foreground rounded px-1.5 py-0.5 text-[10px]">
                            eigen
                          </span>
                        )}
                      </div>
                      <div className="absolute top-1 right-1 flex gap-1">
                        <button
                          type="button"
                          className="bg-background/85 rounded p-1"
                          onClick={() =>
                            setHidden((h) =>
                              h.includes(url) ? h.filter((u) => u !== url) : [...h, url],
                            )
                          }
                          aria-label={isHidden ? "Bild einblenden" : "Bild ausblenden"}
                        >
                          {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <span className="bg-background/85 rounded p-1 cursor-grab">
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="p-4 sm:p-6">
            {!auditRows || auditRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Noch keine manuellen Änderungen protokolliert.
              </p>
            ) : (
              <ul className="space-y-3">
                {auditRows.map((row) => (
                  <li key={row.id} className="border-b border-border pb-3 last:border-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {new Date(row.created_at).toLocaleString("de-DE", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                      <span>·</span>
                      <span>{row.user_email ?? "Unbekannt"}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {row.action}
                      </Badge>
                    </div>
                    <p className="text-sm mt-1">
                      {row.field ? <span className="font-medium">{row.field}: </span> : null}
                      <span className="text-muted-foreground line-through">
                        {row.old_value ?? "—"}
                      </span>{" "}
                      → <span>{row.new_value ?? "—"}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
