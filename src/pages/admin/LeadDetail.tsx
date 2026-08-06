import { primaryVehicleImage } from "@/lib/vehicleImages";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  Info,
  Loader2,
  Mail,
  Phone,
  PhoneMissed,
  Search,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  LEAD_EVENT_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_TYPE_LABELS,
  extractMessage,
  formatDuration,
  isMissedCallEvent,
  mobileDeLeadUrl,
  type LeadStatus,
} from "@/lib/leads";

interface LeadRow {
  id: string;
  lead_id: string | null;
  source: string;
  lead_type: string;
  status: string;
  vehicle_id: string | null;
  mobile_ad_id: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  first_event_at: string;
  last_event_at: string;
  internal_note: string | null;
}

interface EventRow {
  id: string;
  event_id: string;
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown> | null;
}

interface VehicleRow {
  id: string;
  title: string;
  price: number | null;
  image_urls: string[] | null;
  is_sold: boolean;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function dataOf(payload: unknown): Record<string, unknown> {
  return obj(obj(payload).data);
}

function euro(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("de-DE")} €`;
}

function DetailTable({ rows }: { rows: [string, string][] }) {
  const visible = rows.filter(([, v]) => v && v !== "—");
  if (visible.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
      {visible.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function EventBody({ event }: { event: EventRow }) {
  const data = dataOf(event.payload);
  const type = event.event_type;

  if (type === "PhoneCallReceived") {
    const call = obj(data.call ?? data.phoneCall);
    const missed = isMissedCallEvent(event.payload);
    const duration = formatDuration(call.durationInSeconds ?? call.duration ?? data.duration);
    const summary =
      (call.aiSummary as string) ??
      (data.aiSummary as string) ??
      (obj(data.summary).text as string) ??
      (typeof data.summary === "string" ? data.summary : null);
    return (
      <div className={missed ? "rounded-md border border-destructive/40 bg-destructive/5 p-3" : "rounded-md border bg-card p-3"}>
        <div className="flex items-center gap-2">
          {missed ? (
            <PhoneMissed className="h-4 w-4 text-destructive" />
          ) : (
            <Phone className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={missed ? "text-sm font-semibold text-destructive" : "text-sm font-semibold"}>
            {missed ? "Verpasster Anruf" : "Telefonanruf"}
          </span>
        </div>
        <DetailTable
          rows={[
            ["Dauer", duration ?? "—"],
            ["Nummer", String(call.callerNumber ?? call.phoneNumber ?? data.phoneNumber ?? "—")],
          ]}
        />
        {summary && (
          <div className="mt-2 rounded-md bg-muted/60 p-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Zusammenfassung des Anliegens</p>
            <p className="mt-1">{summary}</p>
          </div>
        )}
      </div>
    );
  }

  if (type === "LeasingLeadSubmitted") {
    const leasing = obj(data.leasing ?? data.leasingRequest ?? data);
    return (
      <div className="rounded-md border bg-card p-3">
        <p className="text-sm font-semibold">Leasinganfrage</p>
        <DetailTable
          rows={[
            ["Laufzeit", leasing.durationInMonths ? `${leasing.durationInMonths} Monate` : "—"],
            ["Anzahlung", leasing.downPayment !== undefined ? euro(leasing.downPayment) : "—"],
            ["Monatliche Rate", leasing.monthlyRate !== undefined ? euro(leasing.monthlyRate) : "—"],
            [
              "Laufleistung",
              leasing.mileagePerYear ? `${Number(leasing.mileagePerYear).toLocaleString("de-DE")} km/Jahr` : "—",
            ],
          ]}
        />
        {extractMessage(event.payload) && (
          <p className="mt-2 whitespace-pre-wrap text-sm">{extractMessage(event.payload)}</p>
        )}
      </div>
    );
  }

  if (type === "BuyerPreferencesUpdated") {
    const prefs = obj(data.preferences ?? data.buyerPreferences ?? data);
    const tradeIn = obj(prefs.tradeIn ?? prefs.tradeInVehicle);
    const flag = (v: unknown) => (v === true ? "Ja" : v === false ? "Nein" : "—");
    return (
      <div className="rounded-md border bg-card p-3">
        <p className="text-sm font-semibold">Käuferwünsche</p>
        <DetailTable
          rows={[
            ["Probefahrt", flag(prefs.testDrive ?? prefs.wantsTestDrive)],
            ["Inzahlungnahme", flag(prefs.tradeIn ? true : prefs.wantsTradeIn)],
            ["Finanzierung", flag(prefs.financing ?? prefs.wantsFinancing)],
            ["Lieferung", flag(prefs.delivery ?? prefs.wantsDelivery)],
          ]}
        />
        {Object.keys(tradeIn).length > 0 && (
          <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-semibold">Angebotenes Fahrzeug zur Inzahlungnahme</p>
            <DetailTable
              rows={Object.entries(tradeIn).map(([k, v]) => [
                k,
                typeof v === "object" ? JSON.stringify(v) : String(v ?? "—"),
              ])}
            />
          </div>
        )}
      </div>
    );
  }

  if (type === "BuyerSearchBehaviourAdded") {
    const behaviour = obj(data.searchBehaviour ?? data.behaviour ?? data);
    const asList = (v: unknown) =>
      Array.isArray(v) ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") : "—";
    return (
      <div className="rounded-md border border-dashed bg-muted/40 p-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Wonach dieser Interessent sonst sucht</p>
        </div>
        <DetailTable
          rows={[
            ["Marken", asList(behaviour.makes ?? behaviour.brands)],
            ["Modelle", asList(behaviour.models)],
            ["Kraftstoff", asList(behaviour.fuels ?? behaviour.fuel)],
            ["Getriebe", asList(behaviour.gearboxes ?? behaviour.gearbox)],
          ]}
        />
      </div>
    );
  }

  const message = extractMessage(event.payload);
  if (message) {
    return (
      <div className="rounded-2xl rounded-tl-sm border bg-card p-3">
        <p className="whitespace-pre-wrap text-sm">{message}</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <p className="text-sm text-muted-foreground">
        {LEAD_EVENT_LABELS[type] ?? type} — keine Textnachricht übermittelt.
      </p>
    </div>
  );
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
    if (!data) {
      setLoading(false);
      return;
    }
    const row = data as LeadRow;
    setLead(row);
    setNote(row.internal_note ?? "");

    const { data: ev } = await supabase
      .from("lead_events")
      .select("*")
      .eq("lead_id", id)
      .order("occurred_at", { ascending: true });
    setEvents((ev ?? []) as EventRow[]);

    if (row.vehicle_id) {
      const { data: v } = await supabase
        .from("vehicles")
        .select("id, title, price, image_urls, is_sold")
        .eq("id", row.vehicle_id)
        .maybeSingle();
      setVehicle((v as VehicleRow) ?? null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (value: string) => {
    if (!lead) return;
    setSavingStatus(true);
    const { data, error } = await supabase.functions.invoke("update-lead-status", {
      body: { leadIds: [lead.id], newStatus: value },
    });
    setSavingStatus(false);
    if (error) {
      toast.error(`Status konnte nicht gesetzt werden: ${error.message}`);
      return;
    }
    const result = (data as { results?: { remote: boolean; message?: string }[] })?.results?.[0];
    setLead({ ...lead, status: value });
    if (result?.remote) toast.success("Status gesetzt und an Mobile.de gemeldet.");
    else if (result?.message) toast.warning(`Status im Portal gesetzt. Mobile.de: ${result.message}`);
    else toast.success("Status gesetzt.");
  };

  const saveNote = async () => {
    if (!lead) return;
    const { error } = await supabase.from("leads").update({ internal_note: note }).eq("id", lead.id);
    if (error) toast.error("Notiz konnte nicht gespeichert werden.");
    else toast.success("Notiz gespeichert.");
  };

  const removeLead = async () => {
    if (!lead) return;
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) {
      toast.error(`Löschen fehlgeschlagen: ${error.message}`);
      return;
    }
    toast.success("Anfrage und Verlauf wurden unwiderruflich gelöscht.");
    navigate("/admin/anfragen");
  };

  const isRemote = useMemo(
    () => !!lead && lead.source !== "MANUAL" && lead.source !== "AUTOSCOUT24",
    [lead],
  );

  if (loading) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  }
  if (!lead) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-muted-foreground">Diese Anfrage wurde nicht gefunden.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/admin/anfragen">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Zurück zu den Anfragen
        </Link>
      </Button>

      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold">{lead.buyer_name ?? "Unbekannter Interessent"}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</Badge>
                  <Badge variant="outline">{LEAD_TYPE_LABELS[lead.lead_type] ?? lead.lead_type}</Badge>
                  <span>
                    Eingang {format(new Date(lead.first_event_at), "dd.MM.yyyy HH:mm", { locale: de })} Uhr
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {lead.buyer_email && (
                    <a href={`mailto:${lead.buyer_email}`} className="flex items-center gap-1.5 hover:underline">
                      <Mail className="h-3.5 w-3.5" /> {lead.buyer_email}
                    </a>
                  )}
                  {lead.buyer_phone && (
                    <a href={`tel:${lead.buyer_phone}`} className="flex items-center gap-1.5 hover:underline">
                      <Phone className="h-3.5 w-3.5" /> {lead.buyer_phone}
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Select value={lead.status} onValueChange={changeStatus} disabled={savingStatus}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {LEAD_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => setDeleteOpen(true)} title="Anfrage löschen">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>

          {isRemote && (
            <Card className="border-primary/30 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Antworten ist hier nicht möglich.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Diese Anfrage wird nur angezeigt. Geantwortet wird weiterhin direkt bei Mobile.de —
                    eine Notiz in diesem Portal erreicht den Interessenten nicht.
                  </p>
                  <Button variant="default" size="sm" className="mt-3" asChild>
                    <a href={mobileDeLeadUrl()} target="_blank" rel="noopener noreferrer">
                      Gespräch bei Mobile.de öffnen <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Gesprächsverlauf
            </h2>
            {events.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Noch keine Ereignisse erfasst.</p>
            ) : (
              <ol className="mt-4 space-y-4">
                {events.map((event) => (
                  <li key={event.id}>
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium">
                        {LEAD_EVENT_LABELS[event.event_type] ?? event.event_type}
                      </span>
                      <span>·</span>
                      <span>{format(new Date(event.occurred_at), "dd.MM.yyyy HH:mm", { locale: de })} Uhr</span>
                    </div>
                    <EventBody event={event} />
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Interne Notiz
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Nur für Ihr Team sichtbar — wird nicht an den Interessenten gesendet.
            </p>
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} className="mt-2" />
            <Button size="sm" variant="outline" className="mt-2" onClick={saveNote}>
              Notiz speichern
            </Button>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fahrzeug</h2>
            {vehicle ? (
              <div className="mt-3">
                {primaryVehicleImage(vehicle) && (
                  <img
                    src={primaryVehicleImage(vehicle) ?? undefined}
                    alt={vehicle.title}
                    className="mb-3 aspect-video w-full rounded-md object-cover"
                    loading="lazy"
                  />
                )}
                <p className="font-medium">{vehicle.title}</p>
                <p className="text-sm text-primary">{vehicle.price ? euro(vehicle.price) : "Auf Anfrage"}</p>
                {vehicle.is_sold && (
                  <Badge variant="destructive" className="mt-2">
                    Bereits verkauft
                  </Badge>
                )}
                <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                  <Link to={`/admin/fahrzeuge/${vehicle.id}`}>Fahrzeug öffnen</Link>
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Kein Fahrzeug zugeordnet{lead.mobile_ad_id ? ` (Anzeigen-Nr. ${lead.mobile_ad_id})` : ""}.
              </p>
            )}
          </Card>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anfrage endgültig löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Anfrage samt komplettem Gesprächsverlauf und allen Kontaktdaten wird unwiderruflich
              entfernt. Das lässt sich nicht rückgängig machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={removeLead}>Endgültig löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
