import { Vehicle } from "@/data/vehicles";
import { AspectRatio } from "@/components/ui/aspect-ratio";

interface VehicleCardProps {
  vehicle: Vehicle;
}

const VehicleCard = ({ vehicle }: VehicleCardProps) => {
  const formattedMileage = vehicle.mileage.toLocaleString("de-DE");

  return (
    <div className="group rounded-lg overflow-hidden shadow-lg shadow-black/30 transition-all duration-300 hover:shadow-xl hover:shadow-black/40 hover:-translate-y-1">
      <div className="overflow-hidden">
        <AspectRatio ratio={16 / 9}>
          <img
            src={vehicle.image}
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
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <span className="text-primary font-medium">›</span>
            <span>Kilometerstand: {formattedMileage} km</span>
          </p>
          <p className="flex items-center gap-2">
            <span className="text-primary font-medium">›</span>
            <span>Karosserieform: {vehicle.bodyType}</span>
          </p>
          <p className="flex items-center gap-2">
            <span className="text-primary font-medium">›</span>
            <span>Baujahr: {vehicle.year}</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default VehicleCard;
