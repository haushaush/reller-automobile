import { useNavigate, useLocation } from "react-router-dom";
import { Scale, Send, X } from "lucide-react";
import { useInquiry } from "@/contexts/InquiryContext";
import { useCompare } from "@/contexts/CompareContext";
import { useFooterVisible } from "@/hooks/useFooterVisible";
import { Button } from "@/components/ui/button";

/**
 * Single combined sticky bar showing both the "Vergleich" (compare)
 * and "Anfrage" (inquiry) lists. Slides out of the way when the
 * page footer scrolls into view so it never covers the footer.
 */
const FloatingActionBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { inquiryList, inquiryCount, removeFromInquiry, clearInquiry } = useInquiry();
  const { selected: compareList, remove: removeFromCompare, clear: clearCompare } = useCompare();
  const footerVisible = useFooterVisible(140);

  const hasCompare = compareList.length >= 2;
  const hasInquiry = inquiryCount > 0;

  // Hide on inquiry-flow pages — user is already there.
  const onInquiryRoute = location.pathname.startsWith("/anfrage");
  const onComparePage = location.pathname.startsWith("/vergleich");

  if (onInquiryRoute && onComparePage) return null;
  if (!hasCompare && !hasInquiry) return null;

  const showCompare = hasCompare && !onComparePage;
  const showInquiry = hasInquiry && !onInquiryRoute;

  if (!showCompare && !showInquiry) return null;

  const visibleThumbs = inquiryList.slice(0, 4);
  const remaining = inquiryCount - visibleThumbs.length;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md transition-transform duration-300 animate-in slide-in-from-bottom-4 ${
        footerVisible ? "translate-y-full" : "translate-y-0"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-6">
          {/* Compare Section */}
          {showCompare && (
            <div className="flex items-center justify-between md:justify-start gap-3 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Scale className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">
                    {compareList.length} im Vergleich
                  </p>
                  <p className="text-xs text-muted-foreground leading-tight">
                    {compareList.length} von 3 ausgewählt
                  </p>
                </div>
              </div>

              {/* Desktop thumbs */}
              <div className="hidden lg:flex items-center gap-1.5">
                {compareList.map((v) => {
                  const img = v.image_urls?.[0];
                  return (
                    <div
                      key={v.id}
                      className="relative h-9 w-12 rounded overflow-hidden border border-border bg-muted group"
                      title={v.title}
                    >
                      {img ? (
                        <img src={img} alt={v.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-muted" />
                      )}
                      <button
                        onClick={() => removeFromCompare(v.id)}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-90 hover:opacity-100"
                        aria-label={`${v.title} aus Vergleich entfernen`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={clearCompare}
                  className="text-xs px-2.5 min-h-[36px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Leeren
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/vergleich")}
                  className="gap-1.5 min-h-[36px]"
                >
                  <Scale className="h-4 w-4" />
                  <span className="hidden sm:inline">Vergleichen</span>
                </Button>
              </div>
            </div>
          )}

          {/* Divider when both sections are visible */}
          {showCompare && showInquiry && (
            <div className="hidden md:block h-10 w-px bg-border" aria-hidden />
          )}
          {showCompare && showInquiry && (
            <div className="md:hidden h-px w-full bg-border" aria-hidden />
          )}

          {/* Inquiry Section */}
          {showInquiry && (
            <div className="flex items-center justify-between md:justify-end gap-3 min-w-0 md:flex-1">
              {/* Desktop thumbs */}
              <div className="hidden md:flex -space-x-2">
                {visibleThumbs.map((v) => {
                  const img = v.image_urls?.[0];
                  return (
                    <div
                      key={v.id}
                      className="relative h-10 w-10 rounded-md overflow-hidden border-2 border-card bg-muted group"
                      title={v.title}
                    >
                      {img ? (
                        <img src={img} alt={v.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-muted" />
                      )}
                      <button
                        onClick={() => removeFromInquiry(v.id)}
                        className="absolute inset-0 flex items-center justify-center bg-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`${v.title} aus Anfrage entfernen`}
                      >
                        <X className="h-3.5 w-3.5 text-background" />
                      </button>
                    </div>
                  );
                })}
                {remaining > 0 && (
                  <div className="h-10 w-10 rounded-md bg-muted border-2 border-card flex items-center justify-center text-foreground text-xs font-semibold">
                    +{remaining}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary md:hidden">
                  <Send className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold text-foreground whitespace-nowrap">
                  {inquiryCount} {inquiryCount === 1 ? "Fahrzeug" : "Fahrzeuge"}
                  <span className="hidden sm:inline"> in Anfrage</span>
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={clearInquiry}
                  className="text-xs px-2.5 min-h-[36px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Leeren
                </button>
                <Button
                  size="sm"
                  onClick={() => navigate("/anfrage")}
                  className="gap-1.5 min-h-[36px]"
                >
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">Anfrage senden</span>
                  <span className="sm:hidden">Anfragen</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FloatingActionBar;
