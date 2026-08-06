import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LISTING_STATUS_LABELS,
  MANUAL_STATUS_CHOICES,
  PLATFORM_LABELS,
  PLATFORM_ORDER,
  accountBadgeClass,
  accountFullLabel,
  accountLabel,
  accountShortLabel,
  ensureListingRows,
  findAccount,
  isAccountCategoryMismatch,
  isAccountLocked,
  isManualPlatform,
  suggestAccountKey,
  type ListingPlatform,
  type ListingRow,
  type ListingStatus,
  type PlatformAccountRow,
} from "@/lib/listings";

interface Props {
  vehicleId: string;
  vehicleCategory: string | null | undefined;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VehicleListingsPanel({ vehicleId, vehicleCategory }: Props) {
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { external_url: string; note: string }>>({});

  const { data: accounts = [] } = useQuery({
    queryKey: ["platform-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_accounts")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as PlatformAccountRow[];
    },
  });

  const { data: listings, isLoading } = useQuery({
    queryKey: ["vehicle-listings", vehicleId],
    queryFn: async () => {
      await ensureListingRows(vehicleId, vehicleCategory, accounts);
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("vehicle_id", vehicleId);
      if (error) throw error;
      return (data ?? []) as ListingRow[];
    },
    enabled: accounts.length > 0,
  });

  const byPlatform = new Map((listings ?? []).map((l) => [l.platform as ListingPlatform, l]));

  const patchListing = async (listing: ListingRow, patch: Partial<ListingRow>) => {
    setSavingId(listing.id);
    try {
      const { error } = await supabase
        .from("listings")
        .update(patch as never)
        .eq("id", listing.id);
      if (error) throw error;
      toast.success("Inserat aktualisiert");
      queryClient.invalidateQueries({ queryKey: ["vehicle-listings", vehicleId] });
      queryClient.invalidateQueries({ queryKey: ["listing-tasks"] });
    } catch (e) {
      toast.error(`Speichern fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setSavingId(null);
    }
  };

  if (isLoading || accounts.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border">
      <div className="p-4 sm:p-6">
        <h2 className="text-sm font-semibold">Inserate</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Mobile.de wird automatisch geführt. AutoScout24 und Kleinanzeigen pflegen Sie hier von
          Hand — das Portal erinnert Sie an offene Handgriffe.
        </p>
      </div>

      {PLATFORM_ORDER.map((platform) => {
        const listing = byPlatform.get(platform);
        if (!listing) return null;
        const manual = isManualPlatform(platform);
        const locked = !manual;
        const draft = drafts[listing.id] ?? {
          external_url: listing.external_url ?? "",
          note: listing.note ?? "",
        };
        const dirty =
          draft.external_url !== (listing.external_url ?? "") ||
          draft.note !== (listing.note ?? "");

        return (
          <div key={platform} className="space-y-3 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{PLATFORM_LABELS[platform]}</span>
              {locked ? (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Lock className="h-3 w-3" /> automatisch
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  von Hand gepflegt
                </Badge>
              )}
              {listing.account_key && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    platform === "mobile_de"
                      ? accountBadgeClass(findAccount(accounts, platform, listing.account_key)?.badge_color)
                      : ""
                  }`}
                >
                  Konto:{" "}
                  {platform === "mobile_de"
                    ? accountFullLabel(accounts, listing.account_key)
                    : accountLabel(accounts, platform, listing.account_key)}
                </Badge>
              )}
              {platform === "mobile_de" &&
                isAccountCategoryMismatch(accounts, listing.account_key, vehicleCategory) && (
                  <Badge variant="outline" className="gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" /> Konto passt nicht zur Fahrzeugart
                  </Badge>
                )}
              <span className="ml-auto text-xs text-muted-foreground">
                Zuletzt geändert: {formatDate(listing.updated_at)}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
              <Select
                value={listing.status}
                disabled={locked || savingId === listing.id}
                onValueChange={(v) =>
                  patchListing(listing, {
                    status: v as ListingStatus,
                    published_at:
                      v === "live" ? listing.published_at ?? new Date().toISOString() : listing.published_at,
                  })
                }
              >
                <SelectTrigger aria-label={`Status ${PLATFORM_LABELS[platform]}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(locked
                    ? ([listing.status] as ListingStatus[])
                    : MANUAL_STATUS_CHOICES
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {LISTING_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                <Input
                  value={draft.external_url}
                  disabled={locked}
                  placeholder="Link zum Inserat"
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [listing.id]: { ...draft, external_url: e.target.value },
                    }))
                  }
                />
                {listing.external_url && (
                  <Button asChild variant="outline" size="icon" aria-label="Inserat öffnen">
                    <a href={listing.external_url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </div>

            <Input
              value={draft.note}
              disabled={locked}
              placeholder="Notiz (intern)"
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [listing.id]: { ...draft, note: e.target.value } }))
              }
            />

            {listing.error_message && (
              <p className="text-xs text-destructive">{listing.error_message}</p>
            )}

            {locked && isAccountLocked(listing) && (
              <p className="text-xs text-muted-foreground">
                Dieses Inserat läuft über das Konto „{(platform === "mobile_de"
                  ? accountFullLabel(accounts, listing.account_key)
                  : accountLabel(accounts, platform, listing.account_key)) ?? "—"}“. Ein Wechsel des Kontos ist nicht möglich — dafür müssten Sie das Inserat
                löschen und neu erstellen.
              </p>
            )}

            {!locked && dirty && (
              <Button
                size="sm"
                disabled={savingId === listing.id}
                onClick={() =>
                  patchListing(listing, {
                    external_url: draft.external_url.trim() || null,
                    note: draft.note.trim() || null,
                  })
                }
              >
                {savingId === listing.id && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Änderungen speichern
              </Button>
            )}
          </div>
        );
      })}

      {!byPlatform.get("mobile_de")?.account_key && (
        <div className="p-4 text-xs text-muted-foreground sm:p-6">
          Vorschlag für das Mobile.de-Konto:{" "}
          {accountFullLabel(accounts, suggestAccountKey(accounts, vehicleCategory)) ??
            accountShortLabel(accounts, suggestAccountKey(accounts, vehicleCategory))}
        </div>
      )}
    </Card>
  );
}
