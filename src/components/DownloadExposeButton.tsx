import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Vehicle } from "@/hooks/useVehicles";

interface DownloadExposeButtonProps {
  vehicle: Vehicle;
}

const DownloadExposeButton = ({ vehicle }: DownloadExposeButtonProps) => {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      // Lazy-load PDF deps only when the user actually wants the PDF.
      const [{ pdf }, { default: VehicleExpose }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./VehicleExpose"),
      ]);

      const blob = await pdf(<VehicleExpose vehicle={vehicle} />).toBlob();

      // Trigger local download immediately so the user always gets the file.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const brand = vehicle.brand || "Fahrzeug";
      const model = vehicle.model || vehicle.model_description || "";
      a.href = url;
      a.download = `${brand}-${model}-Exposé.pdf`.replace(/\s+/g, "-");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

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
      console.error("PDF generation failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleDownload} disabled={loading} variant="outline" className="gap-2">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      PDF-Exposé herunterladen
    </Button>
  );
};

export default DownloadExposeButton;
