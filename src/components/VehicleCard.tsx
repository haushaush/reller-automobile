import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Vehicle } from "@/hooks/useVehicles";
import { useCompare } from "@/contexts/CompareContext";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Scale } from "lucide-react";

interface VehicleCardProps {
  vehicle: Vehicle;
}

const VehicleCard = ({ vehicle }: VehicleCardProps) => {
  const navigate = useNavigate();
  const { add, remove, isSelected } = useCompare();
  const selected = isSelected(vehicle.id);

  const formattedMileage = vehicle.mileage ? vehicle.mileage.toLocaleString("de-DE") : "–";
  const imageUrl = vehicle.image_urls && vehicle.image_urls.length > 0
    ? vehicle.image_urls[0]
    : "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&h=450&fit=crop";
  
  const formattedPrice = vehicle.price
    ? vehicle.price.toLocaleString("de-DE") + " " + (vehicle.currency || "€")
    : null;

  const handleCompareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selected) {
      remove(vehicle.id);
    } else {
      add(vehicle);
    }
  };

  return (
    <div
      onClick={() => navigate(`/fahrzeug/${vehicle.id}`)}
      className={`group rounded-xl overflow-hidden bg-card border transition-all duration-300 hover:-translate-y-1 cursor-pointer ${
        selected ? "border-primary shadow-[0_0_15px_hsl(var(--primary)/0.3)]" : "border-border hover:border-primary/30"
      }`}
    >
      <div className="overflow-hidden relative">
        <AspectRatio ratio={16 / 9}>
          <img
            src={imageUrl}
            alt={vehicle.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </AspectRatio>
        <button
          onClick={handleCompareClick}
          className={`absolute top-3 right-3 p-2 rounded-full transition-colors ${
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
};

export default VehicleCard;
