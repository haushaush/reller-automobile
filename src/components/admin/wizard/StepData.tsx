import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import type { MobileRefdata } from "@/hooks/useMobileRefdata";
import {
  type FormState,
  CATEGORY_LABELS,
  FUEL_LABELS,
  GEARBOX_LABELS,
  DOORS_OPTIONS,
  COMFORT_FEATURES,
  SAFETY_FEATURES,
  REQUIRED_FIELDS,
  isFieldFilled,
  labelFor,
  PORTAL_VEHICLE_CATEGORIES,
} from "@/lib/mobileAdForm";

export type SectionId = "basis" | "technik" | "ausstattung" | "preis";

interface Props {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  refdata: MobileRefdata;
  /** Abschnitt, der beim Öffnen aufgeklappt sein soll */
  focusSection?: SectionId | null;
}

const req = (label: string) => (
  <>
    {label} <span className="text-destructive">*</span>
  </>
);

export default function StepData({ form, onChange, refdata, focusSection }: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState<SectionId[]>(
    focusSection ? [focusSection] : ["basis"],
  );

  const toggle = (id: SectionId) => {
    setOpen((cur) => {
      const isOpen = cur.includes(id);
      if (isMobile) return isOpen ? [] : [id];
      return isOpen ? cur.filter((x) => x !== id) : [...cur, id];
    });
  };

  const missingPerSection = useMemo(() => {
    const map: Record<string, number> = { basis: 0, technik: 0, ausstattung: 0, preis: 0 };
    for (const r of REQUIRED_FIELDS) {
      if (r.section === "fotos") continue;
      if (!isFieldFilled(form, r.field)) map[r.section] = (map[r.section] ?? 0) + 1;
    }
    return map;
  }, [form]);

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")),
    [],
  );
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 40 }, (_, i) => String(now - i));
  }, []);

  const section = (id: SectionId, title: string, children: ReactNode) => {
    const isOpen = open.includes(id);
    const missing = missingPerSection[id] ?? 0;
    return (
      <Card key={id}>
        <button
          type="button"
          onClick={() => toggle(id)}
          className="w-full flex items-center justify-between gap-3 p-4 text-left"
          aria-expanded={isOpen}
        >
          <span className="font-medium">{title}</span>
          <span className="flex items-center gap-2">
            {missing > 0 ? (
              <Badge variant="destructive">
                {missing} Pflichtangabe{missing === 1 ? "" : "n"} fehlt
              </Badge>
            ) : id === "ausstattung" ? (
              <Badge variant="outline">freiwillig</Badge>
            ) : (
              <Badge variant="outline">vollständig</Badge>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </span>
        </button>
        {isOpen && <div className="px-4 pb-6 space-y-4 border-t pt-4">{children}</div>}
      </Card>
    );
  };

  const featureGrid = (items: { key: string; label: string }[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
      {items.map((f) => (
        <div key={f.key} className="flex items-center gap-2">
          <Checkbox
            id={`w-${f.key}`}
            checked={!!form.features[f.key]}
            onCheckedChange={(c) =>
              onChange({ features: { ...form.features, [f.key]: c === true } })
            }
          />
          <Label htmlFor={`w-${f.key}`} className="cursor-pointer text-sm font-normal">
            {f.label}
          </Label>
        </div>
      ))}
    </div>
  );

  const [equipOpen, setEquipOpen] = useState<string[]>(["komfort"]);
  const toggleEquip = (id: string) =>
    setEquipOpen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const equipGroup = (id: string, title: string, items: { key: string; label: string }[]) => {
    const count = items.filter((i) => form.features[i.key]).length;
    const isOpen = equipOpen.includes(id);
    return (
      <div className="border rounded-md">
        <button
          type="button"
          onClick={() => toggleEquip(id)}
          className="w-full flex items-center justify-between p-3 text-left text-sm font-medium"
        >
          <span>{title}</span>
          <span className="flex items-center gap-2 text-muted-foreground font-normal">
            {count > 0 && <span>{count} ausgewählt</span>}
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </span>
        </button>
        {isOpen && <div className="p-3 pt-0">{featureGrid(items)}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {section("basis", "Basisdaten", (<>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{req("Marke")}</Label>
            <Select value={form.make} onValueChange={(v) => onChange({ make: v, model: "" })}>
              <SelectTrigger><SelectValue placeholder={refdata.loading ? "lädt…" : "Marke wählen"} /></SelectTrigger>
              <SelectContent className="max-h-72">
                {refdata.makes.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{req("Modell")}</Label>
            <Select value={form.model} onValueChange={(v) => onChange({ model: v })} disabled={!form.make}>
              <SelectTrigger>
                <SelectValue placeholder={!form.make ? "zuerst Marke wählen" : refdata.loadingModels ? "lädt…" : "Modell wählen"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {refdata.models.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{req("Modellbezeichnung")}</Label>
            <Input
              value={form.modelDescription}
              onChange={(e) => onChange({ modelDescription: e.target.value })}
              placeholder="z. B. 1.4 TSI Highline"
            />
          </div>
          <div className="space-y-2">
            <Label>Modellreihe</Label>
            <Input
              value={form.modelRange}
              onChange={(e) => onChange({ modelRange: e.target.value })}
              placeholder="z. B. Golf VII"
            />
            <p className="text-xs text-muted-foreground">
              Optional — Mobile.de weist sonst auf die fehlende Angabe hin.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Ausstattungslinie</Label>
            <Input
              value={form.trimLine}
              onChange={(e) => onChange({ trimLine: e.target.value })}
              placeholder="z. B. Highline"
            />
            <p className="text-xs text-muted-foreground">
              Optional — Mobile.de weist sonst auf die fehlende Angabe hin.
            </p>
          </div>
          <div className="space-y-2">
            <Label>{req("Fahrzeugart")}</Label>
            <Select value={form.portalCategory} onValueChange={(v) => onChange({ portalCategory: v })}>
              <SelectTrigger><SelectValue placeholder="Fahrzeugart wählen" /></SelectTrigger>
              <SelectContent>
                {PORTAL_VEHICLE_CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Steuert Filter und Kategorieseiten im Portal sowie die Vorauswahl des Mobile.de-Kontos.
            </p>
          </div>
          <div className="space-y-2">
            <Label>{req("Karosserieform (Mobile.de)")}</Label>
            <Select value={form.category} onValueChange={(v) => onChange({ category: v })}>
              <SelectTrigger><SelectValue placeholder="Karosserieform wählen" /></SelectTrigger>
              <SelectContent>
                {refdata.categories.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{labelFor(CATEGORY_LABELS, c.key, c.name)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{req("Erstzulassung")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={form.regMonth} onValueChange={(v) => onChange({ regMonth: v })}>
                <SelectTrigger><SelectValue placeholder="Monat" /></SelectTrigger>
                <SelectContent>
                  {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <YearCombobox value={form.regYear} onChange={(v) => onChange({ regYear: v })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Baujahr</Label>
            <YearCombobox
              value={form.constructionYear}
              onChange={(v) => onChange({ constructionYear: v })}
              placeholder="optional"
            />
            <p className="text-xs text-muted-foreground">
              Nur ausfüllen, wenn das Baujahr von der Erstzulassung abweicht (häufig bei Oldtimern).
            </p>
          </div>
          <div className="space-y-2">
            <Label>{req("Kilometerstand")}</Label>
            <Input
              inputMode="numeric"
              value={form.mileage}
              onChange={(e) => onChange({ mileage: e.target.value.replace(/[^0-9]/g, "") })}
              placeholder="z. B. 85000"
            />
          </div>
          <div className="space-y-2">
            <Label>{req("Zustand")}</Label>
            <Select value={form.condition} onValueChange={(v) => onChange({ condition: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USED">Gebrauchtfahrzeug</SelectItem>
                <SelectItem value="NEW">Neufahrzeug</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{req("Unfallschaden")}</Label>
            <Select
              value={accidentStateOf(form)}
              onValueChange={(v) => onChange(accidentStatePatch(v as AccidentState))}
            >
              <SelectTrigger><SelectValue placeholder="bitte wählen" /></SelectTrigger>
              <SelectContent>
                {ACCIDENT_STATE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{req("Fahrbereit")}</Label>
            <Select
              value={form.roadworthy}
              onValueChange={(v) => onChange({ roadworthy: v as FormState["roadworthy"] })}
            >
              <SelectTrigger><SelectValue placeholder="bitte wählen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Ja, fahrbereit</SelectItem>
                <SelectItem value="false">Nein, nicht fahrbereit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Interne Nummer</Label>
            <Input value={form.internalNumber} onChange={(e) => onChange({ internalNumber: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Fahrzeug-Identifikationsnummer</Label>
            <Input
              value={form.vin}
              onChange={(e) => onChange({ vin: e.target.value.toUpperCase() })}
              className="font-mono"
              maxLength={17}
            />
          </div>
        </div>
      </>))}

      {section("technik", "Technik", (<>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{req("Kraftstoff")}</Label>
            <Select value={form.fuel} onValueChange={(v) => onChange({ fuel: v })}>
              <SelectTrigger><SelectValue placeholder="Kraftstoff wählen" /></SelectTrigger>
              <SelectContent>
                {refdata.fuels.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{labelFor(FUEL_LABELS, f.key, f.name)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{req("Getriebe")}</Label>
            <Select value={form.gearbox} onValueChange={(v) => onChange({ gearbox: v })}>
              <SelectTrigger><SelectValue placeholder="Getriebe wählen" /></SelectTrigger>
              <SelectContent>
                {refdata.gearboxes.map((g) => (
                  <SelectItem key={g.key} value={g.key}>{labelFor(GEARBOX_LABELS, g.key, g.name)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{req("Leistung (kW)")}</Label>
            <Input
              inputMode="numeric"
              value={form.power}
              onChange={(e) => onChange({ power: e.target.value.replace(/[^0-9]/g, "") })}
              placeholder="z. B. 110"
            />
          </div>
          <div className="space-y-2">
            <Label>{req("Hubraum (ccm)")}</Label>
            <Input
              inputMode="numeric"
              value={form.cubicCapacity}
              onChange={(e) => onChange({ cubicCapacity: e.target.value.replace(/[^0-9]/g, "") })}
              placeholder="z. B. 1395"
            />
          </div>
          <div className="space-y-2">
            <Label>Türen</Label>
            <Select value={form.doors} onValueChange={(v) => onChange({ doors: v })}>
              <SelectTrigger><SelectValue placeholder="Türen wählen" /></SelectTrigger>
              <SelectContent>
                {DOORS_OPTIONS.map((d) => (
                  <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sitzplätze</Label>
            <Input
              inputMode="numeric"
              value={form.seats}
              onChange={(e) => onChange({ seats: e.target.value.replace(/[^0-9]/g, "") })}
            />
          </div>
          <div className="space-y-2">
            <Label>Zylinder</Label>
            <Input
              inputMode="numeric"
              value={form.cylinders}
              onChange={(e) => onChange({ cylinders: e.target.value.replace(/[^0-9]/g, "") })}
            />
          </div>
          <div className="space-y-2">
            <Label>Antriebsart</Label>
            <Select value={form.driveType} onValueChange={(v) => onChange({ driveType: v })}>
              <SelectTrigger><SelectValue placeholder="Antrieb wählen" /></SelectTrigger>
              <SelectContent>
                {refdata.driveTypes.map((d) => (
                  <SelectItem key={d.key} value={d.key}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Außenfarbe</Label>
            <Select value={form.exteriorColor} onValueChange={(v) => onChange({ exteriorColor: v })}>
              <SelectTrigger><SelectValue placeholder="Farbe wählen" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {refdata.exteriorColors.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Farbbezeichnung des Herstellers</Label>
            <Input
              value={form.manufacturerColorName}
              onChange={(e) => onChange({ manufacturerColorName: e.target.value })}
              placeholder="z. B. Tornadorot"
            />
          </div>
          <div className="flex items-center gap-6 md:col-span-2">
            <div className="flex items-center gap-2">
              <Checkbox id="w-metallic" checked={form.metallic} onCheckedChange={(c) => onChange({ metallic: c === true })} />
              <Label htmlFor="w-metallic" className="font-normal cursor-pointer">Metallic-Lackierung</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="w-matt" checked={form.matt} onCheckedChange={(c) => onChange({ matt: c === true })} />
              <Label htmlFor="w-matt" className="font-normal cursor-pointer">Matt-Lackierung</Label>
            </div>
          </div>
        </div>
      </>))}

      {section("ausstattung", "Ausstattung", (<>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Klimatisierung</Label>
            <Select value={form.climatisation} onValueChange={(v) => onChange({ climatisation: v })}>
              <SelectTrigger><SelectValue placeholder="Klimatisierung wählen" /></SelectTrigger>
              <SelectContent>
                {refdata.climatisations.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          {equipGroup("komfort", "Komfort und Multimedia", COMFORT_FEATURES)}
          {equipGroup("sicherheit", "Sicherheit und Assistenz", SAFETY_FEATURES)}
        </div>
      </>))}

      {section("preis", "Preis und Beschreibung", (<>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{req("Preis (Brutto, EUR)")}</Label>
            <Input
              inputMode="numeric"
              value={form.consumerPriceGross}
              onChange={(e) => onChange({ consumerPriceGross: e.target.value.replace(/[^0-9]/g, "") })}
              placeholder="z. B. 12900"
            />
            {(() => {
              const p = Number(form.consumerPriceGross || 0);
              if (!p) return null;
              if (p < 500) return <p className="text-xs text-amber-600 dark:text-amber-400">Der Preis wirkt sehr niedrig — bitte prüfen.</p>;
              if (p > 500000) return <p className="text-xs text-amber-600 dark:text-amber-400">Der Preis wirkt sehr hoch — bitte prüfen.</p>;
              return null;
            })()}
          </div>
          <div className="space-y-2">
            <Label>{req("Mehrwertsteuer")}</Label>
            <Select value={form.vatRate} onValueChange={(v) => onChange({ vatRate: v })}>
              <SelectTrigger><SelectValue placeholder="bitte wählen" /></SelectTrigger>
              <SelectContent>
                {refdata.vatRates.map((v) => (
                  <SelectItem key={v.key} value={v.key}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Beschreibung</Label>
          <Textarea
            rows={8}
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Beschreiben Sie Zustand, Ausstattung und Besonderheiten des Fahrzeugs."
          />
        </div>
      </>))}

      <p className="text-sm text-muted-foreground">
        <span className="text-destructive">*</span> Pflichtangabe für Mobile.de
      </p>
    </div>
  );
}
