import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { downloadBlob } from "@/lib/download";
import { materialFileName } from "@/lib/materials";
import { generateExposeBlob, logExposeFailure, EXPOSE_ERROR_HINT } from "@/lib/exposePdf";
import type { Vehicle } from "@/hooks/useVehicles";

interface DownloadExposeButtonProps {
  vehicle: Vehicle;
}

const DownloadExposeButton = ({ vehicle }: DownloadExposeButtonProps) => {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    const toastId = toast.loading("Exposé wird erstellt …");
    try {
      const blob = await generateExposeBlob(vehicle);

      // PDF: immer direkter Download — auch auf dem Handy (Dateien, nicht Galerie).
      downloadBlob(
        blob,
        materialFileName("expose", {
          brand: vehicle.brand,
          model: vehicle.model || vehicle.model_description,
          fallback: vehicle.title,
        }),
      );

      toast.success("Exposé wurde heruntergeladen", { id: toastId });

      // Best-effort: archive the PDF (admins only — anonymous users will be
      // rejected by RLS, which is fine and silent).
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;
        if (!user) return;

        const path = `exposes/${vehicle.id}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("vehicle-exposes")
          .upload(path, blob, {
            contentType: "application/pdf",
            upsert: true,
          });
        if (uploadError) {
          console.warn("Expose upload failed:", uploadError.message);
          return;
        }

        const { error: dbError } = await supabase
          .from("vehicle_exposes")
          .upsert(
            {
              vehicle_id: vehicle.id,
              pdf_url: path,
              created_by: user.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "vehicle_id" },
          );
        if (dbError) console.warn("Expose DB upsert failed:", dbError.message);
      } catch (archiveErr) {
        console.warn("Expose archive skipped:", archiveErr);
      }
    } catch (err) {
      await logExposeFailure(vehicle.id, vehicle.title, err, "vehicle-detail");
      toast.error("Das Exposé konnte nicht erstellt werden", {
        id: toastId,
        description: EXPOSE_ERROR_HINT,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleDownload} disabled={loading} variant="outline" className="gap-2">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      {loading ? "Exposé wird erstellt …" : "PDF-Exposé herunterladen"}
    </Button>
  );
};

export default DownloadExposeButton;
