import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompareProvider } from "@/contexts/CompareContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { InquiryProvider } from "@/contexts/InquiryContext";
import CompareBar from "@/components/CompareBar";
import InquiryBar from "@/components/InquiryBar";
import Hub from "./pages/Hub";
import CategoryPage, { AllVehiclesPage } from "./pages/CategoryPage";
import VehicleDetail from "./pages/VehicleDetail.tsx";
import ComparePage from "./pages/ComparePage.tsx";
import InquiryPage from "./pages/InquiryPage.tsx";
import InquirySuccessPage from "./pages/InquirySuccessPage.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <FavoritesProvider>
          <CompareProvider>
            <InquiryProvider>
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
              <CompareBar />
              <InquiryBar />
            </InquiryProvider>
          </CompareProvider>
        </FavoritesProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
