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
import { Checkbox } from "@/components/ui/checkbox";
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
  vehicleId: string;
  vehicleTitle: string;
  current: VehicleSaleStatus;
  /** Vorauswahl, wenn der Dialog aus dem Auswahlfeld der Tabelle geöffnet wird */
  initialTarget?: VehicleSaleStatus;
  onDone?: () => void;
}

export default function VehicleStatusDialog({
  open,
  onOpenChange,
  vehicleId,
  vehicleTitle,
  current,
  initialTarget,
  onDone,
}: Props) {
  const [target, setTarget] = useState<VehicleSaleStatus>(current);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [running, setRunning] = useState(false);
  const [openLeads, setOpenLeads] = useState<{ id: string; buyer_name: string | null }[]>([]);
  const [closeLeads, setCloseLeads] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTarget(initialTarget ?? current);
    supabase
      .from("listings")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .then(({ data }) => setListings((data ?? []) as ListingRow[]));
    setCloseLeads(false);
    supabase
      .from("leads")
      .select("id, buyer_name")
      .eq("vehicle_id", vehicleId)
      .eq("status", "IN_PROGRESS")
      .then(({ data }) => setOpenLeads((data ?? []) as { id: string; buyer_name: string | null }[]));
  }, [open, current, initialTarget, vehicleId]);

  const mobile = listings.find((l) => l.platform === "mobile_de");
  const manualLive = listings.filter((l) => l.is_manual && l.status === "live");
  const mobileLive = mobile?.status === "live" || mobile?.status === "publishing";

  const consequences: string[] = [];
  if (target === "sold") {
    consequences.push(
      mobileLive
        ? "Das Inserat auf Mobile.de wird automatisch beendet."
        : "Auf Mobile.de ist derzeit kein aktives Inserat vorhanden — dort passiert nichts.",
    );
    if (manualLive.length > 0) {
      consequences.push(
        `Auf ${manualLive
          .map((l) => PLATFORM_LABELS[l.platform])
          .join(" und ")} müssen Sie das Inserat selbst beenden — wir erinnern Sie daran.`,
      );
    }
  } else if (target === "reserved") {
    consequences.push(
      mobileLive
        ? "Das Inserat auf Mobile.de wird als „Reserviert“ gekennzeichnet und bleibt sichtbar."
        : "Das Fahrzeug bleibt online, erhält aber den Hinweis „Reserviert“.",
    );

    if (manualLive.length > 0) {
      consequences.push(
        `Auf ${manualLive
          .map((l) => PLATFORM_LABELS[l.platform])
          .join(" und ")} kennzeichnen Sie das Inserat bitte selbst als reserviert — wir erinnern Sie daran.`,
      );
    }
  } else {
    consequences.push("Das Fahrzeug wird wieder als verfügbar geführt.");
    if (manualLive.length > 0) {
      consequences.push(
        `Prüfen Sie auf ${manualLive
          .map((l) => PLATFORM_LABELS[l.platform])
          .join(" und ")}, ob das Inserat wieder aktiv ist — wir erinnern Sie daran.`,
      );
    }
  }

  const apply = async () => {
    setRunning(true);
    try {
      // Portalstatus setzen UND an Mobile.de übertragen (verfügbar/reserviert = PUT, verkauft = Inserat beenden)
      const { data, error } = await supabase.functions.invoke("set-mobile-ad-status", {
        body: { vehicleId, target },
      });
      if (error) throw new Error(error.message);
      const result = (data ?? {}) as { ok?: boolean; pushed?: boolean; error?: string };

      await logVehicleAudit(vehicleId, [
        {
          action: "status_change",
          field: "sale_status",
          oldValue: SALE_STATUS_LABELS[current],
          newValue: SALE_STATUS_LABELS[target],
        },
      ]);

      // 3) Offene Anfragen auf Wunsch ebenfalls schließen
      if (target === "sold" && closeLeads && openLeads.length > 0) {
        const { error: leadError } = await supabase.functions.invoke("update-lead-status", {
          body: { leadIds: openLeads.map((l) => l.id), newStatus: "SOLD" },
        });
        if (leadError) toast.warning(`Anfragen konnten nicht alle gemeldet werden: ${leadError.message}`);
      }

      // 4) Aufgaben für manuelle Plattformen
      const action =
        target === "sold" ? "end_listing" : target === "reserved" ? "mark_reserved" : "reactivate";
      const count = await createTasksForManualListings(
        vehicleId,
        action,
        `${vehicleTitle}: Status auf „${SALE_STATUS_LABELS[target]}“ geändert`,
      );

      if (result.ok === false) {
        toast.error(
          `Status im Portal gesetzt, aber noch nicht an Mobile.de übertragen: ${result.error ?? "unbekannter Fehler"}`,
        );
      } else {
        toast.success(
          count > 0
            ? `Status geändert. ${count} offene(r) Handgriff(e) wurden für Sie notiert.`
            : result.pushed
              ? "Status geändert und an Mobile.de übertragen."
              : "Status geändert.",
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
          <DialogDescription>{vehicleTitle}</DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={target}
          onValueChange={(v) => setTarget(v as VehicleSaleStatus)}
          className="gap-3"
        >
          {(["available", "reserved", "sold"] as VehicleSaleStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <RadioGroupItem value={s} id={`status-${s}`} />
              <Label htmlFor={`status-${s}`} className="cursor-pointer font-normal">
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

        {target === "sold" && openLeads.length > 0 && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="close-leads"
                checked={closeLeads}
                onCheckedChange={(v) => setCloseLeads(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="close-leads" className="cursor-pointer text-xs font-normal leading-relaxed">
                Zu diesem Fahrzeug {openLeads.length === 1 ? "gibt es 1 offene Anfrage" : `gibt es ${openLeads.length} offene Anfragen`}.
                Ebenfalls auf „Verkauft" setzen und an Mobile.de melden?
                <span className="mt-1 block text-muted-foreground">
                  Nur ankreuzen, wenn das Fahrzeug an diese Interessenten oder gar nicht mehr verfügbar ist.
                </span>
              </Label>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Abbrechen
          </Button>
          <Button onClick={apply} disabled={running || target === current}>
            {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Status setzen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
