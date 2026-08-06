import { Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ALL_FEATURES,
  COMFORT_FEATURES,
  SAFETY_FEATURES,
  CATEGORY_LABELS,
  DOORS_OPTIONS,
  EXTERIOR_COLOR_FALLBACK,
  FUEL_LABELS,
  GEARBOX_LABELS,
  labelFor,
  type FormState,
  type RequiredField,
} from "@/lib/mobileAdForm";
import {
  PLATFORM_LABELS,
  accountShortLabel,
  findAccount,
  isPlatformConnected,
  type PlatformAccountRow,
} from "@/lib/listings";

/**
 * Vollständige Vorschau des Inserats, so wie es veröffentlicht wird.
 * Leere Felder werden bewusst als „keine Angabe“ ausgegeben — nur so fällt
 * beim Prüfen auf, was noch fehlt.
 */

interface Props {
  form: FormState;
  makeName: string;
  modelName: string;
  imagePaths: string[];
  previews: Record<string, string>;
  accounts: PlatformAccountRow[];
  accountKey: string;
  manual: { autoscout24: boolean; kleinanzeigen: boolean };
  onJump: (field: RequiredField) => void;
}

const CONDITION_LABELS: Record<string, string> = {
  NEW: "Neufahrzeug",
  USED: "Gebrauchtfahrzeug",
  DEMONSTRATION: "Vorführfahrzeug",
  EMPLOYEES_CAR: "Jahreswagen",
  PRE_REGISTRATION: "Tageszulassung",
  CLASSIC: "Oldtimer",
};

const Empty = () => (
  <span className="text-muted-foreground/60 italic">keine Angabe</span>
);

function Section({
  title,
  section,
  label,
  onJump,
  children,
}: {
  title: string;
  section: RequiredField["section"];
  label: string;
  onJump: Props["onJump"];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => onJump({ field: "make", label, section })}
        >
          <Pencil className="h-3 w-3" /> Bearbeiten
        </button>
      </div>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={`rounded-md border px-3 py-2 ${empty ? "opacity-70" : ""}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{empty ? <Empty /> : value}</div>
    </div>
  );
}

export default function AdPreview({
  form,
  makeName,
  modelName,
  imagePaths,
  previews,
  accounts,
  accountKey,
  manual,
  onJump,
}: Props) {
  const title = [makeName, modelName].filter(Boolean).join(" ").trim();
  const price = Number(String(form.consumerPriceGross || "").replace(/[^0-9]/g, ""));
  const colorLabel = form.exteriorColor
    ? EXTERIOR_COLOR_FALLBACK.find((c) => c.key === form.exteriorColor)?.name ?? form.exteriorColor
    : "";
  const paintNotes = [
    form.metallic ? "Metallic" : null,
    form.matt ? "Matt-Lackierung" : null,
  ].filter(Boolean);

  const facts: { label: string; value: string }[] = [
    {
      label: "Erstzulassung",
      value: form.regYear ? `${form.regMonth ? `${form.regMonth}/` : ""}${form.regYear}` : "",
    },
    { label: "Kilometerstand", value: form.mileage ? `${Number(form.mileage).toLocaleString("de-DE")} km` : "" },
    { label: "Kraftstoff", value: form.fuel ? labelFor(FUEL_LABELS, form.fuel, form.fuel) : "" },
    { label: "Getriebe", value: form.gearbox ? labelFor(GEARBOX_LABELS, form.gearbox, form.gearbox) : "" },
    {
      label: "Leistung",
      value: form.power ? `${form.power} kW (${Math.round(Number(form.power) * 1.35962)} PS)` : "",
    },
    { label: "Hubraum", value: form.cubicCapacity ? `${Number(form.cubicCapacity).toLocaleString("de-DE")} cm³` : "" },
    { label: "Zylinder", value: form.cylinders },
    { label: "Türen", value: form.doors ? DOORS_OPTIONS.find((d) => d.key === form.doors)?.label ?? form.doors : "" },
    { label: "Sitzplätze", value: form.seats },
    { label: "Außenfarbe", value: [colorLabel, ...paintNotes].filter(Boolean).join(" · ") },
    { label: "Herstellerfarbe", value: form.manufacturerColorName },
    { label: "Zustand", value: form.condition ? CONDITION_LABELS[form.condition] ?? form.condition : "" },
    {
      label: "Vorbesitzer",
      value: form.numberOfPreviousOwners,
    },
  ];

  const featureGroups = [
    { title: "Komfort und Multimedia", items: COMFORT_FEATURES },
    { title: "Sicherheit und Assistenz", items: SAFETY_FEATURES },
  ];
  const anyFeature = ALL_FEATURES.some((f) => form.features[f.key]);

  const gallery = imagePaths.filter((p) => previews[p]);

  const platforms: { name: string; detail: string }[] = [
    {
      name: PLATFORM_LABELS.mobile_de,
      detail:
        accountShortLabel(accounts, accountKey) ??
        findAccount(accounts, "mobile_de", accountKey)?.label ??
        "Konto offen",
    },
  ];
  if (manual.autoscout24)
    platforms.push({
      name: PLATFORM_LABELS.autoscout24,
      detail: isPlatformConnected(accounts, "autoscout24") ? "Verbunden" : "Von Hand anzulegen",
    });
  if (manual.kleinanzeigen)
    platforms.push({
      name: PLATFORM_LABELS.kleinanzeigen,
      detail: isPlatformConnected(accounts, "kleinanzeigen") ? "Verbunden" : "Von Hand anzulegen",
    });

  return (
    <Card className="p-6 space-y-5">
      <h2 className="text-lg font-medium">So wird das Inserat veröffentlicht</h2>

      <Section title="Bilder" section="fotos" label="Fotos" onJump={onJump}>
        {gallery.length === 0 ? (
          <p className="text-sm">
            <Empty />
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {gallery.map((p, i) => (
              <div key={p} className="relative overflow-hidden rounded-md border">
                <img
                  src={previews[p]}
                  alt={`${title || "Fahrzeug"} Bild ${i + 1}`}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                {i === 0 && (
                  <Badge className="absolute left-1 top-1 text-[10px]" variant="secondary">
                    Titelbild
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Titel und Preis" section="basis" label="Basisdaten" onJump={onJump}>
        <div className="space-y-1">
          <p className="text-xl font-semibold">{title || <Empty />}</p>
          <p className="text-sm text-muted-foreground">{form.modelDescription || <Empty />}</p>
          <p className="pt-1 text-2xl font-semibold">
            {price > 0 ? `${price.toLocaleString("de-DE")} €` : <Empty />}
          </p>
          <p className="text-sm text-muted-foreground">
            {form.vatRate ? `inkl. ${form.vatRate} % MwSt., ausweisbar` : "MwSt.: "}
            {!form.vatRate && <Empty />}
          </p>
          {form.category && (
            <Badge variant="outline">{labelFor(CATEGORY_LABELS, form.category, form.category)}</Badge>
          )}
        </div>
      </Section>

      <Section title="Eckdaten" section="technik" label="Technik" onJump={onJump}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {facts.map((f) => (
            <Fact key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
      </Section>

      <Section title="Ausstattung" section="ausstattung" label="Ausstattung" onJump={onJump}>
        <p className="text-sm">
          Klimatisierung: {form.climatisation ? form.climatisation : <Empty />}
        </p>
        {!anyFeature ? (
          <p className="text-sm">
            <Empty />
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {featureGroups.map((g) => {
              const on = g.items.filter((f) => form.features[f.key]);
              return (
                <div key={g.title}>
                  <p className="text-xs font-medium text-muted-foreground">{g.title}</p>
                  {on.length === 0 ? (
                    <p className="text-sm">
                      <Empty />
                    </p>
                  ) : (
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {on.map((f) => (
                        <li key={f.key}>
                          <Badge variant="secondary" className="font-normal">
                            {f.label}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Beschreibung" section="preis" label="Beschreibung" onJump={onJump}>
        {form.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{form.description}</p>
        ) : (
          <p className="text-sm">
            <Empty />
          </p>
        )}
      </Section>

      <Section title="Zielplattformen" section="basis" label="Plattformen" onJump={onJump}>
        <ul className="flex flex-wrap gap-2">
          {platforms.map((p) => (
            <li key={p.name}>
              <Badge variant="outline" className="font-normal">
                {p.name} · {p.detail}
              </Badge>
            </li>
          ))}
        </ul>
      </Section>
    </Card>
  );
}
