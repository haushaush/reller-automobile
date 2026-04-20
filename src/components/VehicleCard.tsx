import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { Vehicle } from "@/hooks/useVehicles";
import { useCompare } from "@/contexts/CompareContext";
import { useFavoritesContext } from "@/contexts/FavoritesContext";
import { Scale, Heart, ArrowRight } from "lucide-react";
import ImageCarousel from "@/components/ImageCarousel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  const selected = isSelected(vehicle.id);
  const favorited = isFavorite(vehicle.id);
  const isSold = vehicle.is_sold;

  const images = vehicle.image_urls && vehicle.image_urls.length > 0
    ? vehicle.image_urls
    : ["https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&h=450&fit=crop"];

  const currencySymbol = !vehicle.currency || vehicle.currency.toUpperCase() === "EUR" ? "€" : vehicle.currency;
  const formattedPrice = vehicle.price
    ? `${vehicle.price.toLocaleString("de-DE")} ${currencySymbol}`
    : null;

  const modelTitle = vehicle.model_description?.trim() || stripBrandFromTitle(vehicle.title, vehicle.brand);

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

  const handleSecondaryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/fahrzeug/${vehicle.id}`);
  };

  return (
    <div
      onClick={() => navigate(`/fahrzeug/${vehicle.id}`)}
      className={`group rounded-xl overflow-hidden bg-card border transition-all duration-300 hover:-translate-y-1 cursor-pointer ${
        selected ? "border-primary shadow-[0_0_15px_hsl(var(--primary)/0.3)]" : "border-border hover:border-primary/30"
      }`}
      style={isSold ? { filter: "grayscale(40%) opacity(0.85)" } : undefined}
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
        {vehicle.brand && (
          <p
            className="text-muted-foreground font-medium mb-1"
            style={{ fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            {vehicle.brand}
          </p>
        )}

        {/* Model / title */}
        <h3
          className="text-foreground font-semibold mb-3 leading-tight line-clamp-2"
          style={{ fontSize: "18px", lineHeight: 1.3 }}
        >
          {modelTitle}
        </h3>

        {/* Price pill */}
        <div className="mb-4">
          {formattedPrice ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                width: "fit-content",
                backgroundColor: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
                padding: "8px 18px",
                borderRadius: "24px",
                fontSize: "18px",
                fontWeight: 700,
              }}
            >
              {formattedPrice}
            </span>
          ) : (
            <span className="text-muted-foreground font-medium" style={{ fontSize: "16px" }}>
              Auf Anfrage
            </span>
          )}
        </div>

        {/* Spec chips */}
        {visibleChips.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              justifyContent: "flex-start",
            }}
          >
            {visibleChips.map((chip, i) => (
              <span
                key={i}
                style={{
                  backgroundColor: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--muted-foreground))",
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "13px",
                  fontWeight: 400,
                  display: "inline-block",
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        )}

        {/* CTA Button */}
        <button
          onClick={handleCtaClick}
          disabled={isSold}
          className={`w-full mt-4 flex items-center justify-center gap-2 transition-opacity ${
            isSold
              ? "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
              : "bg-foreground text-background hover:opacity-90"
          }`}
          style={{
            padding: "12px 20px",
            borderRadius: "24px",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          {isSold ? (
            "Fahrzeug nicht mehr verfügbar"
          ) : (
            <>
              Jetzt Fahrzeug anfragen <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        {/* Secondary link */}
        <button
          onClick={handleSecondaryClick}
          className="w-full mt-2.5 text-muted-foreground hover:text-foreground transition-colors"
          style={{ fontSize: "13px", fontWeight: 500 }}
        >
          Mehr erfahren →
        </button>
      </div>
    </div>
  );
});

VehicleCard.displayName = "VehicleCard";
export default VehicleCard;
