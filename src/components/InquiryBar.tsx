import { useNavigate, useLocation } from "react-router-dom";
import { Send, X } from "lucide-react";
import { useInquiry } from "@/contexts/InquiryContext";

const InquiryBar = () => {
  const { inquiryList, inquiryCount, removeFromInquiry, clearInquiry } = useInquiry();
  const navigate = useNavigate();
  const location = useLocation();

  // Hide on /anfrage routes (already see the list there) and on detail pages on mobile
  // (the detail page has its own sticky CTA — only ONE sticky bar at a time on mobile).
  const isDetailRoute = location.pathname.startsWith("/fahrzeug/");
  if (inquiryCount === 0 || location.pathname.startsWith("/anfrage")) {
    return null;
  }

  const visibleThumbs = inquiryList.slice(0, 5);
  const remaining = inquiryCount - visibleThumbs.length;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md animate-in slide-in-from-bottom-4 duration-300 ${
        isDetailRoute ? "hidden lg:block" : ""
      }`}
      style={{
        background: "rgba(0, 13, 20, 0.92)",
        borderTopColor: "rgba(218, 27, 30, 0.3)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap md:flex-nowrap">
          {/* Left: thumbs + count */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex -space-x-2">
              {visibleThumbs.map((v) => {
                const img = v.image_urls?.[0];
                return (
                  <div
                    key={v.id}
                    className="relative h-10 w-10 md:h-12 md:w-12 rounded-md overflow-hidden border-2 border-[rgba(255,255,255,0.15)] bg-black/40 group"
                    title={v.title}
                  >
                    {img ? (
                      <img src={img} alt={v.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-white/5" />
                    )}
                    <button
                      onClick={() => removeFromInquiry(v.id)}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`${v.title} entfernen`}
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  </div>
                );
              })}
              {remaining > 0 && (
                <div className="h-10 w-10 md:h-12 md:w-12 rounded-md bg-white/10 border-2 border-[rgba(255,255,255,0.15)] flex items-center justify-center text-white text-xs font-semibold">
                  +{remaining}
                </div>
              )}
            </div>
            <p className="text-sm md:text-base font-medium text-white whitespace-nowrap">
              {inquiryCount} {inquiryCount === 1 ? "Fahrzeug" : "Fahrzeuge"} in Anfrage
            </p>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={clearInquiry}
              className="text-xs md:text-sm px-3 py-2 text-white/60 hover:text-white transition-colors"
            >
              Leeren
            </button>
            <button
              onClick={() => navigate("/anfrage")}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 md:px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Anfrage senden</span>
              <span className="sm:hidden">Anfragen</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InquiryBar;
