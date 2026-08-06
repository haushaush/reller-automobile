import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LISTING_STATUS_LABELS,
  PLATFORM_LABELS,
  PLATFORM_ORDER,
  accountShortLabel,
  findAccount,
  isAccountCategoryMismatch,
  type ListingPlatform,
  type ListingStatus,
  type ListingSummary,
  type PlatformAccountRow,
} from "@/lib/listings";

/**
 * Kompakte Plattform-Kürzel eines Fahrzeugs in den offiziellen Markenfarben:
 * Mobile.de Orange (#FF5A00), AutoScout24 Gelb (#FFED00), Kleinanzeigen Grün (#3AA935).
 * Alle drei sind helle Farben, deshalb durchgehend dunkle Schrift — das bleibt
 * in hellem wie dunklem Modus gut lesbar.
 * Pausiert = blass, Fehler = rot, beendet = grau, nicht inseriert = grauer Umriss.
 */
const BRAND_CLASSES: Record<ListingPlatform, string> = {
  mobile_de: "bg-[#FF5A00] text-[#1A1A1A] border-[#E24F00]",
  autoscout24: "bg-[#FFED00] text-[#1A1A1A] border-[#E0D000]",
  kleinanzeigen: "bg-[#3AA935] text-[#0B1F0A] border-[#2E8A2A]",
};

/** Kürzel laut Vorgabe: M, AS, KA */
const SHORT: Record<ListingPlatform, string> = {
  mobile_de: "M",
  autoscout24: "AS",
  kleinanzeigen: "KA",
};

function badgeClass(platform: ListingPlatform, status: ListingStatus): string {
  switch (status) {
    case "not_listed":
      return "bg-transparent text-muted-foreground border-border border-dashed";
    case "error":
      return "bg-destructive text-destructive-foreground border-destructive";
    case "ended":
      return "bg-muted text-muted-foreground border-transparent";
    case "paused":
      return `${BRAND_CLASSES[platform]} opacity-60`;
    default:
      return BRAND_CLASSES[platform];
  }
}

/** „Hauptkonto“ → „Haupt“, „Unfallkonto“ → „Unfall“ */
function accountArt(short: string | null): string | null {
  if (!short) return null;
  return short.replace(/konto$/i, "").trim() || short;
}

interface Props {
  listings: ListingSummary[] | undefined;
  /** Nicht inserierte Plattformen ausblenden */
  hideNotListed?: boolean;
  className?: string;
  /** Kontostammdaten für Kurzbezeichnung, Farbe und Kundennummer */
  accounts?: PlatformAccountRow[];
  /** Fahrzeugart, um ein unpassendes Konto zu erkennen */
  vehicleCategory?: string | null;
}

export default function PlatformBadges({
  listings,
  hideNotListed,
  className,
  accounts = [],
  vehicleCategory,
}: Props) {
  const byPlatform = new Map((listings ?? []).map((l) => [l.platform, l]));
  const visible = PLATFORM_ORDER.map((platform) => {
    const l = byPlatform.get(platform);
    return (
      l ?? {
        id: platform,
        platform,
        account_key: null,
        status: "not_listed" as ListingStatus,
        is_manual: platform !== "mobile_de",
        external_ad_id: null,
        external_url: null,
        note: null,
        error_message: null,
        updated_at: "",
      }
    );
  }).filter((l) => !(hideNotListed && l.status === "not_listed"));

  if (visible.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className ?? ""}`}>
      {visible.map((l) => {
        const account =
          l.platform === "mobile_de" ? findAccount(accounts, "mobile_de", l.account_key) : undefined;
        const short = account ? accountShortLabel(accounts, l.account_key) ?? "" : null;
        const art = l.status === "not_listed" ? null : accountArt(short);
        const mismatch =
          l.platform === "mobile_de" &&
          l.status !== "not_listed" &&
          isAccountCategoryMismatch(accounts, l.account_key, vehicleCategory);
        return (
          <Tooltip key={l.platform}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${PLATFORM_LABELS[l.platform]}: ${LISTING_STATUS_LABELS[l.status]}${
                  short ? ` · Konto: ${short}` : ""
                }`}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-wide ${badgeClass(
                  l.platform,
                  l.status,
                )}`}
              >
                <span>{SHORT[l.platform]}</span>
                {art && <span className="font-medium opacity-90">{art}</span>}
                {mismatch && <AlertTriangle className="h-3 w-3 text-amber-600" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px]">
              <p className="text-xs font-medium">{PLATFORM_LABELS[l.platform]}</p>
              <p className="text-xs">{LISTING_STATUS_LABELS[l.status]}</p>
              {account && (
                <p className="text-xs">
                  Konto: {short}
                  {account.seller_id ? ` (${account.seller_id})` : ""}
                </p>
              )}
              {l.external_ad_id && <p className="text-xs">Inserats-Nr. {l.external_ad_id}</p>}
              {l.external_url && (
                <p className="text-xs break-all text-muted-foreground">{l.external_url}</p>
              )}
              {mismatch && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Konto passt nicht zur Fahrzeugart.
                </p>
              )}
              {l.error_message && (
                <p className="mt-1 text-xs text-destructive">{l.error_message}</p>
              )}
              {l.note && <p className="mt-1 text-xs text-muted-foreground">{l.note}</p>}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
