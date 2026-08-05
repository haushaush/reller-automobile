import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import StepPhotos from "@/components/admin/wizard/StepPhotos";
import StepVin from "@/components/admin/wizard/StepVin";
import StepData, { type SectionId } from "@/components/admin/wizard/StepData";
import StepReview from "@/components/admin/wizard/StepReview";
import { useMobileRefdata } from "@/hooks/useMobileRefdata";
import {
  EMPTY, type FormState, type RequiredField,
  buildVehiclePayload, buildVehicleColumnsFor, payloadToForm,
} from "@/lib/mobileAdForm";
import {
  ensureListingRows, suggestAccountKey, type PlatformAccountRow,
} from "@/lib/listings";

const STEPS = [
  { n: 1, title: "Fotos" },
  { n: 2, title: "FIN" },
  { n: 3, title: "Daten" },
  { n: 4, title: "Prüfen" },
];

interface DraftCandidate { id: string; title: string; updated_at: string }

export default function VehicleWizard() {
  const navigate = useNavigate();
  const params = useParams<{ vehicleId?: string }>();

  const [vehicleId, setVehicleId] = useState<string | null>(params.vehicleId ?? null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(params.vehicleId));
  const [dirty, setDirty] = useState(false);
  const [resumeDraft, setResumeDraft] = useState<DraftCandidate | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [focusSection, setFocusSection] = useState<SectionId | null>(null);

  const [accounts, setAccounts] = useState<PlatformAccountRow[]>([]);
  const [accountKey, setAccountKey] = useState("");
  const [manual, setManual] = useState({ autoscout24: false, kleinanzeigen: false });

  const refdata = useMobileRefdata(form.make);
  const stateRef = useRef({ form, imagePaths, step, vehicleId });
  stateRef.current = { form, imagePaths, step, vehicleId };

  const makeName = useMemo(
    () => refdata.makes.find((m) => m.key === form.make)?.name ?? form.make,
    [refdata.makes, form.make],
  );
  const modelName = useMemo(
    () => refdata.models.find((m) => m.key === form.model)?.name ?? form.model,
    [refdata.models, form.model],
  );

  /* ── Plattform-Konten ── */
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("platform_accounts")
        .select("*")
        .eq("platform", "mobile_de")
        .order("sort_order");
      setAccounts((data ?? []) as PlatformAccountRow[]);
    })();
  }, []);

  useEffect(() => {
    if (accounts.length === 0) return;
    setAccountKey((cur) => cur || suggestAccountKey(accounts, form.category) || "");
  }, [accounts, form.category]);

  /* ── Bestehenden Entwurf laden ── */
  const loadVehicle = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("mobile_payload, publish_status")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      toast.error("Entwurf konnte nicht geladen werden");
      return;
    }
    const payload = (data.mobile_payload ?? null) as Record<string, unknown> | null;
    setForm(payloadToForm(payload));
    const paths = Array.isArray(payload?._imagePaths) ? (payload!._imagePaths as string[]) : [];
    setImagePaths(paths);
    const savedStep = Number(payload?._wizardStep ?? 1);
    setStep(savedStep >= 1 && savedStep <= 4 ? savedStep : 1);
    const map: Record<string, string> = {};
    await Promise.all(paths.map(async (p) => {
      const { data: s } = await supabase.storage.from("mobile-ad-images").createSignedUrl(p, 3600);
      if (s?.signedUrl) map[p] = s.signedUrl;
    }));
    setPreviews(map);
    setVehicleId(id);
    setDirty(false);
  }, []);

  useEffect(() => {
    (async () => {
      if (params.vehicleId) {
        await loadVehicle(params.vehicleId);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("vehicles")
        .select("id, title, updated_at")
        .eq("source", "portal")
        .eq("publish_status", "draft")
        .order("updated_at", { ascending: false })
        .limit(1);
      const row = (data ?? [])[0] as DraftCandidate | undefined;
      if (row) setResumeDraft(row);
    })();
  }, [params.vehicleId, loadVehicle]);

  /* ── Warnung beim Verlassen der Seite ── */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const patchForm = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  /* ── Speichern ── */
  const persist = useCallback(async (opts?: { silent?: boolean; step?: number }): Promise<string | null> => {
    const { form: f, imagePaths: paths, vehicleId: id } = stateRef.current;
    const payload = {
      ...buildVehiclePayload(f),
      _imagePaths: paths,
      _wizardStep: opts?.step ?? stateRef.current.step,
    };
    const columns = buildVehicleColumnsFor(
      f,
      refdata.makes.find((m) => m.key === f.make)?.name ?? f.make,
      refdata.models.find((m) => m.key === f.model)?.name ?? f.model,
    );
    setSaving(true);
    try {
      if (id) {
        const { error } = await supabase
          .from("vehicles")
          .update({ ...columns, mobile_payload: payload as never } as never)
          .eq("id", id);
        if (error) throw error;
        setDirty(false);
        if (!opts?.silent) toast.success("Entwurf gespeichert");
        return id;
      }
      const { data, error } = await supabase
        .from("vehicles")
        .insert({
          ...columns,
          mobile_de_id: `portal_${Date.now()}`,
          source: "portal",
          publish_status: "draft",
          is_sold: false,
          synced_at: new Date().toISOString(),
          mobile_payload: payload as never,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      const newId = (data as { id: string }).id;
      setVehicleId(newId);
      setDirty(false);
      if (!opts?.silent) toast.success("Entwurf gespeichert");
      return newId;
    } catch (e) {
      console.error(e);
      toast.error(`Speichern fehlgeschlagen: ${(e as Error).message}`);
      return null;
    } finally {
      setSaving(false);
    }
  }, [refdata.makes, refdata.models]);

  const goToStep = async (next: number) => {
    if (next === step) return;
    await persist({ silent: true, step: next });
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ── Fotos ── */
  const handleFiles = async (files: File[]) => {
    setUploading(true);
    try {
      const added: string[] = [];
      const newPreviews: Record<string, string> = {};
      const prefix = `drafts/${vehicleId ?? Date.now()}`;
      for (const file of files) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage
          .from("mobile-ad-images")
          .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (error) {
          console.error(error);
          toast.error(`Upload fehlgeschlagen: ${file.name}`);
          continue;
        }
        const { data: signed } = await supabase.storage
          .from("mobile-ad-images").createSignedUrl(path, 3600);
        added.push(path);
        if (signed?.signedUrl) newPreviews[path] = signed.signedUrl;
      }
      setImagePaths((p) => [...p, ...added]);
      setPreviews((p) => ({ ...p, ...newPreviews }));
      setDirty(true);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (path: string) => {
    await supabase.storage.from("mobile-ad-images").remove([path]);
    setImagePaths((p) => p.filter((x) => x !== path));
    setPreviews((p) => {
      const { [path]: _drop, ...rest } = p;
      return rest;
    });
    setDirty(true);
  };

  /* ── Veröffentlichen ── */
  const publish = async () => {
    const id = await persist({ silent: true, step: 4 });
    if (!id) return;
    setSaving(true);
    try {
      await ensureListingRows(id, form.category, accounts);
      if (accountKey) {
        await supabase
          .from("listings")
          .update({ account_key: accountKey })
          .eq("vehicle_id", id)
          .eq("platform", "mobile_de");
      }
      const chosen = (["autoscout24", "kleinanzeigen"] as const).filter((p) => manual[p]);
      if (chosen.length) {
        const { data: rows } = await supabase
          .from("listings")
          .select("id, platform")
          .eq("vehicle_id", id)
          .in("platform", chosen);
        const tasks = (rows ?? []).map((l) => ({
          listing_id: l.id,
          vehicle_id: id,
          action: "reactivate" as const,
          reason: `Inserat bei ${l.platform === "autoscout24" ? "AutoScout24" : "Kleinanzeigen"} von Hand anlegen`,
        }));
        if (tasks.length) await supabase.from("listing_tasks").insert(tasks);
      }

      const { data, error } = await supabase.functions.invoke("publish-mobile-ad", {
        body: { vehicleId: id },
      });
      const d = (data ?? null) as { success?: boolean; error?: string } | null;
      if (error || !d?.success) {
        toast.error(`Mobile.de: ${d?.error || error?.message || "Veröffentlichen fehlgeschlagen"}`);
        return;
      }
      toast.success("Fahrzeug wurde bei Mobile.de veröffentlicht.");
      setDirty(false);
      navigate("/admin/fahrzeuge");
    } catch (e) {
      console.error(e);
      toast.error(`Veröffentlichen fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const jumpToField = (field: RequiredField) => {
    if (field.section === "fotos") { void goToStep(1); return; }
    setFocusSection(field.section as SectionId);
    void goToStep(3);
  };

  const cancel = () => {
    if (dirty) { setConfirmLeave(true); return; }
    navigate("/admin/fahrzeuge");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Entwurf wird geladen…
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28 md:pb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Fahrzeug anlegen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            In vier Schritten zum fertigen Inserat. Nach jedem Schritt wird automatisch gespeichert.
          </p>
        </div>
        <Button variant="ghost" onClick={cancel}>
          <X className="h-4 w-4" /> Abbrechen
        </Button>
      </div>

      {/* Fortschrittsleiste */}
      <Card className="p-3">
        <ol className="grid grid-cols-4 gap-2">
          {STEPS.map((s) => {
            const done = s.n < step;
            const active = s.n === step;
            const clickable = Boolean(vehicleId) || s.n <= step;
            return (
              <li key={s.n}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && goToStep(s.n)}
                  className={`w-full rounded-md px-2 py-2 text-left transition-colors ${
                    active ? "bg-primary/10" : clickable ? "hover:bg-muted" : "opacity-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-6 w-6 shrink-0 rounded-full text-xs flex items-center justify-center ${
                        active ? "bg-primary text-primary-foreground"
                          : done ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : s.n}
                    </span>
                    <span className="text-sm font-medium truncate">{s.title}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      {step === 1 && (
        <StepPhotos
          imagePaths={imagePaths}
          previews={previews}
          uploading={uploading}
          onFiles={handleFiles}
          onRemove={removeImage}
          onReorder={(p) => { setImagePaths(p); setDirty(true); }}
        />
      )}
      {step === 2 && (
        <StepVin
          vin={form.vin}
          makes={refdata.makes}
          onChange={patchForm}
          onSkip={() => void goToStep(3)}
        />
      )}
      {step === 3 && (
        <StepData form={form} onChange={patchForm} refdata={refdata} focusSection={focusSection} />
      )}
      {step === 4 && (
        <StepReview
          form={form}
          makeName={makeName}
          modelName={modelName}
          imagePaths={imagePaths}
          previews={previews}
          accounts={accounts}
          accountKey={accountKey}
          onAccountKey={setAccountKey}
          manual={manual}
          onManual={(p) => setManual((m) => ({ ...m, ...p }))}
          saving={saving}
          onSaveDraft={async () => { await persist(); navigate("/admin/fahrzeuge"); }}
          onPublish={publish}
          onJump={jumpToField}
        />
      )}

      {/* Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-3 flex gap-2 md:static md:border-0 md:bg-transparent md:p-0">
        <Button
          variant="outline"
          className="flex-1 md:flex-none"
          disabled={step === 1 || saving}
          onClick={() => void goToStep(step - 1)}
        >
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Button>
        {step < 4 ? (
          <Button className="flex-1 md:flex-none" disabled={saving} onClick={() => void goToStep(step + 1)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {step === 1 && imagePaths.length === 0 ? "Überspringen" : "Weiter"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" className="flex-1 md:flex-none" disabled={saving} onClick={() => void persist()}>
            Entwurf speichern
          </Button>
        )}
      </div>

      {/* Entwurf fortsetzen */}
      <AlertDialog open={Boolean(resumeDraft)} onOpenChange={(o) => !o && setResumeDraft(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sie haben ein Fahrzeug in Bearbeitung</AlertDialogTitle>
            <AlertDialogDescription>
              „{resumeDraft?.title}“ wurde zuletzt am{" "}
              {resumeDraft ? new Date(resumeDraft.updated_at).toLocaleString("de-DE") : ""} bearbeitet.
              Möchten Sie dort weitermachen oder ein neues Fahrzeug anlegen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResumeDraft(null)}>Neu anfangen</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const id = resumeDraft!.id;
                setResumeDraft(null);
                setLoading(true);
                await loadVehicle(id);
                setLoading(false);
              }}
            >
              Weitermachen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Verlassen bestätigen */}
      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Änderungen sind noch nicht gespeichert</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie vor dem Verlassen als Entwurf speichern?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setConfirmLeave(false); navigate("/admin/fahrzeuge"); }}>
              Ohne Speichern verlassen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmLeave(false);
                await persist();
                navigate("/admin/fahrzeuge");
              }}
            >
              Speichern und verlassen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
