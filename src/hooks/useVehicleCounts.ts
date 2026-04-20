import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, VehicleCategoryKey, CategorySlug } from "@/lib/categories";

export type VehicleCounts = Record<CategorySlug, number> & { total: number };

async function fetchCounts(): Promise<VehicleCounts> {
  const result: VehicleCounts = {
    oldtimer: 0,
    gebrauchtwagen: 0,
    unfallwagen: 0,
    nutzfahrzeuge: 0,
    total: 0,
  };

  // One count query per UI bucket. We issue them in parallel.
  const queries = CATEGORIES.map(async (cat) => {
    const { count } = await supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("is_sold", false)
      .in("vehicle_category", cat.dbCategories as VehicleCategoryKey[]);
    return { slug: cat.slug, count: count ?? 0 };
  });

  const totalQuery = supabase
    .from("vehicles")
    .select("id", { count: "exact", head: true })
    .eq("is_sold", false);

  const [perCategory, totalRes] = await Promise.all([
    Promise.all(queries),
    totalQuery,
  ]);

  for (const { slug, count } of perCategory) result[slug] = count;
  result.total = totalRes.count ?? 0;
  return result;
}

export function useVehicleCounts() {
  return useQuery({
    queryKey: ["vehicle-counts"],
    queryFn: fetchCounts,
    staleTime: 5 * 60 * 1000,
  });
}
