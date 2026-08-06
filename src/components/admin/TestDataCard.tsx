import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Entfernt sämtliche als Testdaten markierten Beispielaufgaben (is_demo) samt
 * der dazugehörigen Beispiel-Inserate. Echte Aufgaben bleiben unberührt.
 */
export default function TestDataCard() {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { count: c } = await supabase
      .from("listing_tasks")
      .select("id", { count: "exact", head: true })
      .eq("is_demo", true);
    setCount(c ?? 0);
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async () => {
    setBusy(true);
    try {
      const { data: demoTasks, error: readErr } = await supabase
        .from("listing_tasks")
        .select("id, listing_id")
        .eq("is_demo", true);
      if (readErr) throw readErr;

      const listingIds = (demoTasks ?? [])
        .map((t) => t.listing_id)
        .filter((id): id is string => Boolean(id));

      const { error: delErr } = await supabase.from("listing_tasks").delete().eq("is_demo", true);
      if (delErr) throw delErr;

      if (listingIds.length > 0) {
        await supabase.from("listings").delete().in("id", listingIds).eq("note", "[Testdaten]");
      }

      toast.success(`${demoTasks?.length ?? 0} Testaufgabe(n) entfernt`);
      await load();
    } catch (e) {
      toast.error("Testdaten konnten nicht entfernt werden", {
        description: e instanceof Error ? e.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold">Testdaten</h2>
          <p className="text-sm text-muted-foreground">
            Beispielaufgaben für Vorführungen. Sie sind gesondert gekennzeichnet und lassen sich
            jederzeit vollständig entfernen — echte Aufgaben bleiben erhalten.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {count === null ? "Wird geprüft…" : `${count} Testaufgabe(n) vorhanden`}
        </span>
        <Button variant="destructive" onClick={remove} disabled={busy || count === 0}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
          Testdaten entfernen
        </Button>
      </div>
    </Card>
  );
}
