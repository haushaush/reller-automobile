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
import { Mail, Phone, Clock, ExternalLink, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface InquiryVehicle {
  id: string;
  title: string;
  brand: string | null;
  price: number | null;
  image_urls: string[];
}

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
  vehicles: InquiryVehicle[];
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
  const [visibleCount, setVisibleCount] = useState(20);

  const loadData = useCallback(async () => {
    const { data: inquiriesData } = await supabase
      .from("inquiries")
      .select("*")
      .order("created_at", { ascending: false });

    if (!inquiriesData) {
      setIsLoading(false);
      return;
    }

    const inquiryIds = inquiriesData.map((i) => i.id);

    const { data: junctionData } = inquiryIds.length
      ? await supabase
          .from("inquiry_vehicles")
          .select("inquiry_id, vehicle_snapshot")
          .in("inquiry_id", inquiryIds)
      : { data: [] as Array<{ inquiry_id: string; vehicle_snapshot: unknown }> };

    const vehiclesByInquiry = new Map<string, InquiryVehicle[]>();
    (junctionData || []).forEach((j) => {
      const snapshot = j.vehicle_snapshot as Partial<InquiryVehicle> | null;
      if (!snapshot || !snapshot.id) return;
      const existing = vehiclesByInquiry.get(j.inquiry_id) || [];
      existing.push({
        id: snapshot.id,
        title: snapshot.title ?? "",
        brand: snapshot.brand ?? null,
        price: snapshot.price ?? null,
        image_urls: snapshot.image_urls ?? [],
      });
      vehiclesByInquiry.set(j.inquiry_id, existing);
    });

    const enriched: Inquiry[] = inquiriesData.map((i) => ({
      ...i,
      vehicles: vehiclesByInquiry.get(i.id) || [],
    }));

    setInquiries(enriched);
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
          {filtered.slice(0, visibleCount).map((inq) => (
            <Card key={inq.id} className="p-5">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold">
                      {inq.first_name} {inq.last_name}
                    </h3>
                    <Badge variant={statusVariant[inq.status] ?? "outline"}>
                      {statusLabels[inq.status] ?? inq.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <a href={`mailto:${inq.email}`} className="flex items-center gap-1.5 hover:text-foreground">
                      <Mail className="h-3 w-3" /> {inq.email}
                    </a>
                    {inq.phone && (
                      <a href={`tel:${inq.phone}`} className="flex items-center gap-1.5 hover:text-foreground">
                        <Phone className="h-3 w-3" /> {inq.phone}
                      </a>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(inq.created_at), { addSuffix: true, locale: de })}
                    </span>
                    {inq.preferred_contact && (
                      <span>
                        Bevorzugt:{" "}
                        {inq.preferred_contact === "email"
                          ? "E-Mail"
                          : inq.preferred_contact === "phone"
                            ? "Telefon"
                            : "Beides"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0">
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
                  <Button variant="outline" size="icon" asChild title="Details ansehen">
                    <Link to={`/admin/inquiries/${inq.id}`}>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>

              {inq.message && (
                <div className="mt-3 p-3 bg-muted/50 rounded-md border-l-2 border-primary">
                  <p className="text-sm italic whitespace-pre-wrap break-words">„{inq.message}"</p>
                </div>
              )}

              {inq.vehicles.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    Angefragte Fahrzeuge ({inq.vehicles.length})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {inq.vehicles.map((vehicle) => (
                      <a
                        key={vehicle.id}
                        href={`/fahrzeug/${vehicle.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-2 bg-muted/30 rounded-md hover:bg-muted/50 transition-colors group"
                      >
                        {vehicle.image_urls?.[0] && (
                          <img
                            src={vehicle.image_urls[0]}
                            alt={vehicle.title}
                            className="w-16 h-16 rounded object-cover flex-shrink-0"
                            loading="lazy"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          {vehicle.brand && (
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                              {vehicle.brand}
                            </p>
                          )}
                          <p className="text-sm font-medium truncate group-hover:text-primary">
                            {vehicle.title}
                          </p>
                          <p className="text-sm font-semibold text-primary">
                            {vehicle.price
                              ? `${vehicle.price.toLocaleString("de-DE")} €`
                              : "Auf Anfrage"}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}

          {filtered.length > visibleCount && (
            <Button
              variant="outline"
              onClick={() => setVisibleCount((c) => c + 20)}
              className="w-full mt-4"
            >
              Weitere 20 anzeigen ({filtered.length - visibleCount} verbleibend)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
