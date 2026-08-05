import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("vehicles")
      .select("id, title")
      .eq("is_sold", false)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setVehicles((data ?? []) as VehicleOption[]));
  }, [open]);

  const reset = () => {
    setName("");
    setEmail("");
    setPhone("");
    setVehicleId("none");
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
            <Label>Fahrzeug</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Kein Fahrzeug" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Fahrzeug</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
