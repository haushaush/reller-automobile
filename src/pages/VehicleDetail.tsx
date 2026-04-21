import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useVehicle } from "@/hooks/useVehicle";
import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";
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
  const touchStartX = useState<{ x: number }>({ x: 0 })[0];
  const { addToInquiry, removeFromInquiry, isInInquiry, inquiryCount } = useInquiry();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-10 space-y-6 flex-1 w-full">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-96 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-20 text-center flex-1 w-full">
          <p className="text-muted-foreground text-lg mb-6">Fahrzeug nicht gefunden.</p>
          <Button onClick={() => navigate("/")} variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
          </Button>
        </div>
        <SiteFooter />
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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.x = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientX - touchStartX.x;
    if (Math.abs(delta) > 50) {
      if (delta < 0) goNextImage();
      else goPrevImage();
    }
  };

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
    <div className="min-h-screen bg-background" data-detail-page>
      <Navbar />
      {/* Add bottom padding for sticky CTA on mobile */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 pb-[120px] lg:pb-12">
        <Button onClick={() => navigate(-1)} variant="outline" size="sm" className="gap-1.5 mb-6 min-h-[44px]">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left: Images + Specs + Description */}
          <div className="lg:col-span-2 space-y-6">
            {/* Main image with arrows + swipe */}
            <div
              className="relative rounded-xl overflow-hidden bg-muted"
              onTouchStart={images.length > 1 ? handleTouchStart : undefined}
              onTouchEnd={images.length > 1 ? handleTouchEnd : undefined}
            >
              <img
                src={images[selectedImage]}
                alt={vehicle.title}
                loading="lazy"
                className="w-full h-[260px] sm:h-[400px] md:h-[500px] object-cover"
              />
              {images.length > 1 && (
                <>
                  <button
                    onClick={goPrevImage}
                    aria-label="Vorheriges Bild"
                    className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 h-11 w-11 sm:h-10 sm:w-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={goNextImage}
                    aria-label="Nächstes Bild"
                    className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 h-11 w-11 sm:h-10 sm:w-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-black/50 text-white text-xs font-medium">
                    {selectedImage + 1} / {images.length}
                  </div>
                </>
              )}
            </div>

            {/* Mobile-first: Title + Price + Primary CTA appear here BEFORE specs (only on small screens) */}
            <div className="lg:hidden bg-card border border-border rounded-xl p-5 space-y-3">
              {vehicle.brand && (
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {vehicle.brand}
                </p>
              )}
              <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
                {vehicle.title}
              </h1>
              {formattedPrice ? (
                <p className="text-2xl sm:text-3xl font-bold text-primary">{formattedPrice}</p>
              ) : (
                <p className="text-lg font-semibold text-muted-foreground">Auf Anfrage</p>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
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
            <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Technische Daten</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                {specs.map(([label, value]) =>
                  value ? (
                    <div
                      key={label}
                      className="flex justify-between py-2 border-b border-border text-sm gap-3"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-foreground font-medium text-right">{value}</span>
                    </div>
                  ) : null
                )}
              </div>
            </div>

            {/* Description */}
            {vehicle.description && (
              <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Beschreibung</h3>
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                  {vehicle.description}
                </p>
              </div>
            )}
          </div>

          {/* Right sidebar — sticky on desktop, hidden header section on mobile (already shown above) */}
          <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            {/* Summary + Inquiry — full version on desktop, only actions on mobile */}
            <div className="bg-card border border-border rounded-xl p-5 sm:p-6 space-y-4">
              <div className="hidden lg:block space-y-4">
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
              </div>

              {!vehicle.is_sold && (
                <Button
                  onClick={inInquiry ? () => removeFromInquiry(vehicle.id) : handleInquiry}
                  size="lg"
                  variant={inInquiry ? "outline" : "default"}
                  className="w-full rounded-full gap-2 text-base font-semibold min-h-[48px]"
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

      {/* Sticky bottom CTA — mobile/tablet only, hidden on lg+ where sidebar is sticky */}
      {!vehicle.is_sold && (
        <div
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {formattedPrice ? (
                <p className="text-lg font-bold text-primary truncate">{formattedPrice}</p>
              ) : (
                <p className="text-sm font-semibold text-muted-foreground">Auf Anfrage</p>
              )}
              <p className="text-xs text-muted-foreground truncate">{vehicle.title}</p>
            </div>
            <Button
              onClick={inInquiry ? () => removeFromInquiry(vehicle.id) : handleInquiry}
              size="lg"
              variant={inInquiry ? "outline" : "default"}
              className="rounded-full gap-2 font-semibold min-h-[48px] shrink-0"
            >
              {inInquiry ? (
                <>
                  <Check className="h-4 w-4" />
                  <span className="hidden sm:inline">In Anfrage</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">Anfragen</span>
                  <span className="sm:hidden">Anfragen</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}
      <SiteFooter />
    </div>
  );
};

export default VehicleDetail;
