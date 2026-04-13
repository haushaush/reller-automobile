import { Vehicle as DbVehicle } from "@/hooks/useVehicles";
import { AspectRatio } from "@/components/ui/aspect-ratio";

interface VehicleCardProps {
  vehicle: DbVehicle;
}

const VehicleCard = ({ vehicle }: VehicleCardProps) => {
  const formattedMileage = vehicle.mileage ? vehicle.mileage.toLocaleString("de-DE") : "–";
  const imageUrl = vehicle.image_urls && vehicle.image_urls.length > 0
    ? vehicle.image_urls[0]
    : "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&h=450&fit=crop";
  
  const formattedPrice = vehicle.price
    ? vehicle.price.toLocaleString("de-DE") + " " + (vehicle.currency || "€")
    : null;

  return (
    <div className="group rounded-lg overflow-hidden shadow-lg shadow-black/30 transition-all duration-300 hover:shadow-xl hover:shadow-black/40 hover:-translate-y-1">
      <div className="overflow-hidden">
        <AspectRatio ratio={16 / 9}>
          <img
            src={imageUrl}
            alt={vehicle.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </AspectRatio>
      </div>
      <div className="p-5" style={{ backgroundColor: 'hsl(20, 30%, 18%)' }}>
        <h3 className="text-lg font-semibold text-foreground mb-3 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
          {vehicle.title}
        </h3>
        {formattedPrice && (
          <p className="text-primary font-bold text-xl mb-3">{formattedPrice}</p>
        )}
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <span className="text-primary font-medium">›</span>
            <span>Kilometerstand: {formattedMileage} km</span>
          </p>
          <p className="flex items-center gap-2">
            <span className="text-primary font-medium">›</span>
            <span>Karosserieform: {vehicle.body_type || "–"}</span>
          </p>
          <p className="flex items-center gap-2">
            <span className="text-primary font-medium">›</span>
            <span>Baujahr: {vehicle.year || "–"}</span>
          </p>
          {vehicle.brand && (
            <p className="flex items-center gap-2">
              <span className="text-primary font-medium">›</span>
              <span>Marke: {vehicle.brand}{vehicle.model ? ` ${vehicle.model}` : ""}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default VehicleCard;
