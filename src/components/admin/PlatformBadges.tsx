import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LISTING_STATUS_LABELS,
  PLATFORM_LABELS,
  PLATFORM_ORDER,
  PLATFORM_SHORT,
  type ListingStatus,
  type ListingSummary,
} from "@/lib/listings";

/**
 * Kompakte Plattform-Kürzel eines Fahrzeugs, eingefärbt nach Status.
 * online = kräftig, pausiert = blass, Fehler = rot, nicht inseriert = grauer Umriss.
 */
const STATUS_CLASSES: Record<ListingStatus, string> = {
  live: "bg-emerald-600 text-white border-emerald-600",
  publishing: "bg-sky-500 text-white border-sky-500",
  draft: "bg-secondary text-secondary-foreground border-transparent",
  paused: "bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 border-transparent",
  error: "bg-destructive text-destructive-foreground border-destructive",
  ended: "bg-muted text-muted-foreground border-transparent",
  not_listed: "bg-transparent text-muted-foreground border-border border-dashed",
};

interface Props {
  listings: ListingSummary[] | undefined;
  /** Nicht inserierte Plattformen ausblenden */
  hideNotListed?: boolean;
  className?: string;
}

export default function PlatformBadges({ listings, hideNotListed, className }: Props) {
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
      {visible.map((l) => (
        <Tooltip key={l.platform}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${PLATFORM_LABELS[l.platform]}: ${LISTING_STATUS_LABELS[l.status]}`}
              className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-wide ${
                STATUS_CLASSES[l.status]
              }`}
            >
              {PLATFORM_SHORT[l.platform]}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px]">
            <p className="text-xs font-medium">{PLATFORM_LABELS[l.platform]}</p>
            <p className="text-xs">{LISTING_STATUS_LABELS[l.status]}</p>
            {l.error_message && (
              <p className="mt-1 text-xs text-destructive">{l.error_message}</p>
            )}
            {l.note && <p className="mt-1 text-xs text-muted-foreground">{l.note}</p>}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
