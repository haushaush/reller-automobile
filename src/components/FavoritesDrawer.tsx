import { useNavigate } from "react-router-dom";
import { useFavoritesContext } from "@/contexts/FavoritesContext";
import { useVehicles, Vehicle } from "@/hooks/useVehicles";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Heart, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const FavoritesDrawer = () => {
  const { favorites, favoritesCount, toggleFavorite, clearAll } = useFavoritesContext();
  const { data: vehicles } = useVehicles();
  const navigate = useNavigate();

  const favVehicles = (vehicles || []).filter((v) => favorites.includes(v.id));

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors">
          <Heart className="h-5 w-5" />
          {favoritesCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {favoritesCount}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ihre Merkliste ({favoritesCount} Fahrzeuge)</SheetTitle>
        </SheetHeader>

        {favVehicles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Heart className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground text-sm">
              Noch keine Favoriten. Klicken Sie das Herz-Icon auf einem Fahrzeug um es zu merken.
            </p>
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            {favVehicles.map((v) => (
              <FavCard key={v.id} vehicle={v} onRemove={() => toggleFavorite(v.id)} onNavigate={() => navigate(`/fahrzeug/${v.id}`)} />
            ))}
            <Button variant="outline" size="sm" className="w-full mt-4" onClick={clearAll}>
              Alle entfernen
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

function FavCard({ vehicle, onRemove, onNavigate }: { vehicle: Vehicle; onRemove: () => void; onNavigate: () => void }) {
  const img = vehicle.image_urls?.[0] || "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=200&h=120&fit=crop";
  const price = vehicle.price ? `${vehicle.price.toLocaleString("de-DE")} €` : null;
  const mileage = vehicle.mileage ? `${vehicle.mileage.toLocaleString("de-DE")} km` : null;

  return (
    <div className="flex gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors cursor-pointer" onClick={onNavigate}>
      <div className="relative shrink-0 w-20 h-14 rounded overflow-hidden">
        <img src={img} alt={vehicle.title} className="w-full h-full object-cover" />
        {vehicle.is_sold && (
          <div className="absolute inset-0 bg-red-600/60 flex items-center justify-center">
            <span className="text-white text-[9px] font-bold">VERKAUFT</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{vehicle.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {price && <span className="text-primary font-semibold">{price}</span>}
          {vehicle.year && <span>{vehicle.year}</span>}
          {mileage && <span>{mileage}</span>}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="shrink-0 p-1.5 text-muted-foreground hover:text-destructive transition-colors"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default FavoritesDrawer;
