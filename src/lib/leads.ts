import { Globe, Phone, MessageSquare, FileText, type LucideIcon } from "lucide-react";

export type LeadSource = "MOBILE" | "KLEINANZEIGEN" | "AUTOSCOUT24" | "SANDBOX" | "MANUAL" | "WEBSITE";
export type LeadStatus = "IN_PROGRESS" | "SOLD" | "NOT_INTERESTED" | "SPAM";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  IN_PROGRESS: "In Bearbeitung",
  SOLD: "Verkauft",
  NOT_INTERESTED: "Kein Interesse",
  SPAM: "Spam",
};

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  MOBILE: "Mobile.de",
  KLEINANZEIGEN: "Kleinanzeigen",
  AUTOSCOUT24: "AutoScout24",
  SANDBOX: "Testumgebung",
  MANUAL: "Handeintrag",
  WEBSITE: "Eigene Website",
};

export const LEAD_TYPE_LABELS: Record<string, string> = {
  messaging: "Nachricht",
  leasing: "Leasinganfrage",
  phone_call: "Telefonanruf",
};

export const LEAD_EVENT_LABELS: Record<string, string> = {
  MessagingLeadSubmitted: "Anfrage eingegangen",
  MessagingLeadResubmitted: "Anfrage erneut gesendet",
  BuyerReplied: "Antwort des Interessenten",
  LeasingLeadSubmitted: "Leasinganfrage",
  PhoneCallReceived: "Telefonanruf",
  BuyerPreferencesUpdated: "Käuferwünsche",
  BuyerSearchBehaviourAdded: "Suchverhalten",
};

export function leadSourceIcon(source: string): LucideIcon {
  switch (source) {
    case "WEBSITE":
      return Globe;
    case "MANUAL":
      return FileText;
    case "AUTOSCOUT24":
    case "KLEINANZEIGEN":
    case "MOBILE":
    default:
      return MessageSquare;
  }
}

export const PhoneIcon = Phone;

/** Farbklasse für das Herkunfts-Symbol — bewusst über Design-Tokens. */
export function leadSourceTone(source: string): string {
  switch (source) {
    case "MOBILE":
      return "bg-primary/10 text-primary";
    case "KLEINANZEIGEN":
      return "bg-accent text-accent-foreground";
    case "AUTOSCOUT24":
      return "bg-secondary text-secondary-foreground";
    case "WEBSITE":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function mobileDeLeadUrl(): string {
  return "https://www.mobile.de/haendler/leads";
}

/** Erste lesbare Nachricht aus einem Ereignis-Payload ziehen. */
export function extractMessage(payload: unknown): string | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  const data = (p.data ?? {}) as Record<string, unknown>;
  const candidates = [
    data.message,
    (data.messaging as Record<string, unknown> | undefined)?.message,
    (data.lead as Record<string, unknown> | undefined)?.message,
    data.text,
    data.body,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (c && typeof c === "object") {
      const inner = (c as Record<string, unknown>).text ?? (c as Record<string, unknown>).content;
      if (typeof inner === "string" && inner.trim()) return inner.trim();
    }
  }
  return null;
}

export function isMissedCallEvent(payload: unknown): boolean {
  const p = (payload ?? {}) as Record<string, unknown>;
  const data = (p.data ?? {}) as Record<string, unknown>;
  const call = ((data.call ?? data.phoneCall) ?? {}) as Record<string, unknown>;
  if (call.missed === true || data.missed === true || call.answered === false) return true;
  const status = String(call.status ?? call.result ?? data.callStatus ?? "").toUpperCase();
  return status.includes("MISSED") || status.includes("NO_ANSWER") || status.includes("NOT_ANSWERED");
}

export function formatDuration(seconds: unknown): string | null {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return m > 0 ? `${m} Min. ${s} Sek.` : `${s} Sek.`;
}
