export interface VehicleImageSource {
  image_urls?: string[] | null;
  custom_image_urls?: string[] | null;
  hidden_image_urls?: string[] | null;
  image_order?: string[] | null;
}

/**
 * Führt Mobile.de-Bilder und eigene Uploads zusammen, entfernt ausgeblendete
 * Bilder und wendet die im Admin gepflegte Reihenfolge (image_order) an.
 */
export function resolveVehicleImages(v: VehicleImageSource | null | undefined): string[] {
  if (!v) return [];
  const merged = [...(v.image_urls ?? []), ...(v.custom_image_urls ?? [])].filter(
    (u): u is string => typeof u === "string" && u.length > 0,
  );
  const unique = Array.from(new Set(merged));
  const hidden = new Set(v.hidden_image_urls ?? []);
  const visible = unique.filter((u) => !hidden.has(u));

  const order = v.image_order ?? [];
  if (order.length === 0) return visible;

  const rank = new Map<string, number>();
  order.forEach((u, i) => rank.set(u, i));

  return visible
    .map((url, idx) => ({ url, idx }))
    .sort((a, b) => {
      const ra = rank.get(a.url);
      const rb = rank.get(b.url);
      if (ra != null && rb != null) return ra - rb;
      if (ra != null) return -1;
      if (rb != null) return 1;
      return a.idx - b.idx;
    })
    .map((e) => e.url);
}
