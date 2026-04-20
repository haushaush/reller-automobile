export type VehicleCategoryKey = "oldtimer" | "youngtimer" | "used" | "accident" | "commercial";
export type CategorySlug = "oldtimer" | "gebrauchtwagen" | "unfallwagen" | "nutzfahrzeuge";

export interface CategoryDefinition {
  slug: CategorySlug;
  /** db vehicle_category values that map into this UI bucket */
  dbCategories: VehicleCategoryKey[];
  eyebrow: string;
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
    eyebrow: "",
    title: "Old- & Youngtimer",
    shortTitle: "Old- & Youngtimer",
    description: "",
    image: "",
  },
  {
    slug: "gebrauchtwagen",
    dbCategories: ["used"],
    eyebrow: "",
    title: "Gebraucht- & Jahreswagen",
    shortTitle: "Gebraucht- & Jahreswagen",
    description: "",
    image: "",
  },
  {
    slug: "unfallwagen",
    dbCategories: ["accident"],
    eyebrow: "",
    title: "Unfallwagen",
    shortTitle: "Unfallwagen",
    description: "",
    image: "",
  },
  {
    slug: "nutzfahrzeuge",
    dbCategories: ["commercial"],
    eyebrow: "",
    title: "Nutzfahrzeuge",
    shortTitle: "Nutzfahrzeuge",
    description: "",
    image: "",
  },
];

export function getCategoryBySlug(slug: string | undefined): CategoryDefinition | undefined {
  if (!slug) return undefined;
  return CATEGORIES.find((c) => c.slug === slug);
}

const COMMERCIAL_BODY_TYPES = new Set([
  "BoxTypeDeliveryVan",
  "BoxVan",
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

  if (input.year && /^\d{4}/.test(input.year)) {
    const y = parseInt(input.year.substring(0, 4), 10);
    const now = new Date().getFullYear();
    if (y <= now - 30) return "oldtimer";
    if (y <= now - 20) return "youngtimer";
  }

  return "used";
}
