import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X, ArrowLeft } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import FavoritesDrawer from "@/components/FavoritesDrawer";
import InquiryNavButton from "@/components/InquiryNavButton";
import { CATEGORIES } from "@/lib/categories";
import rellerLogo from "@/assets/reller-logo.avif";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-sm border-b transition-colors bg-background/95 border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-[auto_1fr_auto] items-center h-16 md:h-20 gap-4">
          {/* Left: Logo */}
          <Link to="/" className="flex items-center shrink-0">
            <img
              src={rellerLogo}
              alt="Reller Automobile"
              className="h-9 sm:h-10 md:h-12 w-auto object-contain logo-adaptive"
              style={{ aspectRatio: "auto" }}
              loading="eager"
              decoding="async"
            />
          </Link>

          {/* Center: Nav links — only on lg+ (1024px+) to avoid cramped tablet rendering */}
          <div className="hidden lg:flex items-center justify-center gap-1">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                to={`/fahrzeuge/${cat.slug}`}
                className="px-3 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors rounded-md whitespace-nowrap"
              >
                {cat.title}
              </Link>
            ))}
            <a
              href="https://reller-automobile.de"
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md whitespace-nowrap inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Zurück zur Website
            </a>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 sm:gap-2 justify-end">
            <ThemeToggle />
            <FavoritesDrawer />
            <InquiryNavButton />

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2.5 text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Menü"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-background">
          <div className="px-4 py-4 space-y-1">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                to={`/fahrzeuge/${cat.slug}`}
                className="block px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary transition-colors rounded-md min-h-[44px]"
                onClick={() => setMobileOpen(false)}
              >
                {cat.title}
              </Link>
            ))}
            <div className="border-t border-border my-2" />
            <a
              href="https://reller-automobile.de"
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md min-h-[44px]"
              onClick={() => setMobileOpen(false)}
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück zur Website
            </a>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
