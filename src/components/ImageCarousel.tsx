import { useState, useRef, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ImageCarouselProps {
  images: string[];
  alt: string;
  vehicleId?: string;
  totalImages?: number;
}

const ImageCarousel = memo(({ images, alt, vehicleId, totalImages }: ImageCarouselProps) => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef(0);

  const displayImages = images.slice(0, 5);
  const hasMultiple = displayImages.length > 1;
  const allCount = totalImages ?? images.length;

  const goNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => Math.min(prev + 1, displayImages.length - 1));
  }, [displayImages.length]);

  const goPrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const goTo = useCallback((idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(idx);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) {
      if (delta < 0) {
        setCurrentIndex(prev => Math.min(prev + 1, displayImages.length - 1));
      } else {
        setCurrentIndex(prev => Math.max(prev - 1, 0));
      }
    }
  }, [displayImages.length]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (vehicleId) navigate(`/fahrzeug/${vehicleId}`);
  }, [vehicleId, navigate]);

  return (
    <div
      className="relative overflow-hidden aspect-video group/carousel"
      onTouchStart={hasMultiple ? handleTouchStart : undefined}
      onTouchEnd={hasMultiple ? handleTouchEnd : undefined}
    >
      {/* Image track */}
      <div
        className="flex h-full"
        style={{
          transform: `translateX(-${currentIndex * 100}%)`,
          transition: "transform 300ms ease",
        }}
      >
        {displayImages.map((url, i) => (
          <div
            key={i}
            className="relative shrink-0"
            style={{ minWidth: "100%", width: "100%" }}
          >
            <img
              src={url}
              alt={`${alt} – Bild ${i + 1}`}
              className="w-full h-full object-cover"
              loading={i <= currentIndex + 1 ? "eager" : "lazy"}
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

      {/* Nav arrows — always visible on touch devices, hover-only on desktop */}
      {hasMultiple && (
        <>
          {currentIndex > 0 && (
            <button
              onClick={goPrev}
              aria-label="Vorheriges Bild"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full h-11 w-11 flex items-center justify-center transition-opacity z-10 opacity-100 lg:opacity-0 lg:group-hover/carousel:opacity-100"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {currentIndex < displayImages.length - 1 && (
            <button
              onClick={goNext}
              aria-label="Nächstes Bild"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full h-11 w-11 flex items-center justify-center transition-opacity z-10 opacity-100 lg:opacity-0 lg:group-hover/carousel:opacity-100"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </>
      )}

      {/* Pagination dots */}
      {hasMultiple && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {displayImages.map((_, i) => (
            <button
              key={i}
              onClick={(e) => goTo(i, e)}
              aria-label={`Bild ${i + 1}`}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentIndex
                  ? "bg-[hsl(var(--primary))]"
                  : "bg-white/30 hover:bg-white/60"
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
