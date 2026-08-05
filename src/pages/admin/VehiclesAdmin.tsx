import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Loader2,
  Search,
  Star,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveVehicleImages } from "@/lib/vehicleImages";
import { logVehicleAudit } from "@/lib/vehicleAudit";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PAGE_SIZE = 25;

export const VEHICLE_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "oldtimer", label: "Oldtimer" },
  { value: "youngtimer", label: "Youngtimer" },
  { value: "used", label: "Gebraucht- & Jahreswagen" },
  { value: "accident", label: "Unfallwagen" },
  { value: "commercial", label: "Nutzfahrzeuge" },
];

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return VEHICLE_CATEGORY_OPTIONS.find((c) => c.value === value)?.label ?? value;
}

interface AdminVehicleRow {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  vehicle_category: string | null;
  year: string | null;
  mileage: number | null;
  price: number | null;
  currency: string | null;
  source: string | null;
  is_sold: boolean;
  reserved_at: string | null;
  is_featured: boolean;
  synced_at: string;
  created_at: string;
  image_urls: string[] | null;
  custom_image_urls: string[] | null;
  hidden_image_urls: string[] | null;
  image_order: string[] | null;
  publish_status: string | null;
  mobile_ad_id: string | null;
}

const SELECT_COLUMNS =
  "id,title,brand,model,vehicle_category,year,mileage,price,currency,source,is_sold,reserved_at,is_featured,synced_at,created_at,image_urls,custom_image_urls,hidden_image_urls,image_order,publish_status,mobile_ad_id";

type SortKey = "price" | "year" | "mileage" | "created_at" | "synced_at";

interface Filters {
  q: string;
  category: string;
  status: string;
  source: string;
  onlyIssues: boolean;
  onlyNoImages: boolean;
}

function formatPrice(price: number | null, currency: string | null) {
  if (price == null) return "—";
  const symbol = !currency || currency.toUpperCase() === "EUR" ? "€" : currency;
  return `${price.toLocaleString("de-DE")} ${symbol}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function StatusBadge({ v }: { v: AdminVehicleRow }) {
  if (v.is_sold) return <Badge variant="destructive">Verkauft</Badge>;
  if (v.reserved_at)
    return (
      <Badge className="bg-amber-500 text-white hover:bg-amber-500">Reserviert</Badge>
    );
  return <Badge variant="secondary">Verfügbar</Badge>;
}

const PUBLISH_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "Entwurf", className: "bg-muted text-muted-foreground hover:bg-muted" },
  publishing: { label: "Wird übertragen…", className: "bg-sky-500 text-white hover:bg-sky-500" },
  published: { label: "Live bei Mobile.de", className: "bg-emerald-600 text-white hover:bg-emerald-600" },
  out_of_sync: { label: "Änderung nicht übertragen", className: "bg-amber-500 text-white hover:bg-amber-500" },
  publish_error: { label: "Fehler", className: "bg-destructive text-destructive-foreground hover:bg-destructive" },
  unpublished: { label: "Zurückgezogen", className: "bg-muted text-muted-foreground hover:bg-muted" },
};

function PublishBadge({ v }: { v: AdminVehicleRow }) {
  const cfg = PUBLISH_LABELS[v.publish_status ?? "draft"] ?? PUBLISH_LABELS.draft;
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

export default function VehiclesAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<Filters>({
    q: "",
    category: "all",
    status: searchParams.get("status") ?? "all",
    source: "all",
    onlyIssues: searchParams.get("issues") === "1",
    onlyNoImages: searchParams.get("noImages") === "1",
  });
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({
    key: "synced_at",
    asc: false,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<null | {
    label: string;
    description: string;
    run: () => Promise<void>;
  }>(null);
  const [isRunning, setIsRunning] = useState(false);

  const updateFilters = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
    setSelected([]);
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-vehicles", filters, sort, page],
    queryFn: async () => {
      let issueIds: string[] | null = null;
      if (filters.onlyIssues) {
        const { data: issues } = await supabase
          .from("vehicle_quality_issues")
          .select("vehicle_id")
          .is("resolved_at", null)
          .limit(2000);
        issueIds = [...new Set((issues ?? []).map((i) => i.vehicle_id))];
        if (issueIds.length === 0) return { rows: [] as AdminVehicleRow[], count: 0 };
      }

      let query = supabase
        .from("vehicles")
        .select(SELECT_COLUMNS, { count: "exact" });

      if (filters.q.trim()) {
        const term = `%${filters.q.trim()}%`;
        query = query.or(
          `title.ilike.${term},brand.ilike.${term},model.ilike.${term}`,
        );
      }
      if (filters.category !== "all") query = query.eq("vehicle_category", filters.category);
      if (filters.source !== "all") query = query.eq("source", filters.source);
      if (filters.status === "sold") query = query.eq("is_sold", true);
      if (filters.status === "reserved")
        query = query.eq("is_sold", false).not("reserved_at", "is", null);
      if (filters.status === "available")
        query = query.eq("is_sold", false).is("reserved_at", null);
      if (filters.onlyNoImages) query = query.or("image_urls.is.null,image_urls.eq.{}");
      if (issueIds) query = query.in("id", issueIds);

      query = query
        .order(sort.key, { ascending: sort.asc, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { rows: (rows as unknown as AdminVehicleRow[]) ?? [], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  const toggleAll = () => {
    if (allOnPageSelected) setSelected((s) => s.filter((id) => !rows.some((r) => r.id === id)));
    else setSelected((s) => [...new Set([...s, ...rows.map((r) => r.id)])]);
  };

  const toggleRow = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: false }));
    setPage(0);
  };

  const runBulk = async (
    label: string,
    patch: Record<string, unknown>,
    action: string,
  ) => {
    setIsRunning(true);
    try {
      const ids = [...selected];
      const { error } = await supabase
        .from("vehicles")
        .update(patch as never)
        .in("id", ids);
      if (error) throw error;
      await logVehicleAudit(
        ids,
        Object.entries(patch).map(([field, value]) => ({
          action,
          field,
          newValue: value,
        })),
      );
      toast.success(`${label}: ${ids.length} Fahrzeug(e) aktualisiert`);
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["admin-vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    } catch (e) {
      toast.error(`Aktion fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setIsRunning(false);
      setPendingAction(null);
    }
  };

  const ask = (label: string, patch: Record<string, unknown>, action: string) =>
    setPendingAction({
      label,
      description: `Diese Aktion betrifft ${selected.length} Fahrzeug(e).`,
      run: () => runBulk(label, patch, action),
    });

  const bulkCategory = (value: string) =>
    setPendingAction({
      label: `Kategorie „${categoryLabel(value)}" setzen`,
      description: `Diese Aktion betrifft ${selected.length} Fahrzeug(e).`,
      run: () =>
        runBulk(`Kategorie „${categoryLabel(value)}"`, { vehicle_category: value }, "bulk_category"),
    });

  const sortableHead = (key: SortKey, label: string) => (
    <TableHead>
      <button
        onClick={() => toggleSort(key)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${sort.key === key ? "text-primary" : "text-muted-foreground/50"}`}
        />
      </button>
    </TableHead>
  );

  const thumbFor = (v: AdminVehicleRow) => resolveVehicleImages(v)[0] ?? null;

  const activeFilterHint = useMemo(() => {
    const parts: string[] = [];
    if (filters.onlyIssues) parts.push("Datenqualitätsprobleme");
    if (filters.onlyNoImages) parts.push("ohne Bilder");
    if (filters.status !== "all") parts.push("Status gefiltert");
    return parts.join(" · ");
  }, [filters]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Fahrzeuge</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} Fahrzeug(e){activeFilterHint ? ` · ${activeFilterHint}` : ""}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/fahrzeug-anlegen">Fahrzeug anlegen</Link>
        </Button>
      </div>

      {/* Filter */}
      <Card className="p-4 mt-6 space-y-4">
        <form
          className="flex flex-col sm:flex-row gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            updateFilters({ q: searchInput });
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Titel, Marke oder Modell suchen"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Suchen
          </Button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select value={filters.category} onValueChange={(v) => updateFilters({ category: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Kategorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kategorien</SelectItem>
              {VEHICLE_CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.status} onValueChange={(v) => updateFilters({ status: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="available">Verfügbar</SelectItem>
              <SelectItem value="reserved">Reserviert</SelectItem>
              <SelectItem value="sold">Verkauft</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.source} onValueChange={(v) => updateFilters({ source: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Quelle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Quellen</SelectItem>
              <SelectItem value="mobile_de">Mobile.de</SelectItem>
              <SelectItem value="manual">Manuell</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="only-issues"
              checked={filters.onlyIssues}
              onCheckedChange={(c) => {
                updateFilters({ onlyIssues: c === true });
                setSearchParams(c === true ? { issues: "1" } : {});
              }}
            />
            <Label htmlFor="only-issues" className="text-sm font-normal cursor-pointer">
              Nur Fahrzeuge mit Datenqualitätsproblemen
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="only-no-images"
              checked={filters.onlyNoImages}
              onCheckedChange={(c) => {
                updateFilters({ onlyNoImages: c === true });
                setSearchParams(c === true ? { noImages: "1" } : {});
              }}
            />
            <Label htmlFor="only-no-images" className="text-sm font-normal cursor-pointer">
              Nur Fahrzeuge ohne Bilder
            </Label>
          </div>
        </div>
      </Card>

      {/* Bulk-Aktionsleiste */}
      {selected.length > 0 && (
        <Card className="p-4 mt-4 border-primary/40">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{selected.length} ausgewählt</span>
            <Select onValueChange={bulkCategory}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Kategorie setzen" />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                ask("Als reserviert markiert", { reserved_at: new Date().toISOString() }, "bulk_reserve")
              }
            >
              Als reserviert markieren
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                ask("Reservierung aufgehoben", { reserved_at: null, reserved_note: null }, "bulk_unreserve")
              }
            >
              Reservierung aufheben
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                ask(
                  "Als verkauft markiert",
                  { is_sold: true, sold_at: new Date().toISOString(), reserved_at: null, reserved_note: null },
                  "bulk_sold",
                )
              }
            >
              Als verkauft markieren
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => ask("Wieder freigegeben", { is_sold: false, sold_at: null }, "bulk_unsold")}
            >
              Wieder freigeben
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => ask("Auf Startseite hervorgehoben", { is_featured: true }, "bulk_feature")}
            >
              Auf Startseite hervorheben
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => ask("Hervorhebung entfernt", { is_featured: false }, "bulk_unfeature")}
            >
              Hervorhebung entfernen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Auswahl aufheben
            </Button>
          </div>
        </Card>
      )}

      {/* Tabelle (Desktop) */}
      <Card className="mt-4 hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} aria-label="Alle auswählen" />
              </TableHead>
              <TableHead className="w-16">Bild</TableHead>
              <TableHead>Titel</TableHead>
              <TableHead>Marke</TableHead>
              <TableHead>Kategorie</TableHead>
              {sortableHead("year", "Erstzulassung")}
              {sortableHead("mileage", "Kilometer")}
              {sortableHead("price", "Preis")}
              <TableHead>Quelle</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Mobile.de</TableHead>
              <TableHead>Bilder</TableHead>
              {sortableHead("synced_at", "Letzter Sync")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={13} className="text-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="text-center py-10 text-muted-foreground">
                  Keine Fahrzeuge gefunden
                </TableCell>
              </TableRow>
            ) : (
              rows.map((v) => {
                const thumb = thumbFor(v);
                return (
                  <TableRow key={v.id} className={selected.includes(v.id) ? "bg-secondary/50" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(v.id)}
                        onCheckedChange={() => toggleRow(v.id)}
                        aria-label="Zeile auswählen"
                      />
                    </TableCell>
                    <TableCell>
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={v.title}
                          loading="lazy"
                          className="h-10 w-14 object-cover rounded"
                        />
                      ) : (
                        <div className="h-10 w-14 rounded bg-secondary flex items-center justify-center">
                          <ImageOff className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <Link
                        to={`/admin/fahrzeuge/${v.id}`}
                        className="font-medium hover:text-primary line-clamp-2"
                      >
                        {v.title}
                      </Link>
                      {v.is_featured && (
                        <Star className="h-3 w-3 inline ml-1 text-amber-500 fill-amber-500" />
                      )}
                    </TableCell>
                    <TableCell>{v.brand ?? "—"}</TableCell>
                    <TableCell>{categoryLabel(v.vehicle_category)}</TableCell>
                    <TableCell>{v.year ?? "—"}</TableCell>
                    <TableCell>
                      {v.mileage != null ? `${v.mileage.toLocaleString("de-DE")} km` : "—"}
                    </TableCell>
                    <TableCell>{formatPrice(v.price, v.currency)}</TableCell>
                    <TableCell className="text-xs">
                      {v.source === "portal" ? "Portal" : v.source === "manual" ? "Manuell" : v.source === "adopted" ? "Übernommen" : "Mobile.de"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge v={v} />
                    </TableCell>
                    <TableCell>
                      <PublishBadge v={v} />
                    </TableCell>
                    <TableCell>{resolveVehicleImages(v).length}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(v.synced_at)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Karten (Mobile) */}
      <div className="mt-4 space-y-3 md:hidden">
        {isLoading ? (
          <div className="py-10 text-center">
            <Loader2 className="h-5 w-5 animate-spin inline" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground text-sm">Keine Fahrzeuge gefunden</p>
        ) : (
          rows.map((v) => {
            const thumb = thumbFor(v);
            return (
              <Card key={v.id} className="p-3">
                <div className="flex gap-3">
                  <Checkbox
                    checked={selected.includes(v.id)}
                    onCheckedChange={() => toggleRow(v.id)}
                    aria-label="Auswählen"
                    className="mt-1"
                  />
                  {thumb ? (
                    <img src={thumb} alt={v.title} loading="lazy" className="h-16 w-20 object-cover rounded" />
                  ) : (
                    <div className="h-16 w-20 rounded bg-secondary flex items-center justify-center">
                      <ImageOff className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link to={`/admin/fahrzeuge/${v.id}`} className="font-medium text-sm line-clamp-2">
                      {v.title}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {v.brand ?? "—"} · {categoryLabel(v.vehicle_category)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.year ?? "—"} ·{" "}
                      {v.mileage != null ? `${v.mileage.toLocaleString("de-DE")} km` : "—"} ·{" "}
                      {formatPrice(v.price, v.currency)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <StatusBadge v={v} />
                      <span className="text-xs text-muted-foreground">
                        {resolveVehicleImages(v).length} Bilder
                      </span>
                      {v.is_featured && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-muted-foreground">
          Seite {page + 1} von {pageCount}
          {isFetching && !isLoading ? " · lädt…" : ""}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Zurück
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Weiter <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={!!pendingAction} onOpenChange={(o) => !o && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction?.label}</AlertDialogTitle>
            <AlertDialogDescription>{pendingAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRunning}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRunning}
              onClick={(e) => {
                e.preventDefault();
                pendingAction?.run();
              }}
            >
              {isRunning ? "Wird ausgeführt…" : "Ausführen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
