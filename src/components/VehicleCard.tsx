import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { Vehicle } from "@/hooks/useVehicles";
import { useCompare } from "@/contexts/CompareContext";
import { useFavoritesContext } from "@/contexts/FavoritesContext";
import { Scale, Heart } from "lucide-react";
import ImageCarousel from "@/components/ImageCarousel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface VehicleCardProps {
  vehicle: Vehicle;
}

const VehicleCard = memo(({ vehicle }: VehicleCardProps) => {
  const navigate = useNavigate();
  const { add, remove, isSelected } = useCompare();
  const { toggleFavorite, isFavorite } = useFavoritesContext();
  const selected = isSelected(vehicle.id);
  const favorited = isFavorite(vehicle.id);
  const isSold = vehicle.is_sold;

  const formattedMileage = vehicle.mileage ? vehicle.mileage.toLocaleString("de-DE") : "–";
  const images = vehicle.image_urls && vehicle.image_urls.length > 0
    ? vehicle.image_urls
    : ["https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&h=450&fit=crop"];

  const formattedPrice = vehicle.price
    ? vehicle.price.toLocaleString("de-DE") + " " + (vehicle.currency || "€")
    : null;

  const handleCompareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selected) remove(vehicle.id);
    else add(vehicle);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSold) toggleFavorite(vehicle.id);
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

      <div className="p-5">
        <h3 className="text-lg font-semibold text-foreground mb-3 leading-tight">
          {vehicle.title}
        </h3>
        {formattedPrice && (
          <p className="text-primary font-bold text-xl mb-3">{formattedPrice}</p>
        )}
        <div className="space-y-1.5 text-sm text-muted-foreground" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>
          <p className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-primary inline-block"></span>
            <span>Kilometerstand: {formattedMileage} km</span>
          </p>
          <p className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-primary inline-block"></span>
            <span>Karosserieform: {vehicle.body_type || "–"}</span>
          </p>
          <p className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-primary inline-block"></span>
            <span>Baujahr: {vehicle.year || "–"}</span>
          </p>
          {vehicle.brand && (
            <p className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-primary inline-block"></span>
              <span>Marke: {vehicle.brand}{vehicle.model ? ` ${vehicle.model}` : ""}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

VehicleCard.displayName = "VehicleCard";
export default VehicleCard;
