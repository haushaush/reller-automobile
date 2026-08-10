import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CalendarDays, Car, Globe, Loader2, Mail, Phone, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_BUTTONS,
  TIME_SLOTS,
  contactName,
  normalizeButtons,
  resolvePhotoUrl,
  timeSlotLabel,
  trackCardEvent,
  type CardButton,
  type SalesContact,
} from "@/lib/salesCard";

interface VehicleHit {
  id: string;
  title: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function SalesCard() {
  const { slug = "" } = useParams();
  const [contact, setContact] = useState<SalesContact | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);
  const openedAt = useRef<number>(Date.now());

  // Formular
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("any");
  const [message, setMessage] = useState("");
  const [gdpr, setGdpr] = useState(false);
  const [website, setWebsite] = useState("");
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [vehicleHits, setVehicleHits] = useState<VehicleHit[]>([]);
  const [vehicle, setVehicle] = useState<VehicleHit | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const columns = "id, slug, first_name, last_name, role, phone, mobile, photo_url, buttons, is_active, sort_order";
      let { data } = await supabase
        .from("sales_contacts")
        .select(columns)
        .eq("slug", slug.toLowerCase())
        .maybeSingle();

      if (!data) {
        const { data: redirect } = await supabase
          .from("sales_contact_slug_redirects")
          .select("sales_contact_id")
          .eq("old_slug", slug.toLowerCase())
          .maybeSingle();
        if (redirect) {
          const { data: viaRedirect } = await supabase
            .from("sales_contacts")
            .select(columns)
            .eq("id", redirect.sales_contact_id)
            .maybeSingle();
          data = viaRedirect;
        }
      }

      if (!active) return;
      if (!data) {
        setContact(null);
        setLoading(false);
        return;
      }
      const parsed: SalesContact = {
        ...(data as unknown as SalesContact),
        buttons: normalizeButtons((data as { buttons: unknown }).buttons),
      };
      setContact(parsed);
      setLoading(false);
      resolvePhotoUrl(parsed.photo_url).then((url) => active && setPhoto(url));
      void trackCardEvent(parsed.id, "view");
    };
    void load();
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!formOpen) return;
    openedAt.current = Date.now();
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [formOpen]);

  const searchVehicles = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setVehicleHits([]);
      return;
    }
    const { data } = await supabase
      .from("vehicles")
      .select("id, title")
      .eq("is_sold", false)
      .ilike("title", `%${q.trim()}%`)
      .limit(6);
    setVehicleHits((data as VehicleHit[]) ?? []);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void searchVehicles(vehicleQuery), 250);
    return () => window.clearTimeout(t);
  }, [vehicleQuery, searchVehicles]);

  const buttons = useMemo<CardButton[]>(
    () => (contact?.buttons?.length ? contact.buttons : DEFAULT_BUTTONS).filter((b) => b.visible),
    [contact],
  );

  const handleButton = (btn: CardButton) => {
    if (contact) void trackCardEvent(contact.id, "click", btn.id);
    if (btn.type === "appointment") {
      setFormOpen(true);
      return;
    }
    if (!btn.href) return;
    if (btn.href.startsWith("/")) window.location.assign(btn.href);
    else window.open(btn.href, "_blank", "noopener,noreferrer");
  };

  /** Die Mailadresse steht bewusst nicht im Seitenquelltext — sie wird erst beim Klick geholt. */
  const openMail = async () => {
    if (!contact) return;
    void trackCardEvent(contact.id, "click", "email");
    const { data } = await supabase.functions.invoke("submit-appointment-request", {
      body: { action: "mailto", slug: contact.slug },
    });
    const address = (data as { email?: string })?.email;
    if (address) window.location.href = `mailto:${address}`;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!gdpr) {
      setError("Bitte stimmen Sie der Datenverarbeitung zu.");
      return;
    }
    setSubmitting(true);
    const { data, error: fnError } = await supabase.functions.invoke("submit-appointment-request", {
      body: {
        slug: contact?.slug ?? slug,
        name,
        email,
        phone,
        preferredDate: date,
        preferredTimeSlot: slot,
        message: message || null,
        vehicleId: vehicle?.id ?? null,
        gdprAccepted: gdpr,
        website,
        elapsedMs: Date.now() - openedAt.current,
      },
    });
    setSubmitting(false);
    if (fnError || !(data as { success?: boolean })?.success) {
      setError("Ihre Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut oder rufen Sie uns an.");
      return;
    }
    setDone(true);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!contact || !contact.is_active) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Diese Karte ist nicht mehr gültig</h1>
          <p className="mt-2 text-muted-foreground">
            Schauen Sie gern direkt in unseren Fahrzeugbestand oder auf unsere Website.
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <Button asChild size="lg" className="h-14 text-base">
            <Link to="/fahrzeuge">Fahrzeugbestand ansehen</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-14 text-base">
            <a href="https://reller-automobile.de" target="_blank" rel="noopener noreferrer">
              Website ansehen
            </a>
          </Button>
        </div>
      </div>
    );
  }

  const fullName = contactName(contact);
  const iconFor = (btn: CardButton) =>
    btn.type === "appointment" ? CalendarDays : btn.href?.startsWith("/") ? Car : Globe;

  return (
    <div className="min-h-screen bg-background px-5 pb-16 pt-10">
      <div className="mx-auto w-full max-w-md">
        <header className="flex flex-col items-center text-center">
          {photo ? (
            <img
              src={photo}
              alt={`Foto von ${fullName}`}
              className="h-32 w-32 rounded-full object-cover shadow-md"
              loading="lazy"
            />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-secondary text-3xl font-semibold text-muted-foreground">
              {contact.first_name[0]}
              {contact.last_name[0]}
            </div>
          )}
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">{fullName}</h1>
          {contact.role && <p className="mt-1 text-muted-foreground">{contact.role}</p>}
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Reller Automobile
          </p>
        </header>

        <nav className="mt-9 flex flex-col gap-4">
          {buttons.map((btn) => {
            const Icon = iconFor(btn);
            return (
              <Button
                key={btn.id}
                size="lg"
                variant={btn.type === "appointment" ? "default" : "outline"}
                className="h-16 justify-start gap-3 text-base"
                onClick={() => handleButton(btn)}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {btn.label}
              </Button>
            );
          })}
        </nav>

        <div className="mt-8 flex flex-col gap-2 text-center text-sm">
          {(contact.mobile || contact.phone) && (
            <a
              href={`tel:${(contact.mobile || contact.phone)!.replace(/\s/g, "")}`}
              className="inline-flex items-center justify-center gap-2 py-2 text-foreground underline-offset-4 hover:underline"
            >
              <Phone className="h-4 w-4" /> {contact.mobile || contact.phone}
            </a>
          )}
          <button
            type="button"
            onClick={openMail}
            className="inline-flex items-center justify-center gap-2 py-2 text-foreground underline-offset-4 hover:underline"
          >
            <Mail className="h-4 w-4" /> E-Mail schreiben
          </button>
        </div>

        {formOpen && (
          <div ref={formRef} className="mt-10 rounded-lg border border-border bg-card p-5">
            {done ? (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
                <h2 className="text-xl font-semibold">Vielen Dank!</h2>
                <p className="text-sm text-muted-foreground">
                  {fullName} meldet sich zeitnah bei Ihnen. Eine Bestätigung ist unterwegs an {email}.
                </p>
                <div className="rounded-md bg-secondary p-4 text-left text-sm">
                  <p><strong>Name:</strong> {name}</p>
                  <p><strong>Telefon:</strong> {phone}</p>
                  <p><strong>E-Mail:</strong> {email}</p>
                  <p><strong>Wunschtermin:</strong> {date} · {timeSlotLabel(slot)}</p>
                  {vehicle && <p><strong>Fahrzeug:</strong> {vehicle.title}</p>}
                  {message && <p className="mt-2 whitespace-pre-wrap"><strong>Nachricht:</strong> {message}</p>}
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <h2 className="text-lg font-semibold">Termin vereinbaren</h2>

                {/* Honigtopf — für Menschen unsichtbar */}
                <div className="hidden" aria-hidden="true">
                  <label htmlFor="website">Website</label>
                  <input
                    id="website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="ap-name">Name *</Label>
                  <Input id="ap-name" required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-12" />
                </div>
                <div>
                  <Label htmlFor="ap-phone">Telefon *</Label>
                  <Input id="ap-phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-12" />
                </div>
                <div>
                  <Label htmlFor="ap-email">E-Mail *</Label>
                  <Input id="ap-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-12" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="ap-date">Wunschtermin *</Label>
                    <Input
                      id="ap-date"
                      type="date"
                      required
                      min={todayIso()}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="mt-1 h-12"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ap-slot">Tageszeit *</Label>
                    <Select value={slot} onValueChange={setSlot}>
                      <SelectTrigger id="ap-slot" className="mt-1 h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="ap-vehicle">Fahrzeug (optional)</Label>
                  {vehicle ? (
                    <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <span className="truncate">{vehicle.title}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setVehicle(null)}>
                        Ändern
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        id="ap-vehicle"
                        className="mt-1 h-12"
                        placeholder="Marke oder Modell suchen…"
                        value={vehicleQuery}
                        onChange={(e) => setVehicleQuery(e.target.value)}
                      />
                      {vehicleHits.length > 0 && (
                        <ul className="mt-1 divide-y divide-border rounded-md border border-border">
                          {vehicleHits.map((v) => (
                            <li key={v.id}>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                                onClick={() => {
                                  setVehicle(v);
                                  setVehicleQuery("");
                                  setVehicleHits([]);
                                }}
                              >
                                {v.title}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <Label htmlFor="ap-message">Nachricht (optional)</Label>
                  <Textarea id="ap-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1" />
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox id="ap-gdpr" checked={gdpr} onCheckedChange={(v) => setGdpr(v === true)} className="mt-1" />
                  <Label htmlFor="ap-gdpr" className="text-sm font-normal leading-relaxed">
                    Ich willige ein, dass meine Angaben zur Bearbeitung meiner Anfrage verarbeitet werden. Hinweise
                    dazu in der{" "}
                    <a
                      href="https://reller-automobile.de/datenschutz"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Datenschutzerklärung
                    </a>
                    . *
                  </Label>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" size="lg" className="h-14 w-full text-base" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Terminanfrage senden
                </Button>
              </form>
            )}
          </div>
        )}

        <footer className="mt-12 flex justify-center gap-4 text-xs text-muted-foreground">
          <a href="https://reller-automobile.de/impressum" target="_blank" rel="noopener noreferrer" className="underline">
            Impressum
          </a>
          <a href="https://reller-automobile.de/datenschutz" target="_blank" rel="noopener noreferrer" className="underline">
            Datenschutz
          </a>
        </footer>
      </div>
    </div>
  );
}
