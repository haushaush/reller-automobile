import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Save, ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type AnyObj = Record<string, unknown>;

const FEATURE_KEYS: { key: string; label: string }[] = [
  { key: "alloyWheels", label: "Leichtmetallfelgen" },
  { key: "navigationSystem", label: "Navigationssystem" },
  { key: "bluetooth", label: "Bluetooth" },
  { key: "carplay", label: "Apple CarPlay" },
  { key: "androidAuto", label: "Android Auto" },
  { key: "electricWindows", label: "Elektrische Fensterheber" },
  { key: "centralLocking", label: "Zentralverriegelung" },
  { key: "isofix", label: "Isofix" },
  { key: "sunroof", label: "Schiebedach" },
  { key: "panoramicGlassRoof", label: "Panoramadach" },
  { key: "usb", label: "USB" },
  { key: "touchscreen", label: "Touchscreen" },
  { key: "soundSystem", label: "Soundsystem" },
  { key: "summerTires", label: "Sommerreifen" },
  { key: "winterTires", label: "Winterreifen" },
  { key: "allSeasonTires", label: "Ganzjahresreifen" },
  { key: "tintedWindows", label: "Getönte Scheiben" },
  { key: "ambientLighting", label: "Ambientebeleuchtung" },
  { key: "electricExteriorMirrors", label: "Elektr. Außenspiegel" },
  { key: "electricAdjustableSeats", label: "Elektr. Sitzverstellung" },
  { key: "powerSteering", label: "Servolenkung" },
  { key: "hillStartAssist", label: "Berganfahrassistent" },
  { key: "onBoardComputer", label: "Bordcomputer" },
  { key: "handsFreePhoneSystem", label: "Freisprecheinrichtung" },
  { key: "roofRack", label: "Dachreling" },
  { key: "winterPackage", label: "Winterpaket" },
  { key: "multifunctionalSteeringWheel", label: "Multifunktionslenkrad" },
  { key: "abs", label: "ABS" },
  { key: "esp", label: "ESP" },
  { key: "immobilizer", label: "Wegfahrsperre" },
  { key: "fatigueWarningSystem", label: "Müdigkeitswarnsystem" },
  { key: "emergencyBrakeAssistant", label: "Notbremsassistent" },
  { key: "rainSensor", label: "Regensensor" },
  { key: "tirePressureMonitoring", label: "Reifendruckkontrolle" },
  { key: "laneDepartureWarning", label: "Spurhalteassistent" },
  { key: "startStopSystem", label: "Start-Stopp-System" },
  { key: "trafficSignRecognition", label: "Verkehrszeichenerkennung" },
  { key: "warranty", label: "Garantie" },
  { key: "nonSmokerVehicle", label: "Nichtraucherfahrzeug" },
  { key: "fullServiceHistory", label: "Scheckheftgepflegt" },
  { key: "huNew", label: "HU neu" },
  { key: "inspectionNew", label: "Inspektion neu" },
];

function getKey(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as { key?: unknown }).key === "string") return (v as { key: string }).key;
  return "";
}
function asNum(v: unknown): string {
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return "";
}

interface FormState {
  make: string; model: string; modelDescription: string; category: string;
  mileage: string; firstRegistration: string; fuel: string; gearbox: string;
  power: string; cubicCapacity: string; condition: string;
  damageUnrepaired: boolean; accidentDamaged: boolean;
  consumerPriceGross: string; vatRate: string;
  description: string;
  exteriorColor: string; manufacturerColorName: string; metallic: boolean;
  doors: string; seats: string; numberOfPreviousOwners: string;
  nonSmokerVehicle: boolean; fullServiceHistory: boolean; warranty: boolean; huNew: boolean;
  features: Record<string, boolean>;
}

const emptyForm: FormState = {
  make: "", model: "", modelDescription: "", category: "",
  mileage: "", firstRegistration: "", fuel: "", gearbox: "",
  power: "", cubicCapacity: "", condition: "USED",
  damageUnrepaired: false, accidentDamaged: false,
  consumerPriceGross: "", vatRate: "19.00",
  description: "",
  exteriorColor: "", manufacturerColorName: "", metallic: false,
  doors: "", seats: "", numberOfPreviousOwners: "",
  nonSmokerVehicle: false, fullServiceHistory: false, warranty: false, huNew: false,
  features: {},
};

function mobileAdToForm(mobileAd: AnyObj | null, draftPayload: AnyObj | null): FormState {
  const m = (mobileAd ?? {}) as AnyObj;
  const d = (draftPayload ?? {}) as AnyObj;
  const veh = (d.vehicle ?? {}) as AnyObj;
  const pick = (...c: unknown[]) => { for (const x of c) if (x !== undefined && x !== null && x !== "") return x; return undefined; };

  const priceM = (m.price ?? {}) as AnyObj;
  const priceD = (d.price ?? {}) as AnyObj;
  const featObj = (m.features && typeof m.features === "object") ? (m.features as AnyObj) : {};

  const features: Record<string, boolean> = {};
  for (const f of FEATURE_KEYS) {
    features[f.key] = (m as AnyObj)[f.key] === true || featObj[f.key] === true;
  }

  return {
    make: getKey(pick(m.make, d.make, veh.make)),
    model: getKey(pick(m.model, d.model, veh.model)),
    modelDescription: String(pick(m.modelDescription, d.modelDescription, veh["model-description"], veh.modelDescription) ?? ""),
    category: getKey(pick(m.category, d.category, veh.category)),
    mileage: asNum(pick(m.mileage, d.mileage, veh.mileage)),
    firstRegistration: String(pick(m.firstRegistration, d.firstRegistration, veh["first-registration"], veh.firstRegistration) ?? ""),
    fuel: getKey(pick(m.fuel, d.fuel, veh.fuel)),
    gearbox: getKey(pick(m.gearbox, d.gearbox, veh.gearbox)),
    power: asNum(pick(m.power, d.power, veh.power)),
    cubicCapacity: asNum(pick(m.cubicCapacity, d.cubicCapacity, veh["cubic-capacity"], veh.cubicCapacity)),
    condition: String(pick(m.condition, d.condition, veh.condition) ?? "USED"),
    damageUnrepaired: pick(m.damageUnrepaired, d.damageUnrepaired, veh["damage-unrepaired"]) === true,
    accidentDamaged: pick(m.accidentDamaged, d.accidentDamaged) === true,
    consumerPriceGross: normalizePriceInput(pick(priceM.consumerPriceGross, priceD.consumerPriceGross, priceD["consumer-price-gross"], (priceM as AnyObj).consumerValue)),
    vatRate: String(pick(priceM.vatRate, priceD.vatRate, priceD["vat-rate"]) ?? "19.00"),
    description: String(pick(m.description, d.description, veh.description) ?? ""),
    exteriorColor: getKey(pick(m.exteriorColor, d.exteriorColor)),
    manufacturerColorName: String(pick(m.manufacturerColorName, d.manufacturerColorName) ?? ""),
    metallic: pick(m.metallic, d.metallic) === true,
    doors: getKey(pick(m.doors, d.doors)),
    seats: asNum(pick(m.seats, d.seats)),
    numberOfPreviousOwners: asNum(pick(m.numberOfPreviousOwners, d.numberOfPreviousOwners)),
    nonSmokerVehicle: pick(m.nonSmokerVehicle, d.nonSmokerVehicle) === true,
    fullServiceHistory: pick(m.fullServiceHistory, d.fullServiceHistory) === true,
    warranty: pick(m.warranty, d.warranty) === true,
    huNew: pick(m.huNew, d.huNew) === true,
    features,
  };
}

function formToPayload(f: FormState): AnyObj {
  const out: AnyObj = {
    make: f.make || undefined,
    model: f.model || undefined,
    modelDescription: f.modelDescription || undefined,
    category: f.category || undefined,
    mileage: f.mileage !== "" ? Number(f.mileage) : undefined,
    firstRegistration: f.firstRegistration || undefined,
    fuel: f.fuel || undefined,
    gearbox: f.gearbox || undefined,
    power: f.power !== "" ? Number(f.power) : undefined,
    cubicCapacity: f.cubicCapacity !== "" ? Number(f.cubicCapacity) : undefined,
    condition: f.condition || "USED",
    damageUnrepaired: f.damageUnrepaired,
    accidentDamaged: f.accidentDamaged,
    description: f.description || undefined,
    exteriorColor: f.exteriorColor || undefined,
    manufacturerColorName: f.manufacturerColorName || undefined,
    metallic: f.metallic || undefined,
    doors: f.doors || undefined,
    seats: f.seats !== "" ? Number(f.seats) : undefined,
    numberOfPreviousOwners: f.numberOfPreviousOwners !== "" ? Number(f.numberOfPreviousOwners) : undefined,
    nonSmokerVehicle: f.nonSmokerVehicle || undefined,
    fullServiceHistory: f.fullServiceHistory || undefined,
    warranty: f.warranty || undefined,
    huNew: f.huNew || undefined,
    price: {
      consumerPriceGross: String(f.consumerPriceGross || "").replace(/[^0-9]/g, ""),
      currency: "EUR",
      vatRate: f.vatRate || "19.00",
      type: "FIXED",
    },
    features: f.features,
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

const REQUIRED = ["make","model","modelDescription","category","mileage","firstRegistration","fuel","gearbox","power","cubicCapacity","condition"] as const;

export default function MobileAdEditLive() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mobileAdId, setMobileAdId] = useState<string | null>(null);
  const [mobileAd, setMobileAd] = useState<AnyObj | null>(null);
  const [imageCount, setImageCount] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draftId) return;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.functions.invoke("get-mobile-ad", { body: { draftId } });
      if (error || !(data as { success?: boolean })?.success) {
        const msg = (data as { error?: string } | null)?.error || error?.message || "Laden fehlgeschlagen";
        setError(msg);
        toast.error(msg);
        setLoading(false);
        return;
      }
      const d = data as { draft: AnyObj; mobileAd: AnyObj | null };
      const ad = d.mobileAd;
      setMobileAd(ad);
      setMobileAdId(String((d.draft as { mobile_ad_id?: string }).mobile_ad_id ?? ""));
      const imgs = ad && Array.isArray((ad as AnyObj).images) ? ((ad as AnyObj).images as unknown[]).length : 0;
      setImageCount(imgs);
      setForm(mobileAdToForm(ad, (d.draft as { payload?: AnyObj }).payload ?? null));
      setLoading(false);
    })();
  }, [draftId]);

  const payload = useMemo(() => formToPayload(form), [form]);
  const missing = REQUIRED.filter((k) => {
    const v = (payload as AnyObj)[k];
    return v === undefined || v === null || v === "";
  }) as string[];
  if (!payload.price || !(payload.price as AnyObj).consumerPriceGross) missing.push("price.consumerPriceGross");
  if (form.firstRegistration && !/^\d{6}$/.test(form.firstRegistration)) missing.push("firstRegistration (YYYYMM)");

  const changedKeys = useMemo(() => {
    if (!mobileAd) return [] as string[];
    const out: string[] = [];
    for (const k of Object.keys(payload)) {
      if (JSON.stringify((mobileAd as AnyObj)[k]) !== JSON.stringify((payload as AnyObj)[k])) out.push(k);
    }
    return out;
  }, [payload, mobileAd]);

  const [lastError, setLastError] = useState<{ msg: string; details?: string } | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const submit = async () => {
    if (!draftId) return;
    if (missing.length) {
      toast.error(`Pflichtfelder fehlen: ${missing.join(", ")}`);
      return;
    }
    setSaving(true);
    setLastError(null);
    try {
      const { data, error } = await supabase.functions.invoke("update-mobile-ad", {
        body: { draftId, mobileAdId, formPayload: payload },
      });
      const d = (data ?? null) as { success?: boolean; error?: string; details?: unknown } | null;
      if (error || !d?.success) {
        const raw = d?.error || error?.message || "Update fehlgeschlagen";
        const isPriceErr = /price|consumer-?price|consumerValue|consumer-price-not-in-range/i.test(
          raw + " " + JSON.stringify(d?.details ?? "")
        );
        const msg = isPriceErr
          ? "Mobile.de hat das Update abgelehnt: Preis prüfen."
          : `Mobile.de hat das Update abgelehnt: ${raw}`;
        const details = typeof d?.details === "string" ? d.details : JSON.stringify(d?.details ?? raw, null, 2);
        setLastError({ msg, details });
        toast.error(msg);
      } else {
        toast.success("Inserat wurde live bei Mobile.de aktualisiert.");
        navigate("/admin/mobile-ad");
      }
    } catch (e) {
      const msg = (e as Error)?.message || "Unbekannter Fehler beim Update";
      setLastError({ msg });
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }));
  const toggleFeat = (k: string, v: boolean) => setForm((s) => ({ ...s, features: { ...s.features, [k]: v } }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Lade Live-Daten von Mobile.de…
      </div>
    );
  }
  if (error) {
    return (
      <Card className="p-6 space-y-3">
        <div className="text-destructive font-medium">{error}</div>
        <Button variant="outline" onClick={() => navigate("/admin/mobile-ad")}>
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Live-Bearbeitung</h1>
          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span>Mobile.de ID: <span className="font-mono">{mobileAdId}</span></span>
            <span>·</span>
            <Badge variant="default">published</Badge>
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate("/admin/mobile-ad")}>
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Button>
      </div>

      <Card className="p-4 bg-muted/30 text-sm">
        Bilder bleiben bei dieser Live-Bearbeitung unverändert.
        {imageCount > 0 && <> Aktuell {imageCount} Bild(er) bei Mobile.de.</>}
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">Fahrzeugdaten</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Marke (key)" v={form.make} on={(v) => upd("make", v)} />
          <Field label="Modell (key)" v={form.model} on={(v) => upd("model", v)} />
          <Field label="Modellbeschreibung" v={form.modelDescription} on={(v) => upd("modelDescription", v)} full />
          <Field label="Kategorie (key)" v={form.category} on={(v) => upd("category", v)} />
          <Field label="Kilometerstand" v={form.mileage} on={(v) => upd("mileage", v)} type="number" />
          <Field label="Erstzulassung (YYYYMM)" v={form.firstRegistration} on={(v) => upd("firstRegistration", v)} placeholder="z.B. 202105" />
          <Field label="Kraftstoff (key)" v={form.fuel} on={(v) => upd("fuel", v)} />
          <Field label="Getriebe (key)" v={form.gearbox} on={(v) => upd("gearbox", v)} />
          <Field label="Leistung (kW)" v={form.power} on={(v) => upd("power", v)} type="number" />
          <Field label="Hubraum (cm³)" v={form.cubicCapacity} on={(v) => upd("cubicCapacity", v)} type="number" />
          <Field label="Zustand" v={form.condition} on={(v) => upd("condition", v)} placeholder="USED / NEW" />
          <Field label="Türen (key)" v={form.doors} on={(v) => upd("doors", v)} placeholder="z.B. FOUR_OR_FIVE" />
          <Field label="Sitze" v={form.seats} on={(v) => upd("seats", v)} type="number" />
          <Field label="Vorbesitzer" v={form.numberOfPreviousOwners} on={(v) => upd("numberOfPreviousOwners", v)} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Bool label="Unrepariertes Schaden" v={form.damageUnrepaired} on={(v) => upd("damageUnrepaired", v)} />
          <Bool label="Unfallfahrzeug" v={form.accidentDamaged} on={(v) => upd("accidentDamaged", v)} />
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">Farbe</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Außenfarbe (key)" v={form.exteriorColor} on={(v) => upd("exteriorColor", v)} />
          <Field label="Herstellerfarbe (Text)" v={form.manufacturerColorName} on={(v) => upd("manufacturerColorName", v)} />
        </div>
        <Bool label="Metallic" v={form.metallic} on={(v) => upd("metallic", v)} />
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">Preis</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Preis brutto (nur Ziffern)" v={form.consumerPriceGross} on={(v) => upd("consumerPriceGross", v.replace(/[^0-9]/g, ""))} />
          <Field label="MwSt-Satz" v={form.vatRate} on={(v) => upd("vatRate", v)} placeholder="19.00 / OTHER" />
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">Beschreibung</h2>
        <Textarea rows={10} value={form.description} onChange={(e) => upd("description", e.target.value)} />
        <p className="text-xs text-muted-foreground">Test-Inserate müssen „NICHT KAUFEN“ enthalten.</p>
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">Historie</h2>
        <div className="grid grid-cols-2 gap-2">
          <Bool label="Nichtraucher" v={form.nonSmokerVehicle} on={(v) => upd("nonSmokerVehicle", v)} />
          <Bool label="Scheckheft" v={form.fullServiceHistory} on={(v) => upd("fullServiceHistory", v)} />
          <Bool label="Garantie" v={form.warranty} on={(v) => upd("warranty", v)} />
          <Bool label="HU neu" v={form.huNew} on={(v) => upd("huNew", v)} />
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">Ausstattung</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FEATURE_KEYS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <Checkbox checked={!!form.features[f.key]} onCheckedChange={(v) => toggleFeat(f.key, !!v)} />
              {f.label}
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <button
          type="button"
          onClick={() => setShowPreview((s) => !s)}
          className="flex items-center gap-2 font-semibold"
        >
          {showPreview ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Mobile.de Update-Payload Vorschau
        </button>
        {showPreview && (
          <div className="text-xs space-y-2">
            <div>
              <strong>Root-Keys:</strong> {Object.keys(payload).join(", ")}
            </div>
            <div>
              <strong>Pflichtfelder fehlend:</strong>{" "}
              {missing.length ? <span className="text-destructive">{missing.join(", ")}</span> : <span className="text-green-700">keine</span>}
            </div>
            <div>
              <strong>Geänderte Felder vs. Live:</strong>{" "}
              {changedKeys.length ? changedKeys.join(", ") : "keine"}
            </div>
            <div className="text-muted-foreground">Bilder werden unverändert übernommen.</div>
            <pre className="bg-muted/40 p-2 rounded overflow-x-auto max-h-72">{JSON.stringify(payload, null, 2)}</pre>
          </div>
        )}
      </Card>

      {lastError && (
        <Card className="p-4 border-destructive/50 bg-destructive/5 space-y-2">
          <div className="text-destructive font-medium text-sm">{lastError.msg}</div>
          {lastError.details && (
            <>
              <button
                type="button"
                onClick={() => setShowErrorDetails((s) => !s)}
                className="text-xs underline text-muted-foreground"
              >
                {showErrorDetails ? "Details ausblenden" : "Details anzeigen"}
              </button>
              {showErrorDetails && (
                <pre className="bg-muted/40 p-2 rounded overflow-x-auto max-h-60 text-xs">
                  {lastError.details}
                </pre>
              )}
            </>
          )}
        </Card>
      )}

      <div className="flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={saving || missing.length > 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Live aktualisieren
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Änderungen live bei Mobile.de speichern?</AlertDialogTitle>
              <AlertDialogDescription>
                Diese Änderung wird direkt im veröffentlichten Mobile.de-Inserat sichtbar. Bitte vorher prüfen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={submit}>Ja, live aktualisieren</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function Field({ label, v, on, type = "text", placeholder, full }: {
  label: string; v: string; on: (v: string) => void;
  type?: string; placeholder?: string; full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2 space-y-1" : "space-y-1"}>
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={v} placeholder={placeholder} onChange={(e) => on(e.target.value)} />
    </div>
  );
}

function Bool({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={v} onCheckedChange={(x) => on(!!x)} />
      {label}
    </label>
  );
}
