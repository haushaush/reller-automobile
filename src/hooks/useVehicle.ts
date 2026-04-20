import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Vehicle } from "./useVehicles";

const VEHICLE_COLUMNS = [
  "id",
  "mobile_de_id",
  "title",
  "category",
  "brand",
  "model",
  "model_description",
  "body_type",
  "year",
  "mileage",
  "price",
  "currency",
  "price_type",
  "vatable",
  "image_urls",
  "description",
  "exterior_color",
  "fuel",
  "power",
  "gearbox",
  "climatisation",
  "num_seats",
  "cubic_capacity",
  "condition",
  "usage_type",
  "interior_color",
  "interior_type",
  "damage_unrepaired",
  "detail_page_url",
  "creation_date",
  "modification_date",
  "seller_city",
  "seller_zipcode",
  "is_sold",
  "sold_at",
  "synced_at",
  "vehicle_category",
].join(",");

async function fetchVehicle(id: string): Promise<Vehicle> {
  const { data, error } = await supabase
    .from("vehicles")
    .select(VEHICLE_COLUMNS)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as unknown as Vehicle;
}

export function useVehicle(id: string | undefined) {
  return useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => fetchVehicle(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
