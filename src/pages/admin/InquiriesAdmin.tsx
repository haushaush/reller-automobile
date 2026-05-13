import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, Phone, ExternalLink, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface Inquiry {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  preferred_contact: string | null;
  status: string;
  created_at: string;
  message: string | null;
  vehicleCount: number;
}

const statusLabels: Record<string, string> = {
  new: "Neu",
  contacted: "Kontaktiert",
  closed: "Abgeschlossen",
};

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  new: "default",
  contacted: "secondary",
  closed: "outline",
};

export default function InquiriesAdmin() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = useCallback(async () => {
    const { data: inquiriesData } = await supabase
      .from("inquiries")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: vehicleCounts } = await supabase.from("inquiry_vehicles").select("inquiry_id");

    const countMap = new Map<string, number>();
    (vehicleCounts || []).forEach((iv: { inquiry_id: string }) => {
      countMap.set(iv.inquiry_id, (countMap.get(iv.inquiry_id) || 0) + 1);
    });

    setInquiries(
      (inquiriesData || []).map((i) => ({
        ...i,
        vehicleCount: countMap.get(i.id) || 0,
      })) as Inquiry[],
    );
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const i = setInterval(loadData, 60000);
    return () => clearInterval(i);
  }, [loadData]);

  const updateStatus = async (id: string, newStatus: string) => {
    setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i)));
    await supabase.from("inquiries").update({ status: newStatus }).eq("id", id);
  };

  const filtered = inquiries.filter((i) => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const full = `${i.first_name} ${i.last_name} ${i.email}`.toLowerCase();
      if (!full.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Anfragen</h1>
        <p className="text-muted-foreground mt-1">Kundenanfragen für Fahrzeuge</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Name oder E-Mail suchen…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="new">Neu</SelectItem>
              <SelectItem value="contacted">Kontaktiert</SelectItem>
              <SelectItem value="closed">Abgeschlossen</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Mail className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Keine Anfragen gefunden</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((inq) => (
            <Card key={inq.id} className="p-5">
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <h3 className="font-semibold">
                      {inq.first_name} {inq.last_name}
                    </h3>
                    <Badge variant={statusVariant[inq.status] ?? "outline"}>
                      {statusLabels[inq.status] ?? inq.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <a href={`mailto:${inq.email}`} className="flex items-center gap-1 hover:text-foreground">
                      <Mail className="h-3.5 w-3.5" /> {inq.email}
                    </a>
                    {inq.phone && (
                      <a href={`tel:${inq.phone}`} className="flex items-center gap-1 hover:text-foreground">
                        <Phone className="h-3.5 w-3.5" /> {inq.phone}
                      </a>
                    )}
                    <span>
                      {inq.vehicleCount} Fahrzeug{inq.vehicleCount !== 1 ? "e" : ""}
                    </span>
                    <span>
                      {formatDistanceToNow(new Date(inq.created_at), { addSuffix: true, locale: de })}
                    </span>
                  </div>
                  {inq.message && (
                    <p className="mt-3 text-sm bg-muted/50 rounded-md p-3 italic line-clamp-2">
                      „{inq.message}"
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Select value={inq.status} onValueChange={(v) => updateStatus(inq.id, v)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Neu</SelectItem>
                      <SelectItem value="contacted">Kontaktiert</SelectItem>
                      <SelectItem value="closed">Abgeschlossen</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" asChild>
                    <Link to={`/admin/inquiries/${inq.id}`}>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
