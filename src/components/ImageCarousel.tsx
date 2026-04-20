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
  const [isHovered, setIsHovered] = useState(false);
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
      className="relative overflow-hidden aspect-video"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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

      {/* Nav arrows - hover only */}
      {hasMultiple && isHovered && (
        <>
          {currentIndex > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors z-10"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {currentIndex < displayImages.length - 1 && (
            <button
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors z-10"
            >
              <ChevronRight className="h-6 w-6" />
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
