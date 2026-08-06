import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logVehicleAudit } from "@/lib/vehicleAudit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  PLATFORM_LABELS,
  SALE_STATUS_LABELS,
  createTasksForManualListings,
  type ListingRow,
  type VehicleSaleStatus,
} from "@/lib/listings";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleIds: string[];
  onDone?: () => void;
}

/**
 * Sammel-Statuswechsel. Nennt vor dem Ausführen, was automatisch passiert
 * und was der Nutzer selbst auf den manuellen Plattformen erledigen muss.
 */
export default function BulkStatusDialog({ open, onOpenChange, vehicleIds, onDone }: Props) {
  const [target, setTarget] = useState<VehicleSaleStatus>("sold");
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open || vehicleIds.length === 0) return;
    supabase
      .from("listings")
      .select("*")
      .in("vehicle_id", vehicleIds)
      .then(({ data }) => setListings((data ?? []) as ListingRow[]));
  }, [open, vehicleIds]);

  const mobileLive = listings.filter(
    (l) => l.platform === "mobile_de" && (l.status === "live" || l.status === "publishing"),
  );
  const manualLive = listings.filter((l) => l.is_manual && l.status === "live");
  const manualPlatforms = [...new Set(manualLive.map((l) => PLATFORM_LABELS[l.platform]))];

  const consequences: string[] = [];
  if (target === "sold") {
    consequences.push(
      mobileLive.length > 0
        ? `${mobileLive.length} Inserat(e) auf Mobile.de werden automatisch beendet.`
        : "Auf Mobile.de ist bei diesen Fahrzeugen kein aktives Inserat — dort passiert nichts.",
    );
  } else if (target === "reserved") {
    consequences.push("Die Fahrzeuge bleiben online und erhalten den Hinweis „Reserviert“.");
  } else {
    consequences.push("Die Fahrzeuge werden wieder als verfügbar geführt.");
  }
  if (manualLive.length > 0) {
    consequences.push(
      `${manualLive.length} Inserat(e) auf ${manualPlatforms.join(" und ")} müssen Sie selbst anpassen — wir notieren das als Aufgabe.`,
    );
  }

  const apply = async () => {
    setRunning(true);
    try {
      // Streng nacheinander: die Seller-API verträgt keine parallelen Aufrufe.
      let failed = 0;
      for (const id of vehicleIds) {
        const { data, error } = await supabase.functions.invoke("set-mobile-ad-status", {
          body: { vehicleId: id, target },
        });
        const result = (data ?? {}) as { ok?: boolean; error?: string };
        if (error || result.ok === false) {
          failed++;
          toast.error(
            `Ein Fahrzeug konnte nicht an Mobile.de übertragen werden: ${
              error?.message ?? result.error ?? "unbekannter Fehler"
            }`,
          );
        }
      }

      await logVehicleAudit(vehicleIds, [
        {
          action: "status_change",
          field: "sale_status",
          newValue: SALE_STATUS_LABELS[target],
        },
      ]);

      const action =
        target === "sold" ? "end_listing" : target === "reserved" ? "mark_reserved" : "reactivate";
      let tasks = 0;
      for (const id of vehicleIds) {
        tasks += await createTasksForManualListings(
          id,
          action,
          `Sammelaktion: Status auf „${SALE_STATUS_LABELS[target]}“ geändert`,
        );
      }

      if (failed > 0) {
        toast.warning(
          `${vehicleIds.length} Fahrzeug(e) im Portal geändert, ${failed} davon noch nicht an Mobile.de übertragen.`,
        );
      } else {
        toast.success(
          tasks > 0
            ? `${vehicleIds.length} Fahrzeug(e) geändert. ${tasks} Handgriff(e) wurden notiert.`
            : `${vehicleIds.length} Fahrzeug(e) geändert.`,
        );
      }

      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(`Statuswechsel fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Status ändern</DialogTitle>
          <DialogDescription>
            Diese Aktion betrifft {vehicleIds.length} Fahrzeug(e).
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={target}
          onValueChange={(v) => setTarget(v as VehicleSaleStatus)}
          className="gap-3"
        >
          {(["available", "reserved", "sold"] as VehicleSaleStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <RadioGroupItem value={s} id={`bulk-status-${s}`} />
              <Label htmlFor={`bulk-status-${s}`} className="cursor-pointer font-normal">
                {SALE_STATUS_LABELS[s]}
              </Label>
            </div>
          ))}
        </RadioGroup>

        <div className="rounded-md bg-secondary/60 p-3">
          <p className="text-xs font-medium">Das passiert dann:</p>
          <ul className="mt-1.5 space-y-1">
            {consequences.map((c) => (
              <li key={c} className="text-xs text-muted-foreground">
                · {c}
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Abbrechen
          </Button>
          <Button onClick={apply} disabled={running || vehicleIds.length === 0}>
            {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Status setzen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
