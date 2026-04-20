import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell } from "lucide-react";
import type { LabeledOption } from "@/components/FilterBar";

interface VehicleAlertDialogProps {
  brands: string[];
  bodyTypes: LabeledOption[];
}

const categories = ["Oldtimer", "Gebrauchtwagen", "Unfallwagen", "Nutzfahrzeuge"];

const VehicleAlertDialog = ({ brands, bodyTypes }: VehicleAlertDialogProps) => {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    brand: "all",
    category: "all",
    body_type: "all",
    max_price: "",
    min_year: "",
    max_mileage: "",
    consent: false,
  });

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const canSubmit = form.name.trim() && isEmailValid && form.consent && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("vehicle_alerts").insert({
        name: form.name.trim(),
        email: form.email.trim(),
        brand: form.brand === "all" ? null : form.brand,
        category: form.category === "all" ? null : form.category,
        body_type: form.body_type === "all" ? null : form.body_type,
        max_price: form.max_price ? parseInt(form.max_price) : null,
        min_year: form.min_year || null,
        max_mileage: form.max_mileage ? parseInt(form.max_mileage) : null,
      });
      if (error) throw error;
      toast.success("Suchauftrag erstellt! Wir benachrichtigen Sie per E-Mail.");
      setOpen(false);
      setForm({ name: "", email: "", brand: "all", category: "all", body_type: "all", max_price: "", min_year: "", max_mileage: "", consent: false });
    } catch {
      toast.error("Fehler beim Erstellen des Suchauftrags.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Bell className="h-4 w-4" /> Suchauftrag erstellen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suchauftrag erstellen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="alert-name">Name *</Label>
            <Input id="alert-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ihr Name" />
          </div>
          <div>
            <Label htmlFor="alert-email">E-Mail *</Label>
            <Input id="alert-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="ihre@email.de" />
          </div>
          <div>
            <Label>Marke</Label>
            <Select value={form.brand} onValueChange={(v) => setForm((f) => ({ ...f, brand: v }))}>
              <SelectTrigger><SelectValue placeholder="Alle Marken" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Marken</SelectItem>
                {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Kategorie</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger><SelectValue placeholder="Alle Kategorien" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kategorien</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Karosserieform</Label>
            <Select value={form.body_type} onValueChange={(v) => setForm((f) => ({ ...f, body_type: v }))}>
              <SelectTrigger><SelectValue placeholder="Alle" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Karosserieformen</SelectItem>
                {bodyTypes.map((bt) => <SelectItem key={bt.raw} value={bt.raw}>{bt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Max. Preis (€)</Label>
              <Input type="number" value={form.max_price} onChange={(e) => setForm((f) => ({ ...f, max_price: e.target.value }))} placeholder="z.B. 50000" />
            </div>
            <div>
              <Label>Min. Baujahr</Label>
              <Input value={form.min_year} onChange={(e) => setForm((f) => ({ ...f, min_year: e.target.value }))} placeholder="z.B. 1970" />
            </div>
            <div>
              <Label>Max. KM</Label>
              <Input type="number" value={form.max_mileage} onChange={(e) => setForm((f) => ({ ...f, max_mileage: e.target.value }))} placeholder="z.B. 100000" />
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="consent"
              checked={form.consent}
              onCheckedChange={(c) => setForm((f) => ({ ...f, consent: !!c }))}
              className="mt-0.5"
            />
            <Label htmlFor="consent" className="text-xs text-muted-foreground leading-tight">
              Ich stimme zu, dass meine Daten zur Benachrichtigung über passende Fahrzeuge gespeichert werden.
            </Label>
          </div>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
            Suchauftrag aktivieren
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VehicleAlertDialog;
