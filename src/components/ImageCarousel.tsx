import { useState, useRef, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ImageCarouselProps {
  images: string[];
  alt: string;
  vehicleId?: string;
  totalImages?: number;
}

const ImageCarousel = memo(({ images, alt, vehicleId, totalImages }: ImageCarouselProps) => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const displayImages = images.slice(0, 5);
  const hasMultiple = displayImages.length > 1;
  const allCount = totalImages ?? images.length;

  const goTo = useCallback((idx: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrent(Math.max(0, Math.min(idx, displayImages.length - 1)));
  }, [displayImages.length]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
    setDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const delta = e.touches[0].clientX - touchStartX.current;
    touchDeltaX.current = delta;
    setDragOffset(delta);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setDragging(false);
    setDragOffset(0);
    if (Math.abs(touchDeltaX.current) > 50) {
      if (touchDeltaX.current < 0 && current < displayImages.length - 1) {
        setCurrent((p) => p + 1);
      } else if (touchDeltaX.current > 0 && current > 0) {
        setCurrent((p) => p - 1);
      }
    }
  }, [current, displayImages.length]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (vehicleId) navigate(`/fahrzeug/${vehicleId}`);
  }, [vehicleId, navigate]);

  return (
    <div
      className="overflow-hidden relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={hasMultiple ? handleTouchStart : undefined}
      onTouchMove={hasMultiple ? handleTouchMove : undefined}
      onTouchEnd={hasMultiple ? handleTouchEnd : undefined}
    >
      <AspectRatio ratio={16 / 9}>
        <div
          className="flex h-full"
          style={{
            transform: `translateX(calc(-${current * 100}% + ${dragging ? dragOffset : 0}px))`,
            transition: dragging ? "none" : "transform 300ms ease",
            width: `${displayImages.length * 100}%`,
          }}
        >
          {displayImages.map((url, i) => (
            <div key={i} className="relative shrink-0" style={{ width: `${100 / displayImages.length}%` }}>
              <img
                src={url}
                alt={`${alt} – Bild ${i + 1}`}
                className="w-full h-full object-cover"
                loading={i <= current + 1 ? "eager" : "lazy"}
              />
              {/* "Alle X Bilder" overlay on last slide */}
              {hasMultiple && i === displayImages.length - 1 && allCount > displayImages.length && (
                <button
                  onClick={handleOverlayClick}
                  className="absolute inset-x-0 bottom-0 bg-black/50 flex items-center justify-center py-2 cursor-pointer"
                >
                  <span className="text-white text-xs font-medium">
                    Alle {allCount} Bilder
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      </AspectRatio>

      {/* Nav arrows - hover only */}
      {hasMultiple && isHovered && (
        <>
          {current > 0 && (
            <button
              onClick={(e) => goTo(current - 1, e)}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors z-10"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {current < displayImages.length - 1 && (
            <button
              onClick={(e) => goTo(current + 1, e)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors z-10"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </>
      )}

      {/* Pagination dots */}
      {hasMultiple && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {displayImages.map((_, i) => (
            <button
              key={i}
              onClick={(e) => goTo(i, e)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === current ? "bg-primary" : "bg-white/50 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
});

ImageCarousel.displayName = "ImageCarousel";
export default ImageCarousel;
