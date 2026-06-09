import { useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ImageIcon,
  RefreshCw,
  Mail,
  Bell,
  Archive,
  LogOut,
  ArrowLeft,
  Menu,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface NavItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  badgeKey?: "inquiries";
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "Übersicht", path: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Auto hinzufügen", path: "/admin/vehicles/new", icon: Plus },
  { label: "Accounts", path: "/admin/accounts", icon: Users, adminOnly: true },
  { label: "Sync-Status", path: "/admin/sync", icon: RefreshCw },
  { label: "Anfragen", path: "/admin/inquiries", icon: Mail, badgeKey: "inquiries" },
  { label: "Suchaufträge", path: "/admin/alerts", icon: Bell },
  { label: "Story-Generator", path: "/admin/stories", icon: ImageIcon },
  { label: "Story-Archiv", path: "/admin/story-archive", icon: Archive },
  { label: "Einstellungen", path: "/admin/settings", icon: Settings },
];

export default function AdminLayout() {
  const { user, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<{ inquiries: number }>({ inquiries: 0 });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const loadCounts = async () => {
      const { count } = await supabase
        .from("inquiries")
        .select("*", { count: "exact", head: true })
        .eq("status", "new");
      setCounts({ inquiries: count || 0 });
    };
    loadCounts();
    const i = setInterval(loadCounts, 60000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const NavContent = () => (
    <>
      <div className="p-6 border-b border-border">
        <h2 className="text-lg font-semibold">Admin Backend</h2>
        <p className="text-xs text-muted-foreground mt-1 truncate">{user?.email}</p>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path);
          const Icon = item.icon;
          const badge = item.badgeKey ? counts[item.badgeKey] : 0;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {badge > 0 && (
                <span
                  className={`text-xs font-semibold rounded-full px-2 py-0.5 min-w-[20px] text-center ${
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-destructive text-destructive-foreground"
                  }`}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border space-y-1">
        <Link
          to="/"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Zum Portal
        </Link>
        <Button
          variant="ghost"
          onClick={handleSignOut}
          className="w-full justify-start gap-3 text-muted-foreground"
        >
          <LogOut className="h-4 w-4" />
          Abmelden
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden lg:flex w-64 border-r border-border bg-card flex-col">
        <NavContent />
      </aside>

      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card px-4 h-14">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menü öffnen">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 flex flex-col bg-card">
            <NavContent />
          </SheetContent>
        </Sheet>
        <h2 className="text-sm font-semibold">Admin Backend</h2>
        <div className="w-9" />
      </header>

      <main className="flex-1 overflow-auto min-w-0">
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
