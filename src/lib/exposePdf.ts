import { createElement } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Vehicle } from "@/hooks/useVehicles";

/**
 * @react-pdf/renderer relies on Node's `Buffer` at runtime. Vite does not
 * polyfill it, which made PDF generation fail silently in the browser.
 * We load the polyfill lazily, only when a PDF is actually requested.
 */
async function ensureBufferPolyfill() {
  const g = globalThis as typeof globalThis & { Buffer?: unknown };
  if (!g.Buffer) {
    const { Buffer } = await import("buffer");
    g.Buffer = Buffer;
  }
}

export async function logExposeFailure(
  vehicleId: string | null | undefined,
  vehicleTitle: string | null | undefined,
  error: unknown,
  context: string,
) {
  const message = error instanceof Error ? error.message : String(error ?? "Unbekannter Fehler");
  console.error(`[Exposé] Fehlgeschlagen (${context}) für Fahrzeug ${vehicleId ?? "?"}:`, error);
  try {
    await supabase.from("expose_generation_failures").insert({
      vehicle_id: vehicleId ?? null,
      vehicle_title: vehicleTitle ?? null,
      error_message: message.slice(0, 2000),
      context,
    });
  } catch (logErr) {
    console.warn("[Exposé] Fehlerprotokollierung fehlgeschlagen:", logErr);
  }
}

/** Generates the exposé PDF for a vehicle entirely in the browser. */
export async function generateExposeBlob(vehicle: Vehicle): Promise<Blob> {
  await ensureBufferPolyfill();
  const [{ pdf }, { default: VehicleExpose }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/VehicleExpose"),
  ]);
  const blob = await pdf(createElement(VehicleExpose, { vehicle }) as never).toBlob();
  if (!blob || blob.size === 0) {
    throw new Error("Das erzeugte PDF war leer.");
  }
  return blob;
}

export const EXPOSE_ERROR_HINT =
  "Bitte versuchen Sie es in einigen Minuten erneut. Falls der Fehler bestehen bleibt, kontaktieren Sie uns bitte telefonisch unter 05251 69 42 40.";
