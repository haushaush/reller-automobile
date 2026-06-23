import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, RotateCcw, Search } from "lucide-react";

type EmailLog = {
  id: string;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  opened_at: string | null;
  mail_type: string;
  status: string;
  recipients: string[];
  subject: string | null;
  vehicle_id: string | null;
  mobile_ad_draft_id: string | null;
  mobile_ad_id: string | null;
  story_id: string | null;
  expose_path: string | null;
  provider: string | null;
  provider_message_id: string | null;
  provider_response: any;
  error_message: string | null;
  metadata: any;
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Wartet",
  sending: "Wird gesendet",
  sent: "Versendet",
  failed: "Fehlgeschlagen",
  delivered: "Zugestellt",
  bounced: "Unzustellbar",
  opened: "Geöffnet",
};

function StatusBadge({ log }: { log: EmailLog }) {
  const cls: Record<string, string> = {
    queued: "bg-muted text-muted-foreground",
    sending: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    sent: "bg-green-500/15 text-green-700 dark:text-green-400",
    delivered: "bg-green-600/20 text-green-700 dark:text-green-300",
    failed: "bg-destructive/15 text-destructive",
    bounced: "bg-destructive/15 text-destructive",
    opened: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  };
  const badge = (
    <Badge variant="outline" className={cls[log.status] ?? ""}>
      {STATUS_LABEL[log.status] ?? log.status}
    </Badge>
  );
  if (log.status === "sent" && !log.delivered_at) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{badge}</span>
          </TooltipTrigger>
          <TooltipContent>
            Der Mail-Anbieter hat den Versand angenommen. Eine Zustellbestätigung liegt nicht vor.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return badge;
}

const MAIL_TYPES = [
  "all",
  "mobile_ad_synced",
  "daily_story_digest",
  "story_email",
  "manual_resend",
  "test_email",
];
const STATUSES = ["all", "queued", "sending", "sent", "failed", "delivered", "bounced", "opened"];

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function EmailLogs() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [mailType, setMailType] = useState("all");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("7d");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EmailLog | null>(null);
  const [resendCandidate, setResendCandidate] = useState<EmailLog | null>(null);
  const [resending, setResending] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("email_logs").select("*").order("created_at", { ascending: false }).limit(500);
    if (range !== "all") {
      const days = range === "24h" ? 1 : range === "7d" ? 7 : 30;
      q = q.gte("created_at", new Date(Date.now() - days * 86400_000).toISOString());
    }
    if (status !== "all") q = q.eq("status", status);
    if (mailType !== "all") q = q.eq("mail_type", mailType);
    const { data, error } = await q;
    if (error) {
      toast({ title: "Mail-Verlauf laden fehlgeschlagen", description: error.message, variant: "destructive" });
      setLogs([]);
    } else {
      setLogs((data ?? []) as EmailLog[]);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mailType, status, range]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return logs;
    return logs.filter((l) => {
      const hay = [
        l.subject ?? "",
        l.mobile_ad_id ?? "",
        l.vehicle_id ?? "",
        (l.recipients ?? []).join(","),
        l.mail_type,
        l.error_message ?? "",
      ].join(" ").toLowerCase();
      return hay.includes(s);
    });
  }, [logs, search]);

  const doResend = async () => {
    if (!resendCandidate) return;
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-email-log", {
        body: { emailLogId: resendCandidate.id },
      });
      if (error) throw error;
      toast({ title: "Mail erneut gesendet", description: `Gesendet: ${data?.sent ?? 0}` });
      setResendCandidate(null);
      await load();
    } catch (e: any) {
      toast({ title: "Erneut senden fehlgeschlagen", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mail-Verlauf</h1>
          <p className="text-sm text-muted-foreground">Automatische E-Mails: Versand, Status & Fehler.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Aktualisieren
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger><SelectValue placeholder="Zeitraum" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Letzte 24 h</SelectItem>
              <SelectItem value="7d">Letzte 7 Tage</SelectItem>
              <SelectItem value="30d">Letzte 30 Tage</SelectItem>
              <SelectItem value="all">Alle</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s === "all" ? "Alle Status" : STATUS_LABEL[s] ?? s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={mailType} onValueChange={setMailType}>
            <SelectTrigger><SelectValue placeholder="Mail-Typ" /></SelectTrigger>
            <SelectContent>
              {MAIL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t === "all" ? "Alle Typen" : t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Empfänger, Mobile.de-ID, Betreff…"
              className="pl-8"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zeitpunkt</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Betreff</TableHead>
                <TableHead>Empfänger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mobile.de-ID</TableHead>
                <TableHead>Fehler</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  {loading ? "Lädt…" : "Keine Einträge"}
                </TableCell></TableRow>
              )}
              {filtered.map((l) => (
                <TableRow
                  key={l.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setSelected(l)}
                >
                  <TableCell className="whitespace-nowrap text-xs">{fmt(l.created_at)}</TableCell>
                  <TableCell className="text-xs">{l.mail_type}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{l.subject ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{(l.recipients ?? []).join(", ")}</TableCell>
                  <TableCell><StatusBadge log={l} /></TableCell>
                  <TableCell className="text-xs">{l.mobile_ad_id ?? "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-destructive">
                    {l.error_message ?? ""}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setResendCandidate(l)}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Erneut
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.subject ?? "Mail-Details"}</DialogTitle>
            <DialogDescription>{selected?.mail_type}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-muted-foreground text-xs">Status</div><StatusBadge log={selected} /></div>
                <div><div className="text-muted-foreground text-xs">Versendet</div>{fmt(selected.sent_at)}</div>
                <div><div className="text-muted-foreground text-xs">Erstellt</div>{fmt(selected.created_at)}</div>
                <div><div className="text-muted-foreground text-xs">Provider</div>{selected.provider ?? "—"}</div>
                <div className="col-span-2"><div className="text-muted-foreground text-xs">Empfänger</div>{(selected.recipients ?? []).join(", ")}</div>
                <div className="col-span-2"><div className="text-muted-foreground text-xs">Provider Message ID</div><code className="text-xs">{selected.provider_message_id ?? "—"}</code></div>
                {selected.vehicle_id && <div><div className="text-muted-foreground text-xs">Fahrzeug</div><a className="text-primary underline" href={`/fahrzeug/${selected.vehicle_id}`} target="_blank" rel="noreferrer">{selected.vehicle_id.slice(0, 8)}…</a></div>}
                {selected.mobile_ad_id && <div><div className="text-muted-foreground text-xs">Mobile.de-ID</div>{selected.mobile_ad_id}</div>}
                {selected.mobile_ad_draft_id && <div><div className="text-muted-foreground text-xs">Draft</div><a className="text-primary underline" href={`/admin/mobile-ad/edit/${selected.mobile_ad_draft_id}`}>{selected.mobile_ad_draft_id.slice(0, 8)}…</a></div>}
                {selected.expose_path && <div className="col-span-2"><div className="text-muted-foreground text-xs">Exposé-Pfad</div><code className="text-xs">{selected.expose_path}</code></div>}
              </div>
              {selected.status === "sent" && !selected.delivered_at && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                  Der Mail-Anbieter hat den Versand angenommen. Eine Zustellbestätigung liegt nicht vor.
                </div>
              )}
              {selected.error_message && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive whitespace-pre-wrap">
                  {selected.error_message}
                </div>
              )}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Technische Metadaten</summary>
                <pre className="mt-2 p-2 bg-muted/40 rounded overflow-x-auto max-h-72">
{JSON.stringify({ metadata: selected.metadata, provider_response: selected.provider_response }, null, 2)}
                </pre>
              </details>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Schließen</Button>
            {selected && (
              <Button onClick={() => { setResendCandidate(selected); setSelected(null); }}>
                <RotateCcw className="h-4 w-4 mr-2" /> Erneut senden
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend confirm */}
      <AlertDialog open={!!resendCandidate} onOpenChange={(o) => !o && setResendCandidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mail erneut senden?</AlertDialogTitle>
            <AlertDialogDescription>
              Es wird ein neuer Mail-Verlauf-Eintrag erzeugt. Der alte Eintrag bleibt erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resending}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={doResend} disabled={resending}>
              {resending ? "Wird gesendet…" : "Erneut senden"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
