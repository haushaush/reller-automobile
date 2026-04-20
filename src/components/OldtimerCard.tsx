import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { Vehicle } from "@/hooks/useVehicles";
import { useCompare } from "@/contexts/CompareContext";
import { useFavoritesContext } from "@/contexts/FavoritesContext";
import { Scale, Heart } from "lucide-react";
import ImageCarousel from "@/components/ImageCarousel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface OldtimerCardProps {
  vehicle: Vehicle;
}

const GOLD = "#c9a961";
const CARD_BG = "rgba(35, 22, 15, 0.85)";
const TEXT_WARM = "#f5f1ed";
const TEXT_MUTED = "#dcd8d5";

const OldtimerCard = memo(({ vehicle }: OldtimerCardProps) => {
  const navigate = useNavigate();
  const { add, remove, isSelected } = useCompare();
  const { toggleFavorite, isFavorite } = useFavoritesContext();
  const selected = isSelected(vehicle.id);
  const favorited = isFavorite(vehicle.id);
  const isSold = vehicle.is_sold;

  const images =
    vehicle.image_urls && vehicle.image_urls.length > 0
      ? vehicle.image_urls
      : ["https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&h=450&fit=crop"];

  const handleCompareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selected) remove(vehicle.id);
    else add(vehicle);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSold) toggleFavorite(vehicle.id);
  };

  // Build chevron-spec rows
  const specs: { label: string; value: string }[] = [];
  if (vehicle.mileage != null)
    specs.push({ label: "Kilometerstand", value: `${vehicle.mileage.toLocaleString("de-DE")} km` });
  if (vehicle.body_type) specs.push({ label: "Karosserieform", value: vehicle.body_type });
  if (vehicle.year) specs.push({ label: "Baujahr", value: vehicle.year });
  if (vehicle.power) specs.push({ label: "Leistung", value: `${Math.round(vehicle.power * 1.36)} PS` });

  return (
    <div
      onClick={() => navigate(`/fahrzeug/${vehicle.id}`)}
      className="oldtimer-card group relative cursor-pointer overflow-hidden"
      style={{
        background: CARD_BG,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: `1px solid ${selected ? "rgba(201, 169, 97, 0.6)" : "rgba(201, 169, 97, 0.2)"}`,
        borderRadius: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        transition: "all 300ms ease",
        ...(isSold ? { filter: "grayscale(40%) opacity(0.85)" } : {}),
      }}
    >
      <div className="relative" style={{ borderRadius: "12px 12px 0 0", overflow: "hidden" }}>
        <ImageCarousel
          images={images}
          alt={vehicle.title}
          vehicleId={vehicle.id}
          totalImages={vehicle.image_urls?.length}
        />

        {isSold && (
          <div className="absolute inset-0 bg-red-600/50 flex items-center justify-center z-20 pointer-events-none">
            <span className="text-white font-bold text-2xl tracking-wider">VERKAUFT</span>
          </div>
        )}

        {/* Favorite */}
        <div className="absolute top-3 right-3 z-20">
          {isSold ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-2 rounded-full bg-black/40 text-white/60 cursor-not-allowed">
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
                  : "bg-black/40 text-white hover:bg-red-500"
              }`}
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))" }}
            >
              <Heart className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />
            </button>
          )}
        </div>

        {/* Compare */}
        <button
          onClick={handleCompareClick}
          className="absolute top-3 left-3 z-20 p-2 rounded-full transition-colors"
          style={{
            background: selected ? GOLD : "rgba(0,0,0,0.4)",
            color: selected ? "#1a0f08" : "#fff",
          }}
          title="Vergleichen"
        >
          <Scale className="h-4 w-4" />
        </button>
      </div>

      <div style={{ padding: "24px" }}>
        <h3
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "20px",
            fontWeight: 500,
            color: TEXT_WARM,
            lineHeight: 1.3,
            marginBottom: "16px",
          }}
          className="line-clamp-2"
        >
          {vehicle.title}
        </h3>

        <ul style={{ display: "flex", flexDirection: "column", gap: "6px", margin: 0, padding: 0, listStyle: "none" }}>
          {specs.map((s, i) => (
            <li
              key={i}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "12px",
                color: TEXT_MUTED,
                display: "flex",
                alignItems: "baseline",
                gap: "8px",
              }}
            >
              <span style={{ color: GOLD, fontWeight: 600, fontSize: "10px" }}>›</span>
              <span style={{ fontWeight: 600 }}>{s.label}:</span>
              <span style={{ opacity: 0.85, fontWeight: 400 }}>{s.value}</span>
            </li>
          ))}
        </ul>

        {!isSold && (
          <div
            className="oldtimer-reveal"
            style={{
              marginTop: "20px",
              fontFamily: "'Playfair Display', serif",
              fontStyle: "italic",
              fontSize: "13px",
              color: GOLD,
              opacity: 0,
              transform: "translateY(4px)",
              transition: "opacity 250ms ease, transform 250ms ease",
            }}
          >
            Details ansehen →
          </div>
        )}
      </div>

      <style>{`
        .oldtimer-card:hover {
          border-color: rgba(201, 169, 97, 0.5) !important;
          box-shadow: 0 12px 48px rgba(0,0,0,0.55) !important;
        }
        .oldtimer-card:hover .oldtimer-reveal {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
});

OldtimerCard.displayName = "OldtimerCard";
export default OldtimerCard;
