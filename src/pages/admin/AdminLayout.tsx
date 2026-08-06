import { useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut, ArrowLeft, Menu, Settings as SettingsIcon, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MAIN_NAV, SETTINGS_NAV, type AdminNavEntry } from "@/lib/adminNav";

export default function AdminLayout() {
  const { user, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<{ inquiries: number; tasks: number }>({ inquiries: 0, tasks: 0 });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const inSettings = location.pathname.startsWith("/admin/einstellungen");
  const [settingsOpen, setSettingsOpen] = useState(inSettings);

  useEffect(() => {
    if (inSettings) setSettingsOpen(true);
  }, [inSettings]);

  useEffect(() => {
    const loadCounts = async () => {
      const [{ count }, { count: taskCount }] = await Promise.all([
        supabase
          .from("inquiries")
          .select("*", { count: "exact", head: true })
          .eq("status", "new"),
        supabase
          .from("listing_tasks")
          .select("*", { count: "exact", head: true })
          .is("done_at", null)
          .is("dismissed_at", null),
      ]);
      setCounts({ inquiries: count || 0, tasks: taskCount || 0 });
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

  const isActive = (item: AdminNavEntry) =>
    item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);

  const NavLinkItem = ({ item, nested = false }: { item: AdminNavEntry; nested?: boolean }) => {
    const active = isActive(item);
    const Icon = item.icon;
    const badge = item.badgeKey ? counts[item.badgeKey] : 0;
    return (
      <Link
        to={item.path}
        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          nested ? "ml-3" : ""
        } ${active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"}`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{item.label}</span>
        {badge > 0 && (
          <span
            className={`min-w-[20px] rounded-full px-2 py-0.5 text-center text-xs font-semibold ${
              active
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-destructive text-destructive-foreground"
            }`}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  const NavContent = () => (
    <>
      <div className="border-b border-border p-6">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold">Verwaltung</h2>
          <ThemeToggle />
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{user?.email}</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {MAIN_NAV.map((item) => (
          <NavLinkItem key={item.path} item={item} />
        ))}

        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                inSettings ? "bg-secondary text-foreground" : "text-foreground hover:bg-secondary"
              }`}
            >
              <SettingsIcon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Einstellungen</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-1">
            {SETTINGS_NAV.filter((i) => !i.adminOnly || isAdmin).map((item) => (
              <NavLinkItem key={item.path} item={item} nested />
            ))}
          </CollapsibleContent>
        </Collapsible>
      </nav>

      <div className="space-y-1 border-t border-border p-3">
        <Link
          to="/"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
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
      <aside className="hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <NavContent />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:hidden">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menü öffnen">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col bg-card p-0">
            <NavContent />
          </SheetContent>
        </Sheet>
        <h2 className="text-sm font-semibold">Verwaltung</h2>
        <div className="w-9" />
      </header>

      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
