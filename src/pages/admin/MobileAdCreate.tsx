import { useEffect, useMemo, useState, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Upload, X, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RefItem = { key: string; name: string };

const FUEL_LABELS: Record<string, string> = {
  PETROL: "Benzin",
  DIESEL: "Diesel",
  LPG: "Autogas (LPG)",
  CNG: "Erdgas (CNG)",
  ELECTRICITY: "Elektro",
  HYBRID: "Hybrid (Benzin/Elektro)",
  HYBRID_DIESEL: "Hybrid (Diesel/Elektro)",
  HYDROGENIUM: "Wasserstoff",
  ETHANOL: "Ethanol (E85)",
  OTHER: "Andere",
};

const GEARBOX_LABELS: Record<string, string> = {
  MANUAL_GEAR: "Schaltgetriebe",
  SEMIAUTOMATIC_GEAR: "Halbautomatik",
  AUTOMATIC_GEAR: "Automatik",
};

const CATEGORY_LABELS: Record<string, string> = {
  Cabrio: "Cabrio/Roadster",
  SmallCar: "Kleinwagen",
  EstateCar: "Kombi",
  Limousine: "Limousine",
  SportsCar: "Sportwagen/Coupé",
  Van: "Van/Kleinbus",
  OffRoad: "SUV/Geländewagen",
  OtherCar: "Andere",
};

const labelFor = (map: Record<string, string>, key: string, fallback: string) =>
  map[key] ?? fallback ?? key;

interface FormState {
  make: string;
  model: string;
  modelDescription: string;
  category: string;
  mileage: string;
  regYear: string;
  regMonth: string;
  fuel: string;
  gearbox: string;
  power: string;
  cubicCapacity: string;
  condition: string;
  damageUnrepaired: "false" | "true";
  consumerPriceGross: string;
  vatRate: string;
  description: string;
  vin: string;
}

const EMPTY: FormState = {
  make: "",
  model: "",
  modelDescription: "",
  category: "",
  mileage: "",
  regYear: "",
  regMonth: "",
  fuel: "",
  gearbox: "",
  power: "",
  cubicCapacity: "",
  condition: "USED",
  damageUnrepaired: "false",
  consumerPriceGross: "",
  vatRate: "",
  description: "",
  vin: "",
};

async function loadRef(kind: string, make?: string): Promise<RefItem[]> {
  const { data, error } = await supabase.functions.invoke("mobile-refdata", {
    body: { kind, make },
  });
  if (error) throw error;
  return (data as { items: RefItem[] })?.items ?? [];
}

export default function MobileAdCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [makes, setMakes] = useState<RefItem[]>([]);
  const [models, setModels] = useState<RefItem[]>([]);
  const [categories, setCategories] = useState<RefItem[]>([]);
  const [fuels, setFuels] = useState<RefItem[]>([]);
  const [gearboxes, setGearboxes] = useState<RefItem[]>([]);
  const [vatRates, setVatRates] = useState<RefItem[]>([]);
  const [loadingMakes, setLoadingMakes] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initial refdata
  useEffect(() => {
    (async () => {
      try {
        const [m, c, f, g, v] = await Promise.all([
          loadRef("makes"),
          loadRef("categories").catch(() => []),
          loadRef("fuels").catch(() => []),
          loadRef("gearboxes").catch(() => []),
          loadRef("vatrates").catch(() => []),
        ]);
        setMakes(m);
        setCategories(c);
        setFuels(f);
        setGearboxes(g);
        setVatRates(v.length ? v : [
          { key: "19.00", name: "19 %" },
          { key: "OTHER", name: "Differenzbesteuert" },
        ]);
      } catch (err) {
        console.error(err);
        toast.error("Refdaten konnten nicht geladen werden");
      } finally {
        setLoadingMakes(false);
      }
    })();
  }, []);

  // Load models when make changes
  useEffect(() => {
    if (!form.make) {
      setModels([]);
      return;
    }
    setLoadingModels(true);
    loadRef("models", form.make)
      .then(setModels)
      .catch((err) => {
        console.error(err);
        toast.error("Modelle konnten nicht geladen werden");
      })
      .finally(() => setLoadingModels(false));
  }, [form.make]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newPaths: string[] = [];
      const newPreviews: Record<string, string> = {};
      const prefix = `drafts/${Date.now()}`;
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage
          .from("mobile-ad-images")
          .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (error) {
          console.error(error);
          toast.error(`Upload fehlgeschlagen: ${file.name}`);
          continue;
        }
        const { data: signed } = await supabase.storage
          .from("mobile-ad-images")
          .createSignedUrl(path, 60 * 60);
        newPaths.push(path);
        if (signed?.signedUrl) newPreviews[path] = signed.signedUrl;
      }
      setImagePaths((p) => [...p, ...newPaths]);
      setImagePreviews((p) => ({ ...p, ...newPreviews }));
      e.target.value = "";
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (path: string) => {
    await supabase.storage.from("mobile-ad-images").remove([path]);
    setImagePaths((p) => p.filter((x) => x !== path));
    setImagePreviews((p) => {
      const { [path]: _drop, ...rest } = p;
      return rest;
    });
  };

  const buildPayload = () => ({
    vehicle: {
      class: { key: "Car" },
      make: form.make ? { key: form.make } : undefined,
      model: form.model ? { key: form.model } : undefined,
      "model-description": form.modelDescription || undefined,
      category: form.category ? { key: form.category } : undefined,
      mileage: form.mileage ? parseInt(form.mileage, 10) : undefined,
      "first-registration":
        form.regYear && form.regMonth
          ? `${form.regYear}${form.regMonth.padStart(2, "0")}`
          : undefined,
      fuel: form.fuel ? { key: form.fuel } : undefined,
      gearbox: form.gearbox ? { key: form.gearbox } : undefined,
      power: form.power ? parseInt(form.power, 10) : undefined,
      "cubic-capacity": form.cubicCapacity ? parseInt(form.cubicCapacity, 10) : undefined,
      condition: form.condition,
      "damage-unrepaired": form.damageUnrepaired === "true",
      vin: form.vin || undefined,
    },
    price: {
      "consumer-price-gross": form.consumerPriceGross
        ? parseFloat(form.consumerPriceGross)
        : undefined,
      "vat-rate": form.vatRate || undefined,
      type: "FIXED",
      currency: "EUR",
    },
    description: form.description || undefined,
  });

  const validate = (): string | null => {
    if (!form.make) return "Marke fehlt";
    if (!form.model) return "Modell fehlt";
    if (!form.category) return "Kategorie fehlt";
    if (!form.mileage) return "Kilometerstand fehlt";
    if (!form.regYear || !form.regMonth) return "Erstzulassung (Monat + Jahr) fehlt";
    if (!form.fuel) return "Kraftstoff fehlt";
    if (!form.gearbox) return "Getriebe fehlt";
    if (!form.power) return "Leistung (kW) fehlt";
    if (!form.cubicCapacity) return "Hubraum fehlt";
    if (!form.consumerPriceGross) return "Preis fehlt";
    if (!form.vatRate) return "MwSt.-Satz fehlt";
    return null;
  };

  const saveDraft = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("mobile_ad_drafts").insert({
        status: "draft",
        payload: buildPayload() as never,
        image_paths: imagePaths,
        created_by: userRes.user?.id ?? null,
      });
      if (error) {
        console.error(error);
        toast.error(`Speichern fehlgeschlagen: ${error.message}`);
        return;
      }
      toast.success("Entwurf gespeichert");
      navigate("/admin/mobile-ad");
    } finally {
      setSaving(false);
    }
  };

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")),
    [],
  );
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 40 }, (_, i) => String(now - i));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mobile.de Inserat anlegen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pflichtfelder ausfüllen und als Entwurf speichern. Die Veröffentlichung auf Mobile.de
          folgt in Etappe 2.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Fahrzeug</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Marke *</Label>
            <Select
              value={form.make}
              onValueChange={(v) => {
                update("make", v);
                update("model", "");
              }}
              disabled={loadingMakes}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingMakes ? "Lade…" : "Marke wählen"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {makes.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Modell *</Label>
            <Select
              value={form.model}
              onValueChange={(v) => update("model", v)}
              disabled={!form.make || loadingModels}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !form.make ? "Erst Marke wählen" : loadingModels ? "Lade…" : "Modell wählen"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {models.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Modell-Beschreibung</Label>
            <Input
              value={form.modelDescription}
              onChange={(e) => update("modelDescription", e.target.value)}
              placeholder="z. B. 2.0 TDI Style"
            />
          </div>
          <div className="space-y-2">
            <Label>Kategorie *</Label>
            <Select value={form.category} onValueChange={(v) => update("category", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Kategorie wählen" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {categories.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {labelFor(CATEGORY_LABELS, c.key, c.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Kilometerstand *</Label>
            <Input
              type="number"
              value={form.mileage}
              onChange={(e) => update("mileage", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Erstzulassung *</Label>
            <div className="flex gap-2">
              <Select value={form.regMonth} onValueChange={(v) => update("regMonth", v)}>
                <SelectTrigger className="w-24">
                  <SelectValue placeholder="MM" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={form.regYear} onValueChange={(v) => update("regYear", v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="YYYY" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {years.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Kraftstoff *</Label>
            <Select value={form.fuel} onValueChange={(v) => update("fuel", v)}>
              <SelectTrigger><SelectValue placeholder="Wählen" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {fuels.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{labelFor(FUEL_LABELS, f.key, f.name)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Getriebe *</Label>
            <Select value={form.gearbox} onValueChange={(v) => update("gearbox", v)}>
              <SelectTrigger><SelectValue placeholder="Wählen" /></SelectTrigger>
              <SelectContent>
                {gearboxes.map((g) => (
                  <SelectItem key={g.key} value={g.key}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Leistung (kW) *</Label>
            <Input
              type="number"
              value={form.power}
              onChange={(e) => update("power", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Hubraum (ccm) *</Label>
            <Input
              type="number"
              value={form.cubicCapacity}
              onChange={(e) => update("cubicCapacity", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Zustand *</Label>
            <Select value={form.condition} onValueChange={(v) => update("condition", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USED">Gebraucht</SelectItem>
                <SelectItem value="NEW">Neuwagen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Unreparierte Schäden</Label>
            <Select
              value={form.damageUnrepaired}
              onValueChange={(v) => update("damageUnrepaired", v as "true" | "false")}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Nein</SelectItem>
                <SelectItem value="true">Ja</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>FIN (optional)</Label>
            <Input
              value={form.vin}
              onChange={(e) => update("vin", e.target.value.toUpperCase())}
              maxLength={17}
              className="font-mono"
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Preis</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Endkundenpreis brutto (EUR) *</Label>
            <Input
              type="number"
              value={form.consumerPriceGross}
              onChange={(e) => update("consumerPriceGross", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>MwSt.-Satz *</Label>
            <Select value={form.vatRate} onValueChange={(v) => update("vatRate", v)}>
              <SelectTrigger><SelectValue placeholder="Wählen" /></SelectTrigger>
              <SelectContent>
                {vatRates.map((v) => (
                  <SelectItem key={v.key} value={v.key}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2 text-xs text-muted-foreground">
            Typ: FIXED · Währung: EUR
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Beschreibung</h2>
        <Textarea
          rows={6}
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
        />
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Bilder</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {imagePaths.map((path) => (
            <div key={path} className="relative aspect-[4/3] rounded-md overflow-hidden border border-border bg-muted">
              {imagePreviews[path] ? (
                <img src={imagePreviews[path]} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                  {path.split("/").pop()}
                </div>
              )}
              <button
                type="button"
                onClick={() => removeImage(path)}
                aria-label="Bild entfernen"
                className="absolute top-1 right-1 bg-background/90 rounded-full p-1 hover:bg-background"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div>
          <Label
            htmlFor="ad-images"
            className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 h-10 text-sm font-medium"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Bilder hochladen
          </Label>
          <input
            id="ad-images"
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            className="hidden"
            disabled={uploading}
          />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate("/admin/mobile-ad")} disabled={saving}>
          Abbrechen
        </Button>
        <Button onClick={saveDraft} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Als Entwurf speichern
        </Button>
      </div>
    </div>
  );
}
