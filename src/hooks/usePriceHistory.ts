import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PriceHistoryEntry {
  id: string;
  vehicle_id: string;
  price: number;
  recorded_at: string;
}

async function fetchPriceHistory(vehicleId: string): Promise<PriceHistoryEntry[]> {
  const { data, error } = await supabase
    .from("price_history")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("recorded_at", { ascending: true });

  if (error) throw error;
  return data as PriceHistoryEntry[];
}

export function usePriceHistory(vehicleId: string | undefined) {
  return useQuery({
    queryKey: ["price_history", vehicleId],
    queryFn: () => fetchPriceHistory(vehicleId!),
    enabled: !!vehicleId,
    staleTime: 5 * 60 * 1000,
  });
}
