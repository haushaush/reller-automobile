import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompareProvider } from "@/contexts/CompareContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { InquiryProvider } from "@/contexts/InquiryContext";
import FloatingActionBar from "@/components/FloatingActionBar";
import Hub from "./pages/Hub";

const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const AllVehiclesPage = lazy(() =>
  import("./pages/CategoryPage").then((m) => ({ default: m.AllVehiclesPage }))
);
const VehicleDetail = lazy(() => import("./pages/VehicleDetail"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const InquiryPage = lazy(() => import("./pages/InquiryPage"));
const InquirySuccessPage = lazy(() => import("./pages/InquirySuccessPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-screen bg-background" />
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <FavoritesProvider>
          <CompareProvider>
            <InquiryProvider>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Hub />} />
                  <Route path="/fahrzeuge" element={<AllVehiclesPage />} />
                  <Route path="/fahrzeuge/:category" element={<CategoryPage />} />
                  <Route path="/fahrzeug/:id" element={<VehicleDetail />} />
                  <Route path="/vergleich" element={<ComparePage />} />
                  <Route path="/anfrage" element={<InquiryPage />} />
                  <Route path="/anfrage/erfolg" element={<InquirySuccessPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <FloatingActionBar />
            </InquiryProvider>
          </CompareProvider>
        </FavoritesProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
