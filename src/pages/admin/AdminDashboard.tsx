import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Car, Image as ImageIcon, Mail, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

interface Stats {
  activeVehicles: number;
  soldVehicles: number;
  totalStories: number;
  pendingInquiries: number;
  activeAlerts: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    activeVehicles: 0,
    soldVehicles: 0,
    totalStories: 0,
    pendingInquiries: 0,
    activeAlerts: 0,
  });

  useEffect(() => {
    const load = async () => {
      const [vehicles, sold, stories, inquiries, alerts] = await Promise.all([
        supabase.from("vehicles").select("*", { count: "exact", head: true }).eq("is_sold", false),
        supabase.from("vehicles").select("*", { count: "exact", head: true }).eq("is_sold", true),
        supabase.from("vehicle_stories").select("*", { count: "exact", head: true }),
        supabase.from("inquiries").select("*", { count: "exact", head: true }).eq("status", "new"),
        supabase.from("vehicle_alerts").select("*", { count: "exact", head: true }).eq("is_active", true),
      ]);
      setStats({
        activeVehicles: vehicles.count ?? 0,
        soldVehicles: sold.count ?? 0,
        totalStories: stories.count ?? 0,
        pendingInquiries: inquiries.count ?? 0,
        activeAlerts: alerts.count ?? 0,
      });
    };
    load();
  }, []);

  const cards = [
    { label: "Aktive Fahrzeuge", value: stats.activeVehicles, icon: Car, to: "/admin/sync" },
    { label: "Verkaufte Fahrzeuge", value: stats.soldVehicles, icon: Car, to: "/admin/sync" },
    { label: "Generierte Stories", value: stats.totalStories, icon: ImageIcon, to: "/admin/story-archive" },
    { label: "Offene Anfragen", value: stats.pendingInquiries, icon: Mail, to: "/admin/inquiries" },
    { label: "Aktive Suchaufträge", value: stats.activeAlerts, icon: Bell, to: "/admin/alerts" },
  ];

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Übersicht</h1>
      <p className="text-sm sm:text-base text-muted-foreground mt-1">
        Willkommen im Admin-Backend von Reller Automobile
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-6 sm:mt-8">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} to={c.to} className="block group">
              <Card className="p-4 sm:p-6 transition-all group-hover:border-primary/50 group-hover:shadow-md group-active:scale-[0.98] cursor-pointer h-full">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="text-2xl sm:text-3xl font-semibold">{c.value}</div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">{c.label}</div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
