import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Inbox, Loader2, Plus, PhoneMissed, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import ManualLeadDialog from "@/components/admin/ManualLeadDialog";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  extractMessage,
  isMissedCallEvent,
  leadSourceIcon,
  leadSourceTone,
  type LeadStatus,
} from "@/lib/leads";

type QuickFilter = "all" | "open" | "missed" | "mine";

interface InboxItem {
  key: string;
  kind: "lead" | "inquiry";
  id: string;
  source: string;
  name: string;
  contact: string;
  vehicleTitle: string | null;
  snippet: string;
  receivedAt: string;
  status: string;
  statusLabel: string;
  assignedTo: string | null;
  missedCall: boolean;
}

const INQUIRY_STATUS_LABELS: Record<string, string> = {
  new: "Neu",
  contacted: "Kontaktiert",
  closed: "Abgeschlossen",
};

export default function InquiriesAdmin() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [quick, setQuick] = useState<QuickFilter>(() =>
    new URLSearchParams(window.location.search).get("filter") === "missed" ? "missed" : "all",
  );
  const [sourceFilter, setSourceFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(25);
  const [userId, setUserId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [fetching, setFetching] = useState(false);

  const loadData = useCallback(async () => {
    const [{ data: leadRows }, { data: inquiryRows }] = await Promise.all([
      supabase.from("leads").select("*").order("last_event_at", { ascending: false }).limit(400),
      supabase.from("inquiries").select("*").order("created_at", { ascending: false }).limit(400),
    ]);

    const leadIds = (leadRows ?? []).map((l) => l.id);
    const { data: eventRows } = leadIds.length
      ? await supabase
          .from("lead_events")
          .select("lead_id, event_type, payload, occurred_at")
          .in("lead_id", leadIds)
          .order("occurred_at", { ascending: true })
      : { data: [] as { lead_id: string; event_type: string; payload: unknown; occurred_at: string }[] };

    const snippetByLead = new Map<string, string>();
    const missedByLead = new Map<string, boolean>();
    (eventRows ?? []).forEach((e) => {
      const msg = extractMessage(e.payload);
      if (msg && !snippetByLead.has(e.lead_id)) snippetByLead.set(e.lead_id, msg);
      if (e.event_type === "PhoneCallReceived" && isMissedCallEvent(e.payload)) {
        missedByLead.set(e.lead_id, true);
      }
    });

    const vehicleIds = Array.from(
      new Set((leadRows ?? []).map((l) => l.vehicle_id).filter(Boolean) as string[]),
    );
    const { data: vehicleRows } = vehicleIds.length
      ? await supabase.from("vehicles").select("id, title").in("id", vehicleIds)
      : { data: [] as { id: string; title: string }[] };
    const vehicleTitles = new Map((vehicleRows ?? []).map((v) => [v.id, v.title]));

    const leadItems: InboxItem[] = (leadRows ?? []).map((l) => ({
      key: `lead-${l.id}`,
      kind: "lead",
      id: l.id,
      source: l.source,
      name: l.buyer_name ?? "Unbekannter Interessent",
      contact: l.buyer_email ?? l.buyer_phone ?? "",
      vehicleTitle: l.vehicle_id ? (vehicleTitles.get(l.vehicle_id) ?? null) : null,
      snippet: snippetByLead.get(l.id) ?? (missedByLead.get(l.id) ? "Verpasster Anruf" : "—"),
      receivedAt: l.last_event_at,
      status: l.status,
      statusLabel: LEAD_STATUS_LABELS[l.status as LeadStatus] ?? l.status,
      assignedTo: l.assigned_to,
      missedCall: missedByLead.get(l.id) === true,
    }));

    const inquiryItems: InboxItem[] = (inquiryRows ?? []).map((i) => ({
      key: `inq-${i.id}`,
      kind: "inquiry",
      id: i.id,
      source: "WEBSITE",
      name: `${i.first_name} ${i.last_name}`.trim(),
      contact: i.email,
      vehicleTitle: null,
      snippet: i.message ?? "—",
      receivedAt: i.created_at,
      status: i.status,
      statusLabel: INQUIRY_STATUS_LABELS[i.status] ?? i.status,
      assignedTo: null,
      missedCall: false,
    }));

    setItems(
      [...leadItems, ...inquiryItems].sort(
        (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
      ),
    );
    setIsLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    loadData();
    const timer = setInterval(loadData, 60000);
    return () => clearInterval(timer);
  }, [loadData]);

  const runFetch = async () => {
    setFetching(true);
    const { error } = await supabase.functions.invoke("fetch-leads", { body: {} });
    setFetching(false);
    if (!error) await loadData();
  };

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
        if (quick === "open" && !(item.status === "IN_PROGRESS" || item.status === "new")) return false;
        if (quick === "missed" && !item.missedCall) return false;
        if (quick === "mine" && (!userId || item.assignedTo !== userId)) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const haystack = `${item.name} ${item.contact} ${item.vehicleTitle ?? ""}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      }),
    [items, sourceFilter, quick, searchQuery, userId],
  );

  const quickFilters: { key: QuickFilter; label: string }[] = [
    { key: "all", label: "Alle" },
    { key: "open", label: "Unbeantwortet" },
    { key: "missed", label: "Verpasste Anrufe" },
    { key: "mine", label: "Meine" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Anfragen</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Alle Anfragen von Mobile.de, Kleinanzeigen, AutoScout24 und der eigenen Website an einem Ort.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runFetch} disabled={fetching}>
            {fetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Jetzt abrufen
          </Button>
          <Button onClick={() => setManualOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Anfrage erfassen
          </Button>
        </div>
      </div>

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {quickFilters.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={quick === f.key ? "default" : "outline"}
              onClick={() => setQuick(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <Input
            placeholder="Name, Kontakt oder Fahrzeug suchen…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 flex-1 sm:h-10"
          />
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-11 w-full sm:h-10 sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Herkünfte</SelectItem>
              {Object.entries(LEAD_SOURCE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Keine Anfragen gefunden</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, visibleCount).map((item) => {
            const Icon = item.missedCall ? PhoneMissed : leadSourceIcon(item.source);
            const to =
              item.kind === "lead" ? `/admin/anfragen/lead/${item.id}` : `/admin/anfragen/${item.id}`;
            return (
              <Link key={item.key} to={to} className="block">
                <Card className="p-3 transition-colors hover:bg-muted/40 sm:p-4">
                  <div className="flex gap-3">
                    <div
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md ${
                        item.missedCall ? "bg-destructive/10 text-destructive" : leadSourceTone(item.source)
                      }`}
                      title={LEAD_SOURCE_LABELS[item.source] ?? item.source}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {LEAD_SOURCE_LABELS[item.source] ?? item.source}
                        </Badge>
                        {item.missedCall && (
                          <Badge variant="destructive" className="text-[10px]">
                            Verpasster Anruf
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {item.vehicleTitle ? `${item.vehicleTitle} · ` : ""}
                        {item.snippet}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1 text-right">
                      <Badge variant={item.status === "IN_PROGRESS" || item.status === "new" ? "default" : "secondary"}>
                        {item.statusLabel}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.receivedAt), { addSuffix: true, locale: de })}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}

          {filtered.length > visibleCount && (
            <Button variant="outline" onClick={() => setVisibleCount((c) => c + 25)} className="mt-4 w-full">
              Weitere 25 anzeigen ({filtered.length - visibleCount} verbleibend)
            </Button>
          )}
        </div>
      )}

      <ManualLeadDialog open={manualOpen} onOpenChange={setManualOpen} onCreated={loadData} />
    </div>
  );
}
