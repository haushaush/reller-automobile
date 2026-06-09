import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AccountRole = "admin" | "seller";

interface AccountUser {
  id: string;
  email: string | null;
  created_at: string;
  roles: string[];
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  seller: "Verkäufer",
  editor: "Editor",
  viewer: "Viewer",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function primaryRole(roles: string[]): string {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("seller")) return "seller";
  return roles[0] ?? "—";
}

export default function Accounts() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AccountRole>("seller");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-list-users", {
      method: "GET",
    });
    if (error) {
      toast.error(error.message ?? "Konnte Accounts nicht laden.");
      setUsers([]);
    } else if (data?.error) {
      toast.error(data.error);
      setUsers([]);
    } else {
      setUsers((data?.users as AccountUser[]) ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Bitte eine gültige E-Mail-Adresse eingeben.");
      return;
    }
    if (password.length < 8) {
      toast.error("Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    setIsSubmitting(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: { email: trimmedEmail, password, role },
    });
    if (error) {
      toast.error(error.message ?? "Account konnte nicht erstellt werden.");
    } else if (data?.error) {
      toast.error(data.error);
    } else {
      toast.success(`Account ${trimmedEmail} angelegt.`);
      setEmail("");
      setPassword("");
      setRole("seller");
      await loadUsers();
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (target: AccountUser) => {
    if (target.id === currentUser?.id) {
      toast.error("Du kannst dich nicht selbst löschen.");
      return;
    }
    if (!confirm(`Account ${target.email ?? target.id} wirklich löschen?`)) return;
    setDeletingId(target.id);
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { userId: target.id },
    });
    if (error) {
      toast.error(error.message ?? "Löschen fehlgeschlagen.");
    } else if (data?.error) {
      toast.error(data.error);
    } else {
      toast.success("Account gelöscht.");
      await loadUsers();
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Benutzerverwaltung: Admins und Verkäufer anlegen.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Neuen Account erstellen
        </h2>
        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="role">Rolle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AccountRole)}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="seller">Verkäufer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Account anlegen
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Bestehende Accounts</h2>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Accounts gefunden.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-Mail</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Erstellt</TableHead>
                <TableHead className="text-right">Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const pr = primaryRole(u.roles);
                const isSelf = u.id === currentUser?.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.email ?? "—"}
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">(du)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {pr === "—" ? (
                        <span className="text-xs text-muted-foreground">keine Rolle</span>
                      ) : (
                        <Badge variant={pr === "admin" ? "default" : "secondary"}>
                          {ROLE_LABEL[pr] ?? pr}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(u.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isSelf || deletingId === u.id}
                        onClick={() => handleDelete(u)}
                        aria-label="Account löschen"
                      >
                        {deletingId === u.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
