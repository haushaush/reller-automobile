import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useVehicle } from "@/hooks/useVehicle";
import Navbar from "@/components/Navbar";

import DealerLocation from "@/components/DealerLocation";
import DownloadExposeButton from "@/components/DownloadExposeButton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Send, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useInquiry, MAX_INQUIRY_ITEMS } from "@/contexts/InquiryContext";
import { toast } from "sonner";
import {
  getBodyTypeLabel,
  getFuelLabel,
  getGearboxLabel,
  getClimatisationLabel,
  getConditionLabel,
  getInteriorTypeLabel,
} from "@/lib/mobileDeLabels";

const VehicleDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: vehicle, isLoading } = useVehicle(id);
  const [selectedImage, setSelectedImage] = useState(0);
  const { addToInquiry, removeFromInquiry, isInInquiry, inquiryCount } = useInquiry();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-10 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-96 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <p className="text-muted-foreground text-lg mb-6">Fahrzeug nicht gefunden.</p>
          <Button onClick={() => navigate("/")} variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
          </Button>
        </div>
      </div>
    );
  }

  const images = vehicle.image_urls?.length ? vehicle.image_urls : ["/placeholder.svg"];
  const ps = vehicle.power ? Math.round(vehicle.power * 1.36) : null;
  const formattedPrice = vehicle.price
    ? vehicle.price.toLocaleString("de-DE") + " " + (vehicle.currency || "€")
    : null;

  const goPrevImage = () =>
    setSelectedImage((i) => (i - 1 + images.length) % images.length);
  const goNextImage = () => setSelectedImage((i) => (i + 1) % images.length);

  const handleInquiry = () => {
    if (inquiryCount >= MAX_INQUIRY_ITEMS) {
      toast.error(`Maximal ${MAX_INQUIRY_ITEMS} Fahrzeuge pro Anfrage`);
      return;
    }
    addToInquiry(vehicle);
    toast.success("Zur Anfrage hinzugefügt");
  };

  const inInquiry = isInInquiry(vehicle.id);

  const specs: [string, string | null][] = [
    ["Baujahr", vehicle.year],
    ["Kilometerstand", vehicle.mileage ? vehicle.mileage.toLocaleString("de-DE") + " km" : null],
    ["Leistung", vehicle.power ? `${vehicle.power} kW (${ps} PS)` : null],
    ["Hubraum", vehicle.cubic_capacity ? vehicle.cubic_capacity.toLocaleString("de-DE") + " cm³" : null],
    ["Getriebe", vehicle.gearbox ? getGearboxLabel(vehicle.gearbox) : null],
    ["Kraftstoff", vehicle.fuel ? getFuelLabel(vehicle.fuel) : null],
    ["Karosserie", vehicle.body_type ? getBodyTypeLabel(vehicle.body_type) : null],
    ["Farbe außen", vehicle.exterior_color],
    ["Farbe innen", vehicle.interior_color],
    ["Interieur", vehicle.interior_type ? getInteriorTypeLabel(vehicle.interior_type) : null],
    ["Sitze", vehicle.num_seats?.toString() || null],
    ["Klimaanlage", vehicle.climatisation ? getClimatisationLabel(vehicle.climatisation) : null],
    ["Zustand", vehicle.condition ? getConditionLabel(vehicle.condition) : null],
    ["Nutzungsart", vehicle.usage_type],
    ["Unfallschaden", vehicle.damage_unrepaired === true ? "Ja" : vehicle.damage_unrepaired === false ? "Nein" : null],
    ["MwSt. ausweisbar", vehicle.vatable === true ? "Ja" : vehicle.vatable === false ? "Nein" : null],
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-10 pb-32">
        <Button onClick={() => navigate(-1)} variant="outline" size="sm" className="gap-1.5 mb-6">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Images + Specs + Description */}
          <div className="lg:col-span-2 space-y-6">
            {/* Main image with arrows */}
            <div className="relative rounded-xl overflow-hidden">
              <img
                src={images[selectedImage]}
                alt={vehicle.title}
                loading="lazy"
                className="w-full h-[400px] md:h-[500px] object-cover"
              />
              {images.length > 1 && (
                <>
                  <button
                    onClick={goPrevImage}
                    aria-label="Vorheriges Bild"
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={goNextImage}
                    aria-label="Nächstes Bild"
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-black/50 text-white text-xs font-medium">
                    {selectedImage + 1} / {images.length}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {images.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                      i === selectedImage ? "border-primary" : "border-transparent"
                    }`}
                  >
                    <img src={url} alt="" loading="lazy" className="w-20 h-14 object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Specs */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Technische Daten</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                {specs.map(([label, value]) =>
                  value ? (
                    <div
                      key={label}
                      className="flex justify-between py-2 border-b border-border text-sm"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-foreground font-medium">{value}</span>
                    </div>
                  ) : null
                )}
              </div>
            </div>

            {/* Description */}
            {vehicle.description && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Beschreibung</h3>
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                  {vehicle.description}
                </p>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-6">
            {/* Summary + Inquiry */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              {vehicle.brand && (
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {vehicle.brand}
                </p>
              )}
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                {vehicle.title}
              </h1>
              {formattedPrice ? (
                <p className="text-3xl font-bold text-primary">{formattedPrice}</p>
              ) : (
                <p className="text-xl font-semibold text-muted-foreground">Auf Anfrage</p>
              )}

              {!vehicle.is_sold && (
                <Button
                  onClick={inInquiry ? () => removeFromInquiry(vehicle.id) : handleInquiry}
                  size="lg"
                  variant={inInquiry ? "outline" : "default"}
                  className="w-full rounded-full gap-2 text-base font-semibold"
                >
                  {inInquiry ? (
                    <>
                      <Check className="h-4 w-4" />
                      Aus Anfrage entfernen
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Jetzt Fahrzeug anfragen
                    </>
                  )}
                </Button>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <DownloadExposeButton vehicle={vehicle} />
                {vehicle.detail_page_url && (
                  <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                    <a
                      href={vehicle.detail_page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Auf Mobile.de ansehen
                    </a>
                  </Button>
                )}
              </div>
            </div>

            <DealerLocation />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VehicleDetail;
