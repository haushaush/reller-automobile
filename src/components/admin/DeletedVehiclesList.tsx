import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageOff, Info, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryLabel } from "@/pages/admin/VehiclesAdmin";

interface DeletionRow {
  id: string;
  vehicle_id: string;
  title: string;
  price: number | null;
  vehicle_category: string | null;
  mobile_ad_ids: string[] | null;
  mobile_ad_refs: { accountLabel?: string; adId?: string | null }[] | null;
  platforms: { platform?: string; adId?: string | null }[] | null;
  thumbnail_path: string | null;
  reason: string | null;
  performed_at: string;
  performed_by: string | null;
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const euro = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("de-DE")} €`);

export default function DeletedVehiclesList() {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["deleted-vehicles", from, to],
    queryFn: async () => {
      let query = supabase
        .from("vehicle_deletion_log")
        .select("*")
        .eq("action", "deleted")
        .order("performed_at", { ascending: false })
        .limit(500);
      if (from) query = query.gte("performed_at", `${from}T00:00:00Z`);
      if (to) query = query.lte("performed_at", `${to}T23:59:59Z`);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as DeletionRow[];

      // Vorschaubilder liegen in einem privaten Bereich — signierte Links holen
      const paths = rows.map((r) => r.thumbnail_path).filter(Boolean) as string[];
      const thumbs = new Map<string, string>();
      if (paths.length) {
        const { data: signed } = await supabase.storage
          .from("deletion-log")
          .createSignedUrls(paths, 3600);
        for (const s of signed ?? []) {
          if (s.path && s.signedUrl) thumbs.set(s.path, s.signedUrl);
        }
      }
      return { rows, thumbs };
    },
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = data?.rows ?? [];
    if (!term) return list;
    return list.filter((r) => (r.title ?? "").toLowerCase().includes(term));
  }, [data, q]);

  return (
    <div className="mt-4">
      <Card className="flex items-start gap-2 border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Diese Fahrzeuge wurden endgültig entfernt. Die Einträge dienen der Nachvollziehbarkeit
          und lassen sich nicht wiederherstellen.
        </p>
      </Card>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Nach Fahrzeugtitel suchen"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="del-from" className="text-xs">
            Gelöscht ab
          </Label>
          <Input id="del-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="del-to" className="text-xs">
            Gelöscht bis
          </Label>
          <Input id="del-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Kein endgültig gelöschtes Fahrzeug im gewählten Zeitraum.
          </Card>
        ) : (
          rows.map((r) => {
            const thumb = r.thumbnail_path ? data?.thumbs.get(r.thumbnail_path) : null;
            const ads = (r.mobile_ad_refs ?? []).length
              ? (r.mobile_ad_refs ?? []).map(
                  (m) => `Mobile.de ${m.accountLabel ?? ""} ${m.adId ?? ""}`.trim(),
                )
              : (r.mobile_ad_ids ?? []).map((id) => `Mobile.de ${id}`);
            const manual = (r.platforms ?? []).map(
              (p) => `${p.platform ?? "Plattform"}${p.adId ? ` ${p.adId}` : ""}`,
            );
            return (
              <Card
                key={r.id}
                className="flex gap-3 p-3 opacity-80 grayscale select-text"
                aria-disabled
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    loading="lazy"
                    className="h-20 w-28 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded bg-muted">
                    <ImageOff className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <p className="font-medium">{r.title}</p>
                    <span className="text-sm">{euro(r.price)}</span>
                    <Badge variant="outline">{categoryLabel(r.vehicle_category)}</Badge>
                  </div>
                  {(ads.length > 0 || manual.length > 0) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ehemalige Inserate: {[...ads, ...manual].join(" · ")}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Gelöscht am {dateTime(r.performed_at)}
                    {r.performed_by ? ` · von ${r.performed_by.slice(0, 8)}…` : ""}
                  </p>
                  {r.reason && <p className="mt-1 text-xs">Grund: {r.reason}</p>}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
