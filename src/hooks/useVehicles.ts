import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Vehicle {
  id: string;
  mobile_de_id: string;
  title: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  model_description: string | null;
  body_type: string | null;
  year: string | null;
  mileage: number | null;
  price: number | null;
  currency: string | null;
  price_type: string | null;
  vatable: boolean | null;
  image_urls: string[] | null;
  description: string | null;
  exterior_color: string | null;
  fuel: string | null;
  power: number | null;
  gearbox: string | null;
  climatisation: string | null;
  num_seats: number | null;
  cubic_capacity: number | null;
  condition: string | null;
  usage_type: string | null;
  interior_color: string | null;
  interior_type: string | null;
  damage_unrepaired: boolean | null;
  detail_page_url: string | null;
  creation_date: string | null;
  modification_date: string | null;
  seller_city: string | null;
  seller_zipcode: string | null;
  is_sold: boolean;
  sold_at: string | null;
  synced_at: string;
  vehicle_category: string | null;
}

// Explicit column list — avoid select("*") so payload size is predictable
// and we don't ship internal columns to the client.
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

async function fetchVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from("vehicles")
    .select(VEHICLE_COLUMNS)
    .order("synced_at", { ascending: false });

  if (error) throw error;
  return (data as unknown as Vehicle[]) ?? [];
}

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: fetchVehicles,
    staleTime: 5 * 60 * 1000,
  });
}
