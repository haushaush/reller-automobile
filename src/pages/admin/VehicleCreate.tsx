import { useState, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deriveVehicleCategory } from "@/lib/categories";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

interface FormState {
  brand: string;
  model: string;
  model_description: string;
  year: string;
  fuel: string;
  power: string;
  gearbox: string;
  body_type: string;
  num_seats: string;
  cubic_capacity: string;
  title: string;
  price: string;
  mileage: string;
  exterior_color: string;
  description: string;
}

const EMPTY: FormState = {
  brand: "",
  model: "",
  model_description: "",
  year: "",
  fuel: "",
  power: "",
  gearbox: "",
  body_type: "",
  num_seats: "",
  cubic_capacity: "",
  title: "",
  price: "",
  mileage: "",
  exterior_color: "",
  description: "",
};

export default function VehicleCreate() {
  const navigate = useNavigate();
  const [vin, setVin] = useState("");
  const [decoding, setDecoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  const update = (k: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const decodeVin = async () => {
    const v = vin.trim().toUpperCase();
    if (!VIN_RE.test(v)) {
      toast.error("Ungültige FIN: 17 Zeichen, Großbuchstaben, keine I/O/Q.");
      return;
    }
    setDecoding(true);
    try {
      const { data, error } = await supabase.functions.invoke("decode-vin", { body: { vin: v } });
      if (error || !data) {
        toast.error("FIN nicht gefunden, bitte manuell eingeben");
        return;
      }
      if ((data as { error?: string }).error) {
        toast.error((data as { error: string }).error || "FIN nicht gefunden");
        return;
      }
      setVin(v);
      setForm((f) => {
        const brand = (data.brand as string) || f.brand;
        const model = (data.model as string) || f.model;
        const year = data.year ? String(data.year) : f.year;
        const body_type = (data.body_type as string) || f.body_type;
        const titleFromData = (data.title as string) || [brand, model].filter(Boolean).join(" ");
        return {
          ...f,
          brand,
          model,
          year,
          body_type,
          title: f.title || titleFromData,
        };
      });
      toast.success("Stammdaten geladen (Marke + Baujahr). Restliche Felder bitte ergänzen.");
    } catch (err) {
      console.error(err);
      toast.error("FIN-Abfrage fehlgeschlagen");
    } finally {
      setDecoding(false);
    }
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      const prefix = vin.trim().toUpperCase() || `manual-${Date.now()}`;
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from("vehicle-images").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
        if (error) {
          console.error(error);
          toast.error(`Upload fehlgeschlagen: ${file.name}`);
          continue;
        }
        const { data } = supabase.storage.from("vehicle-images").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      setImageUrls((prev) => [...prev, ...uploaded]);
      e.target.value = "";
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (url: string) => setImageUrls((prev) => prev.filter((u) => u !== url));

  const save = async () => {
    const v = vin.trim().toUpperCase();
    if (!VIN_RE.test(v)) {
      toast.error("Bitte gültige FIN eingeben.");
      return;
    }
    if (!form.title.trim()) { toast.error("Titel ist Pflicht."); return; }
    if (!form.price.trim() || isNaN(Number(form.price))) { toast.error("Preis fehlt oder ungültig."); return; }
    if (!form.mileage.trim() || isNaN(Number(form.mileage))) { toast.error("Kilometerstand fehlt oder ungültig."); return; }

    setSaving(true);
    try {
      const vehicleCategory = deriveVehicleCategory({
        body_type: form.body_type || null,
        category: null,
        year: form.year || null,
        is_accident: false,
      });
      const payload = {
        mobile_de_id: `vin_${v}`,
        source: "manual",
        vin: v,
        title: form.title.trim(),
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        model_description: form.model_description.trim() || null,
        year: form.year.trim() || null,
        fuel: form.fuel.trim() || null,
        power: form.power ? parseInt(form.power, 10) : null,
        gearbox: form.gearbox.trim() || null,
        body_type: form.body_type.trim() || null,
        num_seats: form.num_seats ? parseInt(form.num_seats, 10) : null,
        cubic_capacity: form.cubic_capacity ? parseInt(form.cubic_capacity, 10) : null,
        price: parseInt(form.price, 10),
        mileage: parseInt(form.mileage, 10),
        exterior_color: form.exterior_color.trim() || null,
        description: form.description.trim() || null,
        image_urls: imageUrls,
        vehicle_category: vehicleCategory,
        currency: "EUR",
        is_sold: false,
        synced_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("vehicles").insert(payload);
      if (error) {
        console.error(error);
        toast.error(error.message.includes("duplicate") ? "Diese FIN existiert bereits." : `Speichern fehlgeschlagen: ${error.message}`);
        return;
      }
      toast.success("Fahrzeug gespeichert");
      navigate("/admin");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Auto hinzufügen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fahrgestellnummer eingeben, Stammdaten automatisch laden und Bilder + Preis ergänzen.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <Label htmlFor="vin">Fahrgestellnummer (FIN/VIN)</Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            id="vin"
            value={vin}
            onChange={(e) => setVin(e.target.value.toUpperCase())}
            placeholder="WAUZZZ8K9AA000000"
            maxLength={17}
            className="flex-1 font-mono"
          />
          <Button type="button" onClick={decodeVin} disabled={decoding}>
            {decoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Daten abrufen
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Stammdaten</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Marke" value={form.brand} onChange={update("brand")} />
          <Field label="Modell" value={form.model} onChange={update("model")} />
          <Field label="Modell-Beschreibung" value={form.model_description} onChange={update("model_description")} className="md:col-span-2" />
          <Field label="Erstzulassung (Jahr)" value={form.year} onChange={update("year")} />
          <Field label="Kraftstoff" value={form.fuel} onChange={update("fuel")} />
          <Field label="Leistung (kW)" value={form.power} onChange={update("power")} type="number" />
          <Field label="Getriebe" value={form.gearbox} onChange={update("gearbox")} />
          <Field label="Karosserie" value={form.body_type} onChange={update("body_type")} />
          <Field label="Sitze" value={form.num_seats} onChange={update("num_seats")} type="number" />
          <Field label="Hubraum (ccm)" value={form.cubic_capacity} onChange={update("cubic_capacity")} type="number" />
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Inserat</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Titel *" value={form.title} onChange={update("title")} className="md:col-span-2" />
          <Field label="Preis (EUR) *" value={form.price} onChange={update("price")} type="number" />
          <Field label="Kilometer *" value={form.mileage} onChange={update("mileage")} type="number" />
          <Field label="Außenfarbe" value={form.exterior_color} onChange={update("exterior_color")} className="md:col-span-2" />
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="description">Beschreibung</Label>
            <Textarea id="description" value={form.description} onChange={update("description")} rows={4} />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Bilder</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {imageUrls.map((url) => (
            <div key={url} className="relative aspect-[4/3] rounded-md overflow-hidden border border-border bg-muted">
              <img src={url} alt="Fahrzeug" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(url)}
                aria-label="Bild entfernen"
                className="absolute top-1 right-1 bg-background/90 rounded-full p-1 hover:bg-background"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div>
          <Label htmlFor="images" className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 h-10 text-sm font-medium">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Bilder hochladen
          </Label>
          <input id="images" type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate("/admin")} disabled={saving}>Abbrechen</Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Fahrzeug speichern
        </Button>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  className?: string;
}
function Field({ label, value, onChange, type = "text", className = "" }: FieldProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label>{label}</Label>
      <Input value={value} onChange={onChange} type={type} />
    </div>
  );
}
