import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Vehicle } from "@/hooks/useVehicles";

interface CompareContextType {
  selected: Vehicle[];
  add: (vehicle: Vehicle) => void;
  remove: (id: string) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
}

const CompareContext = createContext<CompareContextType | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Vehicle[]>([]);

  const add = useCallback((vehicle: Vehicle) => {
    setSelected((prev) => {
      if (prev.length >= 3 || prev.some((v) => v.id === vehicle.id)) return prev;
      return [...prev, vehicle];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSelected((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const clear = useCallback(() => setSelected([]), []);

  const isSelected = useCallback((id: string) => selected.some((v) => v.id === id), [selected]);

  return (
    <CompareContext.Provider value={{ selected, add, remove, clear, isSelected }}>
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error("useCompare must be used within CompareProvider");
  return ctx;
}
