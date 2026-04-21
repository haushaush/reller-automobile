import { MapPin, Phone, Mail, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const DealerLocation = () => {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Besichtigung & Probefahrt</h3>

        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span className="text-foreground">Steinbruchweg 16-22, 33106 Paderborn</span>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-primary shrink-0" />
            <a href="tel:+4952516942 40" className="text-foreground hover:text-primary transition-colors">
              05251 69 42 40
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-primary shrink-0" />
            <a href="mailto:info@reller-automobile.de" className="text-foreground hover:text-primary transition-colors">
              info@reller-automobile.de
            </a>
          </div>
          <div className="flex items-start gap-3">
            <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="text-muted-foreground">
              <p>Mo–Fr: 09:00–13:00 & 14:00–18:00</p>
              <p>Sa: nach tel. Absprache</p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <Button asChild className="w-full gap-2">
            <a
              href="https://www.google.com/maps/dir/?api=1&destination=51.7148,8.7538"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" /> Route planen
            </a>
          </Button>
        </div>
      </div>

      <iframe
        title="Reller Automobile Standort"
        src="https://maps.google.com/maps?q=51.7148,8.7538&z=15&output=embed"
        className="w-full h-64 border-t border-border"
        loading="lazy"
        allowFullScreen
      />
    </div>
  );
};

export default DealerLocation;
