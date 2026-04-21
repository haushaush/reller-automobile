import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import VehicleListGrid from "@/components/VehicleListGrid";
import { ChevronRight as Chevron } from "lucide-react";
import type { VehicleCategoryKey } from "@/lib/categories";
import type { QuickTabOption } from "@/components/CategoryQuickTabs";

export interface VehicleListPageProps {
  /** Page title shown in the header */
  title: string;
  /** Eyebrow shown above the title (kept for compat, currently ignored) */
  eyebrow?: string;
  /** Optional breadcrumb segments — last item is current page (no link) */
  breadcrumbs?: { label: string; to?: string }[];
  /** Pre-filter to a subset of vehicle_category values (UI bucket). Empty/undefined = all */
  categoryFilter?: VehicleCategoryKey[];
  /** Show the "Kategorie" select inside FilterBar (only useful on /fahrzeuge) */
  showCategorySelect?: boolean;
  /** Optional quick-tabs above the grid (e.g. Oldtimer / Youngtimer) */
  quickTabs?: QuickTabOption[];
}

const VehicleListPage = ({
  title,
  breadcrumbs,
  categoryFilter,
  showCategorySelect = false,
  quickTabs,
}: VehicleListPageProps) => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <header className="px-4 pt-8 max-w-7xl mx-auto">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6 flex-wrap"
          >
            {breadcrumbs.map((bc, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {bc.to ? (
                  <Link to={bc.to} className="hover:text-foreground transition-colors">
                    {bc.label}
                  </Link>
                ) : (
                  <span className="text-foreground">{bc.label}</span>
                )}
                {i < breadcrumbs.length - 1 && <Chevron className="h-3.5 w-3.5 opacity-60" />}
              </span>
            ))}
          </nav>
        )}

        <div className="py-12 text-center max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight">
            {title}
          </h1>
        </div>
      </header>

      <main id="fahrzeuge" className="max-w-7xl mx-auto px-4 pb-20">
        <VehicleListGrid
          categoryFilter={categoryFilter}
          showCategorySelect={showCategorySelect}
          quickTabs={quickTabs}
        />
      </main>

      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Reller Automobile. Alle Rechte vorbehalten.
          </p>
          <a
            href="https://reller-automobile.de"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Zur Hauptwebsite
          </a>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a
              href="https://reller-automobile.de/impressum"
              className="hover:text-foreground transition-colors"
            >
              Impressum
            </a>
            <a
              href="https://reller-automobile.de/datenschutz"
              className="hover:text-foreground transition-colors"
            >
              Datenschutz
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default VehicleListPage;
