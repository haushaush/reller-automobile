import { supabase } from "@/integrations/supabase/client";

export interface AuditEntry {
  action: string;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Protokolliert manuelle Änderungen an Fahrzeugen im Änderungsverlauf.
 * Fehler werden bewusst nur geloggt — das Protokoll darf keine Aktion blockieren.
 */
export async function logVehicleAudit(vehicleIds: string | string[], entries: AuditEntry[]) {
  if (entries.length === 0) return;
  const ids = Array.isArray(vehicleIds) ? vehicleIds : [vehicleIds];
  if (ids.length === 0) return;

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return;

  const rows = ids.flatMap((vehicleId) =>
    entries.map((e) => ({
      vehicle_id: vehicleId,
      user_id: user.id,
      user_email: user.email ?? null,
      action: e.action,
      field: e.field ?? null,
      old_value: toText(e.oldValue),
      new_value: toText(e.newValue),
    })),
  );

  const { error } = await supabase.from("vehicle_audit_log").insert(rows);
  if (error) console.error("[audit] konnte nicht protokolliert werden:", error.message);
}
