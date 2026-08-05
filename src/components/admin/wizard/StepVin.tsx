import { useState } from "react";
import { Loader2, ScanLine, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { loadRef, type FormState, type RefItem } from "@/lib/mobileAdForm";

interface Candidate {
  id: string;
  label: string;
  display: string;
  patch: Partial<FormState>;
}

interface Props {
  vin: string;
  makes: RefItem[];
  onChange: (patch: Partial<FormState>) => void;
  onSkip: () => void;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export default function StepVin({ vin, makes, onChange, onSkip }: Props) {
  const [value, setValue] = useState(vin);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const decode = async () => {
    const clean = value.trim().toUpperCase();
    if (clean.length !== 17) {
      setFailed("Eine FIN besteht aus genau 17 Zeichen. Bitte prüfen Sie Ihre Eingabe.");
      return;
    }
    setLoading(true);
    setFailed(null);
    setCandidates(null);
    try {
      const { data, error } = await supabase.functions.invoke("decode-vin", { body: { vin: clean } });
      const d = (data ?? null) as Record<string, unknown> | null;
      if (error || !d || d.error) {
        setFailed(
          String(d?.error ?? error?.message ?? "Zu dieser FIN konnten keine Daten gefunden werden."),
        );
        return;
      }
      const found: Candidate[] = [];
      found.push({ id: "vin", label: "Fahrzeug-Identifikationsnummer", display: clean, patch: { vin: clean } });

      const brand = typeof d.brand === "string" ? d.brand : "";
      let makeKey = "";
      if (brand) {
        makeKey = makes.find((m) => norm(m.name) === norm(brand))?.key ?? "";
        if (makeKey) {
          found.push({ id: "make", label: "Marke", display: brand, patch: { make: makeKey, model: "" } });
        }
      }
      const model = typeof d.model === "string" ? d.model : "";
      if (makeKey && model) {
        const items = await loadRef("models", makeKey).catch(() => [] as RefItem[]);
        const hit =
          items.find((i) => norm(i.name) === norm(model)) ??
          items.find((i) => norm(i.name).startsWith(norm(model)));
        if (hit) {
          found.push({ id: "model", label: "Modell", display: hit.name, patch: { model: hit.key } });
        } else {
          found.push({ id: "modelDescription", label: "Modellbezeichnung", display: model, patch: { modelDescription: model } });
        }
      }
      const year = typeof d.year === "number" ? d.year : null;
      if (year) {
        found.push({ id: "regYear", label: "Baujahr (Erstzulassung)", display: String(year), patch: { regYear: String(year) } });
      }
      for (const [key, label, field] of [
        ["power", "Leistung (kW)", "power"],
        ["cubic_capacity", "Hubraum (ccm)", "cubicCapacity"],
        ["num_seats", "Sitzplätze", "seats"],
      ] as const) {
        const v = d[key];
        if (typeof v === "number" && v > 0) {
          found.push({ id: field, label, display: String(v), patch: { [field]: String(v) } as Partial<FormState> });
        }
      }

      if (found.length <= 1) {
        setFailed("Zu dieser FIN wurden kaum Daten gefunden. Bitte tragen Sie die Angaben von Hand ein.");
        onChange({ vin: clean });
        return;
      }
      setCandidates(found);
      setSelected(Object.fromEntries(found.map((f) => [f.id, true])));
    } catch (e) {
      console.error(e);
      setFailed("Die Abfrage hat nicht geklappt. Bitte später erneut versuchen oder ohne FIN fortfahren.");
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!candidates) return;
    let patch: Partial<FormState> = {};
    for (const c of candidates) if (selected[c.id]) patch = { ...patch, ...c.patch };
    onChange(patch);
    toast.success("Daten übernommen");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="vin-input" className="text-base">Fahrzeug-Identifikationsnummer (FIN)</Label>
          <Input
            id="vin-input"
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            placeholder="z. B. WVWZZZ1KZAW000000"
            maxLength={17}
            className="h-14 text-lg tracking-widest font-mono"
          />
          <p className="text-sm text-muted-foreground flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            Sie finden die FIN im Fahrzeugschein in Feld E sowie unten links an der Windschutzscheibe.
            Sie besteht aus 17 Zeichen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={decode} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            Daten übernehmen
          </Button>
          <Button type="button" variant="ghost" onClick={onSkip}>Ohne FIN fortfahren</Button>
        </div>
      </Card>

      {failed && (
        <Card className="p-4 space-y-3 border-amber-500/40 bg-amber-500/5">
          <p className="text-sm">{failed}</p>
          <p className="text-sm text-muted-foreground">
            Kein Problem — Sie können alle Angaben im nächsten Schritt selbst eintragen.
          </p>
          <Button type="button" variant="outline" onClick={onSkip}>Ohne FIN fortfahren</Button>
        </Card>
      )}

      {candidates && (
        <Card className="p-6 space-y-4">
          <h3 className="font-medium">Erkannte Angaben</h3>
          <p className="text-sm text-muted-foreground">
            Entfernen Sie das Häkchen bei allem, was nicht übernommen werden soll.
          </p>
          <div className="space-y-2">
            {candidates.map((c) => (
              <label key={c.id} className="flex items-center gap-3 rounded-md border p-3 cursor-pointer">
                <Checkbox
                  checked={!!selected[c.id]}
                  onCheckedChange={(v) => setSelected((s) => ({ ...s, [c.id]: v === true }))}
                />
                <span className="text-sm text-muted-foreground w-56 shrink-0">{c.label}</span>
                <span className="font-medium">{c.display}</span>
              </label>
            ))}
          </div>
          <Button type="button" onClick={apply}>Ausgewählte Angaben übernehmen</Button>
        </Card>
      )}
    </div>
  );
}
