import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { Vehicle } from "@/hooks/useVehicles";
import { useCompare } from "@/contexts/CompareContext";
import { useFavoritesContext } from "@/contexts/FavoritesContext";
import { useInquiry, MAX_INQUIRY_ITEMS } from "@/contexts/InquiryContext";
import { Scale, Heart, ArrowRight, Plus, Check } from "lucide-react";
import ImageCarousel from "@/components/ImageCarousel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { decodeHtml } from "@/lib/decodeHtml";
import { toast } from "sonner";

interface VehicleCardProps {
  vehicle: Vehicle;
}

function stripBrandFromTitle(title: string, brand?: string | null): string {
  if (!brand) return title;
  const lower = title.toLowerCase();
  const lowerBrand = brand.toLowerCase();
  if (lower.startsWith(lowerBrand)) {
    return title.substring(brand.length).trim();
  }
  return title;
}

const VehicleCard = memo(({ vehicle }: VehicleCardProps) => {
  const navigate = useNavigate();
  const { add, remove, isSelected } = useCompare();
  const { toggleFavorite, isFavorite } = useFavoritesContext();
  const { addToInquiry, removeFromInquiry, isInInquiry, inquiryCount } = useInquiry();
  const selected = isSelected(vehicle.id);
  const favorited = isFavorite(vehicle.id);
  const inInquiry = isInInquiry(vehicle.id);
  const isSold = vehicle.is_sold;

  const images = vehicle.image_urls && vehicle.image_urls.length > 0
    ? vehicle.image_urls
    : ["https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&h=450&fit=crop"];

  const currencySymbol = !vehicle.currency || vehicle.currency.toUpperCase() === "EUR" ? "€" : vehicle.currency;
  const formattedPrice = vehicle.price
    ? `${vehicle.price.toLocaleString("de-DE")} ${currencySymbol}`
    : null;

  const decodedBrand = decodeHtml(vehicle.brand);
  const decodedTitleSource = vehicle.model_description?.trim() || stripBrandFromTitle(vehicle.title, vehicle.brand);
  const modelTitle = decodeHtml(decodedTitleSource);

  // Build spec chips (max 5)
  const chips: string[] = [];
  if (vehicle.gearbox) chips.push(vehicle.gearbox);
  if (vehicle.power) chips.push(`${Math.round(vehicle.power * 1.36)} PS`);
  if (vehicle.year) chips.push(`EZ ${vehicle.year}`);
  if (vehicle.mileage != null) chips.push(`${vehicle.mileage.toLocaleString("de-DE")} km`);
  if (vehicle.fuel) chips.push(vehicle.fuel);
  const visibleChips = chips.slice(0, 5);

  const handleCompareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selected) remove(vehicle.id);
    else add(vehicle);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSold) toggleFavorite(vehicle.id);
  };

  const handleCtaClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSold) navigate(`/fahrzeug/${vehicle.id}`);
  };

  const handleInquiryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSold) return;
    if (inInquiry) {
      removeFromInquiry(vehicle.id);
      return;
    }
    if (inquiryCount >= MAX_INQUIRY_ITEMS) {
      toast.error(`Maximal ${MAX_INQUIRY_ITEMS} Fahrzeuge pro Anfrage`);
      return;
    }
    addToInquiry(vehicle);
  };

  return (
    <div
      onClick={() => navigate(`/fahrzeug/${vehicle.id}`)}
      className={`group rounded-xl overflow-hidden bg-card border cursor-pointer ${
        selected
          ? "border-primary shadow-[0_0_15px_hsl(var(--primary)/0.3)]"
          : "border-border hover:border-[hsl(var(--primary)/0.2)] shadow-[0_2px_8px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
      }`}
      style={{
        transition: "all 200ms ease",
        ...(isSold ? { filter: "grayscale(40%) opacity(0.85)" } : {}),
      }}
    >
      <div className="relative">
        <ImageCarousel images={images} alt={vehicle.title} vehicleId={vehicle.id} totalImages={vehicle.image_urls?.length} />

        {/* Sold overlay */}
        {isSold && (
          <div className="absolute inset-0 bg-red-600/50 flex items-center justify-center z-20 pointer-events-none">
            <span className="text-white font-bold text-2xl tracking-wider">VERKAUFT</span>
          </div>
        )}

        {/* Favorite heart */}
        <div className="absolute top-3 right-3 z-20">
          {isSold ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-2 rounded-full bg-background/80 text-muted-foreground cursor-not-allowed opacity-60">
                  <Heart className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Dieses Fahrzeug ist bereits verkauft</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={handleFavoriteClick}
              className={`p-2 rounded-full transition-all ${
                favorited
                  ? "bg-red-500 text-white scale-110"
                  : "bg-background/80 text-white hover:bg-red-500 hover:text-white"
              }`}
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
            >
              <Heart className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />
            </button>
          )}
        </div>

        {/* Compare button */}
        <button
          onClick={handleCompareClick}
          className={`absolute top-3 left-3 z-20 p-2 rounded-full transition-colors ${
            selected
              ? "bg-primary text-primary-foreground"
              : "bg-background/80 text-muted-foreground hover:bg-primary hover:text-primary-foreground"
          }`}
          title="Vergleichen"
        >
          <Scale className="h-4 w-4" />
        </button>
      </div>

      <div className="px-5 py-4">
        {/* Brand */}
        {decodedBrand && (
          <p
            className="text-muted-foreground font-medium mb-1"
            style={{ fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            {decodedBrand}
          </p>
        )}

        {/* Model / title */}
        <h3
          className="text-foreground font-semibold mb-3 leading-tight line-clamp-2"
          style={{ fontSize: "18px", lineHeight: 1.3 }}
        >
          {modelTitle}
        </h3>

        {/* Price — plain text in primary color */}
        <div className="mb-4">
          {formattedPrice ? (
            <p
              style={{
                fontSize: "22px",
                fontWeight: 700,
                color: "hsl(var(--primary))",
                lineHeight: 1.2,
              }}
            >
              {formattedPrice}
            </p>
          ) : (
            <p className="text-muted-foreground font-medium" style={{ fontSize: "16px" }}>
              Auf Anfrage
            </p>
          )}
        </div>

        {/* Specs — typographic row with dot separators */}
        {visibleChips.length > 0 && (
          <div
            className="mb-4"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "8px",
              color: "hsl(var(--muted-foreground))",
              fontSize: "13px",
              fontWeight: 400,
            }}
          >
            {visibleChips.map((chip, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <span>{chip}</span>
                {i < visibleChips.length - 1 && (
                  <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* CTA row: ansehen + zur Anfrage */}
        {isSold ? (
          <p className="text-muted-foreground" style={{ fontSize: "14px", fontWeight: 500 }}>
            Fahrzeug nicht mehr verfügbar
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              onClick={handleCtaClick}
              className="cta-link inline-flex items-center gap-1.5 hover:underline transition-colors"
              style={{
                width: "fit-content",
                fontSize: "14px",
                fontWeight: 600,
                color: "hsl(var(--primary))",
                background: "transparent",
                padding: 0,
              }}
            >
              Fahrzeug ansehen
              <ArrowRight className="h-4 w-4 cta-arrow" style={{ transition: "transform 200ms ease" }} />
            </button>
            <button
              onClick={handleInquiryClick}
              className="inline-flex items-center gap-1 hover:underline transition-colors"
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: inInquiry ? "rgb(34 197 94)" : "hsl(var(--primary))",
                background: "transparent",
                padding: 0,
              }}
              title={inInquiry ? "Aus Anfrage entfernen" : "Zur Anfrage hinzufügen"}
            >
              {inInquiry ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {inInquiry ? "In Anfrage" : "Zur Anfrage"}
            </button>
          </div>
        )}
      </div>
      <style>{`
        .group:hover .cta-arrow { transform: translateX(4px); }
      `}</style>
    </div>
  );
});

VehicleCard.displayName = "VehicleCard";
export default VehicleCard;
