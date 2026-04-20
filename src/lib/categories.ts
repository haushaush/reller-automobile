export type VehicleCategoryKey = "oldtimer" | "youngtimer" | "used" | "accident" | "commercial";
export type CategorySlug = "oldtimer" | "gebrauchtwagen" | "unfallwagen" | "nutzfahrzeuge";

export interface CategoryDefinition {
  slug: CategorySlug;
  /** db vehicle_category values that map into this UI bucket */
  dbCategories: VehicleCategoryKey[];
  title: string;
  shortTitle: string;
  description: string;
  image: string;
  /** Used for hub overlay accent; falls back to brand red */
  accent?: string;
}

export const CATEGORIES: CategoryDefinition[] = [
  {
    slug: "oldtimer",
    dbCategories: ["oldtimer", "youngtimer"],
    title: "Oldtimer, Youngtimer & Service",
    shortTitle: "Oldtimer & Youngtimer",
    description:
      "Ikonen wie Mercedes SL, Pagode oder Porsche 356 — mit internationalem Netzwerk und jahrzehntelanger Erfahrung.",
    image:
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1600&h=900&fit=crop&q=80",
  },
  {
    slug: "gebrauchtwagen",
    dbCategories: ["used"],
    title: "Gebraucht- & Jahreswagen",
    shortTitle: "Gebrauchtwagen",
    description: "Geprüfte Fahrzeuge, transparente Preise, schnelle Abwicklung.",
    image:
      "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=1600&h=900&fit=crop&q=80",
  },
  {
    slug: "unfallwagen",
    dbCategories: ["accident"],
    title: "Unfallwagen",
    shortTitle: "Unfallwagen",
    description: "Transparente Unfallfahrzeuge direkt vom Fachhändler.",
    image:
      "https://images.unsplash.com/photo-1597007030739-6d2e7172ee6c?w=1600&h=900&fit=crop&q=80",
  },
  {
    slug: "nutzfahrzeuge",
    dbCategories: ["commercial"],
    title: "Nutzfahrzeuge",
    shortTitle: "Nutzfahrzeuge",
    description: "Transporter, Vans und Kleinbusse für Ihren Geschäftsalltag.",
    image:
      "https://images.unsplash.com/photo-1586244439413-bc2288941dda?w=1600&h=900&fit=crop&q=80",
  },
];

export function getCategoryBySlug(slug: string | undefined): CategoryDefinition | undefined {
  if (!slug) return undefined;
  return CATEGORIES.find((c) => c.slug === slug);
}

const COMMERCIAL_BODY_TYPES = new Set([
  "Van",
  "Transporter",
  "Kastenwagen",
  "Pritschenwagen",
  "Kleinbus",
  "LKW",
  "Sattelzugmaschine",
  "Kipper",
]);

/**
 * Compute a vehicle_category for a vehicle based on its raw fields.
 * Mirrors the SQL backfill + sync-vehicles logic so the FE can derive a
 * category for legacy rows that still have a NULL vehicle_category.
 */
export function deriveVehicleCategory(input: {
  body_type?: string | null;
  category?: string | null;
  year?: string | null;
  is_accident?: boolean;
}): VehicleCategoryKey {
  if (input.is_accident) return "accident";

  if (input.body_type && COMMERCIAL_BODY_TYPES.has(input.body_type)) return "commercial";
  const cat = input.category?.toLowerCase() ?? "";
  if (cat.includes("transporter") || cat.includes("nutzfahrzeug")) return "commercial";

  if (input.year && /^\d{4}/.test(input.year)) {
    const y = parseInt(input.year.substring(0, 4), 10);
    const now = new Date().getFullYear();
    if (y <= now - 30) return "oldtimer";
    if (y <= now - 20) return "youngtimer";
  }

  return "used";
}
