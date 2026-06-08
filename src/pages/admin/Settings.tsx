import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Plus, X } from "lucide-react";
import { toast } from "sonner";

const STORY_RECIPIENTS_KEY = "story_email_recipients";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Settings() {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", STORY_RECIPIENTS_KEY)
        .maybeSingle();
      if (error) {
        console.error(error);
        toast.error("Einstellungen konnten nicht geladen werden");
      } else if (data?.value && Array.isArray(data.value)) {
        setRecipients((data.value as unknown[]).filter((v): v is string => typeof v === "string"));
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
    </div>
  );
}
