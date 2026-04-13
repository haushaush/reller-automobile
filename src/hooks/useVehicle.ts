import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Vehicle } from "./useVehicles";

async function fetchVehicle(id: string): Promise<Vehicle> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Vehicle;
}

export function useVehicle(id: string | undefined) {
  return useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => fetchVehicle(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
