import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import {
  duplicateVehicle,
  ownImagePathCount,
  DUPLICATE_BLANK_FIELDS,
} from "@/lib/duplicateVehicle";

interface Props {
  /** Fahrzeug, das kopiert werden soll — null schließt den Dialog. */
  vehicle: { id: string; title: string; mobile_payload?: unknown } | null;
  onClose: () => void;
  onDone?: () => void;
}

/** Fahrzeug samt Inseratsdaten kopieren, um ähnliche Fahrzeuge schneller anzulegen. */
export default function DuplicateVehicleDialog({ vehicle, onClose, onDone }: Props) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [copyImages, setCopyImages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [imageCount, setImageCount] = useState(0);

  useEffect(() => {
    if (!vehicle) return;
    setTitle(`${vehicle.title} (Kopie)`);
    let active = true;
    (async () => {
      let payload = vehicle.mobile_payload;
      if (payload === undefined) {
        const { data } = await supabase
          .from("vehicles").select("mobile_payload").eq("id", vehicle.id).maybeSingle();
        payload = data?.mobile_payload;
      }
      if (!active) return;
      const count = ownImagePathCount(payload);
      setImageCount(count);
      setCopyImages(count > 0);
    })();
    return () => { active = false; };
  }, [vehicle]);

  const run = async () => {
    if (!vehicle) return;
    setBusy(true);
    try {
      const res = await duplicateVehicle(vehicle.id, { title: title.trim(), copyImages });
      toast.success(
        res.copiedImages > 0
          ? `Kopie angelegt — ${res.copiedImages} Foto(s) übernommen`
          : "Kopie angelegt — bitte Fotos hochladen",
      );
      onDone?.();
      onClose();
      navigate(`/admin/fahrzeug-anlegen/${res.newVehicleId}`);
    } catch (e) {
      toast.error(`Duplizieren fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!vehicle} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" /> Fahrzeug duplizieren
          </DialogTitle>
          <DialogDescription>
            Alle beschreibenden Angaben und die Ausstattung werden übernommen. Die Kopie
            wird als Entwurf angelegt und niemals automatisch veröffentlicht.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dup-title">Titel der Kopie</Label>
            <Input id="dup-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {imageCount > 0 ? (
            <label className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                checked={copyImages}
                onCheckedChange={(v) => setCopyImages(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="font-medium">Bilder übernehmen</span>
                <span className="block text-muted-foreground">
                  {imageCount} Foto(s) werden als eigene Dateien kopiert und beim
                  Veröffentlichen neu zu Mobile.de übertragen.
                </span>
              </span>
            </label>
          ) : (
            <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              Für dieses Fahrzeug liegen keine eigenen Bilddateien vor — die Fotos stammen
              aus der Mobile.de-Bildablage. Die Kopie wird ohne Fotos angelegt, bitte neu
              hochladen.
            </p>
          )}

          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm font-medium">Diese Angaben bleiben bewusst leer:</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
              {DUPLICATE_BLANK_FIELDS.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button onClick={() => void run()} disabled={busy || !title.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Kopie anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
