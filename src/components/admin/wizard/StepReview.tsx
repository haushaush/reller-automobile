import { AlertCircle, Check, Loader2, Lock, Rocket, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { PlatformAccountRow } from "@/lib/listings";
import {
  type FormState, type RequiredField, REQUIRED_FIELDS, isFieldFilled,
  CATEGORY_LABELS, FUEL_LABELS, GEARBOX_LABELS, labelFor,
} from "@/lib/mobileAdForm";

interface Props {
  form: FormState;
  makeName: string;
  modelName: string;
  imagePaths: string[];
  previews: Record<string, string>;
  accounts: PlatformAccountRow[];
  accountKey: string;
  onAccountKey: (key: string) => void;
  manual: { autoscout24: boolean; kleinanzeigen: boolean };
  onManual: (patch: Partial<Props["manual"]>) => void;
  saving: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  onJump: (field: RequiredField) => void;
}

export default function StepReview({
  form, makeName, modelName, imagePaths, previews, accounts,
  accountKey, onAccountKey, manual, onManual, saving, onSaveDraft, onPublish, onJump,
}: Props) {
  const mobileAccounts = accounts.filter((a) => a.platform === "mobile_de" && a.is_active);
  const checklist: { item: RequiredField; ok: boolean }[] = REQUIRED_FIELDS.map((r) => ({
    item: r,
    ok: isFieldFilled(form, r.field),
  }));
  const photosOk = imagePaths.length > 0;
  const missing = checklist.filter((c) => !c.ok).map((c) => c.item.label);
  if (!photosOk) missing.unshift("Fotos");
  const canPublish = missing.length === 0;

  const price = Number(String(form.consumerPriceGross || "").replace(/[^0-9]/g, ""));
  const title = [makeName, modelName, form.modelDescription].filter(Boolean).join(" ").trim();
  const facts = [
    form.regMonth && form.regYear ? `EZ ${form.regMonth}/${form.regYear}` : null,
    form.mileage ? `${Number(form.mileage).toLocaleString("de-DE")} km` : null,
    form.fuel ? labelFor(FUEL_LABELS, form.fuel, form.fuel) : null,
    form.gearbox ? labelFor(GEARBOX_LABELS, form.gearbox, form.gearbox) : null,
    form.power ? `${form.power} kW` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-5">
        <h2 className="text-lg font-medium">Wo soll das Fahrzeug erscheinen?</h2>

        <div className="space-y-2">
          <Label>Mobile.de — Konto</Label>
          <Select value={accountKey} onValueChange={onAccountKey}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Konto wählen" />
            </SelectTrigger>
            <SelectContent>
              {mobileAccounts.map((a) => (
                <SelectItem key={a.account_key} value={a.account_key}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            Nach dem Veröffentlichen kann das Konto nicht mehr gewechselt werden.
          </p>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="pf-as24"
              checked={manual.autoscout24}
              onCheckedChange={(c) => onManual({ autoscout24: c === true })}
            />
            <Label htmlFor="pf-as24" className="font-normal cursor-pointer">
              AutoScout24
              <span className="block text-sm text-muted-foreground">
                Wird als „Nicht inseriert“ angelegt. Das Inserat müssen Sie dort von Hand erstellen —
                wir legen dafür eine Aufgabe unter „Zu erledigen“ an.
              </span>
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="pf-ka"
              checked={manual.kleinanzeigen}
              onCheckedChange={(c) => onManual({ kleinanzeigen: c === true })}
            />
            <Label htmlFor="pf-ka" className="font-normal cursor-pointer">
              Kleinanzeigen
              <span className="block text-sm text-muted-foreground">
                Wird als „Nicht inseriert“ angelegt. Das Inserat müssen Sie dort von Hand erstellen —
                wir legen dafür eine Aufgabe unter „Zu erledigen“ an.
              </span>
            </Label>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-3">
          <h2 className="text-lg font-medium">Pflichtangaben</h2>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center gap-2">
              {photosOk ? <Check className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-destructive" />}
              {photosOk ? (
                <span>Fotos ({imagePaths.length})</span>
              ) : (
                <button
                  type="button"
                  className="text-destructive underline underline-offset-2"
                  onClick={() => onJump({ field: "vin", label: "Fotos", section: "fotos" })}
                >
                  Fotos fehlen — jetzt hochladen
                </button>
              )}
            </li>
            {checklist.map(({ item, ok }) => (
              <li key={item.label} className="flex items-center gap-2">
                {ok ? <Check className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-destructive" />}
                {ok ? (
                  <span>{item.label}</span>
                ) : (
                  <button
                    type="button"
                    className="text-destructive underline underline-offset-2"
                    onClick={() => onJump(item)}
                  >
                    {item.label} fehlt — jetzt ergänzen
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6 space-y-3">
          <h2 className="text-lg font-medium">So sieht die Fahrzeugkarte aus</h2>
          <div className="rounded-lg border overflow-hidden max-w-sm">
            <div className="aspect-[4/3] bg-muted">
              {imagePaths[0] && previews[imagePaths[0]] ? (
                <img src={previews[imagePaths[0]]} alt={title || "Fahrzeug"} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                  Kein Foto
                </div>
              )}
            </div>
            <div className="p-4 space-y-1">
              <div className="font-medium">{title || "Unbenanntes Fahrzeug"}</div>
              <div className="text-sm text-muted-foreground">{facts.join(" · ") || "Noch keine Eckdaten"}</div>
              <div className="pt-1 flex items-center justify-between">
                <span className="text-lg font-semibold">
                  {price > 0 ? `${price.toLocaleString("de-DE")} €` : "Preis offen"}
                </span>
                {form.category && (
                  <Badge variant="outline">{labelFor(CATEGORY_LABELS, form.category, form.category)}</Badge>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6 space-y-3">
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={onSaveDraft} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Als Entwurf speichern
          </Button>
          <Button type="button" onClick={onPublish} disabled={saving || !canPublish}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Jetzt veröffentlichen
          </Button>
        </div>
        {!canPublish && (
          <p className="text-sm text-destructive">
            Zum Veröffentlichen fehlt noch: {missing.join(", ")}.
          </p>
        )}
      </Card>
    </div>
  );
}
