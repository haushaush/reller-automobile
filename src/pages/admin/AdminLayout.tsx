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
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  badgeKey?: "inquiries";
}

const navItems: NavItem[] = [
  { label: "Übersicht", path: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Sync-Status", path: "/admin/sync", icon: RefreshCw },
  { label: "Anfragen", path: "/admin/inquiries", icon: Mail, badgeKey: "inquiries" },
  { label: "Suchaufträge", path: "/admin/alerts", icon: Bell },
  { label: "Story-Generator", path: "/admin/stories", icon: ImageIcon },
  { label: "Story-Archiv", path: "/admin/story-archive", icon: Archive },
];

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<{ inquiries: number }>({ inquiries: 0 });

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

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Admin Backend</h2>
          <p className="text-xs text-muted-foreground mt-1 truncate">{user?.email}</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
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
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
