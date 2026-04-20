import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X, ChevronDown } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import FavoritesDrawer from "@/components/FavoritesDrawer";
import InquiryNavButton from "@/components/InquiryNavButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORIES } from "@/lib/categories";
import rellerLogo from "@/assets/reller-logo.avif";

const externalLinks = [
  { label: "Werkstatt & Services", href: "https://reller-automobile.de/#werkstatt" },
  { label: "Für Unternehmen", href: "https://reller-automobile.de/#unternehmen" },
  { label: "Karriere", href: "https://reller-automobile.de/karriere" },
  { label: "Über Uns", href: "https://reller-automobile.de/#ueber-uns" },
];

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-sm border-b transition-colors bg-background/95 border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Link to="/" className="flex items-center shrink-0">
            <img
              src={rellerLogo}
              alt="Reller Automobile"
              className="h-10 md:h-12 w-auto logo-adaptive"
            />
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {/* Fahrzeuge dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors rounded-md outline-none"
                style={{ fontFamily: "'Instrument Sans', sans-serif" }}
              >
                Fahrzeuge
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="min-w-[260px]"
                style={{ fontFamily: "'Instrument Sans', sans-serif" }}
              >
                {CATEGORIES.map((cat) => (
                  <DropdownMenuItem key={cat.slug} asChild>
                    <Link to={`/fahrzeuge/${cat.slug}`} className="cursor-pointer">
                      {cat.title}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/fahrzeuge" className="cursor-pointer font-medium">
                    Alle Fahrzeuge
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {externalLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md"
                style={{ fontFamily: "'Instrument Sans', sans-serif" }}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <FavoritesDrawer />
            <InquiryNavButton />
            <Link
              to="/"
              className="hidden md:inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors"
              style={{ fontFamily: "'Instrument Sans', sans-serif" }}
            >
              Aktueller Fahrzeugbestand
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 text-foreground"
              aria-label="Menü"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="px-4 py-4 space-y-1">
            <p className="px-4 pt-2 pb-1 text-xs uppercase tracking-wider text-muted-foreground">
              Fahrzeuge
            </p>
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                to={`/fahrzeuge/${cat.slug}`}
                className="block px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary transition-colors rounded-md"
                onClick={() => setMobileOpen(false)}
              >
                {cat.title}
              </Link>
            ))}
            <Link
              to="/fahrzeuge"
              className="block px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md"
              onClick={() => setMobileOpen(false)}
            >
              Alle Fahrzeuge
            </Link>

            <div className="border-t border-border my-2" />

            {externalLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="block px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <Link
              to="/"
              className="block mt-3 text-center bg-primary text-primary-foreground px-5 py-3 rounded-full text-sm font-semibold"
              onClick={() => setMobileOpen(false)}
            >
              Aktueller Fahrzeugbestand →
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
