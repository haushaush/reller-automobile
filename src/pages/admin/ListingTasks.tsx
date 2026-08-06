import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { differenceInCalendarDays, format } from "date-fns";
import { CheckCircle2, Copy, ExternalLink, Link2, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { primaryVehicleImage } from "@/lib/vehicleImages";
import {
  PLATFORM_LABELS,
  type ListingPlatform,
  type ListingTaskAction,
} from "@/lib/listings";

const STALE_DAYS = 7;

/** Reihenfolge nach Dringlichkeit: erst was Geld kostet oder Kunden irreführt. */
const ACTION_URGENCY: Record<ListingTaskAction, number> = {
  end_listing: 0,
  update_price: 1,
  mark_reserved: 2,
  reactivate: 3,
};

const PLATFORM_GROUP_ORDER: ListingPlatform[] = [
  "autoscout24",
  "kleinanzeigen",
  "mobile_de",
];

interface TaskVehicle {
  title: string | null;
  price: number | null;
  currency: string | null;
  is_sold: boolean | null;
  sold_at: string | null;
  reserved_at: string | null;
  updated_at: string | null;
  image_urls: string[] | null;
  custom_image_urls: string[] | null;
  hidden_image_urls: string[] | null;
  image_order: string[] | null;
  mobile_payload: unknown;
}

interface TaskRow {
  id: string;
  action: ListingTaskAction;
  reason: string | null;
  created_at: string;
  vehicle_id: string | null;
  /** Nur bei Aufgaben ohne Fahrzeugbezug (Fahrzeug wurde endgültig gelöscht) */
  platform: ListingPlatform | null;
  ad_title: string | null;
  ad_url: string | null;
  is_demo: boolean;
  listings: {
    id: string;
    platform: ListingPlatform;
    external_url: string | null;
  } | null;
  vehicles: TaskVehicle | null;
}

interface PriceChange {
  current: number | null;
  previous: number | null;
  changedAt: string | null;
}

const euro = (v: number | null | undefined, currency?: string | null) =>
  typeof v === "number"
    ? v.toLocaleString("de-DE", {
        style: "currency",
        currency: currency || "EUR",
        maximumFractionDigits: 0,
      })
    : null;

const dateDe = (iso: string | null | undefined) =>
  iso ? format(new Date(iso), "dd.MM.yyyy") : null;

function internalNumberOf(v: TaskVehicle | null): string | null {
  const payload = v?.mobile_payload as
    | { vehicle?: { internalNumber?: unknown }; internalNumber?: unknown }
    | null
    | undefined;
  const raw = payload?.vehicle?.internalNumber ?? payload?.internalNumber;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** Überschrift im Imperativ, mit Plattform. */
function taskHeadline(action: ListingTaskAction, platform: ListingPlatform | null): string {
  const on = platform ? ` auf ${PLATFORM_LABELS[platform]}` : "";
  switch (action) {
    case "end_listing":
      return `Inserat${on} beenden`;
    case "update_price":
      return `Preis${on} anpassen`;
    case "mark_reserved":
      return `Inserat${on} als reserviert kennzeichnen`;
    case "reactivate":
      return `Inserat${on} wieder aktivieren`;
  }
}

/** Grund als vollständiger Satz mit Datum. */
function taskReason(t: TaskRow, price: PriceChange | null): string {
  const v = t.vehicles;
  // Aufgaben ohne Fahrzeugbezug tragen ihren Grund als eigenen Text.
  if (!t.vehicle_id) return t.reason ?? "Das zugehörige Fahrzeug wurde endgültig gelöscht.";
  switch (t.action) {
    case "end_listing": {
      const d = dateDe(v?.sold_at) ?? dateDe(t.created_at);
      return `Das Fahrzeug wurde am ${d} als verkauft markiert.`;
    }
    case "update_price": {
      const d = dateDe(price?.changedAt) ?? dateDe(t.created_at);
      return `Der Preis wurde im Portal am ${d} geändert.`;
    }
    case "mark_reserved": {
      const d = dateDe(v?.reserved_at) ?? dateDe(t.created_at);
      return `Das Fahrzeug wurde am ${d} reserviert.`;
    }
    case "reactivate": {
      const d = dateDe(v?.updated_at) ?? dateDe(t.created_at);
      return `Das Fahrzeug steht seit dem ${d} wieder zum Verkauf.`;
    }
  }
}

/** Zielzustand für Statusaufgaben. */
function targetState(action: ListingTaskAction): string | null {
  switch (action) {
    case "end_listing":
      return "Zielzustand: Inserat beendet, nicht mehr sichtbar";
    case "mark_reserved":
      return "Zielzustand: Inserat als reserviert gekennzeichnet";
    case "reactivate":
      return "Zielzustand: Inserat wieder online und sichtbar";
    default:
      return null;
  }
}

/** Klartext für alte Aufgaben. */
function staleSentence(days: number, action: ListingTaskAction): string {
  const tail: Record<ListingTaskAction, string> = {
    end_listing: "das Fahrzeug ist verkauft und steht dort noch zum Verkauf",
    update_price: "dort steht noch der alte Preis",
    mark_reserved: "das Fahrzeug ist reserviert, dort steht es noch frei verfügbar",
    reactivate: "das Fahrzeug ist wieder verfügbar, dort ist es noch beendet",
  };
  return `Seit ${days} ${days === 1 ? "Tag" : "Tagen"} offen — ${tail[action]}.`;
}

export default function ListingTasks() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [urlEditId, setUrlEditId] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["listing-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_tasks")
        .select(
          "id, action, reason, created_at, vehicle_id, is_demo, listings(id, platform, external_url), vehicles(title, price, currency, is_sold, sold_at, reserved_at, updated_at, image_urls, custom_image_urls, hidden_image_urls, image_order, mobile_payload)",
        )
        .is("done_at", null)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TaskRow[];
    },
  });

  const priceVehicleIds = useMemo(
    () =>
      Array.from(
        new Set(tasks.filter((t) => t.action === "update_price").map((t) => t.vehicle_id)),
      ),
    [tasks],
  );

  // Preisverlauf nur für Preisaufgaben — daraus ergibt sich der alte Preis.
  const { data: priceMap = new Map<string, PriceChange>() } = useQuery({
    queryKey: ["listing-task-prices", priceVehicleIds],
    enabled: priceVehicleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_price_history")
        .select("vehicle_id, price, recorded_at")
        .in("vehicle_id", priceVehicleIds)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      const grouped = new Map<string, { price: number | null; recorded_at: string }[]>();
      for (const row of data ?? []) {
        const list = grouped.get(row.vehicle_id) ?? [];
        list.push({ price: row.price, recorded_at: row.recorded_at });
        grouped.set(row.vehicle_id, list);
      }
      const result = new Map<string, PriceChange>();
      for (const [id, list] of grouped) {
        result.set(id, {
          current: list[0]?.price ?? null,
          previous: list.find((e) => e.price !== list[0]?.price)?.price ?? null,
          changedAt: list[0]?.recorded_at ?? null,
        });
      }
      return result;
    },
  });

  const groups = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      const ua = ACTION_URGENCY[a.action] - ACTION_URGENCY[b.action];
      if (ua !== 0) return ua;
      // Bei gleicher Dringlichkeit zuerst das Älteste — es liegt am längsten.
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const byPlatform = new Map<ListingPlatform | "unbekannt", TaskRow[]>();
    for (const t of sorted) {
      const key = t.listings?.platform ?? "unbekannt";
      byPlatform.set(key, [...(byPlatform.get(key) ?? []), t]);
    }
    return [...PLATFORM_GROUP_ORDER, "unbekannt" as const]
      .filter((p) => byPlatform.has(p))
      .map((p) => ({
        key: p,
        label: p === "unbekannt" ? "Ohne Plattform" : PLATFORM_LABELS[p],
        rows: byPlatform.get(p)!,
      }));
  }, [tasks]);

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

  const saveUrl = async (listingId: string) => {
    const url = urlDraft.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Bitte eine vollständige Adresse mit https:// angeben.");
      return;
    }
    setBusyId(listingId);
    try {
      const { error } = await supabase
        .from("listings")
        .update({ external_url: url })
        .eq("id", listingId);
      if (error) throw error;
      toast.success("Inserats-Link gespeichert — beim nächsten Mal führt er direkt hin.");
      setUrlEditId(null);
      setUrlDraft("");
      queryClient.invalidateQueries({ queryKey: ["listing-tasks"] });
    } catch (e) {
      toast.error(`Speichern fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  const copyPrice = async (value: number) => {
    try {
      await navigator.clipboard.writeText(String(value));
      toast.success("Preis kopiert");
    } catch {
      toast.error("Kopieren nicht möglich — bitte von Hand übertragen.");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Offene Aufgaben</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Handgriffe, die Sie auf AutoScout24 oder Kleinanzeigen selbst vornehmen müssen. Diese
        beiden Portale sind noch nicht angebunden — Mobile.de wird automatisch aktualisiert.
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
            Auf AutoScout24 und Kleinanzeigen ist derzeit nichts zu tun.
          </p>
        </Card>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">
                {g.label} ({g.rows.length})
              </h2>
              <div className="mt-3 space-y-3">
                {g.rows.map((t) => {
                  const days = differenceInCalendarDays(new Date(), new Date(t.created_at));
                  const stale = days >= STALE_DAYS;
                  const v = t.vehicles;
                  const platform = t.listings?.platform ?? null;
                  const price = priceMap.get(t.vehicle_id) ?? null;
                  const newPrice =
                    t.action === "update_price" ? price?.current ?? v?.price ?? null : null;
                  const oldPrice = t.action === "update_price" ? price?.previous ?? null : null;
                  const target = targetState(t.action);
                  const thumb = primaryVehicleImage(v);
                  const intNo = internalNumberOf(v);
                  const editing = urlEditId === t.id;

                  return (
                    <Card
                      key={t.id}
                      className={[
                        "p-4",
                        t.is_demo ? "border-dashed bg-muted/50" : "",
                        stale && !t.is_demo ? "border-l-2 border-l-amber-500 bg-amber-500/5" : "",
                      ].join(" ")}
                    >
                      {t.is_demo && (
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Beispiel für die Vorführung
                        </p>
                      )}

                      {/* 1) Handlung zuerst */}
                      <h3 className="text-base font-semibold leading-snug">
                        {taskHeadline(t.action, platform)}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {taskReason(t, price)}
                      </p>
                      {stale && (
                        <p className="mt-1 text-sm font-medium text-amber-600 dark:text-amber-500">
                          {staleSentence(days, t.action)}
                        </p>
                      )}

                      {/* 2) Konkrete Werte */}
                      {t.action === "update_price" && newPrice != null && (
                        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="text-xl font-semibold">
                            Neuer Preis: {euro(newPrice, v?.currency)}
                          </span>
                          {oldPrice != null && (
                            <span className="text-sm text-muted-foreground line-through">
                              bisher {euro(oldPrice, v?.currency)}
                            </span>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyPrice(newPrice)}
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Preis kopieren
                          </Button>
                        </div>
                      )}
                      {target && (
                        <p className="mt-2 text-sm font-medium">{target}</p>
                      )}

                      {/* 3) Fahrzeug als Nebeninformation */}
                      <Link
                        to={`/admin/fahrzeuge/${t.vehicle_id}`}
                        className="mt-3 flex items-center gap-3 rounded-md p-1 text-xs text-muted-foreground hover:bg-muted/60"
                      >
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            className="h-9 w-14 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <span className="h-9 w-14 shrink-0 rounded bg-muted" />
                        )}
                        <span className="truncate">
                          {v?.title ?? "Fahrzeug"}
                          {intNo ? ` · Nr. ${intNo}` : ""}
                        </span>
                      </Link>

                      {/* 4) Erst der Weg zum Ziel, dann das Abhaken */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {t.listings?.external_url ? (
                          <Button asChild size="sm">
                            <a
                              href={t.listings.external_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                              Bei {platform ? PLATFORM_LABELS[platform] : "Plattform"} öffnen
                            </a>
                          </Button>
                        ) : editing && t.listings ? (
                          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                            <Input
                              autoFocus
                              value={urlDraft}
                              placeholder="https://…"
                              className="h-9 w-full sm:w-72"
                              onChange={(e) => setUrlDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveUrl(t.listings!.id);
                                if (e.key === "Escape") setUrlEditId(null);
                              }}
                            />
                            <Button
                              size="sm"
                              disabled={busyId === t.listings.id}
                              onClick={() => saveUrl(t.listings!.id)}
                            >
                              Speichern
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setUrlEditId(null)}>
                              Abbrechen
                            </Button>
                          </div>
                        ) : (
                          t.listings && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setUrlEditId(t.id);
                                setUrlDraft("");
                              }}
                            >
                              <Link2 className="mr-1.5 h-3.5 w-3.5" />
                              Inserats-Link hinterlegen
                            </Button>
                          )
                        )}

                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId === t.id}
                          onClick={() => close(t.id, "done")}
                        >
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
                        {t.is_demo && (
                          <Badge variant="outline" className="ml-auto text-[10px]">
                            Testdaten
                          </Badge>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
