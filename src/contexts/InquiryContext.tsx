import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Vehicle } from "@/hooks/useVehicles";

const STORAGE_KEY = "reller-inquiries";
export const MAX_INQUIRY_ITEMS = 10;

interface InquiryContextType {
  inquiryList: Vehicle[];
  addToInquiry: (vehicle: Vehicle) => boolean;
  removeFromInquiry: (vehicleId: string) => void;
  isInInquiry: (vehicleId: string) => boolean;
  clearInquiry: () => void;
  inquiryCount: number;
}

const InquiryContext = createContext<InquiryContextType | null>(null);

function loadFromStorage(): Vehicle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function InquiryProvider({ children }: { children: ReactNode }) {
  const [inquiryList, setInquiryList] = useState<Vehicle[]>(() => loadFromStorage());

  // Persist
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inquiryList));
    } catch {
      /* ignore quota errors */
    }
  }, [inquiryList]);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setInquiryList(loadFromStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addToInquiry = useCallback((vehicle: Vehicle): boolean => {
    let added = false;
    setInquiryList((prev) => {
      if (prev.some((v) => v.id === vehicle.id)) return prev;
      if (prev.length >= MAX_INQUIRY_ITEMS) return prev;
      added = true;
      return [...prev, vehicle];
    });
    return added;
  }, []);

  const removeFromInquiry = useCallback((vehicleId: string) => {
    setInquiryList((prev) => prev.filter((v) => v.id !== vehicleId));
  }, []);

  const isInInquiry = useCallback(
    (vehicleId: string) => inquiryList.some((v) => v.id === vehicleId),
    [inquiryList]
  );

  const clearInquiry = useCallback(() => setInquiryList([]), []);

  return (
    <InquiryContext.Provider
      value={{
        inquiryList,
        addToInquiry,
        removeFromInquiry,
        isInInquiry,
        clearInquiry,
        inquiryCount: inquiryList.length,
      }}
    >
      {children}
    </InquiryContext.Provider>
  );
}

export function useInquiry() {
  const ctx = useContext(InquiryContext);
  if (!ctx) throw new Error("useInquiry must be used within InquiryProvider");
  return ctx;
}
