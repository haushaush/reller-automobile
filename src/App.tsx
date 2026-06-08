import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { CompareProvider } from "@/contexts/CompareContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { InquiryProvider } from "@/contexts/InquiryContext";
import { AdminRoute } from "@/components/AdminRoute";
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
const Login = lazy(() => import("./pages/Login"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const StoryGenerator = lazy(() => import("./pages/admin/StoryGenerator"));
const SyncStatus = lazy(() => import("./pages/admin/SyncStatus"));
const InquiriesAdmin = lazy(() => import("./pages/admin/InquiriesAdmin"));
const InquiryDetail = lazy(() => import("./pages/admin/InquiryDetail"));
const AlertsAdmin = lazy(() => import("./pages/admin/AlertsAdmin"));
const StoryArchive = lazy(() => import("./pages/admin/StoryArchive"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const VehicleCreate = lazy(() => import("./pages/admin/VehicleCreate"));

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
        <AuthProvider>
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
                    <Route path="/login" element={<Login />} />
                    <Route
                      path="/admin"
                      element={
                        <AdminRoute>
                          <AdminLayout />
                        </AdminRoute>
                      }
                    >
                      <Route index element={<AdminDashboard />} />
                      <Route path="sync" element={<SyncStatus />} />
                      <Route path="inquiries" element={<InquiriesAdmin />} />
                      <Route path="inquiries/:id" element={<InquiryDetail />} />
                      <Route path="alerts" element={<AlertsAdmin />} />
                      <Route path="stories" element={<StoryGenerator />} />
                      <Route path="story-archive" element={<StoryArchive />} />
                      <Route path="settings" element={<Settings />} />
                      <Route path="vehicles/new" element={<VehicleCreate />} />
                    </Route>
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
                <FloatingActionBar />
              </InquiryProvider>
            </CompareProvider>
          </FavoritesProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
