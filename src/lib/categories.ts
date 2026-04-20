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
    eyebrow: "RESTAURIERT MIT LEIDENSCHAFT, GEPRÜFT FÜR DIE ZUKUNFT.",
    title: "Oldtimer & Youngtimer",
    shortTitle: "Oldtimer & Youngtimer",
    description: "",
    image:
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1600&h=900&fit=crop&q=80",
  },
  {
    slug: "gebrauchtwagen",
    dbCategories: ["used"],
    eyebrow: "GEPRÜFTE FAHRZEUGE, TRANSPARENTE PREISE",
    title: "Gebraucht- & Jahreswagen",
    shortTitle: "Gebrauchtwagen",
    description: "",
    image:
      "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=1600&h=900&fit=crop&q=80",
  },
  {
    slug: "unfallwagen",
    dbCategories: ["accident"],
    eyebrow: "TRANSPARENTE UNFALLFAHRZEUGE VOM FACHHÄNDLER",
    title: "Unfallwagen",
    shortTitle: "Unfallwagen",
    description: "",
    image:
      "https://images.unsplash.com/photo-1597007030739-6d2e7172ee6c?w=1600&h=900&fit=crop&q=80",
  },
  {
    slug: "nutzfahrzeuge",
    dbCategories: ["commercial"],
    eyebrow: "TRANSPORTER FÜR IHREN GESCHÄFTSALLTAG",
    title: "Nutzfahrzeuge",
    shortTitle: "Nutzfahrzeuge",
    description: "",
    image:
      "https://images.unsplash.com/photo-1586244439413-bc2288941dda?w=1600&h=900&fit=crop&q=80",
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
