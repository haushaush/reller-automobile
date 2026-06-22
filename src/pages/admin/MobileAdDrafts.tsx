import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, Upload, Loader2, Pencil, Radio, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DraftRow {
  id: string;
  status: string;
  payload: Record<string, unknown> | null;
  mobile_ad_id: string | null;
  error_message: string | null;
  created_at: string;
  image_paths: string[] | null;
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
  const [publishing, setPublishing] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const [confirmCopyId, setConfirmCopyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("mobile_ad_drafts")
      .select("id, status, payload, mobile_ad_id, error_message, created_at")
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
  const publish = async (id: string) => {
    if (!confirm("Wirklich live auf Mobile.de stellen? Das Inserat wird öffentlich sichtbar.")) return;
    setPublishing(id);
    try {
      const { data, error } = await supabase.functions.invoke("publish-mobile-ad", {
        body: { draftId: id },
      });
      if (error) {
        const msg = (data as { error?: string; details?: unknown } | null)?.error
          || error.message
          || "Unbekannter Fehler";
        toast.error(`Veröffentlichen fehlgeschlagen: ${msg}`);
      } else {
        toast.success("Auf Mobile.de veröffentlicht");
      }
      await load();
    } finally {
      setPublishing(null);
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Mobile.de Inserate</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entwürfe verwalten und auf Mobile.de veröffentlichen.
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
                  {r.status === "error" && r.error_message && (
                    <div className="text-xs text-destructive mt-1 break-all">
                      {r.error_message}
                    </div>
                  )}
                  {r.status === "published" && r.mobile_ad_id && (
                    <a
                      href={`https://suchen.mobile.de/fahrzeuge/details.html?id=${r.mobile_ad_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline mt-1 inline-block"
                    >
                      Inserat öffnen
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {r.status !== "published" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/admin/mobile-ad/edit/${r.id}`)}
                    >
                      <Pencil className="h-4 w-4" />
                      Bearbeiten
                    </Button>
                  ) : r.mobile_ad_id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/admin/mobile-ad/${r.id}/live-edit`)}
                    >
                      <Radio className="h-4 w-4" />
                      Live bearbeiten
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button size="sm" variant="outline" disabled>
                            <Radio className="h-4 w-4" />
                            Live bearbeiten
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Keine Mobile.de-ID vorhanden.</TooltipContent>
                    </Tooltip>
                  )}
                  {r.status !== "published" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => publish(r.id)}
                      disabled={publishing === r.id}
                    >
                      {publishing === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Veröffentlichen
                    </Button>
                  )}
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
