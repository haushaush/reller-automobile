import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACCOUNT_BADGE_COLORS,
  accountBadgeClass,
  type PlatformAccountRow,
} from "@/lib/listings";

/**
 * Kurzbezeichnung und Farbe der Mobile.de-Konten.
 * Diese Angaben erscheinen überall dort, wo ein Fahrzeug einem Konto zugeordnet ist.
 */
export default function PlatformAccountsCard() {
  const [rows, setRows] = useState<PlatformAccountRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { short: string; color: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("platform_accounts")
        .select("*")
        .eq("platform", "mobile_de")
        .order("sort_order");
      const list = (data ?? []) as PlatformAccountRow[];
      setRows(list);
      setDrafts(
        Object.fromEntries(
          list.map((a) => [
            a.id,
            { short: a.short_label ?? a.label, color: a.badge_color ?? "slate" },
          ]),
        ),
      );
      setIsLoading(false);
    };
    load();
  }, []);

  const save = async (row: PlatformAccountRow) => {
    const draft = drafts[row.id];
    if (!draft?.short.trim()) {
      toast.error("Bitte eine Kurzbezeichnung eingeben.");
      return;
    }
    setSavingId(row.id);
    const { error } = await supabase
      .from("platform_accounts")
      .update({ short_label: draft.short.trim(), badge_color: draft.color } as never)
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast.error("Speichern fehlgeschlagen.");
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, short_label: draft.short.trim(), badge_color: draft.color } : r,
      ),
    );
    toast.success("Kurzbezeichnung gespeichert.");
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Mobile.de-Konten</h2>
        <p className="text-sm text-muted-foreground">
          Kurzbezeichnung und Farbe, mit der ein Konto in Listen und Übersichten gekennzeichnet
          wird.
        </p>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        rows.map((row) => {
          const draft = drafts[row.id] ?? { short: "", color: "slate" };
          const dirty =
            draft.short !== (row.short_label ?? row.label) ||
            draft.color !== (row.badge_color ?? "slate");
          return (
            <div key={row.id} className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_180px_auto]">
              <div>
                <Label className="text-xs">
                  {row.label}
                  {row.seller_id ? ` · Kundennummer ${row.seller_id}` : ""}
                </Label>
                <Input
                  className="mt-1"
                  value={draft.short}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [row.id]: { ...draft, short: e.target.value } }))
                  }
                  placeholder="z. B. Hauptkonto"
                />
              </div>
              <div>
                <Label className="text-xs">Farbe</Label>
                <Select
                  value={draft.color}
                  onValueChange={(v) =>
                    setDrafts((d) => ({ ...d, [row.id]: { ...draft, color: v } }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {ACCOUNT_BADGE_COLORS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Badge variant="outline" className={accountBadgeClass(draft.color)}>
                  {draft.short || "—"}
                </Badge>
                <Button
                  size="sm"
                  disabled={!dirty || savingId === row.id}
                  onClick={() => save(row)}
                >
                  {savingId === row.id && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Speichern
                </Button>
              </div>
            </div>
          );
        })
      )}
    </Card>
  );
}
