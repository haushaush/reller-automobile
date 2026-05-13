import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Mail, Phone, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface Inquiry {
  id: string;
  salutation: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  preferred_contact: string | null;
  status: string;
  created_at: string;
  message: string | null;
  gdpr_accepted: boolean;
}

interface InquiryVehicle {
  id: string;
  vehicle_id: string;
  vehicle_snapshot: {
    title?: string;
    brand?: string;
    price?: number;
    image_urls?: string[];
    mileage?: number;
    year?: string;
  };
}

const statusLabels: Record<string, string> = {
  new: "Neu",
  contacted: "Kontaktiert",
  closed: "Abgeschlossen",
};

export default function InquiryDetail() {
  const { id } = useParams<{ id: string }>();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [vehicles, setVehicles] = useState<InquiryVehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [iRes, vRes] = await Promise.all([
        supabase.from("inquiries").select("*").eq("id", id).maybeSingle(),
        supabase.from("inquiry_vehicles").select("*").eq("inquiry_id", id),
      ]);
      setInquiry(iRes.data as Inquiry | null);
      setVehicles((vRes.data as InquiryVehicle[]) || []);
      setIsLoading(false);
    })();
  }, [id]);

  const updateStatus = async (newStatus: string) => {
    if (!inquiry) return;
    setInquiry({ ...inquiry, status: newStatus });
    await supabase.from("inquiries").update({ status: newStatus }).eq("id", inquiry.id);
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (!inquiry)
    return (
      <div>
        <Button variant="ghost" asChild>
          <Link to="/admin/inquiries">
            <ArrowLeft className="h-4 w-4" /> Zurück
          </Link>
        </Button>
        <p className="mt-4 text-muted-foreground">Anfrage nicht gefunden.</p>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-3">
            <Link to="/admin/inquiries">
              <ArrowLeft className="h-4 w-4" /> Anfragen
            </Link>
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight">
            {inquiry.salutation ? `${inquiry.salutation} ` : ""}
            {inquiry.first_name} {inquiry.last_name}
          </h1>
          <p className="text-muted-foreground mt-1">
            {format(new Date(inquiry.created_at), "dd.MM.yyyy 'um' HH:mm", { locale: de })} Uhr
          </p>
        </div>
        <Select value={inquiry.status} onValueChange={updateStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Neu</SelectItem>
            <SelectItem value="contacted">Kontaktiert</SelectItem>
            <SelectItem value="closed">Abgeschlossen</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-1 space-y-4">
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Kontakt</div>
            <Badge variant="outline">{statusLabels[inquiry.status] ?? inquiry.status}</Badge>
          </div>
          <div className="space-y-2 text-sm">
            <a href={`mailto:${inquiry.email}`} className="flex items-center gap-2 hover:underline">
              <Mail className="h-4 w-4" /> {inquiry.email}
            </a>
            {inquiry.phone && (
              <a href={`tel:${inquiry.phone}`} className="flex items-center gap-2 hover:underline">
                <Phone className="h-4 w-4" /> {inquiry.phone}
              </a>
            )}
            {inquiry.preferred_contact && (
              <div className="text-muted-foreground">
                Bevorzugt: <span className="text-foreground">{inquiry.preferred_contact}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button asChild>
              <a href={`mailto:${inquiry.email}`}>
                <Mail className="h-4 w-4" /> E-Mail antworten
              </a>
            </Button>
            {inquiry.phone && (
              <Button variant="outline" asChild>
                <a href={`tel:${inquiry.phone}`}>
                  <Phone className="h-4 w-4" /> Anrufen
                </a>
              </Button>
            )}
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {inquiry.message && (
            <Card className="p-6">
              <div className="text-xs uppercase text-muted-foreground mb-2">Nachricht</div>
              <p className="text-base whitespace-pre-wrap">{inquiry.message}</p>
            </Card>
          )}

          <Card className="p-6">
            <h2 className="font-semibold mb-4">
              Angefragte Fahrzeuge ({vehicles.length})
            </h2>
            {vehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Fahrzeuge angegeben.</p>
            ) : (
              <div className="space-y-3">
                {vehicles.map((v) => {
                  const s = v.vehicle_snapshot || {};
                  const img = s.image_urls?.[0];
                  return (
                    <Link
                      key={v.id}
                      to={`/fahrzeug/${v.vehicle_id}`}
                      className="flex gap-4 p-3 rounded-md border border-border hover:bg-muted/50 transition-colors"
                    >
                      {img ? (
                        <img src={img} alt={s.title || ""} className="w-24 h-20 object-cover rounded" />
                      ) : (
                        <div className="w-24 h-20 bg-muted rounded" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs uppercase text-muted-foreground">{s.brand}</div>
                        <div className="font-medium truncate">{s.title}</div>
                        <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                          {s.year && <span>{s.year}</span>}
                          {s.mileage != null && <span>{s.mileage.toLocaleString("de-DE")} km</span>}
                          {s.price != null && <span className="font-medium text-foreground">{s.price.toLocaleString("de-DE")} €</span>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
