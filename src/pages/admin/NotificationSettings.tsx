import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Mail, Send, ShieldCheck, X } from "lucide-react";

const FORBIDDEN = "info@reller-automobile.de";

type MailSettings = {
  id: number;
  sender_address: string;
  sender_name: string;
  reply_to_customer: string;
  reply_to_internal: string | null;
  inquiry_inbox: string;
};

type EventType =
  | "inquiry_received" | "vehicle_sold" | "vehicle_published" | "publish_failed"
  | "story_generated" | "expose_created" | "quality_report" | "open_tasks_reminder";

type Recipient = { id: string; event_type: EventType; email: string; is_active: boolean };
type Setting = { event_type: EventType; is_enabled: boolean; digest_mode: "immediate" | "daily" };

const EVENTS: { type: EventType; label: string; hint: string }[] = [
  { type: "inquiry_received", label: "Neue Kundenanfrage", hint: "Sobald ein Kunde das Anfrageformular abschickt." },
  { type: "vehicle_sold", label: "Fahrzeug verkauft", hint: "Sobald ein Fahrzeug als verkauft markiert wird — mit Hinweis, welche Inserate noch beendet werden müssen." },
  { type: "vehicle_published", label: "Fahrzeug veröffentlicht", hint: "Sobald ein Inserat erfolgreich online gegangen ist." },
  { type: "publish_failed", label: "Veröffentlichung fehlgeschlagen", hint: "Wenn ein Inserat nicht online gestellt werden konnte." },
  { type: "story_generated", label: "Neue Story erzeugt", hint: "Sobald ein Story-Bild für WhatsApp erstellt wurde." },
  { type: "expose_created", label: "Exposé erstellt", hint: "Sobald ein Fahrzeug-PDF erzeugt wurde." },
  { type: "quality_report", label: "Datenqualität (wöchentlich)", hint: "Jeden Montag: Zusammenfassung aller offenen Datenprobleme." },
  { type: "open_tasks_reminder", label: "Erinnerung an offene Handgriffe", hint: "Täglich, wenn Aufgaben länger als 7 Tage offen sind." },
];

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function NotificationSettings() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notification-config"],
    queryFn: async () => {
      const [settingsRes, recipientsRes, eventsRes] = await Promise.all([
        supabase.from("mail_settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("notification_recipients").select("*").order("email"),
        supabase.from("notification_settings").select("*"),
      ]);
      if (settingsRes.error) throw settingsRes.error;
      return {
        mail: settingsRes.data as MailSettings | null,
        recipients: (recipientsRes.data ?? []) as Recipient[],
        settings: (eventsRes.data ?? []) as Setting[],
      };
    },
  });

  const [form, setForm] = useState<Partial<MailSettings>>({});
  useEffect(() => {
    if (data?.mail) setForm(data.mail);
  }, [data?.mail]);

  const [domainCheck, setDomainCheck] = useState<{
    status: string; message: string; requiredRecords?: { type: string; name: string; value: string; purpose: string }[];
  } | null>(null);
  const [checking, setChecking] = useState(false);

  const saveMail = useMutation({
    mutationFn: async () => {
      const payload = {
        sender_address: (form.sender_address ?? "").trim().toLowerCase(),
        sender_name: (form.sender_name ?? "").trim(),
        reply_to_customer: (form.reply_to_customer ?? "").trim().toLowerCase(),
        reply_to_internal: (form.reply_to_internal ?? "")?.trim().toLowerCase() || null,
        inquiry_inbox: (form.inquiry_inbox ?? "").trim().toLowerCase(),
      };
      for (const [key, value] of Object.entries(payload)) {
        if (key === "sender_name" || !value) continue;
        if (!isEmail(String(value))) throw new Error("Bitte gültige E-Mail-Adressen eintragen.");
        if (key !== "inquiry_inbox" && String(value) === FORBIDDEN) {
          throw new Error(`${FORBIDDEN} darf nicht als Absender oder Antwortadresse verwendet werden.`);
        }
      }
      const { error } = await supabase.from("mail_settings").update(payload).eq("id", 1);
      if (error) throw error;
      return payload.sender_address;
    },
    onSuccess: async (address) => {
      toast.success("Absender gespeichert");
      qc.invalidateQueries({ queryKey: ["notification-config"] });
      await checkDomain(address);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function checkDomain(address: string) {
    if (!address) return;
    setChecking(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("check-sender-domain", {
        body: { address },
      });
      if (error) throw error;
      setDomainCheck(res as typeof domainCheck);
    } catch {
      setDomainCheck({ status: "unknown", message: "Domainstatus konnte nicht geprüft werden." });
    } finally {
      setChecking(false);
    }
  }

  const toggleEvent = useMutation({
    mutationFn: async (args: { eventType: EventType; patch: Partial<Setting> }) => {
      const { error } = await supabase
        .from("notification_settings")
        .update(args.patch)
        .eq("event_type", args.eventType);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-config"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const addRecipient = useMutation({
    mutationFn: async (args: { eventType: EventType; email: string }) => {
      const email = args.email.trim().toLowerCase();
      if (!isEmail(email)) throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
      const { error } = await supabase
        .from("notification_recipients")
        .insert({ event_type: args.eventType, email });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empfänger hinzugefügt");
      qc.invalidateQueries({ queryKey: ["notification-config"] });
    },
    onError: (e: Error) => toast.error(e.message.includes("duplicate") ? "Adresse ist bereits hinterlegt." : e.message),
  });

  const removeRecipient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notification_recipients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-config"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: async (eventType: EventType) => {
      const { data: res, error } = await supabase.functions.invoke("notify-event", {
        body: { eventType, test: true },
      });
      if (error) throw error;
      return res as { sent?: number; recipients?: string[]; error?: string };
    },
    onSuccess: (res, eventType) => {
      if (res?.error) toast.error(res.error);
      else toast.success(`Testmail für „${EVENTS.find((e) => e.type === eventType)?.label}" verschickt an ${(res?.recipients ?? []).join(", ") || "die hinterlegten Empfänger"}.`);
    },
    onError: (e: Error) => toast.error(`Testmail fehlgeschlagen: ${e.message}`),
  });

  const byEvent = useMemo(() => {
    const map = new Map<EventType, { setting?: Setting; recipients: Recipient[] }>();
    for (const e of EVENTS) map.set(e.type, { recipients: [] });
    for (const s of data?.settings ?? []) {
      const entry = map.get(s.event_type);
      if (entry) entry.setting = s;
    }
    for (const r of data?.recipients ?? []) {
      const entry = map.get(r.event_type);
      if (entry) entry.recipients.push(r);
    }
    return map;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Benachrichtigungen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hier legen Sie fest, von welcher Adresse Mails verschickt werden und wer welche Meldung bekommt.
        </p>
      </div>

      {/* Absender */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold">Absender</h2>
            <p className="text-sm text-muted-foreground">
              Diese Angaben gelten für alle Mails aus dem Portal.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Absenderadresse</Label>
            <Input
              value={form.sender_address ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, sender_address: e.target.value }))}
              placeholder="no-reply@reller-automobile.de"
            />
            <p className="text-xs text-muted-foreground">
              Steht im Posteingang des Empfängers als Absender. Antworten hierauf werden nicht gelesen.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Absendername</Label>
            <Input
              value={form.sender_name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, sender_name: e.target.value }))}
              placeholder="Reller Automobile"
            />
            <p className="text-xs text-muted-foreground">Der Name, der vor der Adresse angezeigt wird.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Antwortadresse für Kunden</Label>
            <Input
              value={form.reply_to_customer ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, reply_to_customer: e.target.value }))}
              placeholder="anfrage@reller-automobile.de"
            />
            <p className="text-xs text-muted-foreground">
              Antwortet ein Kunde auf eine Bestätigungsmail, landet die Antwort hier.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Antwortadresse für interne Mails (freiwillig)</Label>
            <Input
              value={form.reply_to_internal ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, reply_to_internal: e.target.value }))}
              placeholder="leer lassen"
            />
            <p className="text-xs text-muted-foreground">Nur nötig, wenn Betriebsmeldungen beantwortet werden sollen.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Posteingang für Kundenanfragen</Label>
            <Input
              value={form.inquiry_inbox ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, inquiry_inbox: e.target.value }))}
              placeholder="anfrage@reller-automobile.de"
            />
            <p className="text-xs text-muted-foreground">
              Dorthin gehen Kundenanfragen, wenn unten kein eigener Empfänger hinterlegt ist.
            </p>
          </div>
        </div>

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Feste Regel</AlertTitle>
          <AlertDescription className="text-sm">
            {FORBIDDEN} wird ausschließlich als Empfänger verwendet und kann nicht als Absender oder
            Antwortadresse eingetragen werden. Versuche werden protokolliert und blockiert.
          </AlertDescription>
        </Alert>

        {domainCheck && (
          <Alert variant={domainCheck.status === "verified" ? "default" : "destructive"}>
            {domainCheck.status === "verified"
              ? <CheckCircle2 className="h-4 w-4" />
              : <AlertTriangle className="h-4 w-4" />}
            <AlertTitle>
              {domainCheck.status === "verified" ? "Domain ist verifiziert" : "Domain nicht bestätigt"}
            </AlertTitle>
            <AlertDescription className="space-y-2 text-sm">
              <p>{domainCheck.message}</p>
              {(domainCheck.requiredRecords?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <p className="font-medium">Diese Einträge müssen beim Domain-Anbieter hinterlegt werden:</p>
                  <ul className="space-y-1">
                    {domainCheck.requiredRecords!.map((r) => (
                      <li key={r.purpose} className="font-mono text-xs break-all">
                        {r.purpose}: {r.type} {r.name} → {r.value}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => saveMail.mutate()} disabled={saveMail.isPending}>
            {saveMail.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Absender speichern
          </Button>
          <Button
            variant="outline"
            onClick={() => checkDomain((form.sender_address ?? "").trim())}
            disabled={checking}
          >
            {checking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Domain prüfen
          </Button>
        </div>
      </Card>

      {/* Ereignisse */}
      <Card className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Wer bekommt welche Mail?</h2>
          <p className="text-sm text-muted-foreground">
            Pro Meldung können beliebig viele Adressen hinterlegt werden. Mit „Testmail senden" prüfen Sie,
            ob die Zustellung wirklich funktioniert.
          </p>
        </div>

        <div className="divide-y">
          {EVENTS.map((event) => {
            const entry = byEvent.get(event.type);
            const setting = entry?.setting;
            return (
              <EventRow
                key={event.type}
                event={event}
                enabled={setting?.is_enabled ?? true}
                digest={setting?.digest_mode ?? "immediate"}
                recipients={entry?.recipients ?? []}
                busy={toggleEvent.isPending || addRecipient.isPending}
                testing={sendTest.isPending && sendTest.variables === event.type}
                onToggle={(v) => toggleEvent.mutate({ eventType: event.type, patch: { is_enabled: v } })}
                onDigest={(v) => toggleEvent.mutate({ eventType: event.type, patch: { digest_mode: v } })}
                onAdd={(email) => addRecipient.mutate({ eventType: event.type, email })}
                onRemove={(id) => removeRecipient.mutate(id)}
                onTest={() => sendTest.mutate(event.type)}
              />
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function EventRow({
  event, enabled, digest, recipients, busy, testing,
  onToggle, onDigest, onAdd, onRemove, onTest,
}: {
  event: { type: EventType; label: string; hint: string };
  enabled: boolean;
  digest: "immediate" | "daily";
  recipients: Recipient[];
  busy: boolean;
  testing: boolean;
  onToggle: (v: boolean) => void;
  onDigest: (v: "immediate" | "daily") => void;
  onAdd: (email: string) => void;
  onRemove: (id: string) => void;
  onTest: () => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="py-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[220px]">
          <p className="font-medium">{event.label}</p>
          <p className="text-sm text-muted-foreground">{event.hint}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={digest} onValueChange={(v) => onDigest(v as "immediate" | "daily")}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="immediate">Sofort senden</SelectItem>
              <SelectItem value="daily">Tageszusammenfassung (18 Uhr)</SelectItem>
            </SelectContent>
          </Select>
          <Switch checked={enabled} onCheckedChange={onToggle} disabled={busy} aria-label="An oder aus" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {recipients.length === 0 && (
          <span className="text-sm text-muted-foreground">Noch kein Empfänger hinterlegt.</span>
        )}
        {recipients.map((r) => (
          <Badge key={r.id} variant="secondary" className="gap-1 pl-2.5">
            {r.email}
            <button
              type="button"
              onClick={() => onRemove(r.id)}
              className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
              aria-label={`${r.email} entfernen`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onAdd(draft);
              setDraft("");
            }
          }}
          placeholder="weitere Adresse hinzufügen"
          className="max-w-xs"
        />
        <Button
          variant="outline"
          onClick={() => {
            if (!draft.trim()) return;
            onAdd(draft);
            setDraft("");
          }}
          disabled={busy}
        >
          Hinzufügen
        </Button>
        <Button variant="secondary" onClick={onTest} disabled={testing}>
          {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Testmail senden
        </Button>
      </div>
    </div>
  );
}
