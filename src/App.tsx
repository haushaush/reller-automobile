import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
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
const DataQuality = lazy(() => import("./pages/admin/DataQuality"));
const InquiriesAdmin = lazy(() => import("./pages/admin/InquiriesAdmin"));
const InquiryDetail = lazy(() => import("./pages/admin/InquiryDetail"));
const LeadDetail = lazy(() => import("./pages/admin/LeadDetail"));
const AlertsAdmin = lazy(() => import("./pages/admin/AlertsAdmin"));
const StoryArchive = lazy(() => import("./pages/admin/StoryArchive"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const NotificationSettings = lazy(() => import("./pages/admin/NotificationSettings"));
const VehiclesAdmin = lazy(() => import("./pages/admin/VehiclesAdmin"));
const VehicleAdminDetail = lazy(() => import("./pages/admin/VehicleAdminDetail"));
const Accounts = lazy(() => import("./pages/admin/Accounts"));
const ExposeArchive = lazy(() => import("./pages/admin/ExposeArchive"));
const Collage = lazy(() => import("./pages/admin/Collage"));
const MobileAdCreate = lazy(() => import("./pages/admin/MobileAdCreate"));
const VehicleWizard = lazy(() => import("./pages/admin/VehicleWizard"));
const EmailLogs = lazy(() => import("./pages/admin/EmailLogs"));
const Storys = lazy(() => import("./pages/admin/Storys"));
const ListingTasks = lazy(() => import("./pages/admin/ListingTasks"));

/** Alte Anfragen-Detaillinks auf den neuen Pfad umleiten */
const LegacyInquiryRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/admin/anfragen/${id}`} replace />;
};

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

                      {/* Hauptbereiche */}
                      <Route path="fahrzeuge" element={<VehiclesAdmin />} />
                      <Route path="zu-erledigen" element={<ListingTasks />} />
                      <Route path="fahrzeug-anlegen" element={<VehicleWizard />} />
                      <Route path="fahrzeug-anlegen/:vehicleId" element={<VehicleWizard />} />
                      <Route path="fahrzeuge/:vehicleId/inserat" element={<MobileAdCreate />} />
                      <Route path="fahrzeuge/:vehicleId/live-edit" element={<MobileAdCreate />} />
                      <Route path="fahrzeuge/:id" element={<VehicleAdminDetail />} />
                      <Route path="anfragen" element={<InquiriesAdmin />} />
                      <Route path="anfragen/lead/:id" element={<LeadDetail />} />
                      <Route path="anfragen/:id" element={<InquiryDetail />} />

                      <Route path="storys" element={<Storys />} />

                      {/* Einstellungen */}
                      <Route path="einstellungen" element={<Settings />} />
                      <Route path="einstellungen/benachrichtigungen" element={<NotificationSettings />} />
                      <Route path="einstellungen/accounts" element={<Accounts />} />
                      <Route path="einstellungen/status-log" element={<SyncStatus />} />
                      <Route path="einstellungen/datenqualitaet" element={<DataQuality />} />
                      <Route path="einstellungen/mail-verlauf" element={<EmailLogs />} />

                      {/* Weitere Werkzeuge */}
                      <Route path="suchauftraege" element={<AlertsAdmin />} />
                      <Route path="expose-archiv" element={<ExposeArchive />} />
                      <Route path="collage" element={<Collage />} />

                      {/* Alte Pfade bleiben als Weiterleitung bestehen */}
                      <Route path="sync" element={<Navigate to="/admin/einstellungen/status-log" replace />} />
                      <Route path="data-quality" element={<Navigate to="/admin/einstellungen/datenqualitaet" replace />} />
                      <Route path="email-logs" element={<Navigate to="/admin/einstellungen/mail-verlauf" replace />} />
                      <Route path="accounts" element={<Navigate to="/admin/einstellungen/accounts" replace />} />
                      <Route path="settings" element={<Navigate to="/admin/einstellungen" replace />} />
                      <Route path="inquiries" element={<Navigate to="/admin/anfragen" replace />} />
                      <Route path="inquiries/:id" element={<LegacyInquiryRedirect />} />
                      <Route path="alerts" element={<Navigate to="/admin/suchauftraege" replace />} />
                      <Route path="stories" element={<Navigate to="/admin/storys" replace />} />
                      <Route path="story-archive" element={<Navigate to="/admin/storys?tab=archiv" replace />} />
                      <Route path="expose-archive" element={<Navigate to="/admin/expose-archiv" replace />} />
                      <Route path="mobile-ad" element={<Navigate to="/admin/fahrzeuge" replace />} />
                      <Route path="fahrzeuge/neu" element={<Navigate to="/admin/fahrzeug-anlegen" replace />} />
                      <Route path="vehicles/new" element={<Navigate to="/admin/fahrzeug-anlegen" replace />} />

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
