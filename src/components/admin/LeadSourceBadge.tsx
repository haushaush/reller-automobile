import { Badge } from "@/components/ui/badge";
import { LEAD_SOURCE_LABELS } from "@/lib/leads";

/**
 * Herkunft einer Anfrage in denselben Markenfarben wie die Inserats-Badges
 * der Fahrzeugliste: Mobile.de Orange, AutoScout24 Gelb, Kleinanzeigen Grün.
 * Alle drei sind helle Farben, deshalb durchgehend dunkle Schrift.
 */
const BRAND: Record<string, string> = {
  MOBILE: "bg-[#FF5A00] text-[#1A1A1A] border-[#E24F00]",
  AUTOSCOUT24: "bg-[#FFED00] text-[#1A1A1A] border-[#E0D000]",
  KLEINANZEIGEN: "bg-[#3AA935] text-[#0B1F0A] border-[#2E8A2A]",
};

export default function LeadSourceBadge({
  source,
  className = "",
}: {
  source: string;
  className?: string;
}) {
  const brand = BRAND[source];
  return (
    <Badge
      variant={brand ? "outline" : "secondary"}
      className={`text-[10px] font-semibold ${brand ?? ""} ${className}`}
    >
      {LEAD_SOURCE_LABELS[source] ?? source}
    </Badge>
  );
}
