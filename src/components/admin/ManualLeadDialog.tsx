import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Car, Loader2, X } from "lucide-react";
import { useFuzzySearch } from "@/hooks/useFuzzySearch";
import { resolveVehicleImages } from "@/lib/vehicleImages";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

interface VehicleOption {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  model_description: string | null;
  price: number | null;
  mobile_de_id: string | null;
  image_urls: string[] | null;
  custom_image_urls: string[] | null;
  hidden_image_urls: string[] | null;
  image_order: string[] | null;
  vin?: string | null;
}

export default function ManualLeadDialog({ open, onOpenChange, onCreated }: Props) {
  const [source, setSource] = useState("AUTOSCOUT24");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleId, setVehicleId] = useState<string>("none");
  const [message, setMessage] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("vehicles")
        .select(
          "id, title, brand, model, model_description, price, mobile_de_id, image_urls, custom_image_urls, hidden_image_urls, image_order",
        )
        .eq("is_sold", false)
        .order("created_at", { ascending: false })
        .limit(1000);
      const rows = (data ?? []) as VehicleOption[];
      const { data: vinRows } = await supabase
        .from("vehicle_private_data")
        .select("vehicle_id, vin");
      const vinMap = new Map((vinRows ?? []).map((r) => [r.vehicle_id, r.vin]));
      setVehicles(rows.map((v) => ({ ...v, vin: vinMap.get(v.id) ?? null })));
    })();
  }, [open]);

  const matches = useFuzzySearch(vehicles as never, vehicleQuery) as unknown as VehicleOption[];
  const suggestions =
    vehicleQuery.trim().length >= 2 ? matches.slice(0, 10) : ([] as VehicleOption[]);
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null;


  const reset = () => {
    setName("");
    setEmail("");
    setPhone("");
    setVehicleId("none");
    setVehicleQuery("");

    setMessage("");
    setReceivedAt(new Date().toISOString().slice(0, 16));
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Bitte einen Namen angeben.");
      return;
    }
    setSaving(true);
    try {
      const occurredAt = new Date(receivedAt).toISOString();
      const { data: lead, error } = await supabase
        .from("leads")
        .insert({
          lead_id: `manual:${crypto.randomUUID()}`,
          source,
          lead_type: "messaging",
          status: "IN_PROGRESS",
          vehicle_id: vehicleId === "none" ? null : vehicleId,
          buyer_name: name.trim(),
          buyer_email: email.trim() || null,
          buyer_phone: phone.trim() || null,
          first_event_at: occurredAt,
          last_event_at: occurredAt,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (message.trim()) {
        await supabase.from("lead_events").insert({
          lead_id: lead.id,
          event_id: `manual:${crypto.randomUUID()}`,
          event_type: "MessagingLeadSubmitted",
          occurred_at: occurredAt,
          payload: { data: { message: message.trim() }, manual: true },
        });
      }

      toast.success("Anfrage erfasst.");
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      toast.error(`Speichern fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Anfrage erfassen</DialogTitle>
          <DialogDescription>
            Für Anfragen, die nicht automatisch ankommen — etwa von AutoScout24 oder per Telefon.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Herkunft</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTOSCOUT24">AutoScout24</SelectItem>
                <SelectItem value="MANUAL">Sonstige (Handeintrag)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="lead-name">Name</Label>
            <Input id="lead-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="lead-mail">E-Mail</Label>
              <Input id="lead-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="lead-phone">Telefon</Label>
              <Input id="lead-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label htmlFor="lead-vehicle">Fahrzeug</Label>
            {selectedVehicle ? (
              <div className="mt-1 flex items-center gap-3 rounded-md border p-2">
                {resolveVehicleImages(selectedVehicle)[0] ? (
                  <img
                    src={resolveVehicleImages(selectedVehicle)[0]}
                    alt={selectedVehicle.title}
                    className="h-12 w-12 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
                    <Car className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{selectedVehicle.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedVehicle.price
                      ? `${selectedVehicle.price.toLocaleString("de-DE")} €`
                      : "Preis auf Anfrage"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setVehicleId("none");
                    setVehicleQuery("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="mt-1 space-y-2">
                <Input
                  id="lead-vehicle"
                  value={vehicleQuery}
                  onChange={(e) => setVehicleQuery(e.target.value)}
                  placeholder="Titel, Marke, Modell, interne Nummer oder VIN…"
                />
                {vehicleQuery.trim().length >= 2 && (
                  <div className="max-h-56 overflow-y-auto rounded-md border">
                    {suggestions.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">Kein Fahrzeug gefunden</p>
                    ) : (
                      suggestions.map((v) => {
                        const img = resolveVehicleImages(v)[0];
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setVehicleId(v.id)}
                            className="flex w-full items-center gap-3 border-b p-2 text-left last:border-b-0 hover:bg-muted/60"
                          >
                            {img ? (
                              <img src={img} alt={v.title} className="h-10 w-10 rounded object-cover" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                                <Car className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">{v.title}</span>
                              <span className="block text-xs text-muted-foreground">
                                {v.price ? `${v.price.toLocaleString("de-DE")} €` : "Preis auf Anfrage"}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Ohne Auswahl wird die Anfrage ohne Fahrzeug gespeichert („Kein Fahrzeug“).
                </p>
              </div>
            )}
          </div>


          <div>
            <Label htmlFor="lead-date">Eingang</Label>
            <Input
              id="lead-date"
              type="datetime-local"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="lead-msg">Nachricht</Label>
            <Textarea id="lead-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Anfrage speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
