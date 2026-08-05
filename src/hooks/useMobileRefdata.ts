import { useEffect, useState } from "react";
import { toast } from "sonner";
import { loadRef, type RefItem, EXTERIOR_COLOR_FALLBACK } from "@/lib/mobileAdForm";

export interface MobileRefdata {
  makes: RefItem[];
  models: RefItem[];
  categories: RefItem[];
  fuels: RefItem[];
  gearboxes: RefItem[];
  vatRates: RefItem[];
  exteriorColors: RefItem[];
  climatisations: RefItem[];
  emissionClasses: RefItem[];
  emissionStickers: RefItem[];
  driveTypes: RefItem[];
  parkingAssistants: RefItem[];
  loading: boolean;
  loadingModels: boolean;
}

/** Lädt alle Auswahllisten von Mobile.de (Anzeige: deutsches Label, gesendet: Schlüssel). */
export function useMobileRefdata(make: string): MobileRefdata {
  const [state, setState] = useState<Omit<MobileRefdata, "models" | "loadingModels">>({
    makes: [], categories: [], fuels: [], gearboxes: [], vatRates: [],
    exteriorColors: [], climatisations: [], emissionClasses: [],
    emissionStickers: [], driveTypes: [], parkingAssistants: [], loading: true,
  });
  const [models, setModels] = useState<RefItem[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [m, c, f, g, v, ec, cl, emC, emS, dt, pa] = await Promise.all([
          loadRef("makes"),
          loadRef("categories").catch(() => []),
          loadRef("fuels").catch(() => []),
          loadRef("gearboxes").catch(() => []),
          loadRef("vatrates").catch(() => []),
          loadRef("exterior-colors").catch(() => []),
          loadRef("climatisations").catch(() => []),
          loadRef("emission-classes").catch(() => []),
          loadRef("emission-stickers").catch(() => []),
          loadRef("drive-types").catch(() => []),
          loadRef("parking-assistants").catch(() => []),
        ]);
        if (!active) return;
        setState({
          makes: m,
          categories: c,
          fuels: f,
          gearboxes: g,
          vatRates: v.length ? v : [
            { key: "19.00", name: "19 %" },
            { key: "OTHER", name: "Differenzbesteuert" },
          ],
          exteriorColors: ec.length ? ec : EXTERIOR_COLOR_FALLBACK,
          climatisations: cl,
          emissionClasses: emC,
          emissionStickers: emS,
          driveTypes: dt,
          parkingAssistants: pa,
          loading: false,
        });
      } catch (err) {
        console.error(err);
        if (!active) return;
        toast.error("Auswahllisten konnten nicht geladen werden");
        setState((s) => ({ ...s, loading: false }));
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!make) { setModels([]); return; }
    let active = true;
    setLoadingModels(true);
    loadRef("models", make)
      .then((items) => { if (active) setModels(items); })
      .catch((err) => {
        console.error(err);
        toast.error("Modelle konnten nicht geladen werden");
      })
      .finally(() => { if (active) setLoadingModels(false); });
    return () => { active = false; };
  }, [make]);

  return { ...state, models, loadingModels };
}
