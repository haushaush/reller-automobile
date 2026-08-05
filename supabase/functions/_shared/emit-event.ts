// Legt ein Ereignis im Sammelspeicher ab. Fehler dürfen den Aufrufer nie stoppen.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Admin = ReturnType<typeof createClient>;

export async function emitNotificationEvent(
  admin: Admin,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: setting } = await admin
      .from("notification_settings")
      .select("is_enabled")
      .eq("event_type", eventType)
      .maybeSingle();
    if (setting && (setting as { is_enabled: boolean }).is_enabled === false) return;

    const { error } = await admin
      .from("notification_events")
      .insert({ event_type: eventType, payload });
    if (error) console.error(`emitNotificationEvent(${eventType}) failed:`, error.message);
  } catch (err) {
    console.error(`emitNotificationEvent(${eventType}) threw:`, err);
  }
}
