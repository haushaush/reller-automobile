import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LISTING_STATUS_LABELS,
  PLATFORM_LABELS,
  PLATFORM_ORDER,
  PLATFORM_SHORT,
  accountBadgeClass,
  accountShortLabel,
  findAccount,
  isAccountCategoryMismatch,
  type ListingStatus,
  type ListingSummary,
  type PlatformAccountRow,
} from "@/lib/listings";

/**
 * Kompakte Plattform-Kürzel eines Fahrzeugs, eingefärbt nach Status.
 * online = kräftig, pausiert = blass, Fehler = rot, nicht inseriert = grauer Umriss.
 * Bei Mobile.de wird zusätzlich das genutzte Konto angehängt.
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
        const short = account
          ? accountShortLabel(accounts, l.account_key) ?? ""
          : null;
        const mismatch =
          l.platform === "mobile_de" &&
          l.status !== "not_listed" &&
          isAccountCategoryMismatch(accounts, l.account_key, vehicleCategory);
        const kuerzel = short
          ? `${PLATFORM_SHORT[l.platform]}·${short.replace(/konto$/i, "").slice(0, 6)}`
          : PLATFORM_SHORT[l.platform];
        return (
          <Tooltip key={l.platform}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${PLATFORM_LABELS[l.platform]}: ${LISTING_STATUS_LABELS[l.status]}${
                  short ? ` · Konto: ${short}` : ""
                }`}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-wide ${
                  STATUS_CLASSES[l.status]
                }`}
              >
                <span>{PLATFORM_SHORT[l.platform]}</span>
                {short && (
                  <span
                    className={`rounded-sm px-1 py-[1px] text-[9px] font-medium ${accountBadgeClass(
                      account?.badge_color,
                    )}`}
                  >
                    {short.replace(/konto$/i, "")}
                  </span>
                )}
                {mismatch && <AlertTriangle className="h-3 w-3 text-amber-500" />}
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
