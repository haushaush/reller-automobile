import { useParams, Navigate } from "react-router-dom";
import VehicleListPage from "@/pages/VehicleListPage";
import { CATEGORIES, getCategoryBySlug } from "@/lib/categories";

const CategoryPage = () => {
  const { category } = useParams<{ category: string }>();
  const def = getCategoryBySlug(category);

  if (!def) {
    return <Navigate to="/" replace />;
  }

  return (
    <VehicleListPage
      title={def.title}
      eyebrow={def.eyebrow}
      breadcrumbs={[
        { label: "Home", to: "/" },
        { label: def.shortTitle },
      ]}
      categoryFilter={def.dbCategories}
    />
  );
};

export default CategoryPage;

export const AllVehiclesPage = () => (
  <VehicleListPage
    title="Aktueller Fahrzeugbestand"
    eyebrow="Alle Kategorien"
    breadcrumbs={[{ label: "Home", to: "/" }, { label: "Alle Fahrzeuge" }]}
    categoryFilter={CATEGORIES.flatMap((c) => c.dbCategories)}
    showCategorySelect
  />
);
