import { useParams, Navigate } from "react-router-dom";
import VehicleListPage from "@/pages/VehicleListPage";
import { CATEGORIES, getCategoryBySlug } from "@/lib/categories";
import type { QuickTabOption } from "@/components/CategoryQuickTabs";

const oldtimerQuickTabs: QuickTabOption[] = [
  { key: "all", label: "Alle Klassiker", value: ["oldtimer", "youngtimer"] },
  { key: "oldtimer", label: "Oldtimer (30+ Jahre)", value: ["oldtimer"] },
  { key: "youngtimer", label: "Youngtimer (20–30 Jahre)", value: ["youngtimer"] },
];

const CategoryPage = () => {
  const { category } = useParams<{ category: string }>();
  const def = getCategoryBySlug(category);

  if (!def) {
    return <Navigate to="/" replace />;
  }

  const quickTabs = def.slug === "oldtimer" ? oldtimerQuickTabs : undefined;

  return (
    <VehicleListPage
      title={def.title}
      breadcrumbs={[{ label: "Home", to: "/" }, { label: def.shortTitle }]}
      categoryFilter={def.dbCategories}
      quickTabs={quickTabs}
    />
  );
};

export default CategoryPage;

export const AllVehiclesPage = () => (
  <VehicleListPage
    title="Aktueller Fahrzeugbestand"
    breadcrumbs={[{ label: "Home", to: "/" }, { label: "Alle Fahrzeuge" }]}
    categoryFilter={CATEGORIES.flatMap((c) => c.dbCategories)}
    showCategorySelect
  />
);
