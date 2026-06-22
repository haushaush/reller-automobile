import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, Upload, Loader2, Pencil, Radio, Copy, Search, Link2, Car } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface DraftRow {
  id: string;
  status: string;
  payload: Record<string, unknown> | null;
  mobile_ad_id: string | null;
  error_message: string | null;
  created_at: string;
  image_paths: string[] | null;
}

interface VehicleMatch {
  id: string;
  mobile_de_id: string | null;
  brand: string | null;
  model: string | null;
  model_description: string | null;
  title: string | null;
  price: number | null;
  mileage: number | null;
  vin: string | null;
  year: number | string | null;
}

function readPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else return undefined;
  }
  return cur;
}

function readFirst(obj: unknown, paths: string[][]): unknown {
  for (const p of paths) {
    const v = readPath(obj, p);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

const fmtPrice = (v: unknown) =>
  typeof v === "number"
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v)
    : "—";

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

// Liest String-Wert aus möglicherweise {key,label}-Objekten oder direkten Strings
function strOrKey(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.label === "string" && o.label.trim()) return o.label.trim();
    if (typeof o.key === "string" && o.key.trim()) return o.key.trim();
  }
  return undefined;
}

function getDraftDisplayTitle(draft: DraftRow): string {
  const p = (draft.payload ?? {}) as Record<string, unknown>;
  const v = (p.vehicle ?? {}) as Record<string, unknown>;

  // 1) modelDescription in diversen Schreibweisen
  const desc =
    (typeof p.modelDescription === "string" && p.modelDescription) ||
    (typeof p["model-description"] === "string" && p["model-description"]) ||
    (typeof v["model-description"] === "string" && v["model-description"]) ||
    (typeof v.modelDescription === "string" && v.modelDescription);
  if (desc && String(desc).trim()) return String(desc).trim();

  // 2) make + model (Root)
  const rootMake = strOrKey(p.make);
  const rootModel = strOrKey(p.model);
  if (rootMake || rootModel) {
    const combined = [rootMake, rootModel].filter(Boolean).join(" ").trim();
    if (combined) return combined;
  }

  // 3) vehicle.make/model labels & keys
  const vMake = strOrKey(v.make);
  const vModel = strOrKey(v.model);
  if (vMake || vModel) {
    const combined = [vMake, vModel].filter(Boolean).join(" ").trim();
    if (combined) return combined;
  }

  // 4) generische Titel-Felder
  if (typeof p.title === "string" && p.title.trim()) return p.title.trim();
  if (typeof p.name === "string" && p.name.trim()) return p.name.trim();

  // 5) Fallback Mobile.de-ID
  if (draft.mobile_ad_id) return `Mobile.de Inserat ${draft.mobile_ad_id}`;

  return "Unbenannt";
}

function getDraftSubDescription(draft: DraftRow): string | null {
  const p = (draft.payload ?? {}) as Record<string, unknown>;
  const v = (p.vehicle ?? {}) as Record<string, unknown>;
  const desc =
    (typeof p.modelDescription === "string" && p.modelDescription) ||
    (typeof p["model-description"] === "string" && p["model-description"]) ||
    (typeof v["model-description"] === "string" && v["model-description"]) ||
    (typeof v.modelDescription === "string" && v.modelDescription);
  // Nur zeigen, wenn nicht bereits als Titel verwendet
  const title = getDraftDisplayTitle(draft);
  if (desc && String(desc).trim() && String(desc).trim() !== title) return String(desc).trim();
  return null;
}

function getDraftIdentity(payload: unknown) {
  const make = (readFirst(payload, [["vehicle","make","key"], ["make","key"], ["make"]]) ?? null) as string | null;
  const model = (readFirst(payload, [["vehicle","model","key"], ["model","key"], ["model"]]) ?? null) as string | null;
  const desc = (readFirst(payload, [["vehicle","model-description"], ["vehicle","modelDescription"], ["modelDescription"]]) ?? null) as string | null;
  const rawPrice = readFirst(payload, [["price","consumer-price-gross"], ["price","consumerPriceGross"], ["consumerPriceGross"]]);
  const priceNum = typeof rawPrice === "number" ? rawPrice : (typeof rawPrice === "string" ? Number(String(rawPrice).replace(/[^0-9.]/g, "")) : NaN);
  const price = Number.isFinite(priceNum) ? Math.round(priceNum) : null;
  const mileageRaw = readFirst(payload, [["vehicle","mileage"], ["mileage"]]);
  const mileage = typeof mileageRaw === "number" ? mileageRaw : (typeof mileageRaw === "string" ? Number(mileageRaw) : null);
  const vin = (readFirst(payload, [["vehicle","vin"], ["vin"]]) ?? null) as string | null;
  return { make, model, desc, price, mileage: Number.isFinite(mileage as number) ? (mileage as number) : null, vin };
}

function getDraftPayloadImageUrl(payload: unknown): string | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  const imgUrls = p.image_urls;
  if (Array.isArray(imgUrls) && typeof imgUrls[0] === "string") return imgUrls[0];
  const imgs = p.images;
  if (Array.isArray(imgs) && imgs[0]) {
    const first = imgs[0] as Record<string, unknown>;
    if (typeof first.url === "string") return first.url;
    if (typeof first.ref === "string") return first.ref;
    // Mobile.de-Format: { representations: [{ url }] } oder { xxl: { url } }
    const repr = first.representations;
    if (Array.isArray(repr) && repr[0] && typeof (repr[0] as Record<string, unknown>).url === "string") {
      return (repr[0] as Record<string, unknown>).url as string;
    }
    for (const key of ["xxl", "xl", "l", "m", "s"]) {
      const v = first[key];
      if (v && typeof v === "object" && typeof (v as Record<string, unknown>).url === "string") {
        return (v as Record<string, unknown>).url as string;
      }
    }
  }
  return null;
}

function scoreMatch(d: ReturnType<typeof getDraftIdentity>, v: VehicleMatch): number {
  let s = 0;
  if (d.vin && v.vin && d.vin.toUpperCase() === v.vin.toUpperCase()) s += 100;
  if (d.make && v.brand && d.make.toLowerCase() === v.brand.toLowerCase()) s += 10;
  if (d.model && v.model && d.model.toLowerCase() === v.model.toLowerCase()) s += 10;
  if (d.desc && (v.model_description || v.title)) {
    const a = d.desc.toLowerCase();
    const b = ((v.model_description ?? "") + " " + (v.title ?? "")).toLowerCase();
    if (b.includes(a) || a.includes(b.trim())) s += 8;
  }
  if (d.price && v.price && Math.abs(d.price - v.price) <= Math.max(50, d.price * 0.02)) s += 6;
  if (d.mileage && v.mileage && Math.abs(d.mileage - v.mileage) <= Math.max(500, d.mileage * 0.05)) s += 4;
  return s;
}

export default function MobileAdDrafts() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const [confirmCopyId, setConfirmCopyId] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  // Linking dialog state
  const [linkDraft, setLinkDraft] = useState<DraftRow | null>(null);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkMatches, setLinkMatches] = useState<Array<VehicleMatch & { _score: number }>>([]);
  const [linking, setLinking] = useState<string | null>(null);

  const loadThumbs = async (drafts: DraftRow[]) => {
    const next: Record<string, string> = {};
    await Promise.all(drafts.map(async (d) => {
      // Bevorzugt Storage signed URL für erstes Bild
      const firstPath = Array.isArray(d.image_paths) && d.image_paths[0];
      if (firstPath) {
        try {
          const { data } = await supabase.storage
            .from("mobile-ad-images")
            .createSignedUrl(firstPath, 60 * 60);
          if (data?.signedUrl) { next[d.id] = data.signedUrl; return; }
        } catch { /* ignore */ }
      }
      // Fallback: URLs aus Payload
      const url = getDraftPayloadImageUrl(d.payload);
      if (url) next[d.id] = url;
    }));
    setThumbs(next);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("mobile_ad_drafts")
      .select("id, status, payload, mobile_ad_id, error_message, created_at, image_paths")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Laden fehlgeschlagen");
    } else {
      const list = (data ?? []) as DraftRow[];
      setRows(list);
      loadThumbs(list);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Entwurf wirklich löschen?")) return;
    const { error } = await supabase.from("mobile_ad_drafts").delete().eq("id", id);
    if (error) toast.error("Löschen fehlgeschlagen");
    else {
      toast.success("Entwurf gelöscht");
      load();
    }
  };

  const publish = async (id: string) => {
    if (!confirm("Wirklich live auf Mobile.de stellen? Das Inserat wird öffentlich sichtbar.")) return;
    setPublishing(id);
    try {
      const { data, error } = await supabase.functions.invoke("publish-mobile-ad", {
        body: { draftId: id },
      });
      if (error) {
        const msg = (data as { error?: string; details?: unknown } | null)?.error
          || error.message
          || "Unbekannter Fehler";
        toast.error(`Veröffentlichen fehlgeschlagen: ${msg}`);
      } else if ((data as { warning?: boolean } | null)?.warning) {
        toast.warning((data as { message?: string }).message ?? "Inserat erstellt, aber Mobile.de-ID fehlt.");
      } else {
        toast.success("Auf Mobile.de veröffentlicht");
      }
      await load();
    } finally {
      setPublishing(null);
    }
  };

  const copyAsDraft = async (id: string) => {
    const orig = rows.find((r) => r.id === id);
    if (!orig) return;
    setCopying(id);
    try {
      const basePayload = orig.payload && typeof orig.payload === "object"
        ? JSON.parse(JSON.stringify(orig.payload))
        : {};
      const newPayload = {
        ...basePayload,
        _copiedFromDraftId: orig.id,
        _copiedFromMobileAdId: orig.mobile_ad_id ?? null,
        _copiedAt: new Date().toISOString(),
      };
      const { data: userRes } = await supabase.auth.getUser();
      const insertRow: Record<string, unknown> = {
        status: "draft",
        payload: newPayload,
        image_paths: Array.isArray(orig.image_paths) ? [...orig.image_paths] : [],
        mobile_ad_id: null,
        error_message: null,
      };
      if (userRes?.user?.id) insertRow.created_by = userRes.user.id;
      const { data, error } = await supabase
        .from("mobile_ad_drafts")
        .insert(insertRow as never)
        .select("id")
        .single();
      if (error || !data?.id) {
        console.error("Kopieren fehlgeschlagen:", error?.message);
        toast.error(`Kopieren fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`);
        return;
      }
      toast.success("Inserat wurde als neuer Entwurf kopiert.");
      navigate(`/admin/mobile-ad/edit/${data.id}`);
    } finally {
      setCopying(null);
      setConfirmCopyId(null);
    }
  };

  const openLinkDialog = async (draft: DraftRow) => {
    setLinkDraft(draft);
    setLinkMatches([]);
    setLinkSearching(true);
    try {
      const d = getDraftIdentity(draft.payload);

      // VIN-first exact match
      if (d.vin) {
        const { data } = await supabase
          .from("vehicles")
          .select("id, mobile_de_id, brand, model, model_description, title, price, mileage, vin, year")
          .ilike("vin", d.vin)
          .limit(10);
        if (data && data.length) {
          const scored = data.map((v) => ({ ...(v as VehicleMatch), _score: scoreMatch(d, v as VehicleMatch) }));
          scored.sort((a, b) => b._score - a._score);
          setLinkMatches(scored);
          return;
        }
      }

      // Fallback: brand+model, optional price window
      let q = supabase
        .from("vehicles")
        .select("id, mobile_de_id, brand, model, model_description, title, price, mileage, vin, year")
        .not("mobile_de_id", "is", null);
      if (d.make) q = q.ilike("brand", d.make);
      if (d.model) q = q.ilike("model", d.model);
      if (d.price) {
        const lo = Math.floor(d.price * 0.9);
        const hi = Math.ceil(d.price * 1.1);
        q = q.gte("price", lo).lte("price", hi);
      }
      const { data, error } = await q.limit(50);
      if (error) {
        toast.error(`Suche fehlgeschlagen: ${error.message}`);
        return;
      }
      const scored = (data ?? [])
        .map((v) => ({ ...(v as VehicleMatch), _score: scoreMatch(d, v as VehicleMatch) }))
        .filter((v) => v._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 10);
      setLinkMatches(scored);
    } finally {
      setLinkSearching(false);
    }
  };

  const linkVehicle = async (vehicle: VehicleMatch) => {
    if (!linkDraft) return;
    if (!vehicle.mobile_de_id) {
      toast.error("Dieses Fahrzeug hat keine Mobile.de-ID.");
      return;
    }
    setLinking(vehicle.id);
    try {
      const basePayload = (linkDraft.payload && typeof linkDraft.payload === "object")
        ? { ...(linkDraft.payload as Record<string, unknown>) }
        : {};
      basePayload._linkedVehicleId = vehicle.id;
      basePayload._linkedFromSyncAt = new Date().toISOString();

      const { error } = await supabase
        .from("mobile_ad_drafts")
        .update({
          mobile_ad_id: vehicle.mobile_de_id,
          status: "published",
          error_message: null,
          payload: basePayload as never,
        })
        .eq("id", linkDraft.id);
      if (error) {
        toast.error(`Verknüpfen fehlgeschlagen: ${error.message}`);
        return;
      }
      toast.success(`Mit Mobile.de-ID ${vehicle.mobile_de_id} verknüpft.`);
      setLinkDraft(null);
      setLinkMatches([]);
      await load();
    } finally {
      setLinking(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Mobile.de Inserate</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entwürfe verwalten und auf Mobile.de veröffentlichen.
          </p>
        </div>
        <Button onClick={() => navigate("/admin/mobile-ad/new")}>
          <Plus className="h-4 w-4" />
          Neuer Entwurf
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Lade…
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          Noch keine Entwürfe.{" "}
          <Link to="/admin/mobile-ad/new" className="underline">
            Jetzt ersten anlegen
          </Link>
          .
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const title = getDraftDisplayTitle(r);
            const desc = getDraftSubDescription(r);
            const price = readFirst(r.payload, [
              ["price", "consumerPriceGross"],
              ["price", "consumer-price-gross"],
              ["consumerPriceGross"],
            ]);
            const priceNum = typeof price === "number"
              ? price
              : typeof price === "string"
                ? Number(price.replace(/[^0-9.]/g, ""))
                : NaN;
            const copiedFromId = readPath(r.payload, ["_copiedFromDraftId"]) as string | undefined;
            const copiedFromAd = readPath(r.payload, ["_copiedFromMobileAdId"]) as string | undefined;
            const isPublished = r.status === "published" || r.status === "published_with_warning";
            const canCopy = isPublished || r.status === "error";
            const needsLink = isPublished && !r.mobile_ad_id;
            const thumb = thumbs[r.id];
            return (
              <Card key={r.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <DraftThumb url={thumb} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{title}</span>
                      {desc && <span className="text-sm text-muted-foreground truncate">{desc}</span>}
                      <Badge
                        variant={
                          r.status === "published"
                            ? "default"
                            : r.status === "published_with_warning"
                            ? "secondary"
                            : r.status === "error"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {r.status}
                      </Badge>
                      {copiedFromId && (
                        <Badge variant="outline" className="text-xs">
                          Kopie{copiedFromAd ? ` von ${copiedFromAd}` : ""}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {fmtPrice(Number.isFinite(priceNum) ? priceNum : undefined)} · erstellt {fmtDate(r.created_at)}
                      {r.mobile_ad_id ? ` · Mobile.de ID ${r.mobile_ad_id}` : ""}
                    </div>
                  {(r.status === "error" || r.status === "published_with_warning") && r.error_message && (
                    <div className={`text-xs mt-1 break-all ${r.status === "error" ? "text-destructive" : "text-amber-600"}`}>
                      {r.error_message}
                    </div>
                  )}
                  {needsLink && (
                    <div className="text-xs text-amber-600 mt-1">
                      Keine Mobile.de-ID vorhanden. Bitte mit synchronisiertem Fahrzeug verknüpfen.
                    </div>
                  )}
                  {r.status === "published" && r.mobile_ad_id && (
                    <a
                      href={`https://suchen.mobile.de/fahrzeuge/details.html?id=${r.mobile_ad_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline mt-1 inline-block"
                    >
                      Inserat öffnen
                    </a>
                  )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isPublished ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/admin/mobile-ad/edit/${r.id}`)}
                    >
                      <Pencil className="h-4 w-4" />
                      Bearbeiten
                    </Button>
                  ) : r.mobile_ad_id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/admin/mobile-ad/${r.id}/live-edit`)}
                    >
                      <Radio className="h-4 w-4" />
                      Live bearbeiten
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button size="sm" variant="outline" disabled>
                            <Radio className="h-4 w-4" />
                            Live bearbeiten
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Keine Mobile.de-ID vorhanden. Erst mit synchronisiertem Fahrzeug verknüpfen.
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {needsLink && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openLinkDialog(r)}
                    >
                      <Search className="h-4 w-4" />
                      Mobile.de-ID suchen
                    </Button>
                  )}
                  {!isPublished && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => publish(r.id)}
                      disabled={publishing === r.id}
                    >
                      {publishing === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Veröffentlichen
                    </Button>
                  )}
                  {canCopy && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmCopyId(r.id)}
                      disabled={copying === r.id}
                    >
                      {copying === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                      Als Entwurf kopieren
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(r.id)}
                    aria-label="Löschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmCopyId} onOpenChange={(o) => !o && setConfirmCopyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inserat als Entwurf kopieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Es wird ein neuer lokaler Entwurf erstellt. Das veröffentlichte Mobile.de-Inserat bleibt unverändert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmCopyId && copyAsDraft(confirmCopyId)}>
              Kopieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!linkDraft} onOpenChange={(o) => { if (!o) { setLinkDraft(null); setLinkMatches([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mobile.de-ID suchen</DialogTitle>
            <DialogDescription>
              Es wird lokal in den synchronisierten Fahrzeugen nach einem passenden Eintrag gesucht.
              Es werden keine Mobile.de-APIs aufgerufen.
            </DialogDescription>
          </DialogHeader>
          {linkSearching ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Suche läuft…
            </div>
          ) : linkMatches.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6">
              Kein passendes synchronisiertes Fahrzeug gefunden.
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {linkMatches.map((v) => (
                <Card key={v.id} className="p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {[v.brand, v.model].filter(Boolean).join(" ") || v.title || "Fahrzeug"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {v.model_description || v.title || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {fmtPrice(v.price)}
                      {v.mileage ? ` · ${v.mileage.toLocaleString("de-DE")} km` : ""}
                      {v.year ? ` · ${v.year}` : ""}
                      {v.mobile_de_id ? ` · Mobile.de ID ${v.mobile_de_id}` : " · keine Mobile.de-ID"}
                      {` · Score ${v._score}`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => linkVehicle(v)}
                    disabled={!v.mobile_de_id || linking === v.id}
                  >
                    {linking === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Verknüpfen
                  </Button>
                </Card>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLinkDraft(null); setLinkMatches([]); }}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
