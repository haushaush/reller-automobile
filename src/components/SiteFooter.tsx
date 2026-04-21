/**
 * Shared site footer used on every page so the FloatingActionBar's
 * footer-visibility detection works consistently across the app.
 */
const SiteFooter = () => {
  return (
    <footer className="border-t border-border py-8 px-4 mt-auto">
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
  );
};

export default SiteFooter;
