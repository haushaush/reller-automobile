import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import VehicleExpose from "./VehicleExpose";
import type { Vehicle } from "@/hooks/useVehicles";

interface DownloadExposeButtonProps {
  vehicle: Vehicle;
}

const DownloadExposeButton = ({ vehicle }: DownloadExposeButtonProps) => {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const blob = await pdf(<VehicleExpose vehicle={vehicle} />).toBlob();
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
