import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Car, BookmarkCheck, BadgeEuro, Mail, FileEdit, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import SalesStats from "@/components/admin/SalesStats";
import { ALL_TOOLS } from "@/lib/adminNav";

interface Stats {
  activeVehicles: number;
  reservedVehicles: number;
  soldThisMonth: number;
  openInquiries: number;
  drafts: number;
  openTasks: number;
}

interface RecentInquiry {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  created_at: string;
  vehicleTitle: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Neu",
  contacted: "Kontaktiert",
  closed: "Abgeschlossen",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  new: "default",
  contacted: "secondary",
  closed: "outline",
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    activeVehicles: 0,
    reservedVehicles: 0,
    soldThisMonth: 0,
    openInquiries: 0,
    drafts: 0,
    openTasks: 0,
  });
  const [recent, setRecent] = useState<RecentInquiry[]>([]);

  useEffect(() => {
    const load = async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [active, reserved, soldMonth, inquiries, drafts, tasks] = await Promise.all([
        supabase.from("vehicles").select("*", { count: "exact", head: true }).eq("is_sold", false),
        supabase
          .from("vehicles")
          .select("*", { count: "exact", head: true })
          .eq("is_sold", false)
          .not("reserved_at", "is", null),
        supabase
          .from("vehicles")
          .select("*", { count: "exact", head: true })
          .eq("is_sold", true)
          .gte("sold_at", monthStart),
        supabase.from("inquiries").select("*", { count: "exact", head: true }).eq("status", "new"),
        supabase
          .from("vehicles")
          .select("*", { count: "exact", head: true })
          .eq("is_sold", false)
          .eq("publish_status", "draft"),
        supabase
          .from("listing_tasks")
          .select("*", { count: "exact", head: true })
          .is("done_at", null)
          .is("dismissed_at", null),
      ]);

      setStats({
        activeVehicles: active.count ?? 0,
        reservedVehicles: reserved.count ?? 0,
        soldThisMonth: soldMonth.count ?? 0,
        openInquiries: inquiries.count ?? 0,
        drafts: drafts.count ?? 0,
        openTasks: tasks.count ?? 0,
      });

      const { data: inquiryRows } = await supabase
        .from("inquiries")
        .select("id, first_name, last_name, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      const rows = inquiryRows ?? [];
      let titles = new Map<string, string>();
      if (rows.length) {
        const { data: junction } = await supabase
          .from("inquiry_vehicles")
          .select("inquiry_id, vehicle_snapshot")
          .in(
            "inquiry_id",
            rows.map((r) => r.id),
          );
        for (const j of junction ?? []) {
          if (titles.has(j.inquiry_id)) continue;
          const snap = j.vehicle_snapshot as { title?: string; brand?: string } | null;
          if (snap?.title) {
            titles.set(j.inquiry_id, [snap.brand, snap.title].filter(Boolean).join(" · "));
          }
        }
      }

      setRecent(
        rows.map((r) => ({
          id: r.id,
          first_name: r.first_name,
          last_name: r.last_name,
          status: r.status,
          created_at: r.created_at,
          vehicleTitle: titles.get(r.id) ?? "Kein Fahrzeug angegeben",
        })),
      );
    };
    load();
  }, []);

  const cards = [
    {
      label: "Aktive Fahrzeuge",
      value: stats.activeVehicles,
      icon: Car,
      to: "/admin/fahrzeuge?status=available",
    },
    {
      label: "Davon reserviert",
      value: stats.reservedVehicles,
      icon: BookmarkCheck,
      to: "/admin/fahrzeuge?status=reserved",
    },
    {
      label: "Verkauft diesen Monat",
      value: stats.soldThisMonth,
      icon: BadgeEuro,
      to: "/admin/fahrzeuge?status=sold",
    },
    {
      label: "Zu erledigen",
      value: stats.openTasks,
      icon: ListChecks,
      to: "/admin/zu-erledigen",
    },
    { label: "Offene Anfragen", value: stats.openInquiries, icon: Mail, to: "/admin/anfragen" },
    {
      label: "Entwürfe",
      value: stats.drafts,
      icon: FileEdit,
      to: "/admin/fahrzeuge?publish=draft",
    },
  ];

  return (
    <div className="space-y-8 sm:space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Übersicht</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Willkommen in der Verwaltung von Reller Automobile
        </p>
      </div>

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} to={c.to} className="group block">
              <Card className="h-full cursor-pointer p-4 transition-all group-hover:border-primary/50 group-hover:shadow-md group-active:scale-[0.98] sm:p-5">
                <Icon className="mb-2 h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                <div className="text-2xl font-semibold sm:text-3xl">{c.value}</div>
                <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{c.label}</div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Neueste Anfragen */}
      <section>
        <div className="mb-3 flex items-center justify-between sm:mb-4">
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">Neueste Anfragen</h2>
          <Link
            to="/admin/anfragen"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Alle ansehen <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <Card className="divide-y divide-border">
          {recent.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Noch keine Anfragen eingegangen.</p>
          ) : (
            recent.map((i) => (
              <Link
                key={i.id}
                to={`/admin/anfragen/${i.id}`}
                className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-secondary/60"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{i.vehicleTitle}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {i.first_name} {i.last_name} ·{" "}
                    {formatDistanceToNow(new Date(i.created_at), { addSuffix: true, locale: de })}
                  </div>
                </div>
                <Badge variant={STATUS_VARIANTS[i.status] ?? "outline"} className="shrink-0">
                  {STATUS_LABELS[i.status] ?? i.status}
                </Badge>
              </Link>
            ))
          )}
        </Card>
      </section>

      {/* Alle Werkzeuge */}
      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight sm:text-xl">Alle Werkzeuge</h2>
        <p className="mb-3 text-sm text-muted-foreground sm:mb-4">
          Hier finden Sie jede Funktion des Portals – auch die, die im Menü unter Einstellungen liegen.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <Link key={t.path} to={t.path} className="group block">
                <Card className="h-full p-4 transition-all group-hover:border-primary/50 group-hover:shadow-md group-active:scale-[0.98]">
                  <div className="flex items-start gap-3">
                    <span className="rounded-md bg-secondary p-2 text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{t.label}</div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t.description}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight sm:mb-4 sm:text-xl">
          Verkaufsauswertung
        </h2>
        <SalesStats />
      </section>
    </div>
  );
}
