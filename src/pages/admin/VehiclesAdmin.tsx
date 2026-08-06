import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageOff,
  MoreHorizontal,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveVehicleImages } from "@/lib/vehicleImages";
import { logVehicleAudit } from "@/lib/vehicleAudit";
import { getFuelLabel, getGearboxLabel } from "@/lib/mobileDeLabels";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PlatformBadges from "@/components/admin/PlatformBadges";
import VehicleStatusDialog from "@/components/admin/VehicleStatusDialog";
import BulkStatusDialog from "@/components/admin/BulkStatusDialog";
import {
  accountShortLabel,
  expectedAccountKey,
  loadListingOverview,
  vehicleSaleStatus,
  type PlatformAccountRow,
} from "@/lib/listings";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** „Wo inseriert?“ — verständliche Bezeichnungen statt Datenbankwerte */
const PUBLISH_OPTIONS: { value: string; label: string; className: string }[] = [
  { value: "draft", label: "Noch nicht inseriert", className: "bg-muted text-muted-foreground hover:bg-muted" },
  { value: "publishing", label: "Wird übertragen…", className: "bg-sky-500 text-white hover:bg-sky-500" },
  { value: "published", label: "Inseriert", className: "bg-emerald-600 text-white hover:bg-emerald-600" },
  { value: "out_of_sync", label: "Änderung nicht übertragen", className: "bg-amber-500 text-white hover:bg-amber-500" },
  { value: "publish_error", label: "Fehler beim Inserieren", className: "bg-destructive text-destructive-foreground hover:bg-destructive" },
  { value: "unpublished", label: "Zurückgezogen", className: "bg-muted text-muted-foreground hover:bg-muted" },
];

const publishLabel = (v: string | null | undefined) =>
  PUBLISH_OPTIONS.find((p) => p.value === (v ?? "draft"))?.label ?? "Noch nicht inseriert";

/** „Zustand“ fasst Zustand und Nutzungsart zusammen */
const CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: "used", label: "Gebraucht" },
  { value: "new", label: "Neu" },
  { value: "oldtimer", label: "Oldtimer" },
  { value: "demonstration", label: "Vorführwagen" },
];

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
  power: number | null;
  fuel: string | null;
  fuel_label: string | null;
  gearbox: string | null;
  gearbox_label: string | null;
  is_sold: boolean;
  reserved_at: string | null;
  is_featured: boolean;
  synced_at: string;
  created_at: string;
  updated_at: string;
  image_urls: string[] | null;
  custom_image_urls: string[] | null;
  hidden_image_urls: string[] | null;
  image_order: string[] | null;
  publish_status: string | null;
  mobile_de_id: string | null;
  mobile_ad_id: string | null;
}

const SELECT_COLUMNS =
  "id,title,brand,model,vehicle_category,year,mileage,price,currency,power,fuel,fuel_label,gearbox,gearbox_label,is_sold,reserved_at,is_featured,synced_at,created_at,updated_at,image_urls,custom_image_urls,hidden_image_urls,image_order,publish_status,mobile_de_id,mobile_ad_id";

type SortKey = "price" | "year" | "mileage" | "standtage" | "created_at";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "created_at:desc", label: "Neueste zuerst" },
  { value: "created_at:asc", label: "Älteste zuerst" },
  { value: "standtage:desc", label: "Standtage: längste zuerst" },
  { value: "standtage:asc", label: "Standtage: kürzeste zuerst" },
  { value: "price:desc", label: "Preis: hoch zu niedrig" },
  { value: "price:asc", label: "Preis: niedrig zu hoch" },
  { value: "year:desc", label: "Erstzulassung: neueste zuerst" },
  { value: "year:asc", label: "Erstzulassung: älteste zuerst" },
  { value: "mileage:asc", label: "Kilometerstand: wenigste zuerst" },
  { value: "mileage:desc", label: "Kilometerstand: meiste zuerst" },
];

type QuickFilter =
  | "all"
  | "not_listed"
  | "reserved"
  | "sold"
  | "attention"
  | "account_mismatch";

const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "not_listed", label: "Nicht inseriert" },
  { value: "reserved", label: "Reserviert" },
  { value: "sold", label: "Verkauft" },
  { value: "attention", label: "Braucht Aufmerksamkeit" },
  { value: "account_mismatch", label: "Konto passt nicht zur Fahrzeugart" },
];

interface Filters {
  q: string;
  quick: QuickFilter;
  /** Mobile.de-Konto: "all" oder account_key */
  account: string;
  category: string;
  publish: string;
  condition: string;
  damage: string;
  vatable: string;
  yearFrom: string;
  yearTo: string;
  mileageMax: string;
  noImages: boolean;
}

const EMPTY_FILTERS: Filters = {
  q: "",
  quick: "all",
  account: "all",
  category: "all",
  publish: "all",
  condition: "all",
  damage: "all",
  vatable: "all",
  yearFrom: "",
  yearTo: "",
  mileageMax: "",
  noImages: false,
};

/* ---------- optionale Spalten ---------- */

type OptionalColumn = "standtage" | "updated" | "internalId" | "vin" | "photos";

const OPTIONAL_COLUMNS: { key: OptionalColumn; label: string }[] = [
  { key: "standtage", label: "Standtage" },
  { key: "updated", label: "Letzte Änderung" },
  { key: "internalId", label: "Interne Nummer" },
  { key: "vin", label: "VIN" },
  { key: "photos", label: "Anzahl Fotos" },
];

const COLUMN_STORAGE_KEY = "admin.vehicles.columns.v1";

function useColumnPrefs() {
  const [cols, setCols] = useState<OptionalColumn[]>(() => {
    try {
      const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as OptionalColumn[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(cols));
    } catch {
      /* Speicher nicht verfügbar — Auswahl gilt dann nur für diese Sitzung */
    }
  }, [cols]);
  const toggle = (key: OptionalColumn) =>
    setCols((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]));
  return { cols, toggle };
}

/* ---------- Formatierung ---------- */

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

function standtage(v: AdminVehicleRow) {
  const ms = Date.now() - new Date(v.created_at).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Eckdaten als eine durchgehende Zeile, getrennt durch Mittelpunkte */
function keyFacts(v: AdminVehicleRow): string {
  const parts = [
    v.year ?? null,
    v.mileage != null ? `${v.mileage.toLocaleString("de-DE")} km` : null,
    v.fuel_label ?? (v.fuel ? getFuelLabel(v.fuel) : null),
    v.gearbox_label ?? (v.gearbox ? getGearboxLabel(v.gearbox) : null),
    v.power != null ? `${Math.round(v.power * 1.35962)} PS` : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : "Keine Eckdaten hinterlegt";
}

function StatusBadge({ v }: { v: AdminVehicleRow }) {
  if (v.is_sold) return <Badge variant="destructive">Verkauft</Badge>;
  if (v.reserved_at)
    return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Reserviert</Badge>;
  return <Badge variant="secondary">Verfügbar</Badge>;
}

/* ---------- Seite ---------- */

export default function VehiclesAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { cols, toggle } = useColumnPrefs();

  const [filters, setFilters] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    quick:
      searchParams.get("issues") === "1"
        ? "attention"
        : ((searchParams.get("status") as QuickFilter) ?? "all"),
    publish: searchParams.get("publish") ?? "all",
    noImages: searchParams.get("noImages") === "1",
  }));
  const [searchInput, setSearchInput] = useState("");
  const [groupByAccount, setGroupByAccount] = useState(
    () => localStorage.getItem("admin.vehicles.groupByAccount") === "1",
  );
  const [isExporting, setIsExporting] = useState(false);
  const [page, setPage] = useState(0);
  const [sortValue, setSortValue] = useState("created_at:desc");
  const [selected, setSelected] = useState<string[]>([]);
  const [statusFor, setStatusFor] = useState<AdminVehicleRow | null>(null);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | {
    label: string;
    description: string;
    run: () => Promise<void>;
  }>(null);
  const [isRunning, setIsRunning] = useState(false);

  const [sortKey, sortDir] = sortValue.split(":") as [SortKey, "asc" | "desc"];

  useEffect(() => {
    try {
      localStorage.setItem("admin.vehicles.groupByAccount", groupByAccount ? "1" : "0");
    } catch {
      /* Speicher nicht verfügbar */
    }
  }, [groupByAccount]);

  /** Stammdaten der Mobile.de-Konten (Kurzname, Farbe, Kundennummer) */
  const { data: accounts = [] } = useQuery({
    queryKey: ["platform-accounts"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_accounts")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as PlatformAccountRow[];
    },
  });

  const mobileAccounts = useMemo(
    () => accounts.filter((a) => a.platform === "mobile_de"),
    [accounts],
  );

  /**
   * Welches Konto trägt welches Fahrzeug — und passt es zur Fahrzeugart?
   * Wird für Filter, Gruppierung und den Hinweis „falsches Konto“ gebraucht.
   */
  const { data: accountIndex } = useQuery({
    queryKey: ["admin-vehicles-account-index", accounts.length],
    enabled: accounts.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("vehicle_id, account_key, status, vehicles!inner(vehicle_category)")
        .eq("platform", "mobile_de")
        .limit(5000);
      if (error) throw error;
      const byVehicle = new Map<string, string>();
      const mismatch = new Set<string>();
      for (const row of (data ?? []) as unknown as {
        vehicle_id: string;
        account_key: string | null;
        status: string;
        vehicles: { vehicle_category: string | null } | null;
      }[]) {
        if (!row.account_key) continue;
        if (row.status === "not_listed") continue;
        byVehicle.set(row.vehicle_id, row.account_key);
        const expected = expectedAccountKey(accounts, row.vehicles?.vehicle_category ?? null);
        if (expected && expected !== row.account_key) mismatch.add(row.vehicle_id);
      }
      return { byVehicle, mismatch };
    },
  });

  const needsAccountIndex =
    filters.account !== "all" || filters.quick === "account_mismatch";

  const updateFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
    setSelected([]);
  }, []);

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchInput("");
    setSearchParams({});
    setPage(0);
    setSelected([]);
  };

  const fetchVehicles = useCallback(
    async (offset: number, size: number) => {
      const term = filters.q.trim();

      // Suche schließt VIN und interne Nummer mit ein
      let vinIds: string[] = [];
      if (term) {
        const { data: priv } = await supabase
          .from("vehicle_private_data")
          .select("vehicle_id")
          .ilike("vin", `%${term}%`)
          .limit(200);
        vinIds = (priv ?? []).map((p) => p.vehicle_id);
      }

      let attentionIds: string[] | null = null;
      if (filters.quick === "attention") {
        const { data: issues } = await supabase
          .from("vehicle_quality_issues")
          .select("vehicle_id")
          .is("resolved_at", null)
          .limit(2000);
        attentionIds = [...new Set((issues ?? []).map((i) => i.vehicle_id))];
      }

      // Kontofilter und „falsches Konto“ laufen über die Inserate
      let accountIds: string[] | null = null;
      if (needsAccountIndex) {
        const entries = [...(accountIndex?.byVehicle.entries() ?? [])];
        accountIds = entries
          .filter(
            ([id, key]) =>
              (filters.account === "all" || key === filters.account) &&
              (filters.quick !== "account_mismatch" || accountIndex?.mismatch.has(id)),
          )
          .map(([id]) => id)
          .slice(0, 1000);
      }

      if (accountIds !== null && accountIds.length === 0) {
        return { rows: [] as AdminVehicleRow[], count: 0 };
      }

      let query = supabase.from("vehicles").select(SELECT_COLUMNS, { count: "exact" });
      if (accountIds !== null) query = query.in("id", accountIds);

      if (term) {
        const like = `%${term}%`;
        const ors = [
          `title.ilike.${like}`,
          `brand.ilike.${like}`,
          `model.ilike.${like}`,
          `mobile_de_id.ilike.${like}`,
        ];
        if (vinIds.length) ors.push(`id.in.(${vinIds.join(",")})`);
        query = query.or(ors.join(","));
      }

      switch (filters.quick) {
        case "not_listed":
          query = query.in("publish_status", ["draft", "unpublished"] as never);
          break;
        case "reserved":
          query = query.eq("is_sold", false).not("reserved_at", "is", null);
          break;
        case "sold":
          query = query.eq("is_sold", true);
          break;
        case "attention":
          if (attentionIds && attentionIds.length > 0) {
            query = query.or(
              `publish_status.in.(publish_error,out_of_sync),id.in.(${attentionIds.join(",")})`,
            );
          } else {
            query = query.in("publish_status", ["publish_error", "out_of_sync"] as never);
          }
          break;
        default:
          break;
      }

      if (filters.category !== "all") query = query.eq("vehicle_category", filters.category);
      if (filters.publish !== "all")
        query = query.eq("publish_status", filters.publish as "draft");
      if (filters.condition === "used") query = query.eq("condition_key", "Used");
      if (filters.condition === "new") query = query.eq("condition_key", "New");
      if (filters.condition === "oldtimer") query = query.eq("usage_type_key", "Oldtimer");
      if (filters.condition === "demonstration")
        query = query.eq("usage_type_key", "Demonstration");
      if (filters.damage !== "all")
        query = query.eq("damage_unrepaired", filters.damage === "yes");
      if (filters.vatable !== "all") query = query.eq("vatable", filters.vatable === "yes");
      if (filters.yearFrom.trim()) query = query.gte("year", filters.yearFrom.trim());
      if (filters.yearTo.trim()) query = query.lte("year", `${filters.yearTo.trim()}-12-31`);
      if (filters.mileageMax.trim())
        query = query.lte("mileage", Number(filters.mileageMax.replace(/\D/g, "")) || 0);
      if (filters.noImages) query = query.or("image_urls.is.null,image_urls.eq.{}");

      // Standtage = Zeit seit Aufnahme, also invertierte created_at-Sortierung
      const dbKey = sortKey === "standtage" ? "created_at" : sortKey;
      const ascending = sortKey === "standtage" ? sortDir === "desc" : sortDir === "asc";

      query = query
        .order(dbKey, { ascending, nullsFirst: false })
        .range(offset, offset + size - 1);

      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { rows: (rows as unknown as AdminVehicleRow[]) ?? [], count: count ?? 0 };
    },
    [filters, sortKey, sortDir, needsAccountIndex, accountIndex],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-vehicles", filters, sortValue, page, needsAccountIndex && !!accountIndex],
    enabled: !needsAccountIndex || !!accountIndex,
    queryFn: () => fetchVehicles(page * PAGE_SIZE, PAGE_SIZE),
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);

  // Plattform-Status pro Seite in einer Abfrage (View vehicle_listing_overview)
  const { data: listingMap } = useQuery({
    queryKey: ["admin-vehicles-listings", pageIds],
    enabled: pageIds.length > 0,
    queryFn: () => loadListingOverview(pageIds),
  });

  // VIN nur laden, wenn die Spalte eingeblendet ist
  const { data: vinMap } = useQuery({
    queryKey: ["admin-vehicles-vin", pageIds],
    enabled: cols.includes("vin") && pageIds.length > 0,
    queryFn: async () => {
      const { data: priv } = await supabase
        .from("vehicle_private_data")
        .select("vehicle_id, vin")
        .in("vehicle_id", pageIds);
      return new Map((priv ?? []).map((p) => [p.vehicle_id, p.vin ?? null]));
    },
  });

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggleAll = () => {
    if (allOnPageSelected) setSelected((s) => s.filter((id) => !pageIds.includes(id)));
    else setSelected((s) => [...new Set([...s, ...pageIds])]);
  };
  const toggleRow = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-vehicles"] });
    queryClient.invalidateQueries({ queryKey: ["vehicles"] });
  };

  const runBulk = async (label: string, patch: Record<string, unknown>, action: string) => {
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
        Object.entries(patch).map(([field, value]) => ({ action, field, newValue: value })),
      );
      toast.success(`${label}: ${ids.length} Fahrzeug(e) aktualisiert`);
      setSelected([]);
      refresh();
    } catch (e) {
      toast.error(`Aktion fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setIsRunning(false);
      setPendingAction(null);
    }
  };

  const bulkCategory = (value: string) =>
    setPendingAction({
      label: `Fahrzeugart „${categoryLabel(value)}“ setzen`,
      description: `Diese Aktion betrifft ${selected.length} Fahrzeug(e). Die Fahrzeugart steuert, in welcher Rubrik das Fahrzeug im Portal erscheint — an bestehenden Inseraten ändert sich nichts.`,
      run: () =>
        runBulk(
          `Fahrzeugart „${categoryLabel(value)}“`,
          { vehicle_category: value },
          "bulk_category",
        ),
    });

  const toggleFeatured = async (v: AdminVehicleRow) => {
    const { error } = await supabase
      .from("vehicles")
      .update({ is_featured: !v.is_featured } as never)
      .eq("id", v.id);
    if (error) return toast.error(error.message);
    await logVehicleAudit(v.id, [
      { action: "feature_toggle", field: "is_featured", newValue: !v.is_featured },
    ]);
    toast.success(!v.is_featured ? "Auf Startseite hervorgehoben" : "Hervorhebung entfernt");
    refresh();
  };

  /* aktive Filter als Chips */
  const chips = useMemo(() => {
    const list: { key: string; label: string; clear: () => void }[] = [];
    if (filters.q)
      list.push({
        key: "q",
        label: `Suche: „${filters.q}“`,
        clear: () => {
          setSearchInput("");
          updateFilters({ q: "" });
        },
      });
    if (filters.quick !== "all")
      list.push({
        key: "quick",
        label: QUICK_FILTERS.find((q) => q.value === filters.quick)!.label,
        clear: () => updateFilters({ quick: "all" }),
      });
    if (filters.category !== "all")
      list.push({
        key: "category",
        label: `Fahrzeugart: ${categoryLabel(filters.category)}`,
        clear: () => updateFilters({ category: "all" }),
      });
    if (filters.publish !== "all")
      list.push({
        key: "publish",
        label: `Wo inseriert?: ${publishLabel(filters.publish)}`,
        clear: () => updateFilters({ publish: "all" }),
      });
    if (filters.condition !== "all")
      list.push({
        key: "condition",
        label: `Zustand: ${CONDITION_OPTIONS.find((c) => c.value === filters.condition)?.label}`,
        clear: () => updateFilters({ condition: "all" }),
      });
    if (filters.damage !== "all")
      list.push({
        key: "damage",
        label: `Unfallschaden: ${filters.damage === "yes" ? "ja" : "nein"}`,
        clear: () => updateFilters({ damage: "all" }),
      });
    if (filters.vatable !== "all")
      list.push({
        key: "vatable",
        label: `Mehrwertsteuer ausweisbar: ${filters.vatable === "yes" ? "ja" : "nein"}`,
        clear: () => updateFilters({ vatable: "all" }),
      });
    if (filters.yearFrom)
      list.push({
        key: "yearFrom",
        label: `Erstzulassung ab ${filters.yearFrom}`,
        clear: () => updateFilters({ yearFrom: "" }),
      });
    if (filters.yearTo)
      list.push({
        key: "yearTo",
        label: `Erstzulassung bis ${filters.yearTo}`,
        clear: () => updateFilters({ yearTo: "" }),
      });
    if (filters.mileageMax)
      list.push({
        key: "mileageMax",
        label: `Kilometerstand bis ${filters.mileageMax}`,
        clear: () => updateFilters({ mileageMax: "" }),
      });
    if (filters.noImages)
      list.push({
        key: "noImages",
        label: "Ohne Fotos",
        clear: () => updateFilters({ noImages: false }),
      });
    return list;
  }, [filters, updateFilters]);

  const thumbFor = (v: AdminVehicleRow) => resolveVehicleImages(v)[0] ?? null;
  const optionalCount = cols.length;

  const rowMenu = (v: AdminVehicleRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Aktionen">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-popover">
        <DropdownMenuItem asChild>
          <Link to={`/admin/fahrzeuge/${v.id}`}>Fahrzeug öffnen</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setStatusFor(v)}>Status ändern</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => toggleFeatured(v)}>
          {v.is_featured ? "Hervorhebung entfernen" : "Auf Startseite hervorheben"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const optionalCell = (v: AdminVehicleRow, key: OptionalColumn) => {
    switch (key) {
      case "standtage":
        return `${standtage(v)} Tage`;
      case "updated":
        return formatDate(v.updated_at);
      case "internalId":
        return v.mobile_de_id ?? "—";
      case "vin":
        return vinMap?.get(v.id) ?? "—";
      case "photos":
        return resolveVehicleImages(v).length;
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Fahrzeuge</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} Fahrzeug(e){chips.length > 0 ? " mit den gesetzten Filtern" : " insgesamt"}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/fahrzeug-anlegen">Fahrzeug anlegen</Link>
        </Button>
      </div>

      {/* Schnellfilter */}
      <div className="mt-6 flex flex-wrap gap-2">
        {QUICK_FILTERS.map((qf) => (
          <Button
            key={qf.value}
            size="sm"
            variant={filters.quick === qf.value ? "default" : "outline"}
            className="rounded-full"
            onClick={() => updateFilters({ quick: qf.value })}
          >
            {qf.label}
          </Button>
        ))}
      </div>

      {/* Suche + Filter + Sortierung + Spalten */}
      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            updateFilters({ q: searchInput });
          }}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Suchen nach Titel, Marke, Modell, interner Nummer oder VIN"
            className="pl-9 h-11 text-base"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-11">
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Filter
                {chips.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {chips.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] bg-popover space-y-3">
              <div>
                <Label className="text-xs">Fahrzeugart</Label>
                <Select
                  value={filters.category}
                  onValueChange={(v) => updateFilters({ category: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="all">Alle Fahrzeugarten</SelectItem>
                    {VEHICLE_CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Wo inseriert?</Label>
                <Select value={filters.publish} onValueChange={(v) => updateFilters({ publish: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="all">Egal</SelectItem>
                    {PUBLISH_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Zustand</Label>
                <Select
                  value={filters.condition}
                  onValueChange={(v) => updateFilters({ condition: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="all">Alle Zustände</SelectItem>
                    {CONDITION_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Unfallschaden</Label>
                  <Select value={filters.damage} onValueChange={(v) => updateFilters({ damage: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">Egal</SelectItem>
                      <SelectItem value="yes">Ja</SelectItem>
                      <SelectItem value="no">Nein</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">MwSt. ausweisbar</Label>
                  <Select
                    value={filters.vatable}
                    onValueChange={(v) => updateFilters({ vatable: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">Egal</SelectItem>
                      <SelectItem value="yes">Ja</SelectItem>
                      <SelectItem value="no">Nein</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Erstzulassung ab</Label>
                  <Input
                    className="mt-1"
                    inputMode="numeric"
                    placeholder="1990"
                    value={filters.yearFrom}
                    onChange={(e) => updateFilters({ yearFrom: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Erstzulassung bis</Label>
                  <Input
                    className="mt-1"
                    inputMode="numeric"
                    placeholder="2026"
                    value={filters.yearTo}
                    onChange={(e) => updateFilters({ yearTo: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Kilometerstand bis</Label>
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  placeholder="150000"
                  value={filters.mileageMax}
                  onChange={(e) => updateFilters({ mileageMax: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="only-no-images"
                  checked={filters.noImages}
                  onCheckedChange={(c) => updateFilters({ noImages: c === true })}
                />
                <Label htmlFor="only-no-images" className="text-sm font-normal cursor-pointer">
                  Nur Fahrzeuge ohne Fotos
                </Label>
              </div>
            </PopoverContent>
          </Popover>

          <Select value={sortValue} onValueChange={(v) => { setSortValue(v); setPage(0); }}>
            <SelectTrigger className="h-11 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              {SORT_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Spalten wählen">
                <Settings2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 bg-popover">
              <p className="text-sm font-medium">Zusätzliche Spalten</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ihre Auswahl bleibt in diesem Browser gespeichert.
              </p>
              <div className="mt-3 space-y-2">
                {OPTIONAL_COLUMNS.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`col-${c.key}`}
                      checked={cols.includes(c.key)}
                      onCheckedChange={() => toggle(c.key)}
                    />
                    <Label htmlFor={`col-${c.key}`} className="text-sm font-normal cursor-pointer">
                      {c.label}
                    </Label>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Gesetzte Filter */}
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <Badge key={c.key} variant="secondary" className="gap-1 pr-1 font-normal">
              {c.label}
              <button
                onClick={c.clear}
                aria-label={`${c.label} entfernen`}
                className="rounded-full p-0.5 hover:bg-background/60"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button size="sm" variant="ghost" onClick={resetFilters}>
            Alle zurücksetzen
          </Button>
        </div>
      )}

      {/* Sammelaktionen */}
      {selected.length > 0 && (
        <Card className="p-4 mt-4 border-primary/40">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{selected.length} ausgewählt</span>
            <Button size="sm" onClick={() => setBulkStatusOpen(true)}>
              Status ändern
            </Button>
            <Select onValueChange={bulkCategory}>
              <SelectTrigger className="w-[220px] h-9">
                <SelectValue placeholder="Fahrzeugart setzen" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {VEHICLE_CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Auswahl aufheben
            </Button>
          </div>
        </Card>
      )}

      {/* Tabelle (ab 768px) */}
      <Card className="mt-4 hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Alle auswählen"
                />
              </TableHead>
              <TableHead className="w-[72px]">Bild</TableHead>
              <TableHead>Fahrzeug</TableHead>
              <TableHead className="text-right w-[190px]">Preis</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[140px]">Inserate</TableHead>
              {OPTIONAL_COLUMNS.filter((c) => cols.includes(c.key)).map((c) => (
                <TableHead key={c.key} className="whitespace-nowrap">
                  {c.label}
                </TableHead>
              ))}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7 + optionalCount}>
                    <div className="flex items-center gap-3 py-1">
                      <Skeleton className="h-12 w-12 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                      <Skeleton className="h-5 w-20" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7 + optionalCount} className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Kein Fahrzeug passt zu den gesetzten Filtern.
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
                    Filter zurücksetzen
                  </Button>
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
                          className="h-12 w-12 rounded object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded bg-secondary flex items-center justify-center">
                          <ImageOff className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[420px]">
                      <Link
                        to={`/admin/fahrzeuge/${v.id}`}
                        className="font-medium hover:text-primary line-clamp-1"
                      >
                        {v.title}
                        {v.is_featured && (
                          <Star className="h-3 w-3 inline ml-1 text-amber-500 fill-amber-500" />
                        )}
                      </Link>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {keyFacts(v)}
                      </p>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-base font-semibold">
                        {formatPrice(v.price, v.currency)}
                      </span>
                      <p className="text-xs text-muted-foreground truncate">
                        {categoryLabel(v.vehicle_category)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge v={v} />
                    </TableCell>
                    <TableCell>
                      <PlatformBadges listings={listingMap?.get(v.id)} className="flex-nowrap" />
                    </TableCell>
                    {OPTIONAL_COLUMNS.filter((c) => cols.includes(c.key)).map((c) => (
                      <TableCell key={c.key} className="text-xs text-muted-foreground whitespace-nowrap">
                        {optionalCell(v, c.key)}
                      </TableCell>
                    ))}
                    <TableCell>{rowMenu(v)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Karten (unter 768px) */}
      <div className="mt-4 space-y-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="p-3 space-y-3">
              <Skeleton className="h-40 w-full rounded" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </Card>
          ))
        ) : rows.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Kein Fahrzeug passt zu den gesetzten Filtern.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
              Filter zurücksetzen
            </Button>
          </Card>
        ) : (
          rows.map((v) => {
            const thumb = thumbFor(v);
            return (
              <Card key={v.id} className="overflow-hidden">
                <div className="relative">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={v.title}
                      loading="lazy"
                      className="h-44 w-full object-cover"
                    />
                  ) : (
                    <div className="h-44 w-full bg-secondary flex items-center justify-center">
                      <ImageOff className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute left-2 top-2 rounded bg-background/90 p-1">
                    <Checkbox
                      checked={selected.includes(v.id)}
                      onCheckedChange={() => toggleRow(v.id)}
                      aria-label="Auswählen"
                    />
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/admin/fahrzeuge/${v.id}`} className="font-medium text-sm">
                      {v.title}
                      {v.is_featured && (
                        <Star className="h-3 w-3 inline ml-1 text-amber-500 fill-amber-500" />
                      )}
                    </Link>
                    {rowMenu(v)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{keyFacts(v)}</p>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold">{formatPrice(v.price, v.currency)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {categoryLabel(v.vehicle_category)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <StatusBadge v={v} />
                      <PlatformBadges listings={listingMap?.get(v.id)} hideNotListed />
                    </div>
                  </div>
                  {cols.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {OPTIONAL_COLUMNS.filter((c) => cols.includes(c.key))
                        .map((c) => `${c.label}: ${optionalCell(v, c.key)}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Seitenwechsel */}
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

      {statusFor && (
        <VehicleStatusDialog
          open={!!statusFor}
          onOpenChange={(o) => !o && setStatusFor(null)}
          vehicleId={statusFor.id}
          vehicleTitle={statusFor.title}
          current={vehicleSaleStatus(statusFor)}
          onDone={refresh}
        />
      )}

      <BulkStatusDialog
        open={bulkStatusOpen}
        onOpenChange={setBulkStatusOpen}
        vehicleIds={selected}
        onDone={() => {
          setSelected([]);
          refresh();
        }}
      />

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
