import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { CATEGORIES } from "@/lib/categories";
import { useVehicleCounts } from "@/hooks/useVehicleCounts";

const Hub = () => {
  const { data: counts } = useVehicleCounts();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <header className="py-16 md:py-24 px-4 max-w-7xl mx-auto">
        <p
          className="text-xs tracking-[0.3em] uppercase mb-4 font-semibold"
          style={{ color: "#da1b1e", fontFamily: "'Instrument Sans', sans-serif" }}
        >
          Vom Alltagsfahrzeug bis zum automobilen Klassiker
        </p>
        <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight max-w-3xl">
          Finden Sie das Fahrzeug, das zu Ihnen passt
        </h1>
        <p
          className="text-muted-foreground text-base md:text-lg max-w-2xl leading-relaxed"
          style={{ fontFamily: "'Instrument Sans', sans-serif" }}
        >
          Vier Welten unter einem Dach — wählen Sie Ihre Kategorie.
        </p>
      </header>

      <main className="max-w-7xl mx-auto px-4 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CATEGORIES.map((cat) => {
            const count = counts?.[cat.slug];
            return (
              <Link
                key={cat.slug}
                to={`/fahrzeuge/${cat.slug}`}
                className="group relative overflow-hidden rounded-2xl border border-border hover:border-[#da1b1e] transition-colors"
                style={{ aspectRatio: "16 / 9" }}
              >
                <img
                  src={cat.image}
                  alt={cat.title}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                {/* Gradient overlay */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.85) 100%)",
                  }}
                />

                {/* Content */}
                <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-8">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <h2
                        className="text-white font-semibold leading-tight"
                        style={{ fontSize: "clamp(20px, 2.5vw, 26px)" }}
                      >
                        {cat.title}
                      </h2>
                      <p
                        className="text-white/70 text-sm mt-2 max-w-md hidden md:block"
                        style={{ fontFamily: "'Instrument Sans', sans-serif" }}
                      >
                        {cat.description}
                      </p>
                    </div>
                    <span
                      className="text-white/80 text-sm whitespace-nowrap shrink-0"
                      style={{ fontFamily: "'Instrument Sans', sans-serif" }}
                    >
                      {count === undefined
                        ? "–"
                        : `${count} ${count === 1 ? "Fahrzeug" : "Fahrzeuge"}`}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Link to all */}
        <div className="mt-10 text-center">
          <Link
            to="/fahrzeuge"
            className="inline-flex items-center gap-2 text-sm font-semibold hover:underline"
            style={{ color: "hsl(var(--primary))", fontFamily: "'Instrument Sans', sans-serif" }}
          >
            Alle {counts?.total ?? ""} Fahrzeuge ansehen →
          </Link>
        </div>
      </main>

      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>
            © {new Date().getFullYear()} Reller Automobile. Alle Rechte vorbehalten.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>
            <a href="https://reller-automobile.de/impressum" className="hover:text-foreground transition-colors">Impressum</a>
            <a href="https://reller-automobile.de/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Hub;
