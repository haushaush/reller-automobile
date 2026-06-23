import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Mail, Phone, Plus, X, Clock, Play, Send } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const STORY_RECIPIENTS_KEY = "story_email_recipients";
const STORY_CONTACT_PHONE_KEY = "story_contact_phone";
const STORY_CONTACT_EMAIL_KEY = "story_contact_email";
const DAILY_DIGEST_ENABLED_KEY = "daily_digest_enabled";
const DAILY_DIGEST_HOUR_KEY = "daily_digest_hour";
const DAILY_REPORT_RECIPIENTS_KEY = "daily_report_recipients";
const DAILY_REPORT_INC_NEW_KEY = "daily_report_include_new_vehicles";
const DAILY_REPORT_INC_SOLD_KEY = "daily_report_include_sold_vehicles";
const DAILY_REPORT_INC_INVENTORY_KEY = "daily_report_include_inventory_value";
const DAILY_REPORT_INC_SYNC_KEY = "daily_report_include_sync_status";
const MAP_ENABLED_KEY = "new_synced_vehicle_email_enabled";
const MAP_RECIPIENTS_KEY = "new_synced_vehicle_email_recipients";
const MAP_INCLUDE_STORY_KEY = "new_synced_vehicle_email_include_story";
const MAP_INCLUDE_EXPOSE_KEY = "new_synced_vehicle_email_include_expose";
const MAP_INCLUDE_VEHICLE_LINK_KEY = "new_synced_vehicle_email_include_vehicle_link";
const MAP_INCLUDE_ACCIDENT_KEY = "new_synced_vehicle_email_include_accident_vehicles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Settings() {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestHour, setDigestHour] = useState<number>(7);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [isSavingDigest, setIsSavingDigest] = useState(false);
  const [isTestingDigest, setIsTestingDigest] = useState(false);

  const [reportRecipientsText, setReportRecipientsText] = useState("");
  const [reportIncludeNew, setReportIncludeNew] = useState(true);
  const [reportIncludeSold, setReportIncludeSold] = useState(true);
  const [reportIncludeInventory, setReportIncludeInventory] = useState(true);
  const [reportIncludeSync, setReportIncludeSync] = useState(true);

  const [mapEnabled, setMapEnabled] = useState(true);
  const [mapRecipientsText, setMapRecipientsText] = useState("");
  const [mapIncludeStory, setMapIncludeStory] = useState(true);
  const [mapIncludeExpose, setMapIncludeExpose] = useState(true);
  const [mapIncludeVehicleLink, setMapIncludeVehicleLink] = useState(true);
  const [mapIncludeAccident, setMapIncludeAccident] = useState(true);
  const [isSavingMap, setIsSavingMap] = useState(false);


  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", [
          STORY_RECIPIENTS_KEY,
          STORY_CONTACT_PHONE_KEY,
          STORY_CONTACT_EMAIL_KEY,
          DAILY_DIGEST_ENABLED_KEY,
          DAILY_DIGEST_HOUR_KEY,
          DAILY_REPORT_RECIPIENTS_KEY,
          DAILY_REPORT_INC_NEW_KEY,
          DAILY_REPORT_INC_SOLD_KEY,
          DAILY_REPORT_INC_INVENTORY_KEY,
          DAILY_REPORT_INC_SYNC_KEY,
          MAP_ENABLED_KEY,
          MAP_RECIPIENTS_KEY,
          MAP_INCLUDE_STORY_KEY,
          MAP_INCLUDE_EXPOSE_KEY,
          MAP_INCLUDE_VEHICLE_LINK_KEY,
          MAP_INCLUDE_ACCIDENT_KEY,
        ]);

      if (error) {
        console.error(error);
        toast.error("Einstellungen konnten nicht geladen werden");
      } else if (data) {
        for (const row of data) {
          if (row.key === STORY_RECIPIENTS_KEY && Array.isArray(row.value)) {
            setRecipients(
              (row.value as unknown[]).filter((v): v is string => typeof v === "string"),
            );
          } else if (row.key === STORY_CONTACT_PHONE_KEY && typeof row.value === "string") {
            setContactPhone(row.value);
          } else if (row.key === STORY_CONTACT_EMAIL_KEY && typeof row.value === "string") {
            setContactEmail(row.value);
          } else if (row.key === DAILY_DIGEST_ENABLED_KEY && typeof row.value === "boolean") {
            setDigestEnabled(row.value);
          } else if (row.key === DAILY_DIGEST_HOUR_KEY && typeof row.value === "number") {
            setDigestHour(row.value);
          } else if (row.key === DAILY_REPORT_RECIPIENTS_KEY && Array.isArray(row.value)) {
            setReportRecipientsText(
              (row.value as unknown[]).filter((v): v is string => typeof v === "string").join("\n"),
            );
          } else if (row.key === DAILY_REPORT_INC_NEW_KEY && typeof row.value === "boolean") {
            setReportIncludeNew(row.value);
          } else if (row.key === DAILY_REPORT_INC_SOLD_KEY && typeof row.value === "boolean") {
            setReportIncludeSold(row.value);
          } else if (row.key === DAILY_REPORT_INC_INVENTORY_KEY && typeof row.value === "boolean") {
            setReportIncludeInventory(row.value);
          } else if (row.key === DAILY_REPORT_INC_SYNC_KEY && typeof row.value === "boolean") {
            setReportIncludeSync(row.value);
          } else if (row.key === MAP_ENABLED_KEY && typeof row.value === "boolean") {
            setMapEnabled(row.value);
          } else if (row.key === MAP_RECIPIENTS_KEY && Array.isArray(row.value)) {
            setMapRecipientsText(
              (row.value as unknown[]).filter((v): v is string => typeof v === "string").join("\n"),
            );
          } else if (row.key === MAP_INCLUDE_STORY_KEY && typeof row.value === "boolean") {
            setMapIncludeStory(row.value);
          } else if (row.key === MAP_INCLUDE_EXPOSE_KEY && typeof row.value === "boolean") {
            setMapIncludeExpose(row.value);
          } else if (row.key === MAP_INCLUDE_VEHICLE_LINK_KEY && typeof row.value === "boolean") {
            setMapIncludeVehicleLink(row.value);
          } else if (row.key === MAP_INCLUDE_ACCIDENT_KEY && typeof row.value === "boolean") {
            setMapIncludeAccident(row.value);
          }

        }
        // Default mobile-ad recipients to story recipients if not yet configured.
        const hasMapRecipients = data.some((r) => r.key === MAP_RECIPIENTS_KEY);
        if (!hasMapRecipients) {
          const storyRow = data.find((r) => r.key === STORY_RECIPIENTS_KEY);
          if (storyRow && Array.isArray(storyRow.value)) {
            setMapRecipientsText(
              (storyRow.value as unknown[]).filter((v): v is string => typeof v === "string").join("\n"),
            );
          }
        }
        // Default daily-report recipients to story recipients if not yet configured.
        const hasReportRecipients = data.some((r) => r.key === DAILY_REPORT_RECIPIENTS_KEY);
        if (!hasReportRecipients) {
          const storyRow = data.find((r) => r.key === STORY_RECIPIENTS_KEY);
          if (storyRow && Array.isArray(storyRow.value)) {
            setReportRecipientsText(
              (storyRow.value as unknown[]).filter((v): v is string => typeof v === "string").join("\n"),
            );
          }
        }
      }
      setIsLoading(false);
    };
    load();
  }, []);

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) {
      toast.error("Bitte eine gültige E-Mail-Adresse eingeben");
      return;
    }
    if (recipients.includes(e)) {
      toast.error("Diese Adresse ist bereits in der Liste");
      return;
    }
    setRecipients((prev) => [...prev, e]);
    setNewEmail("");
  };

  const removeEmail = (email: string) => {
    setRecipients((prev) => prev.filter((e) => e !== email));
  };

  const save = async () => {
    setIsSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: STORY_RECIPIENTS_KEY, value: recipients, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    setIsSaving(false);
    if (error) {
      console.error(error);
      toast.error("Speichern fehlgeschlagen");
    } else {
      toast.success("Einstellungen gespeichert");
    }
  };

  const saveContact = async () => {
    const email = contactEmail.trim();
    if (email && !EMAIL_RE.test(email)) {
      toast.error("Bitte eine gültige E-Mail-Adresse eingeben");
      return;
    }
    setIsSavingContact(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        [
          { key: STORY_CONTACT_PHONE_KEY, value: contactPhone.trim(), updated_at: now },
          { key: STORY_CONTACT_EMAIL_KEY, value: email, updated_at: now },
        ],
        { onConflict: "key" },
      );
    setIsSavingContact(false);
    if (error) {
      console.error(error);
      toast.error("Speichern fehlgeschlagen");
    } else {
      toast.success("Kontaktdaten gespeichert");
    }
  };

  const saveDigest = async () => {
    setIsSavingDigest(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        [
          { key: DAILY_DIGEST_ENABLED_KEY, value: digestEnabled, updated_at: now },
          { key: DAILY_DIGEST_HOUR_KEY, value: digestHour, updated_at: now },
        ],
        { onConflict: "key" },
      );
    setIsSavingDigest(false);
    if (error) {
      console.error(error);
      toast.error("Speichern fehlgeschlagen");
    } else {
      toast.success("Einstellungen gespeichert");
    }
  };

  // supabase.functions.invoke does not support query params, so we call the
  // function URL directly to pass ?force=true.
  const testDigestForce = async () => {
    setIsTestingDigest(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectRef}.supabase.co/functions/v1/daily-story-digest?force=true`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: "{}",
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      console.log("daily-story-digest force test result:", data);
      const sent = (data as { sent?: number })?.sent ?? 0;
      const reason = (data as { reason?: string; skipped?: string })?.reason
        ?? (data as { skipped?: string })?.skipped;
      if (sent > 0) toast.success(`Test erfolgreich: ${sent} Story(s) versendet`);
      else toast.message(`Kein Versand (${reason ?? "ok"})`);
    } catch (err) {
      console.error(err);
      toast.error(`Test fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      setIsTestingDigest(false);
    }
  };

  const parseMapRecipients = (): string[] | null => {
    const list = mapRecipientsText
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const unique = Array.from(new Set(list));
    const invalid = unique.filter((e) => !EMAIL_RE.test(e));
    if (invalid.length > 0) {
      toast.error(`Ungültige E-Mail-Adressen: ${invalid.join(", ")}`);
      return null;
    }
    return unique;
  };

  const saveMap = async () => {
    const recList = parseMapRecipients();
    if (recList === null) return;
    setIsSavingMap(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        [
          { key: MAP_ENABLED_KEY, value: mapEnabled, updated_at: now },
          { key: MAP_RECIPIENTS_KEY, value: recList, updated_at: now },
          { key: MAP_INCLUDE_STORY_KEY, value: mapIncludeStory, updated_at: now },
          { key: MAP_INCLUDE_EXPOSE_KEY, value: mapIncludeExpose, updated_at: now },
          { key: MAP_INCLUDE_VEHICLE_LINK_KEY, value: mapIncludeVehicleLink, updated_at: now },
          { key: MAP_INCLUDE_ACCIDENT_KEY, value: mapIncludeAccident, updated_at: now },
        ],
        { onConflict: "key" },
      );

    setIsSavingMap(false);
    if (error) {
      console.error(error);
      toast.error("Speichern fehlgeschlagen");
    } else {
      toast.success("Einstellungen gespeichert");
    }
  };



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
        <h1 className="text-2xl font-semibold">Einstellungen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verwalte projektweite Einstellungen.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Story-Empfänger</h2>
            <p className="text-sm text-muted-foreground">
              Diese Adressen erhalten die generierten Story-Bilder per E-Mail.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {recipients.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              Noch keine Empfänger hinterlegt.
            </p>
          )}
          {recipients.map((email) => (
            <div
              key={email}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
            >
              <span className="text-sm break-all">{email}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeEmail(email)}
                aria-label={`${email} entfernen`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-recipient">Neue Adresse hinzufügen</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="new-recipient"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEmail();
                }
              }}
              placeholder="name@beispiel.de"
              className="flex-1"
            />
            <Button type="button" variant="secondary" onClick={addEmail}>
              <Plus className="h-4 w-4" />
              Hinzufügen
            </Button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={save} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Story-Kontaktdaten</h2>
            <p className="text-sm text-muted-foreground">
              Diese Daten erscheinen unten im Story-Bild. Leer lassen = keine Anzeige.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-phone">Telefonnummer (auf der Story)</Label>
          <Input
            id="contact-phone"
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+49 ..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-email">E-Mail (auf der Story)</Label>
          <Input
            id="contact-email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="name@beispiel.de"
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={saveContact} disabled={isSavingContact}>
            {isSavingContact && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Tägliche Story-Mail</h2>
            <p className="text-sm text-muted-foreground">
              Verschickt einmal täglich eine Mail mit Story-Bildern aller Fahrzeuge,
              die in den letzten 24 Stunden hinzugefügt wurden. Empfänger = die oben
              konfigurierten Story-Empfänger.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <Label htmlFor="digest-enabled" className="cursor-pointer">
            Täglichen Versand aktivieren
          </Label>
          <Switch
            id="digest-enabled"
            checked={digestEnabled}
            onCheckedChange={setDigestEnabled}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="digest-hour">Versand-Uhrzeit (Europe/Berlin)</Label>
          <Select
            value={String(digestHour)}
            onValueChange={(v) => setDigestHour(parseInt(v, 10))}
          >
            <SelectTrigger id="digest-hour">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, h) => (
                <SelectItem key={h} value={String(h)}>
                  {String(h).padStart(2, "0")}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={testDigestForce}
            disabled={isTestingDigest}
          >
            {isTestingDigest ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Daily-Digest jetzt testen
          </Button>
          <Button onClick={saveDigest} disabled={isSavingDigest}>
            {isSavingDigest && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Send className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Neue Sync-Fahrzeuge</h2>
            <p className="text-sm text-muted-foreground">
              Automatische Mail, wenn der Mobile.de-Sync ein neues Fahrzeug im Bestand anlegt.
              Wird nicht bei normalen Sync-Updates verschickt.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <Label htmlFor="map-enabled" className="cursor-pointer">
            Mail senden, wenn durch Mobile.de-Sync ein neues Fahrzeug im Bestand erscheint
          </Label>
          <Switch id="map-enabled" checked={mapEnabled} onCheckedChange={setMapEnabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="map-recipients">Empfänger</Label>
          <Textarea
            id="map-recipients"
            rows={4}
            value={mapRecipientsText}
            onChange={(e) => setMapRecipientsText(e.target.value)}
            placeholder={"name@beispiel.de\noder kommagetrennt: a@x.de, b@y.de"}
          />
          <p className="text-xs text-muted-foreground">
            Mehrere Adressen erlaubt – kommagetrennt oder zeilenweise.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="map-story"
              checked={mapIncludeStory}
              onCheckedChange={(v) => setMapIncludeStory(v === true)}
            />
            <Label htmlFor="map-story" className="cursor-pointer">
              WhatsApp-Story als Bild in der Mail anzeigen
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="map-expose"
              checked={mapIncludeExpose}
              onCheckedChange={(v) => setMapIncludeExpose(v === true)}
            />
            <Label htmlFor="map-expose" className="cursor-pointer">
              Exposé-Link mitsenden
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="map-vehicle"
              checked={mapIncludeVehicleLink}
              onCheckedChange={(v) => setMapIncludeVehicleLink(v === true)}
            />
            <Label htmlFor="map-vehicle" className="cursor-pointer">
              Fahrzeug-Link mitsenden
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="map-accident"
              checked={mapIncludeAccident}
              onCheckedChange={(v) => setMapIncludeAccident(v === true)}
            />
            <Label htmlFor="map-accident" className="cursor-pointer">
              Auch Unfallwagen berücksichtigen
            </Label>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Hinweis: Die Mail wird nur bei neu angelegten Fahrzeugen versendet, nicht bei normalen Sync-Updates.
        </p>


        <div className="flex justify-end pt-2">
          <Button onClick={saveMap} disabled={isSavingMap}>
            {isSavingMap && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </div>
      </Card>
    </div>
  );
}
