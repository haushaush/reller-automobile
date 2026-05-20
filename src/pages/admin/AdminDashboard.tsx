import { useEffect, useState } from "react";
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
    { label: "Aktive Fahrzeuge", value: stats.activeVehicles, icon: Car },
    { label: "Verkaufte Fahrzeuge", value: stats.soldVehicles, icon: Car },
    { label: "Generierte Stories", value: stats.totalStories, icon: ImageIcon },
    { label: "Offene Anfragen", value: stats.pendingInquiries, icon: Mail },
    { label: "Aktive Suchaufträge", value: stats.activeAlerts, icon: Bell },
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
            <Card key={c.label} className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-2xl sm:text-3xl font-semibold">{c.value}</div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">{c.label}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
