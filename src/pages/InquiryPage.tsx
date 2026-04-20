import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, X, Send, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import { useInquiry } from "@/contexts/InquiryContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { decodeHtml } from "@/lib/decodeHtml";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const InquiryPage = () => {
  const { inquiryList, removeFromInquiry, clearInquiry, inquiryCount } = useInquiry();
  const navigate = useNavigate();

  const [salutation, setSalutation] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredContact, setPreferredContact] = useState<"email" | "phone" | "both">("email");
  const [message, setMessage] = useState("");
  const [gdpr, setGdpr] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "Vorname ist erforderlich";
    if (!lastName.trim()) e.lastName = "Nachname ist erforderlich";
    if (!email.trim()) e.email = "E-Mail ist erforderlich";
    else if (!EMAIL_REGEX.test(email.trim())) e.email = "Ungültige E-Mail-Adresse";
    if (!gdpr) e.gdpr = "Bitte stimmen Sie der Datenverarbeitung zu";
    if (inquiryCount === 0) e.vehicles = "Mindestens ein Fahrzeug erforderlich";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-inquiry", {
        body: {
          contact: {
            salutation: salutation || null,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            phone: phone.trim() || null,
            preferredContact,
            gdprAccepted: gdpr,
          },
          message: message.trim() || null,
          vehicleIds: inquiryList.map((v) => v.id),
          website, // honeypot
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Anfrage konnte nicht gesendet werden");

      // Stash submitted vehicles for confirmation page (cleared from cart)
      sessionStorage.setItem(
        "reller-inquiry-confirmation",
        JSON.stringify({
          firstName: firstName.trim(),
          vehicles: inquiryList.map((v) => ({
            id: v.id,
            title: v.title,
            brand: v.brand,
            price: v.price,
            currency: v.currency,
            image: v.image_urls?.[0] || null,
          })),
        })
      );
      clearInquiry();
      navigate("/anfrage/erfolg");
    } catch (err) {
      console.error("Inquiry submission failed:", err);
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      toast.error("Anfrage fehlgeschlagen", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <Button onClick={() => navigate(-1)} variant="ghost" size="sm" className="gap-1.5 mb-6">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Button>

        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">Ihre Anfrage</h1>
        <p className="text-muted-foreground mb-8">
          Wir melden uns innerhalb von 24 Stunden bei Ihnen.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr,1.2fr] gap-6 md:gap-8">
          {/* Left: vehicle list */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Angefragte Fahrzeuge ({inquiryCount})
            </h2>

            {inquiryCount === 0 ? (
              <div className="border border-dashed border-border rounded-xl p-8 text-center">
                <p className="text-muted-foreground mb-4">Keine Fahrzeuge in der Anfrage.</p>
                <Button asChild variant="outline">
                  <Link to="/fahrzeuge">Zum Fahrzeugbestand</Link>
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {inquiryList.map((v) => {
                  const img = v.image_urls?.[0];
                  const price = v.price
                    ? `${v.price.toLocaleString("de-DE")} ${
                        v.currency?.toUpperCase() === "EUR" || !v.currency ? "€" : v.currency
                      }`
                    : "Auf Anfrage";
                  return (
                    <li
                      key={v.id}
                      className="flex gap-3 bg-card border border-border rounded-xl p-3"
                    >
                      <Link
                        to={`/fahrzeug/${v.id}`}
                        className="shrink-0 w-24 h-20 rounded-md overflow-hidden bg-muted"
                      >
                        {img ? (
                          <img src={img} alt={v.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-muted" />
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        {v.brand && (
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">
                            {decodeHtml(v.brand)}
                          </p>
                        )}
                        <Link
                          to={`/fahrzeug/${v.id}`}
                          className="block font-medium text-foreground line-clamp-1 hover:text-primary transition-colors"
                        >
                          {decodeHtml(v.title)}
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          {v.year && <span>EZ {v.year}</span>}
                          {v.mileage != null && (
                            <>
                              <span>·</span>
                              <span>{v.mileage.toLocaleString("de-DE")} km</span>
                            </>
                          )}
                          {v.power != null && (
                            <>
                              <span>·</span>
                              <span>{Math.round(v.power * 1.36)} PS</span>
                            </>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-primary mt-1">{price}</p>
                      </div>
                      <button
                        onClick={() => removeFromInquiry(v.id)}
                        className="shrink-0 self-start p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                        aria-label="Entfernen"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Right: form */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-4">Ihre Kontaktdaten</h2>
            <form onSubmit={handleSubmit} className="space-y-4 bg-card border border-border rounded-xl p-6">
              {/* Honeypot */}
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "-9999px",
                  width: "1px",
                  height: "1px",
                  opacity: 0,
                }}
              />

              <div>
                <Label htmlFor="salutation">Anrede</Label>
                <Select value={salutation} onValueChange={setSalutation}>
                  <SelectTrigger id="salutation">
                    <SelectValue placeholder="Keine Angabe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Herr">Herr</SelectItem>
                    <SelectItem value="Frau">Frau</SelectItem>
                    <SelectItem value="Divers">Divers</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">
                    Vorname <span className="text-primary">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    aria-invalid={!!errors.firstName}
                    autoComplete="given-name"
                  />
                  {errors.firstName && (
                    <p className="text-xs text-destructive mt-1">{errors.firstName}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="lastName">
                    Nachname <span className="text-primary">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    aria-invalid={!!errors.lastName}
                    autoComplete="family-name"
                  />
                  {errors.lastName && (
                    <p className="text-xs text-destructive mt-1">{errors.lastName}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="email">
                  E-Mail <span className="text-primary">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!errors.email}
                  autoComplete="email"
                />
                {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
              </div>

              <div>
                <Label htmlFor="phone">Telefon (für Rückruf)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>

              <div>
                <Label className="mb-2 block">Bevorzugter Kontakt</Label>
                <RadioGroup
                  value={preferredContact}
                  onValueChange={(v) => setPreferredContact(v as typeof preferredContact)}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="email" id="contact-email" />
                    <Label htmlFor="contact-email" className="font-normal cursor-pointer">
                      E-Mail
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="phone" id="contact-phone" />
                    <Label htmlFor="contact-phone" className="font-normal cursor-pointer">
                      Telefon
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="both" id="contact-both" />
                    <Label htmlFor="contact-both" className="font-normal cursor-pointer">
                      Beides
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <Label htmlFor="message">Nachricht</Label>
                <Textarea
                  id="message"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Haben Sie Fragen zu den Fahrzeugen? Wünschen Sie eine Probefahrt? Teilen Sie uns hier gerne weitere Details mit..."
                  maxLength={2000}
                />
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="gdpr"
                  checked={gdpr}
                  onCheckedChange={(v) => setGdpr(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="gdpr" className="font-normal text-sm leading-snug cursor-pointer">
                  Ich habe die{" "}
                  <a
                    href="https://reller-automobile.de/datenschutz"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    Datenschutzerklärung
                  </a>{" "}
                  gelesen und stimme der Verarbeitung meiner Daten zur Bearbeitung der Anfrage zu.
                  <span className="text-primary"> *</span>
                </Label>
              </div>
              {errors.gdpr && <p className="text-xs text-destructive">{errors.gdpr}</p>}
              {errors.vehicles && <p className="text-xs text-destructive">{errors.vehicles}</p>}

              <Button
                type="submit"
                disabled={submitting || inquiryCount === 0}
                className="w-full gap-2 min-h-[48px]"
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Wird gesendet...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Anfrage jetzt senden
                  </>
                )}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

export default InquiryPage;
