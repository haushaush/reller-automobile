import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DraftRow {
  id: string;
  status: string;
  payload: Record<string, unknown> | null;
  mobile_ad_id: string | null;
  created_at: string;
}

function readPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else return undefined;
  }
  return cur;
}

const fmtPrice = (v: unknown) =>
  typeof v === "number"
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v)
    : "—";

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function MobileAdDrafts() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("mobile_ad_drafts")
      .select("id, status, payload, mobile_ad_id, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Laden fehlgeschlagen");
    } else {
      setRows((data ?? []) as DraftRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Entwurf wirklich löschen?")) return;
    const { error } = await supabase.from("mobile_ad_drafts").delete().eq("id", id);
    if (error) toast.error("Löschen fehlgeschlagen");
    else {
      toast.success("Entwurf gelöscht");
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Mobile.de Inserate</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entwürfe verwalten. Die Veröffentlichung auf Mobile.de folgt in Etappe 2.
          </p>
        </div>
        <Button onClick={() => navigate("/admin/mobile-ad/new")}>
          <Plus className="h-4 w-4" />
          Neuer Entwurf
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Lade…
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          Noch keine Entwürfe.{" "}
          <Link to="/admin/mobile-ad/new" className="underline">
            Jetzt ersten anlegen
          </Link>
          .
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const make = readPath(r.payload, ["vehicle", "make", "key"]) as string | undefined;
            const model = readPath(r.payload, ["vehicle", "model", "key"]) as string | undefined;
            const desc = readPath(r.payload, ["vehicle", "model-description"]) as string | undefined;
            const price = readPath(r.payload, ["price", "consumer-price-gross"]);
            return (
              <Card key={r.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">
                      {[make, model].filter(Boolean).join(" ") || "Unbenannt"}
                    </span>
                    {desc && <span className="text-sm text-muted-foreground truncate">{desc}</span>}
                    <Badge
                      variant={
                        r.status === "published"
                          ? "default"
                          : r.status === "error"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {r.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {fmtPrice(price)} · erstellt {fmtDate(r.created_at)}
                    {r.mobile_ad_id ? ` · Mobile.de ID ${r.mobile_ad_id}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    title="Etappe 2"
                  >
                    <Upload className="h-4 w-4" />
                    Veröffentlichen
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(r.id)}
                    aria-label="Löschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
