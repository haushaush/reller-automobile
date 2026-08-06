import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { saveText } from "@/lib/download";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageOff,
  Loader2,
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
import DuplicateVehicleDialog from "@/components/admin/DuplicateVehicleDialog";
import BulkStatusDialog from "@/components/admin/BulkStatusDialog";
import VehicleLifecycleDialog, {
  type LifecycleMode,
} from "@/components/admin/VehicleLifecycleDialog";
import {
  accountShortLabel,
  expectedAccountKey,
  loadListingOverview,
  publicListingUrl,

  vehicleSaleStatus,
  SALE_STATUS_LABELS,
  type VehicleSaleStatus,
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  archived_at: string | null;
}

const SELECT_COLUMNS =
  "id,title,brand,model,vehicle_category,year,mileage,price,currency,power,fuel,fuel_label,gearbox,gearbox_label,is_sold,reserved_at,is_featured,synced_at,created_at,updated_at,image_urls,custom_image_urls,hidden_image_urls,image_order,publish_status,mobile_de_id,mobile_ad_id,archived_at";

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
  | "account_mismatch"
  | "archived"
  | "deleted";

/** Erste Reihe: Zustand des Fahrzeugs */
const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "reserved", label: "Reserviert" },
  { value: "sold", label: "Verkauft" },
  { value: "archived", label: "Archiviert" },
  { value: "deleted", label: "Gelöscht" },
];

/** Filter, die nur über Verweise aus dem Überblick erreichbar sind */
const EXTRA_QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "not_listed", label: "Nicht inseriert" },
  { value: "attention", label: "Braucht Aufmerksamkeit" },
  { value: "account_mismatch", label: "Konto passt nicht zur Fahrzeugart" },
];

const quickLabel = (value: QuickFilter) =>
  [...QUICK_FILTERS, ...EXTRA_QUICK_FILTERS].find((q) => q.value === value)?.label ?? value;

/** Zweite Reihe: „Nach Portal“ — "all" | "mobile_de" | "mobile_de:<konto>" | "autoscout24" | "kleinanzeigen" | "portal_only" */
type PortalFilter = string;

const PORTAL_BASE_LABELS: Record<string, string> = {
  mobile_de: "Mobile.de",
  autoscout24: "AutoScout24",
  kleinanzeigen: "Kleinanzeigen",
  portal_only: "Nur im Portal",
};

function portalFilterLabel(value: PortalFilter, accounts: PlatformAccountRow[]): string {
  if (value.startsWith("mobile_de:")) {
    const key = value.slice("mobile_de:".length);
    return `Mobile.de · ${accountShortLabel(accounts, key) ?? key}`;
  }
  return PORTAL_BASE_LABELS[value] ?? value;
}


interface Filters {
  q: string;
  quick: QuickFilter;
  portal: PortalFilter;
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
  portal: "all",
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
    v.fuel_label || v.fuel ? getFuelLabel(v.fuel_label || v.fuel) : null,
    v.gearbox_label || v.gearbox ? getGearboxLabel(v.gearbox_label || v.gearbox) : null,
    v.power != null ? `${Math.round(v.power * 1.35962)} PS` : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : "Keine Eckdaten hinterlegt";
}

const SALE_STATUS_TRIGGER: Record<VehicleSaleStatus, string> = {
  available: "bg-secondary text-secondary-foreground border-transparent",
  reserved: "bg-amber-500 text-white border-transparent",
  sold: "bg-destructive text-destructive-foreground border-transparent",
};

/** Ein Übertragungsvorgang gilt nach 5 Minuten als abgebrochen. */
const STUCK_PUBLISHING_MS = 5 * 60 * 1000;
function isPublishing(v: { publish_status: string | null }) {
  return (v.publish_status ?? "") === "publishing";
}
function isStalePublishing(v: { publish_status: string | null; updated_at: string }) {
  return isPublishing(v) && Date.now() - new Date(v.updated_at).getTime() > STUCK_PUBLISHING_MS;
}

/** Hinweis „Wird veröffentlicht…“ — nach 5 Minuten mit Warnung und Prüfung. */
function PublishingNotice({
  v,
  onCheck,
  checking,
}: {
  v: AdminVehicleRow;
  onCheck: () => void;
  checking: boolean;
}) {
  if (!isPublishing(v)) return null;
  const stale = isStalePublishing(v);
  return (
    <div className="mt-1 flex items-center gap-1">
      <Badge
        variant="outline"
        className={
          stale
            ? "border-amber-500 text-amber-600 dark:text-amber-400"
            : "border-sky-500 text-sky-600 dark:text-sky-400"
        }
      >
        {stale ? "Übertragung hängt" : "Wird veröffentlicht …"}
      </Badge>
      {stale && (
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={checking} onClick={onCheck}>
          {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : "Status prüfen"}
        </Button>
      )}
    </div>
  );
}

/** Status direkt in der Zeile ändern — öffnet den Bestätigungsdialog. */
function StatusSelect({
  v,
  onPick,
}: {
  v: AdminVehicleRow;
  onPick: (v: AdminVehicleRow, target: VehicleSaleStatus) => void;
}) {
  const current = vehicleSaleStatus(v);
  return (
    <Select
      value={current}
      onValueChange={(val) => {
        const target = val as VehicleSaleStatus;
        if (target !== current) onPick(v, target);
      }}
    >
      <SelectTrigger
        className={`h-7 w-[128px] rounded-full px-3 text-xs font-medium ${SALE_STATUS_TRIGGER[current]}`}
        aria-label="Status ändern"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-popover">
        {(["available", "reserved", "sold"] as VehicleSaleStatus[]).map((s) => (
          <SelectItem key={s} value={s}>
            {SALE_STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
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
  const [statusTarget, setStatusTarget] = useState<VehicleSaleStatus | undefined>(undefined);
  const openStatus = useCallback((v: AdminVehicleRow, target?: VehicleSaleStatus) => {
    setStatusTarget(target);
    setStatusFor(v);
  }, []);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [lifecycle, setLifecycle] = useState<null | { mode: LifecycleMode; ids: string[] }>(null);
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

  /**
   * Aktive Inserate je Fahrzeug — Grundlage für die Portal-Schnellfilter
   * und die Trefferanzahlen.
   */
  const { data: portalIndex } = useQuery({
    queryKey: ["admin-vehicles-portal-index"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("vehicle_id, platform, status, account_key")
        .in("status", ["live", "paused"] as never)
        .limit(10000);
      if (error) throw error;
      const map = new Map<string, { platform: string; account_key: string | null }[]>();
      for (const l of (data ?? []) as unknown as {
        vehicle_id: string;
        platform: string;
        account_key: string | null;
      }[]) {
        map.set(l.vehicle_id, [
          ...(map.get(l.vehicle_id) ?? []),
          { platform: l.platform, account_key: l.account_key },
        ]);
      }
      return map;
    },
  });

  /** Zustand aller Fahrzeuge — nur für die Trefferanzahlen der Schnellfilter */
  const { data: stateIndex } = useQuery({
    queryKey: ["admin-vehicles-state-index"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, is_sold, reserved_at, archived_at")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        is_sold: boolean;
        reserved_at: string | null;
        archived_at: string | null;
      }[];
    },
  });

  const { data: deletedCount = 0 } = useQuery({
    queryKey: ["admin-vehicles-deleted-count"],
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("vehicle_deletion_log")
        .select("id", { count: "exact", head: true })
        .eq("action", "deleted");
      return count ?? 0;
    },
  });

  /** Passt ein Fahrzeug zum gewählten Portalfilter? */
  const matchesPortal = useCallback(
    (id: string, portal: PortalFilter) => {
      if (portal === "all") return true;
      const rows = portalIndex?.get(id) ?? [];
      if (portal === "portal_only") return rows.length === 0;
      if (portal.startsWith("mobile_de:")) {
        const key = portal.slice("mobile_de:".length);
        return rows.some((r) => r.platform === "mobile_de" && r.account_key === key);
      }
      return rows.some((r) => r.platform === portal);
    },
    [portalIndex],
  );

  /** Passt ein Fahrzeug zur ersten Filterreihe? */
  const matchesQuick = useCallback(
    (
      v: { id: string; is_sold: boolean; reserved_at: string | null; archived_at: string | null },
      quick: QuickFilter,
    ) => {
      if (quick === "archived") return !!v.archived_at;
      if (v.archived_at) return false;
      if (quick === "reserved") return !v.is_sold && !!v.reserved_at;
      if (quick === "sold") return v.is_sold;
      return true;
    },
    [],
  );

  const quickCounts = useMemo(() => {
    const out: Record<string, number> = { deleted: deletedCount };
    for (const qf of QUICK_FILTERS) {
      if (qf.value === "deleted") continue;
      out[qf.value] = (stateIndex ?? []).filter(
        (v) => matchesQuick(v, qf.value) && matchesPortal(v.id, filters.portal),
      ).length;
    }
    return out;
  }, [stateIndex, filters.portal, matchesQuick, matchesPortal, deletedCount]);

  const portalCounts = useCallback(
    (portal: PortalFilter) =>
      (stateIndex ?? []).filter(
        (v) => matchesQuick(v, filters.quick) && matchesPortal(v.id, portal),
      ).length,
    [stateIndex, filters.quick, matchesQuick, matchesPortal],
  );

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

      // Portalfilter über die aktiven Inserate
      let portalIds: string[] | null = null;
      if (filters.portal !== "all") {
        portalIds = (stateIndex ?? [])
          .filter((v) => matchesPortal(v.id, filters.portal))
          .map((v) => v.id)
          .slice(0, 1000);
        if (accountIds !== null) {
          const allow = new Set(accountIds);
          portalIds = portalIds.filter((id) => allow.has(id));
          accountIds = null;
        }
      }

      if (accountIds !== null && accountIds.length === 0) {
        return { rows: [] as AdminVehicleRow[], count: 0 };
      }
      if (portalIds !== null && portalIds.length === 0) {
        return { rows: [] as AdminVehicleRow[], count: 0 };
      }

      let query = supabase.from("vehicles").select(SELECT_COLUMNS, { count: "exact" });
      if (accountIds !== null) query = query.in("id", accountIds);
      if (portalIds !== null) query = query.in("id", portalIds);


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

      // Archivierte Fahrzeuge erscheinen nur im Filter „Archiviert“
      if (filters.quick === "archived") query = query.not("archived_at", "is", null);
      else query = query.is("archived_at", null);

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
              `publish_status.in.(publish_error,out_of_sync,publishing),id.in.(${attentionIds.join(",")})`,
            );
          } else {
            query = query.in(
              "publish_status",
              ["publish_error", "out_of_sync", "publishing"] as never,
            );
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

      // nullsFirst: false → Zeilen ohne Wert (z. B. Preis/EZ bei neuen
      // Portalfahrzeugen) landen immer am Ende, nie zufällig dazwischen.
      // id als Zweitsortierung sorgt für eine stabile Reihenfolge.
      query = query
        .order(dbKey, { ascending, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .range(offset, offset + size - 1);


      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { rows: (rows as unknown as AdminVehicleRow[]) ?? [], count: count ?? 0 };
    },
    [filters, sortKey, sortDir, needsAccountIndex, accountIndex, stateIndex, matchesPortal],
  );

  const needsPortalIndex = filters.portal !== "all";

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "admin-vehicles",
      filters,
      sortValue,
      page,
      needsAccountIndex && !!accountIndex,
      needsPortalIndex && !!portalIndex && !!stateIndex,
    ],
    enabled:
      filters.quick !== "deleted" &&
      (!needsAccountIndex || !!accountIndex) &&
      (!needsPortalIndex || (!!portalIndex && !!stateIndex)),
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

  /* Hängende Veröffentlichungen auflösen: die Function gleicht die
   * Inseratsliste des Kontos ab und trägt gefundene Anzeigen nach. */
  const [duplicate, setDuplicate] = useState<{ id: string; title: string } | null>(null);
  const [stuckChecking, setStuckChecking] = useState(false);
  const checkStuckPublishing = useCallback(async () => {
    setStuckChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-stuck-publishing", { body: {} });
      if (error) throw error;
      const res = data as { resolved?: number; failed?: number } | null;
      if (res?.resolved) toast.success(`${res.resolved} Anzeige(n) nachträglich zugeordnet`);
      else if (res?.failed) toast.warning(`${res.failed} Vorgang/Vorgänge abgebrochen — bitte prüfen`);
      else toast.info("Keine hängenden Vorgänge gefunden");
      refresh();
    } catch (e) {
      toast.error(`Prüfung fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setStuckChecking(false);
    }
  }, []);

  // Beim Öffnen der Liste einmal automatisch prüfen, wenn etwas hängt
  const autoCheckedRef = useRef(false);
  useEffect(() => {
    if (autoCheckedRef.current) return;
    if (!rows.some(isStalePublishing)) return;
    autoCheckedRef.current = true;
    void checkStuckPublishing();
  }, [rows, checkStuckPublishing]);

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

  // Hinweis: „Auf Startseite hervorheben“ wurde aus dem Aktionsmenü entfernt.
  // Die Hervorhebung bleibt in der Fahrzeugdetailseite bearbeitbar.



  const accountKeyFor = (id: string) => accountIndex?.byVehicle.get(id) ?? null;
  const accountNameFor = (id: string) => {
    const key = accountKeyFor(id);
    return key ? accountShortLabel(accounts, key) ?? key : "Kein Konto";
  };

  /** Tabellenexport der aktuell gefilterten Fahrzeuge, inkl. Spalte „Konto“ */
  const exportCsv = async () => {
    setIsExporting(true);
    try {
      const { rows: all } = await fetchVehicles(0, 2000);
      const header = [
        "Titel",
        "Marke",
        "Modell",
        "Fahrzeugart",
        "Erstzulassung",
        "Kilometerstand",
        "Preis",
        "Währung",
        "Status",
        "Konto",
        "Interne Nummer",
      ];
      const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const body = all.map((v) =>
        [
          v.title,
          v.brand,
          v.model,
          categoryLabel(v.vehicle_category),
          v.year,
          v.mileage,
          v.price,
          v.currency ?? "EUR",
          v.is_sold ? "Verkauft" : v.reserved_at ? "Reserviert" : "Verfügbar",
          accountNameFor(v.id),
          v.mobile_de_id,
        ]
          .map(cell)
          .join(";"),
      );
      const csv = "\uFEFF" + [header.map(cell).join(";"), ...body].join("\r\n");
      await saveText(
        csv,
        `fahrzeuge-${new Date().toISOString().slice(0, 10)}.csv`,
        "text/csv;charset=utf-8",
      );
      toast.success(`${all.length} Fahrzeug(e) exportiert`);
    } catch (e) {
      toast.error(`Export fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setIsExporting(false);
    }
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
        label: quickLabel(filters.quick),
        clear: () => updateFilters({ quick: "all" }),
      });
    if (filters.portal !== "all")
      list.push({
        key: "portal",
        label: `Portal: ${portalFilterLabel(filters.portal, accounts)}`,
        clear: () => updateFilters({ portal: "all" }),
      });
    if (filters.account !== "all")
      list.push({
        key: "account",
        label: `Konto: ${accountShortLabel(accounts, filters.account) ?? filters.account}`,
        clear: () => updateFilters({ account: "all" }),
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
  }, [filters, updateFilters, accounts]);

  const thumbFor = (v: AdminVehicleRow) => resolveVehicleImages(v)[0] ?? null;

  /** Abschnitte für die Ansicht „Nach Konto gruppieren“ */
  const groups = useMemo(() => {
    if (!groupByAccount) return [{ key: "all", label: "", rows }];
    const map = new Map<string, AdminVehicleRow[]>();
    for (const v of rows) {
      const key = accountIndex?.byVehicle.get(v.id) ?? "__none";
      const list = map.get(key) ?? [];
      list.push(v);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] === "__none" ? 1 : b[0] === "__none" ? -1 : a[0].localeCompare(b[0])))
      .map(([key, list]) => ({
        key,
        label:
          key === "__none"
            ? "Ohne Mobile.de-Konto"
            : accountShortLabel(accounts, key) ?? key,
        rows: list,
      }));
  }, [groupByAccount, rows, accountIndex, accounts]);
  const optionalCount = cols.length;

  /** Öffentlich erreichbare Inserate des Fahrzeugs (nicht der Händlerbereich). */
  const publicListings = (v: AdminVehicleRow) =>
    (listingMap?.get(v.id) ?? [])
      .filter((l) => l.status === "live" || l.status === "paused")
      .map((l) => ({
        platform: l.platform,
        accountKey: l.account_key,
        url: publicListingUrl(l, v.mobile_ad_id),
        label:
          l.platform === "mobile_de"
            ? `Mobile.de · ${accountShortLabel(accounts, l.account_key) ?? "Konto unbekannt"}`
            : PORTAL_BASE_LABELS[l.platform] ?? l.platform,
      }));

  const rowMenu = (v: AdminVehicleRow) => {
    const live = publicListings(v);
    const single = live.length === 1 ? live[0] : null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Aktionen">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 bg-popover">
          <DropdownMenuItem asChild>
            <Link to={`/admin/fahrzeuge/${v.id}`}>Fahrzeug öffnen</Link>
          </DropdownMenuItem>

          {live.length === 0 && (
            <DropdownMenuItem disabled>Inserat anzeigen — nicht inseriert</DropdownMenuItem>
          )}
          {single &&
            (single.url ? (
              <DropdownMenuItem asChild>
                <a href={single.url} target="_blank" rel="noopener noreferrer">
                  Inserat anzeigen
                </a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem asChild>
                <Link to={`/admin/fahrzeuge/${v.id}`}>Inserats-Link hinterlegen</Link>
              </DropdownMenuItem>
            ))}
          {live.length > 1 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Inserat anzeigen</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover">
                {live.map((l, i) =>
                  l.url ? (
                    <DropdownMenuItem key={i} asChild>
                      <a href={l.url} target="_blank" rel="noopener noreferrer">
                        {l.label}
                      </a>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem key={i} asChild>
                      <Link to={`/admin/fahrzeuge/${v.id}`}>
                        {l.label} — Inserats-Link hinterlegen
                      </Link>
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          <DropdownMenuItem onSelect={() => setDuplicate({ id: v.id, title: v.title })}>
            Duplizieren
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          {v.archived_at ? (
            <DropdownMenuItem onSelect={() => setLifecycle({ mode: "restore", ids: [v.id] })}>
              Wiederherstellen
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setLifecycle({ mode: "archive", ids: [v.id] })}>
              Archivieren (Daten bleiben erhalten)
            </DropdownMenuItem>
          )}
          {v.is_sold ? (
            <DropdownMenuItem disabled>
              Endgültig löschen — verkaufte Fahrzeuge nur archivieren
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setLifecycle({ mode: "delete", ids: [v.id] })}
            >
              Endgültig löschen
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };


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
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Export läuft …" : "Tabelle exportieren"}
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/fahrzeug-anlegen">Fahrzeug anlegen</Link>
          </Button>
        </div>
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
                <Label className="text-xs">Konto (Mobile.de)</Label>
                <Select
                  value={filters.account}
                  onValueChange={(v) => updateFilters({ account: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="all">Alle Konten</SelectItem>
                    {mobileAccounts.map((a) => (
                      <SelectItem key={a.account_key} value={a.account_key}>
                        {accountShortLabel(accounts, a.account_key)}
                        {a.seller_id ? ` (${a.seller_id})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Label htmlFor="group-by-account" className="text-sm font-normal">
                    Nach Konto gruppieren
                  </Label>
                  <Switch
                    id="group-by-account"
                    checked={groupByAccount}
                    onCheckedChange={setGroupByAccount}
                  />
                </div>
              </div>

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
            <Button
              size="sm"
              variant="outline"
              disabled={selected.length > 25}
              title={selected.length > 25 ? "Höchstens 25 Fahrzeuge je Vorgang" : undefined}
              onClick={() => setLifecycle({ mode: "archive", ids: [...selected] })}
            >
              Archivieren
            </Button>
            {selected.length > 25 && (
              <span className="text-xs text-muted-foreground">
                Archivieren ist auf 25 Fahrzeuge je Vorgang begrenzt
              </span>
            )}
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
              groups.flatMap((group) => [
                ...(groupByAccount
                  ? [
                      <TableRow key={`head-${group.key}`} className="bg-muted/60 hover:bg-muted/60">
                        <TableCell colSpan={7 + optionalCount} className="py-2 text-sm font-medium">
                          {group.label} · {group.rows.length} Fahrzeug(e)
                        </TableCell>
                      </TableRow>,
                    ]
                  : []),
                ...group.rows.map((v) => {
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
                      <StatusSelect v={v} onPick={openStatus} />
                      <PublishingNotice v={v} onCheck={checkStuckPublishing} checking={stuckChecking} />
                    </TableCell>
                    <TableCell>
                      <PlatformBadges
                        listings={listingMap?.get(v.id)}
                        accounts={accounts}
                        vehicleCategory={v.vehicle_category}
                        className="flex-nowrap"
                      />
                    </TableCell>
                    {OPTIONAL_COLUMNS.filter((c) => cols.includes(c.key)).map((c) => (
                      <TableCell key={c.key} className="text-xs text-muted-foreground whitespace-nowrap">
                        {optionalCell(v, c.key)}
                      </TableCell>
                    ))}
                    <TableCell>{rowMenu(v)}</TableCell>
                  </TableRow>
                );
                }),
              ])
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
          groups.flatMap((group) => [
            ...(groupByAccount
              ? [
                  <p key={`mhead-${group.key}`} className="pt-2 text-sm font-medium">
                    {group.label} · {group.rows.length} Fahrzeug(e)
                  </p>,
                ]
              : []),
            ...group.rows.map((v) => {
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
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    Konto: {accountNameFor(v.id)}
                    {accountIndex?.mismatch.has(v.id) && (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> passt nicht zur Fahrzeugart
                      </span>
                    )}
                  </p>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold">{formatPrice(v.price, v.currency)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {categoryLabel(v.vehicle_category)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <StatusSelect v={v} onPick={openStatus} />
                      <PublishingNotice v={v} onCheck={checkStuckPublishing} checking={stuckChecking} />
                      <PlatformBadges
                        listings={listingMap?.get(v.id)}
                        accounts={accounts}
                        vehicleCategory={v.vehicle_category}
                        hideNotListed
                      />
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
            }),
          ])
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

      <DuplicateVehicleDialog
        vehicle={duplicate}
        onClose={() => setDuplicate(null)}
        onDone={refresh}
      />

      {statusFor && (

        <VehicleStatusDialog
          open={!!statusFor}
          onOpenChange={(o) => {
            if (!o) {
              setStatusFor(null);
              setStatusTarget(undefined);
            }
          }}
          vehicleId={statusFor.id}
          vehicleTitle={statusFor.title}
          current={vehicleSaleStatus(statusFor)}
          initialTarget={statusTarget}
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

      {lifecycle && (
        <VehicleLifecycleDialog
          open={!!lifecycle}
          onOpenChange={(o) => !o && setLifecycle(null)}
          mode={lifecycle.mode}
          vehicleIds={lifecycle.ids}
          onDone={() => {
            setSelected([]);
            refresh();
          }}
        />
      )}

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
