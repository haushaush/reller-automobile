import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, DownloadCloud } from "lucide-react";
import { toast } from "sonner";

interface IssueRow {
  id: string;
  vehicle_id: string | null;
  mobile_ad_id: string | null;
  issue_type: string;
  severity: string;
  detail: string | null;
  detected_at: string;
  scope: string | null;
}

interface AdoptPreview {
  totalAds: number;
  alreadyLinked: number;
  willCreate: number;
  willMatch: number;
  created?: number;
  matched?: number;
  failures?: string[];
  createSamples?: { mobileAdId: string; title: string; price: number | null }[];
  matchSamples?: { mobileAdId: string; title: string; via: string }[];
}

const TYPE_LABELS: Record<string, string> = {
  orphan_ad: "Inserat ohne Fahrzeug",
  ad_missing: "Inserat verschwunden",
  price_drift: "Preisabweichung",
  mileage_drift: "km-Abweichung",
};

export default function ReconciliationPanel() {
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [preview, setPreview] = useState<AdoptPreview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("mobile_reconciliation_issues" as never)
      .select("id, vehicle_id, mobile_ad_id, issue_type, severity, detail, detected_at, scope")
      .is("resolved_at", null)
      .order("detected_at", { ascending: false })
      .limit(50);
    setIssues(((data ?? []) as unknown as IssueRow[]));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runReconcile = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-vehicles", { body: {} });
      const d = data as { ok?: boolean; error?: string; checked?: number; issues?: number } | null;
      if (error || !d?.ok) {
        toast.error(d?.error || error?.message || "Abgleich fehlgeschlagen");
        return;
      }
      toast.success(`Abgleich fertig: ${d.checked ?? 0} Inserate geprüft, ${d.issues ?? 0} Abweichung(en).`);
      await load();
    } finally {
      setRunning(false);
    }
  };

  const runAdopt = async (dryRun: boolean) => {
    setAdopting(true);
    try {
      const { data, error } = await supabase.functions.invoke("adopt-mobile-ads", { body: { dryRun } });
      const d = data as (AdoptPreview & { ok?: boolean; error?: string }) | null;
      if (error || !d?.ok) {
        toast.error(d?.error || error?.message || "Bestandsübernahme fehlgeschlagen");
        return;
      }
      setPreview(d);
      toast.success(dryRun
        ? `Vorschau: ${d.willCreate} neu, ${d.willMatch} Zuordnung(en), ${d.alreadyLinked} bereits verknüpft.`
        : `Übernommen: ${d.created ?? 0} neu angelegt, ${d.matched ?? 0} zugeordnet.`);
    } finally {
      setAdopting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Abgleich mit Mobile.de</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Das Portal ist führend. Der Abgleich legt keine Fahrzeuge mehr an, sondern meldet nur Abweichungen.
            </p>
          </div>
          <Button onClick={runReconcile} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Abgleich starten
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          ) : issues.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Keine offenen Abweichungen.</p>
          ) : (
            issues.map((i) => (
              <div key={i.id} className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={i.severity === "error" ? "destructive" : "secondary"}>
                      {TYPE_LABELS[i.issue_type] ?? i.issue_type}
                    </Badge>
                    {i.mobile_ad_id && (
                      <span className="text-xs text-muted-foreground font-mono">{i.mobile_ad_id}</span>
                    )}
                  </div>
                  <p className="text-sm mt-1">{i.detail}</p>
                </div>
                {i.vehicle_id && (
                  <Link to={`/admin/fahrzeuge/${i.vehicle_id}`} className="text-sm text-primary underline shrink-0">
                    Fahrzeug
                  </Link>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Einmalige Bestandsübernahme</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Übernimmt bestehende Mobile.de-Inserate als Portal-Fahrzeuge. Erst Vorschau prüfen, dann übernehmen.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => runAdopt(true)} disabled={adopting}>
              {adopting ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
              Vorschau
            </Button>
            <Button onClick={() => runAdopt(false)} disabled={adopting || !preview}>
              Übernahme ausführen
            </Button>
          </div>
        </div>

        {preview && (
          <div className="mt-4 text-sm space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Inserate gesamt" value={preview.totalAds} />
              <Stat label="Bereits verknüpft" value={preview.alreadyLinked} />
              <Stat label="Neu anlegen" value={preview.willCreate} />
              <Stat label="Zuordnen" value={preview.willMatch} />
            </div>
            {!!preview.failures?.length && (
              <div className="text-destructive text-xs">
                Fehler: {preview.failures.slice(0, 5).join(" · ")}
              </div>
            )}
            {!!preview.createSamples?.length && (
              <ul className="text-xs text-muted-foreground list-disc pl-5">
                {preview.createSamples.map((s) => (
                  <li key={s.mobileAdId}>{s.title} — {s.price ? `${s.price.toLocaleString("de-DE")} €` : "kein Preis"}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
