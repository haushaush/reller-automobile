import { useCompare } from "@/contexts/CompareContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, Scale } from "lucide-react";
import { useFooterVisible } from "@/hooks/useFooterVisible";

const CompareBar = () => {
  const { selected, remove, clear } = useCompare();
  const navigate = useNavigate();
  const footerVisible = useFooterVisible(96);

  if (selected.length < 2) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border p-4 transition-transform duration-300 ${
        footerVisible ? "translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 overflow-x-auto">
          {selected.map((v) => {
            const img = v.image_urls?.[0] || "/placeholder.svg";
            return (
              <div key={v.id} className="relative shrink-0">
                <img
                  src={img}
                  alt={v.title}
                  className="w-16 h-10 rounded object-cover border border-border"
                />
                <button
                  onClick={() => remove(v.id)}
                  className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {selected.length} von 3 ausgewählt
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={clear}>
            Auswahl leeren
          </Button>
          <Button size="sm" onClick={() => navigate("/vergleich")} className="gap-1.5">
            <Scale className="h-4 w-4" />
            Vergleichen
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CompareBar;
