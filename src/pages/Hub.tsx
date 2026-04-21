import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import VehicleListGrid from "@/components/VehicleListGrid";
import { CATEGORIES } from "@/lib/categories";
import { useVehicleCounts } from "@/hooks/useVehicleCounts";

const Hub = () => {
  const { data: counts } = useVehicleCounts();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <header className="py-12 md:py-16 px-4 max-w-3xl mx-auto text-center">
        <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight">
          Finden Sie das Fahrzeug, das zu Ihnen passt
        </h1>
      </header>

      <section className="max-w-5xl mx-auto px-4 mb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          {CATEGORIES.map((cat) => {
            const count = counts?.[cat.slug];
            return (
              <Link
                key={cat.slug}
                to={`/fahrzeuge/${cat.slug}`}
                className="group rounded-xl border border-border bg-card px-5 py-5 sm:py-6 text-center hover:border-primary hover:-translate-y-0.5 transition-all min-h-[88px] flex flex-col items-center justify-center"
              >
                <h2 className="text-base md:text-lg font-semibold text-foreground">
                  {cat.title}
                </h2>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {count === undefined
                    ? "–"
                    : `${count} ${count === 1 ? "Fahrzeug" : "Fahrzeuge"}`}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <main id="fahrzeuge" className="max-w-7xl mx-auto px-4 pb-20">
        <VehicleListGrid showCategorySelect />
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

export default Hub;
