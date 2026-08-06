import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  Unlink,
  AlertTriangle,
  Car,
  BadgeEuro,
} from "lucide-react";

interface IssueRow {
  id: string;
  vehicle_id: string | null;
  mobile_ad_id: string | null;
  issue_type: string;
  severity: string;
  detail: string | null;
  scope: string;
  detected_at: string;
}

interface VehicleLite {
  id: string;
  title: string;
  is_sold: boolean;
}

/** Fachlich verständliche Beschreibung je Abweichungstyp */
const ISSUE_INFO: Record<string, { label: string; fields: string[]; hint: string }> = {
  orphan_ad: {
    label: "Inserat ohne Fahrzeug im Portal",
    fields: ["Fahrzeugzuordnung"],
    hint: "Das Inserat läuft bei Mobile.de, im Portal gibt es dazu kein Fahrzeug. Entweder das Fahrzeug im Portal anlegen oder das Inserat bei Mobile.de beenden.",
  },
  price_drift: {
    label: "Preis stimmt nicht überein",
    fields: ["Preis"],
    hint: "Portal und Mobile.de zeigen unterschiedliche Preise. Bitte den richtigen Preis im Portal setzen – er wird dann zu Mobile.de übertragen.",
  },
  mileage_drift: {
    label: "Kilometerstand stimmt nicht überein",
    fields: ["Kilometerstand"],
    hint: "Portal und Mobile.de zeigen unterschiedliche Kilometerstände. Bitte im Portal korrigieren.",
  },
  missing_ad: {
    label: "Fahrzeug ohne Inserat",
    fields: ["Inserat"],
    hint: "Im Portal steht ein veröffentlichtes Fahrzeug, bei Mobile.de gibt es dazu kein Inserat mehr.",
  },
  ad_missing: {
    label: "Fahrzeug ohne Inserat",
    fields: ["Inserat"],
    hint: "Im Portal steht ein veröffentlichtes Fahrzeug, bei Mobile.de gibt es dazu kein Inserat mehr.",
  },
  account_mismatch: {
    label: "Falsches Mobile.de-Konto",
    fields: ["Kontozuordnung"],
    hint: "Das Inserat wurde auf einem anderen Mobile.de-Konto gefunden, als im Portal hinterlegt ist. Die Zuordnung ist nach dem Veröffentlichen fix – bitte einzeln prüfen. Es wird nichts automatisch geändert.",
  },
  sold_but_listed: {
    label: "Verkauft, aber noch inseriert",
    fields: ["Verkaufsstatus", "Inserat"],
    hint: "Das Fahrzeug ist im Portal als verkauft markiert, das Inserat läuft bei Mobile.de aber weiter. Bitte das Inserat beenden oder den Verkaufsstatus korrigieren. Es wird nichts automatisch beendet.",
  },
  title_drift: {
    label: "Titel stimmt nicht überein",
    fields: ["Titel"],
    hint: "Die Bezeichnung unterscheidet sich zwischen Portal und Mobile.de.",
  },
};


function infoFor(type: string) {
  return (
    ISSUE_INFO[type] || {
      label: type,
      fields: ["–"],
      hint: "Abweichung zwischen Portal und Mobile.de.",
    }
  );
}

/** Zieht "Portal X / Mobile.de Y" aus dem Detailtext */
function parseValues(detail: string | null): { portal?: string; mobile?: string } {
  if (!detail) return {};
  const m = detail.match(/Portal\s+(.+?)\s*\/\s*Mobile\.de\s+(.+?)\.?\s*$/);
  if (!m) return {};
  return { portal: m[1].trim(), mobile: m[2].trim() };
}

/** Zahlenwerte aus dem Detailtext (für Differenz-Anzeige) */
function parseNumbers(detail: string | null): { portal?: number; mobile?: number } {
  if (!detail) return {};
  const m = detail.match(/Portal\s+([\d.,]+)[^/]*\/\s*Mobile\.de\s+([\d.,]+)/);
  if (!m) return {};
  const toNum = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
  const portal = toNum(m[1]);
  const mobile = toNum(m[2]);
  return {
    portal: Number.isFinite(portal) ? portal : undefined,
    mobile: Number.isFinite(mobile) ? mobile : undefined,
  };
}

const DRIFT_TYPES = new Set(["price_drift", "mileage_drift"]);

function formatNumber(n: number) {
  return n.toLocaleString("de-DE");
}

function adLink(adId: string) {
  return `https://suchen.mobile.de/fahrzeuge/details.html?id=${adId}`;
}


type FilterKey = "all" | "orphan_ad" | "account_mismatch" | "sold_but_listed" | "drift";

export default function Reconciliation() {
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, VehicleLite>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("mobile_reconciliation_issues")
      .select("id, vehicle_id, mobile_ad_id, issue_type, severity, detail, scope, detected_at")
      .is("resolved_at", null)
      .order("detected_at", { ascending: false })
      .limit(1000);

    if (error) {
      toast.error("Die Abweichungen konnten nicht geladen werden.");
      setIsLoading(false);
      return;
    }

    const rows = (data as IssueRow[]) || [];
    setIssues(rows);

    const ids = [...new Set(rows.map((r) => r.vehicle_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const map: Record<string, VehicleLite> = {};
      for (let i = 0; i < ids.length; i += 200) {
        const { data: vs } = await supabase
          .from("vehicles")
          .select("id, title, is_sold")
          .in("id", ids.slice(i, i + 200));
        for (const v of (vs as VehicleLite[]) || []) map[v.id] = v;
      }
      setVehicles(map);
    } else {
      setVehicles({});
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const counts = useMemo(() => {
    const orphan = issues.filter((i) => i.issue_type === "orphan_ad").length;
    const mismatch = issues.filter((i) => i.issue_type === "account_mismatch").length;
    const sold = issues.filter((i) => i.issue_type === "sold_but_listed").length;
    return {
      all: issues.length,
      orphan_ad: orphan,
      account_mismatch: mismatch,
      sold_but_listed: sold,
      drift: issues.length - orphan - mismatch - sold,
    };
  }, [issues]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter((i) => {
      if (filter === "orphan_ad" && i.issue_type !== "orphan_ad") return false;
      if (filter === "account_mismatch" && i.issue_type !== "account_mismatch") return false;
      if (filter === "sold_but_listed" && i.issue_type !== "sold_but_listed") return false;
      if (
        filter === "drift" &&
        (i.issue_type === "orphan_ad" ||
          i.issue_type === "account_mismatch" ||
          i.issue_type === "sold_but_listed")
      )
        return false;
      if (!q) return true;
      const title = i.vehicle_id ? vehicles[i.vehicle_id]?.title ?? "" : "";
      return (
        title.toLowerCase().includes(q) ||
        (i.mobile_ad_id ?? "").toLowerCase().includes(q) ||
        (i.detail ?? "").toLowerCase().includes(q)
      );
    });
  }, [issues, filter, search, vehicles]);

  const markResolved = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase
      .from("mobile_reconciliation_issues")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", id);
    setBusyId(null);
    if (error) {
      toast.error("Konnte nicht als erledigt markiert werden.");
      return;
    }
    setIssues((prev) => prev.filter((i) => i.id !== id));
    toast.success("Als erledigt markiert.");
  };

  /** Abweichung in eine der beiden Richtungen auflösen */
  const resolveDrift = async (id: string, direction: "to_mobile" | "to_portal") => {
    setBusyId(id);
    const { data, error } = await supabase.functions.invoke("resolve-reconcile-issue", {
      body: { issueId: id, direction },
    });
    setBusyId(null);
    const errText = (data as { error?: string } | null)?.error;
    if (error || errText) {
      toast.error(errText || "Die Änderung konnte nicht ausgeführt werden.");
      return;
    }
    setIssues((prev) => prev.filter((i) => i.id !== id));
    toast.success(
      direction === "to_mobile"
        ? "Portalwert wurde zu Mobile.de übertragen."
        : "Mobile.de-Wert wurde ins Portal übernommen.",
    );
  };

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "Alle", count: counts.all },
    { key: "orphan_ad", label: "Inserate ohne Fahrzeug", count: counts.orphan_ad },
    { key: "account_mismatch", label: "Falsches Konto", count: counts.account_mismatch },
    { key: "sold_but_listed", label: "Verkauft, noch inseriert", count: counts.sold_but_listed },
    { key: "drift", label: "Abweichende Daten", count: counts.drift },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Abgleich mit Mobile.de</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Alle Stellen, an denen Portal und Mobile.de nicht zusammenpassen – mit Grund und betroffenen Angaben
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Aktualisieren
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" /> Offene Punkte
          </div>
          <div className="mt-1 text-2xl font-semibold">{counts.all}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Unlink className="h-4 w-4" /> Inserate ohne Fahrzeug
          </div>
          <div className="mt-1 text-2xl font-semibold">{counts.orphan_ad}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Unlink className="h-4 w-4" /> Falsches Konto
          </div>
          <div className="mt-1 text-2xl font-semibold">{counts.account_mismatch}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BadgeEuro className="h-4 w-4" /> Verkauft, noch inseriert
          </div>
          <div className="mt-1 text-2xl font-semibold">{counts.sold_but_listed}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Car className="h-4 w-4" /> Abweichende Angaben
          </div>
          <div className="mt-1 text-2xl font-semibold">{counts.drift}</div>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <Badge variant="secondary" className="ml-2">
                {f.count}
              </Badge>
            </Button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nach Fahrzeug oder Inserats-Nummer suchen …"
          className="sm:max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wird geladen …
        </div>
      ) : visible.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="font-medium">Nichts zu tun</p>
          <p className="text-sm text-muted-foreground">
            Portal und Mobile.de stimmen überein.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((issue) => {
            const info = infoFor(issue.issue_type);
            const values = parseValues(issue.detail);
            const nums = parseNumbers(issue.detail);
            const isDrift = DRIFT_TYPES.has(issue.issue_type) && !!issue.vehicle_id;
            const unit = issue.issue_type === "price_drift" ? "€" : "km";
            const diff =
              nums.portal !== undefined && nums.mobile !== undefined
                ? nums.mobile - nums.portal
                : undefined;
            const diffPct =
              diff !== undefined && nums.portal ? (diff / nums.portal) * 100 : undefined;
            const vehicle = issue.vehicle_id ? vehicles[issue.vehicle_id] : undefined;
            return (
              <Card key={issue.id} className="p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={issue.issue_type === "orphan_ad" || issue.issue_type === "sold_but_listed"
                          ? "destructive"
                          : "secondary"}>
                        {info.label}
                      </Badge>
                      {info.fields.map((f) => (
                        <Badge key={f} variant="outline">
                          Betrifft: {f}
                        </Badge>
                      ))}
                    </div>

                    <p className="text-sm font-medium">
                      {vehicle ? (
                        <Link
                          to={`/admin/fahrzeuge/${vehicle.id}`}
                          className="hover:underline"
                        >
                          {vehicle.title}
                        </Link>
                      ) : (
                        issue.detail?.match(/"([^"]+)"/)?.[1] ?? "Unbekanntes Fahrzeug"
                      )}
                    </p>

                    {values.portal || values.mobile ? (
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                        <span>
                          <span className="text-muted-foreground">Portal: </span>
                          {values.portal ?? "–"}
                        </span>
                        <span>
                          <span className="text-muted-foreground">Mobile.de: </span>
                          {values.mobile ?? "–"}
                        </span>
                        {diff !== undefined ? (
                          <span>
                            <span className="text-muted-foreground">Differenz: </span>
                            {diff > 0 ? "+" : "−"}
                            {formatNumber(Math.abs(Math.round(diff)))} {unit}
                            {diffPct !== undefined
                              ? ` (${diff > 0 ? "+" : "−"}${Math.abs(diffPct).toFixed(1).replace(".", ",")} %)`
                              : ""}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {isDrift ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resolveDrift(issue.id, "to_mobile")}
                          disabled={busyId === issue.id}
                        >
                          <ArrowUpFromLine className="mr-2 h-4 w-4" />
                          Portalwert übertragen
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resolveDrift(issue.id, "to_portal")}
                          disabled={busyId === issue.id}
                        >
                          <ArrowDownToLine className="mr-2 h-4 w-4" />
                          Mobile.de-Wert übernehmen
                        </Button>
                      </div>
                    ) : null}


                    <p className="text-sm text-muted-foreground">{info.hint}</p>

                    <p className="text-xs text-muted-foreground">
                      Erkannt am{" "}
                      {new Date(issue.detected_at).toLocaleString("de-DE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {issue.mobile_ad_id ? ` · Inserats-Nr. ${issue.mobile_ad_id}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {issue.mobile_ad_id ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={adLink(issue.mobile_ad_id)} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Inserat ansehen
                        </a>
                      </Button>
                    ) : null}
                    {vehicle ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/admin/fahrzeuge/${vehicle.id}`}>
                          <Car className="mr-2 h-4 w-4" />
                          Fahrzeug öffnen
                        </Link>
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markResolved(issue.id)}
                      disabled={busyId === issue.id}
                    >
                      {busyId === issue.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Erledigt
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
