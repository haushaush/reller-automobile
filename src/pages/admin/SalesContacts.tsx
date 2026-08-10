import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  Loader2,
  Plus,
  QrCode,
  Upload,
  ExternalLink,
  Pencil,
  Printer,
  Link2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CARD_BASE_URL,
  DEFAULT_BUTTONS,
  PHOTO_BUCKET_NAME,
  cardUrl,
  contactName,
  normalizeButtons,
  resolvePhotoUrl,
  slugify,
  type CardButton,
  type SalesContact,
} from "@/lib/salesCard";

interface Stats {
  views: number;
  clicks: number;
  requests: number;
}

const PERIODS = [
  { value: "7", label: "Letzte 7 Tage" },
  { value: "30", label: "Letzte 30 Tage" },
  { value: "90", label: "Letzte 90 Tage" },
  { value: "all", label: "Gesamt" },
];

const emptyContact = (): SalesContact => ({
  id: "",
  slug: "",
  first_name: "",
  last_name: "",
  role: "",
  email: "",
  phone: "",
  mobile: "",
  photo_url: null,
  buttons: DEFAULT_BUTTONS,
  is_active: true,
  sort_order: 0,
  card_printed_at: null,
});

export default function SalesContacts() {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<SalesContact[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SalesContact | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slugUnlock, setSlugUnlock] = useState(false);
  const [qrFor, setQrFor] = useState<SalesContact | null>(null);
  const [qrPng, setQrPng] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("sales_contacts")
      .select("*")
      .order("sort_order", { ascending: true });
    const rows: SalesContact[] = (data ?? []).map((r) => ({
      ...(r as unknown as SalesContact),
      buttons: normalizeButtons((r as { buttons: unknown }).buttons),
    }));
    setContacts(rows);
    setLoading(false);

    const urls: Record<string, string> = {};
    await Promise.all(
      rows.map(async (r) => {
        const url = await resolvePhotoUrl(r.photo_url);
        if (url) urls[r.id] = url;
      }),
    );
    setPhotos(urls);
  }, []);

  const loadStats = useCallback(async () => {
    const since =
      period === "all"
        ? null
        : new Date(Date.now() - Number(period) * 24 * 60 * 60 * 1000).toISOString();

    let eventQuery = supabase.from("sales_card_events").select("sales_contact_id, event_type, button_id");
    if (since) eventQuery = eventQuery.gte("created_at", since);
    let reqQuery = supabase.from("appointment_requests").select("sales_contact_id");
    if (since) reqQuery = reqQuery.gte("created_at", since);

    const [{ data: events }, { data: requests }] = await Promise.all([eventQuery, reqQuery]);

    const map: Record<string, Stats> = {};
    (events ?? []).forEach((e) => {
      const id = (e as { sales_contact_id: string }).sales_contact_id;
      map[id] ??= { views: 0, clicks: 0, requests: 0 };
      if ((e as { event_type: string }).event_type === "view") map[id].views += 1;
      else map[id].clicks += 1;
    });
    (requests ?? []).forEach((r) => {
      const id = (r as { sales_contact_id: string | null }).sales_contact_id;
      if (!id) return;
      map[id] ??= { views: 0, clicks: 0, requests: 0 };
      map[id].requests += 1;
    });
    setStats(map);
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const openEdit = (contact: SalesContact | null) => {
    setIsNew(!contact);
    setSlugUnlock(false);
    setEditing(contact ? { ...contact, buttons: [...contact.buttons] } : emptyContact());
  };

  const updateField = <K extends keyof SalesContact>(key: K, value: SalesContact[K]) =>
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));

  const updateButton = (index: number, patch: Partial<CardButton>) =>
    setEditing((prev) =>
      prev
        ? { ...prev, buttons: prev.buttons.map((b, i) => (i === index ? { ...b, ...patch } : b)) }
        : prev,
    );

  const uploadPhoto = async (file: File) => {
    if (!editing) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${editing.slug || slugify(`${editing.first_name}-${editing.last_name}`) || crypto.randomUUID()}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET_NAME).upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Foto konnte nicht hochgeladen werden", description: error.message, variant: "destructive" });
      return;
    }
    updateField("photo_url", path);
    toast({ title: "Foto hochgeladen" });
  };

  const save = async () => {
    if (!editing) return;
    const slug = slugify(editing.slug || `${editing.first_name}-${editing.last_name}`);
    if (!slug || !editing.first_name.trim() || !editing.last_name.trim() || !editing.email?.trim()) {
      toast({ title: "Bitte Name, Kartenadresse und E-Mail ausfüllen", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      slug,
      first_name: editing.first_name.trim(),
      last_name: editing.last_name.trim(),
      role: editing.role?.trim() || null,
      email: editing.email!.trim(),
      phone: editing.phone?.trim() || null,
      mobile: editing.mobile?.trim() || null,
      photo_url: editing.photo_url,
      buttons: editing.buttons as unknown as Json,
      is_active: editing.is_active,
      sort_order: editing.sort_order,
    };

    if (isNew) {
      const { error } = await supabase.from("sales_contacts").insert(payload);
      setSaving(false);
      if (error) {
        toast({ title: "Speichern fehlgeschlagen", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const previous = contacts.find((c) => c.id === editing.id);
      const { error } = await supabase.from("sales_contacts").update(payload).eq("id", editing.id);
      if (error) {
        setSaving(false);
        toast({ title: "Speichern fehlgeschlagen", description: error.message, variant: "destructive" });
        return;
      }
      // Gedruckte Karten dürfen nie ins Leere führen
      if (previous && previous.slug !== slug) {
        await supabase
          .from("sales_contact_slug_redirects")
          .upsert({ old_slug: previous.slug, sales_contact_id: editing.id });
      }
      setSaving(false);
    }
    setEditing(null);
    await load();
    toast({ title: "Gespeichert" });
  };

  const markPrinted = async (contact: SalesContact) => {
    const { error } = await supabase
      .from("sales_contacts")
      .update({ card_printed_at: new Date().toISOString() })
      .eq("id", contact.id);
    if (error) {
      toast({ title: "Nicht möglich", description: error.message, variant: "destructive" });
      return;
    }
    await load();
    toast({ title: "Als gedruckt markiert", description: "Die Kartenadresse ist jetzt gesperrt." });
  };

  const openQr = async (contact: SalesContact) => {
    setQrFor(contact);
    const png = await QRCode.toDataURL(cardUrl(contact.slug), {
      width: 2048,
      margin: 2,
      errorCorrectionLevel: "H",
    });
    setQrPng(png);
  };

  const downloadQrPng = () => {
    if (!qrPng || !qrFor) return;
    const a = document.createElement("a");
    a.href = qrPng;
    a.download = `qr-${qrFor.slug}.png`;
    a.click();
  };

  const downloadQrSvg = async () => {
    if (!qrFor) return;
    const svg = await QRCode.toString(cardUrl(qrFor.slug), {
      type: "svg",
      margin: 2,
      errorCorrectionLevel: "H",
    });
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${qrFor.slug}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const slugLocked = useMemo(
    () => !!editing?.card_printed_at && !slugUnlock,
    [editing, slugUnlock],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Visitenkarten</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Persönliche Kartenseiten mit QR-Code für gedruckte Visitenkarten.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => openEdit(null)}>
            <Plus className="mr-2 h-4 w-4" /> Karte anlegen
          </Button>
        </div>
      </div>

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-3">
          {contacts.map((c) => {
            const s = stats[c.id] ?? { views: 0, clicks: 0, requests: 0 };
            return (
              <Card key={c.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                {photos[c.id] ? (
                  <img src={photos[c.id]} alt="" className="h-16 w-16 rounded-full object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground">
                    {c.first_name[0]}
                    {c.last_name[0]}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{contactName(c)}</p>
                    {!c.is_active && <Badge variant="secondary">Inaktiv</Badge>}
                    {c.card_printed_at && <Badge variant="outline">Gedruckt</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{c.role || "—"}</p>
                  <a
                    href={`/karte/${c.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    <Link2 className="h-3 w-3" /> {CARD_BASE_URL.replace("https://", "")}/karte/{c.slug}
                  </a>
                </div>

                <div className="flex gap-6 text-sm">
                  <div className="text-center">
                    <p className="font-semibold">{s.views}</p>
                    <p className="text-xs text-muted-foreground">Aufrufe</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">{s.clicks}</p>
                    <p className="text-xs text-muted-foreground">Klicks</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">{s.requests}</p>
                    <p className="text-xs text-muted-foreground">Termine</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                    <Pencil className="mr-2 h-4 w-4" /> Bearbeiten
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void openQr(c)}>
                    <QrCode className="mr-2 h-4 w-4" /> QR-Code
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={`/karte/${c.slug}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" /> Vorschau
                    </a>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Bearbeiten */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? "Karte anlegen" : "Karte bearbeiten"}</DialogTitle>
            <DialogDescription>
              Die Kartenadresse steht auf gedruckten Karten und sollte sich nicht ändern.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Vorname</Label>
                  <Input
                    className="mt-1"
                    value={editing.first_name}
                    onChange={(e) => updateField("first_name", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Nachname</Label>
                  <Input
                    className="mt-1"
                    value={editing.last_name}
                    onChange={(e) => updateField("last_name", e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Funktion</Label>
                <Input
                  className="mt-1"
                  value={editing.role ?? ""}
                  onChange={(e) => updateField("role", e.target.value)}
                />
              </div>

              <div>
                <Label>Kartenadresse</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    value={editing.slug}
                    disabled={slugLocked}
                    onChange={(e) => updateField("slug", e.target.value)}
                    placeholder="vorname-nachname"
                  />
                  {slugLocked && (
                    <Button type="button" variant="outline" onClick={() => setSlugUnlock(true)}>
                      Adresse ändern
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {slugLocked
                    ? "Gesperrt, weil die Karte bereits gedruckt wurde."
                    : "Beim Ändern wird automatisch eine dauerhafte Weiterleitung von der alten Adresse angelegt."}
                </p>
              </div>

              <div>
                <Label>E-Mail (nur intern, steht nicht im Seitenquelltext)</Label>
                <Input
                  className="mt-1"
                  type="email"
                  value={editing.email ?? ""}
                  onChange={(e) => updateField("email", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Telefon</Label>
                  <Input
                    className="mt-1"
                    value={editing.phone ?? ""}
                    onChange={(e) => updateField("phone", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Mobil</Label>
                  <Input
                    className="mt-1"
                    value={editing.mobile ?? ""}
                    onChange={(e) => updateField("mobile", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Reihenfolge</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    value={editing.sort_order}
                    onChange={(e) => updateField("sort_order", Number(e.target.value))}
                  />
                </div>
                <div className="flex items-end gap-3 pb-2">
                  <Switch
                    id="active"
                    checked={editing.is_active}
                    onCheckedChange={(v) => updateField("is_active", v)}
                  />
                  <Label htmlFor="active">Aktiv</Label>
                </div>
              </div>

              <div>
                <Label>Foto</Label>
                <div className="mt-1 flex items-center gap-3">
                  <Button asChild variant="outline" size="sm">
                    <label className="cursor-pointer">
                      <Upload className="mr-2 h-4 w-4" /> Foto hochladen
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadPhoto(file);
                        }}
                      />
                    </label>
                  </Button>
                  <span className="truncate text-xs text-muted-foreground">
                    {editing.photo_url ?? "Kein Foto"}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Schaltflächen</Label>
                {editing.buttons.map((btn, i) => (
                  <div key={btn.id} className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Input
                        value={btn.label}
                        onChange={(e) => updateButton(i, { label: e.target.value })}
                        placeholder="Beschriftung"
                      />
                      <div className="flex shrink-0 items-center gap-2">
                        <Switch
                          checked={btn.visible}
                          onCheckedChange={(v) => updateButton(i, { visible: v })}
                        />
                        <span className="text-xs text-muted-foreground">Sichtbar</span>
                      </div>
                    </div>
                    {btn.type === "appointment" ? (
                      <p className="text-xs text-muted-foreground">Öffnet das Terminformular auf der Karte.</p>
                    ) : (
                      <Input
                        value={btn.href ?? ""}
                        onChange={(e) => updateButton(i, { href: e.target.value })}
                        placeholder="Ziel, z. B. /fahrzeuge oder https://…"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Abbrechen
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR-Code */}
      <Dialog open={!!qrFor} onOpenChange={(open) => !open && setQrFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR-Code · {qrFor ? contactName(qrFor) : ""}</DialogTitle>
            <DialogDescription>{qrFor ? cardUrl(qrFor.slug) : ""}</DialogDescription>
          </DialogHeader>
          {qrPng && <img src={qrPng} alt="QR-Code" className="mx-auto w-56 rounded-md border border-border" />}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={downloadQrPng}>
              PNG (Druckauflösung)
            </Button>
            <Button variant="outline" onClick={() => void downloadQrSvg()}>
              SVG für die Druckerei
            </Button>
            {qrFor && !qrFor.card_printed_at && (
              <Button onClick={() => void markPrinted(qrFor)}>
                <Printer className="mr-2 h-4 w-4" /> Als gedruckt markieren
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
