import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { CheckCircle2, ExternalLink, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PLATFORM_LABELS,
  TASK_ACTION_LABELS,
  type ListingPlatform,
  type ListingTaskAction,
} from "@/lib/listings";

const STALE_DAYS = 7;

interface TaskRow {
  id: string;
  action: ListingTaskAction;
  reason: string | null;
  created_at: string;
  vehicle_id: string;
  is_demo: boolean;
  listings: {
    platform: ListingPlatform;
    external_url: string | null;
  } | null;
  vehicles: { title: string } | null;
}

export default function ListingTasks() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["listing-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_tasks")
        .select(
          "id, action, reason, created_at, vehicle_id, is_demo, listings(platform, external_url), vehicles(title)",
        )
        .is("done_at", null)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TaskRow[];
    },
  });

  const staleCutoff = useMemo(
    () => Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000,
    [],
  );

  const close = async (id: string, mode: "done" | "dismiss") => {
    setBusyId(id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const patch =
        mode === "done"
          ? { done_at: new Date().toISOString(), done_by: userData.user?.id ?? null }
          : { dismissed_at: new Date().toISOString() };
      const { error } = await supabase
        .from("listing_tasks")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
      toast.success(mode === "done" ? "Als erledigt abgehakt" : "Vom Zettel gestrichen");
      queryClient.invalidateQueries({ queryKey: ["listing-tasks"] });
    } catch (e) {
      toast.error(`Fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Offene Aufgaben</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Handgriffe, die Sie auf AutoScout24 oder Kleinanzeigen selbst vornehmen müssen.
      </p>

      {isLoading ? (
        <Card className="mt-6 p-10 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </Card>
      ) : tasks.length === 0 ? (
        <Card className="mt-6 border-emerald-600/40 bg-emerald-600/10 p-10 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
          <p className="text-sm font-medium">Alles erledigt</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Es liegen keine offenen Handgriffe vor.
          </p>
        </Card>
      ) : (
        <Card className="mt-6 divide-y divide-border">
          {tasks.map((t) => {
            const stale = new Date(t.created_at).getTime() < staleCutoff;
            return (
              <div
                key={t.id}
                className={`flex flex-wrap items-start gap-3 p-4 ${
                  stale ? "border-l-2 border-l-amber-500 bg-amber-500/5" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/admin/fahrzeuge/${t.vehicle_id}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {t.vehicles?.title ?? "Fahrzeug"}
                    </Link>
                    {t.listings && (
                      <Badge variant="outline" className="text-[10px]">
                        {PLATFORM_LABELS[t.listings.platform]}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {TASK_ACTION_LABELS[t.action]}
                    </Badge>
                    {t.is_demo && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        Testdaten
                      </Badge>
                    )}
                    {stale && (
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-[10px]">
                        seit über {STALE_DAYS} Tagen offen
                      </Badge>
                    )}

                  </div>
                  {t.reason && (
                    <p className="mt-1 text-xs text-muted-foreground">{t.reason}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Notiert{" "}
                    {formatDistanceToNow(new Date(t.created_at), {
                      addSuffix: true,
                      locale: de,
                    })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {t.listings?.external_url && (
                    <Button asChild variant="outline" size="sm">
                      <a href={t.listings.external_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Zum Inserat
                      </a>
                    </Button>
                  )}
                  <Button size="sm" disabled={busyId === t.id} onClick={() => close(t.id, "done")}>
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Erledigt
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === t.id}
                    onClick={() => close(t.id, "dismiss")}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Ist nicht nötig
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
