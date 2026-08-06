import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface LifecycleVehicle {
  vehicleId: string;
  title: string;
  price: number | null;
  isSold: boolean;
  archivedAt: string | null;
  mobileListings: { accountLabel: string; adId: string | null }[];
  manualListings: { platform: string; adId: string | null }[];
  inquiryCount: number;
  leadCount: number;
  canDelete: boolean;
  blockers: string[];
}

interface RunResult {
  vehicleId: string;
  title: string;
  success: boolean;
  message: string;
}

export type LifecycleMode = "archive" | "delete" | "restore";

async function callLifecycle(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("vehicle-lifecycle", { body: payload });
  if (error) {
    const detail = (data as { error?: string } | null)?.error;
    throw new Error(detail || error.message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as { vehicles?: LifecycleVehicle[]; results?: RunResult[] };
}

/** Vorschau über die Auswirkungen holen — nutzbar außerhalb des Dialogs. */
export async function previewLifecycle(vehicleIds: string[]): Promise<LifecycleVehicle[]> {
  const data = await callLifecycle({ action: "preview", vehicleIds });
  return data.vehicles ?? [];
}

export default function VehicleLifecycleDialog({
  open,
  onOpenChange,
  mode,
  vehicleIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: LifecycleMode;
  vehicleIds: string[];
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [vehicles, setVehicles] = useState<LifecycleVehicle[]>([]);
  const [reason, setReason] = useState("");
  const [confirmTitle, setConfirmTitle] = useState("");
  const [results, setResults] = useState<RunResult[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setResults(null);
    setReason("");
    setConfirmTitle("");
    setLoadError(null);
    setLoading(true);
    previewLifecycle(vehicleIds)
      .then(setVehicles)
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [open, vehicleIds]);

  const target = vehicles[0];
  const mobileCount = vehicles.reduce((n, v) => n + v.mobileListings.length, 0);
  const manualCount = vehicles.reduce((n, v) => n + v.manualListings.length, 0);
  const inquiryCount = vehicles.reduce((n, v) => n + v.inquiryCount + v.leadCount, 0);
  const soldCount = vehicles.filter((v) => v.isSold).length;
  const accountSummary = [
    ...new Set(vehicles.flatMap((v) => v.mobileListings.map((m) => m.accountLabel))),
  ].join(", ");

  const run = async () => {
    setRunning(true);
    try {
      const data = await callLifecycle({
        action: mode,
        vehicleIds,
        reason: reason.trim() || null,
        confirmTitle: mode === "delete" ? confirmTitle : undefined,
      });
      setResults(data.results ?? []);
      const failed = (data.results ?? []).filter((r) => !r.success).length;
      if (failed === 0) toast.success("Vorgang abgeschlossen");
      else toast.error(`${failed} Fahrzeug(e) konnten nicht verarbeitet werden`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const titles: Record<LifecycleMode, string> = {
    archive: vehicleIds.length > 1 ? `${vehicleIds.length} Fahrzeuge archivieren` : "Fahrzeug archivieren",
    delete: "Fahrzeug endgültig löschen",
    restore: "Fahrzeug zurückholen",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent className="max-w-lg bg-background">
        <DialogHeader>
          <DialogTitle>{titles[mode]}</DialogTitle>
          <DialogDescription>
            {mode === "archive" &&
              "Das Fahrzeug verschwindet aus allen Listen und von der Website. Alle Daten bleiben erhalten und lassen sich jederzeit zurückholen."}
            {mode === "delete" &&
              "Nur für versehentlich angelegte oder doppelte Fahrzeuge. Alle Daten dieses Fahrzeugs werden unwiderruflich entfernt."}
            {mode === "restore" &&
              "Das Fahrzeug kehrt als Entwurf zurück. Inserate werden dabei nicht automatisch neu veröffentlicht."}
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">Auswirkungen werden geprüft …</p>}
        {loadError && (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        {!loading && !results && !loadError && (
          <div className="space-y-3 text-sm">
            {mode !== "restore" && (
              <ul className="space-y-1 rounded-md border p-3">
                <li>
                  <strong>{mobileCount}</strong> Mobile.de-Inserat(e) werden beendet
                  {accountSummary ? ` — Konto: ${accountSummary}` : ""}
                </li>
                <li>
                  <strong>{manualCount}</strong> Inserat(e) auf manuellen Plattformen müssen selbst
                  beendet werden
                </li>
                <li>
                  {inquiryCount > 0 ? (
                    <>
                      <strong>{inquiryCount}</strong> Anfrage(n) zum Fahrzeug vorhanden
                    </>
                  ) : (
                    "Keine Anfragen zum Fahrzeug"
                  )}
                </li>
              </ul>
            )}

            {soldCount > 0 && mode === "archive" && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {soldCount} verkaufte(s) Fahrzeug(e) in der Auswahl. Die Verkaufsdaten bleiben
                  vollständig erhalten — sie sind die Grundlage der späteren Marktwertermittlung.
                </AlertDescription>
              </Alert>
            )}

            {mode === "delete" && target && (
              <>
                <div className="rounded-md border p-3">
                  <p className="font-medium">Was unwiderruflich verschwindet</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                    <li>Fahrzeugdaten, Preishistorie und Änderungsverlauf</li>
                    <li>Marketing-Materialien, Exposés, Storys und Collagen</li>
                    <li>Alle hinterlegten Bilder</li>
                  </ul>
                  <p className="mt-2 font-medium">Was bleibt</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                    <li>
                      {target.inquiryCount + target.leadCount} Anfrage(n) — künftig ohne
                      Fahrzeugbezug, mit dem Fahrzeugtitel als Text
                    </li>
                    <li>Ein Protokolleintrag im Filter „Gelöscht“</li>
                  </ul>
                  <p className="mt-2">
                    <strong>{mobileCount}</strong> Inserat(e) werden automatisch beendet ·{" "}
                    <strong>{manualCount}</strong> müssen Sie selbst beenden
                  </p>
                </div>

                {!target.canDelete ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Endgültiges Löschen ist hier nicht möglich: {target.blockers.join(" · ")}.
                      Bitte archivieren Sie das Fahrzeug stattdessen.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div>
                    <Label htmlFor="confirm-title">
                      Zur Bestätigung den Fahrzeugtitel eintippen: <em>{target.title}</em>
                    </Label>
                    <Input
                      id="confirm-title"
                      className="mt-1"
                      value={confirmTitle}
                      onChange={(e) => setConfirmTitle(e.target.value)}
                      placeholder={target.title}
                    />
                  </div>
                )}
              </>
            )}

            {mode !== "restore" && (
              <div>
                <Label htmlFor="lifecycle-reason">
                  {mode === "delete" ? "Löschgrund (Pflichtangabe)" : "Grund (optional)"}
                </Label>
                <Textarea
                  id="lifecycle-reason"
                  className="mt-1"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="z. B. Fahrzeug außer Haus, Doppeleintrag"
                />
              </div>
            )}

          </div>
        )}

        {results && (
          <div className="space-y-2 max-h-64 overflow-y-auto text-sm">
            {results.map((r) => (
              <div key={r.vehicleId} className="flex gap-2 rounded-md border p-2">
                {r.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                )}
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-muted-foreground">{r.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {results ? (
            <Button onClick={() => onOpenChange(false)}>Schließen</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>
                Abbrechen
              </Button>
              <Button
                variant={mode === "delete" ? "destructive" : "default"}
                disabled={
                  running ||
                  loading ||
                  !!loadError ||
                  (mode === "delete" &&
                    (!target?.canDelete || confirmTitle.trim() !== (target?.title ?? "").trim()))
                }
                onClick={run}
              >
                {running
                  ? "Wird ausgeführt …"
                  : mode === "archive"
                  ? "Archivieren"
                  : mode === "delete"
                  ? "Endgültig löschen"
                  : "Zurückholen"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
