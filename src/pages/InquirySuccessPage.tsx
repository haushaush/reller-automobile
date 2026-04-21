import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";

interface ConfirmationData {
  firstName: string;
  vehicles: Array<{
    id: string;
    title: string;
    brand: string | null;
    price: number | null;
    currency: string | null;
    image: string | null;
  }>;
}

const InquirySuccessPage = () => {
  const [data, setData] = useState<ConfirmationData | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("reller-inquiry-confirmation");
      if (raw) setData(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-primary/10 mb-6 animate-in zoom-in-50 duration-500">
            <CheckCircle2 className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Vielen Dank für Ihre Anfrage{data?.firstName ? `, ${data.firstName}` : ""}!
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Wir haben Ihre Anfrage erhalten und werden uns innerhalb von 24 Stunden bei Ihnen melden.
            Eine Bestätigung wurde an Ihre E-Mail-Adresse gesendet.
          </p>
        </div>

        {data?.vehicles && data.vehicles.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 mb-8">
            <h2 className="text-base font-semibold text-foreground mb-4">
              Ihre angefragten Fahrzeuge
            </h2>
            <ul className="space-y-3">
              {data.vehicles.map((v) => (
                <li key={v.id} className="flex gap-3 items-center">
                  <div className="shrink-0 w-16 h-12 rounded-md overflow-hidden bg-muted">
                    {v.image && (
                      <img src={v.image} alt={v.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {v.brand && (
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {v.brand}
                      </p>
                    )}
                    <p className="text-sm font-medium text-foreground line-clamp-1">{v.title}</p>
                  </div>
                  {v.price && (
                    <p className="shrink-0 text-sm font-semibold text-primary">
                      {v.price.toLocaleString("de-DE")}{" "}
                      {v.currency?.toUpperCase() === "EUR" || !v.currency ? "€" : v.currency}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-center">
          <Button asChild size="lg" className="gap-2">
            <Link to="/fahrzeuge">
              Zurück zum Fahrzeugbestand
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
};

export default InquirySuccessPage;
