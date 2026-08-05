import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface AccountRow {
  id: string;
  account_key: string;
  label: string;
  seller_id: string | null;
  lead_api_enabled: boolean;
  lead_username_secret_name: string | null;
  lead_cursor: string | null;
}

interface CheckResult {
  accountKey: string;
  ok: boolean;
  status: number;
  usedFallback: boolean;
  message: string;
}

export default function LeadApiCard() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [checking, setChecking] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("platform_accounts")
      .select("id, account_key, label, seller_id, lead_api_enabled, lead_username_secret_name, lead_cursor")
      .eq("platform", "mobile_de")
      .order("sort_order");
    setAccounts((data ?? []) as AccountRow[]);
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (account: AccountRow, value: boolean) => {
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, lead_api_enabled: value } : a)));
    const { error } = await supabase
      .from("platform_accounts")
      .update({ lead_api_enabled: value })
      .eq("id", account.id);
    if (error) {
      toast.error("Einstellung konnte nicht gespeichert werden.");
      load();
    }
  };

  const check = async (account: AccountRow) => {
    setChecking(account.id);
    const { data, error } = await supabase.functions.invoke("lead-api-check", {
      body: { accountKey: account.account_key },
    });
    setChecking(null);
    if (error) {
      toast.error(`Prüfung fehlgeschlagen: ${error.message}`);
      return;
    }
    const result = (data as { results?: CheckResult[] })?.results?.[0];
    if (!result) {
      toast.error("Keine Antwort erhalten.");
      return;
    }
    setResults((prev) => ({ ...prev, [account.id]: result }));
    if (result.ok) toast.success(`${account.label}: Verbindung erfolgreich.`);
    else toast.error(`${account.label}: ${result.message}`);
  };

  if (accounts.length === 0) return null;

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <PlugZap className="h-4 w-4" /> Anfragen von Mobile.de
        </h2>
        <p className="text-sm text-muted-foreground">
          Die Lead-Schnittstelle muss von Mobile.de freigeschaltet werden. Sind keine eigenen Zugangsdaten
          hinterlegt, werden die Verkäufer-Zugangsdaten desselben Kontos verwendet.
        </p>
      </div>

      <div className="divide-y">
        {accounts.map((account) => {
          const result = results[account.id];
          return (
            <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{account.label}</span>
                  <Badge variant="outline" className="text-[10px]">
                    Verkäufer-Nr. {account.seller_id ?? "—"}
                  </Badge>
                  {!account.lead_username_secret_name && (
                    <Badge variant="secondary" className="text-[10px]">
                      nutzt Verkäufer-Zugangsdaten
                    </Badge>
                  )}
                </div>
                {result && (
                  <p
                    className={`mt-1 flex items-center gap-1.5 text-xs ${
                      result.ok ? "text-muted-foreground" : "text-destructive"
                    }`}
                  >
                    {result.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {result.message}
                  </p>
                )}
                {account.lead_cursor && (
                  <p className="mt-1 text-xs text-muted-foreground">Abruf läuft — Historie bereits geladen.</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={account.lead_api_enabled}
                    onCheckedChange={(v) => toggle(account, v)}
                    id={`lead-${account.id}`}
                  />
                  <label htmlFor={`lead-${account.id}`} className="text-sm text-muted-foreground">
                    Abruf aktiv
                  </label>
                </div>
                <Button variant="outline" size="sm" onClick={() => check(account)} disabled={checking === account.id}>
                  {checking === account.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verbindung prüfen
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
