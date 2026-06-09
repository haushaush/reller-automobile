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
import { Loader2, Mail, Phone, Plus, X, Clock, Play } from "lucide-react";
import { toast } from "sonner";

const STORY_RECIPIENTS_KEY = "story_email_recipients";
const STORY_CONTACT_PHONE_KEY = "story_contact_phone";
const STORY_CONTACT_EMAIL_KEY = "story_contact_email";
const DAILY_DIGEST_ENABLED_KEY = "daily_digest_enabled";
const DAILY_DIGEST_HOUR_KEY = "daily_digest_hour";
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
    </div>
  );
}
