/**
 * Zentrale Übersetzung technischer Prüf-Schlüssel in verständliche Klartexte.
 *
 * Neue Prüfungen werden AUSSCHLIESSLICH hier ergänzt – die Seite
 * „Datenqualität“ liest alle Texte aus dieser Tabelle.
 */

export type UrgencyKey = "must" | "should" | "hint";

export interface UrgencyConfig {
  key: UrgencyKey;
  label: string;
  description: string;
}

export const URGENCY: Record<UrgencyKey, UrgencyConfig> = {
  must: {
    key: "must",
    label: "Muss behoben werden",
    description: "Ohne diese Angaben kann das Fahrzeug nicht richtig verkauft werden.",
  },
  should: {
    key: "should",
    label: "Sollte behoben werden",
    description: "Diese Punkte kosten Sie Anfragen, wenn sie offen bleiben.",
  },
  hint: {
    key: "hint",
    label: "Hinweis",
    description: "Kleinigkeiten, die das Inserat noch besser machen.",
  },
};

export interface QualityMessage {
  /** Kurze Überschrift in Klartext */
  title: string;
  /** Handlungsempfehlung. `{n}` wird durch die Zahl aus dem Prüf-Detail ersetzt. */
  advice: string;
  urgency: UrgencyKey;
}

export const QUALITY_MESSAGES: Record<string, QualityMessage> = {
  no_images: {
    title: "Keine Fotos hinterlegt",
    advice:
      "Ohne Fotos wird das Fahrzeug kaum angeklickt. Bitte mindestens 5 Bilder hochladen.",
    urgency: "must",
  },
  few_images: {
    title: "Wenige Fotos",
    advice:
      "Nur {n} Fotos vorhanden. Inserate mit mindestens 8 Fotos bekommen deutlich mehr Anfragen.",
    urgency: "should",
  },
  no_price: {
    title: "Kein Preis angegeben",
    advice: "Ohne Preis kann das Fahrzeug nicht veröffentlicht werden.",
    urgency: "must",
  },
  price_too_low: {
    title: "Preis wirkt zu niedrig",
    advice:
      "Der hinterlegte Preis liegt ungewöhnlich niedrig. Bitte prüfen, ob eine Null fehlt.",
    urgency: "should",
  },
  no_first_registration: {
    title: "Erstzulassung fehlt",
    advice:
      "Die Erstzulassung ist eines der wichtigsten Suchkriterien. Bitte im Fahrzeug nachtragen.",
    urgency: "should",
  },
  invalid_first_registration: {
    title: "Erstzulassung unstimmig",
    advice: "Das hinterlegte Datum kann nicht stimmen. Bitte korrigieren.",
    urgency: "should",
  },
  no_mileage: {
    title: "Kilometerstand fehlt",
    advice:
      "Ohne Kilometerstand erscheint das Fahrzeug in vielen Suchen nicht. Bitte nachtragen.",
    urgency: "should",
  },
  mileage_implausible: {
    title: "Kilometerstand unstimmig",
    advice: "Der Kilometerstand ist ungewöhnlich hoch. Bitte prüfen und korrigieren.",
    urgency: "should",
  },
  no_description: {
    title: "Keine Beschreibung",
    advice:
      "Eine Beschreibung schafft Vertrauen und beantwortet Rückfragen vorab. Bitte ergänzen.",
    urgency: "should",
  },
  short_description: {
    title: "Beschreibung sehr kurz",
    advice:
      "Eine ausführliche Beschreibung schafft Vertrauen. Aktuell nur {n} Zeichen.",
    urgency: "hint",
  },
  unknown_title: {
    title: "Fahrzeugname unvollständig",
    advice:
      "Marke und Modell fehlen im Titel. Bitte einen sprechenden Namen hinterlegen.",
    urgency: "must",
  },
  no_detail_page_url: {
    title: "Noch nicht bei Mobile.de sichtbar",
    advice:
      "Zu diesem Fahrzeug gibt es keine Anzeigenseite. Bitte prüfen, ob es veröffentlicht wurde.",
    urgency: "hint",
  },
  /* Abweichungen aus dem Abgleich mit Mobile.de */
  price_drift: {
    title: "Preis weicht von Mobile.de ab",
    advice: "Der Preis im Portal und bei Mobile.de stimmen nicht überein. Bitte abgleichen.",
    urgency: "should",
  },
  mileage_drift: {
    title: "Kilometerstand weicht von Mobile.de ab",
    advice: "Die Angaben unterscheiden sich. Bitte den richtigen Wert eintragen.",
    urgency: "should",
  },
  ad_missing: {
    title: "Anzeige bei Mobile.de nicht gefunden",
    advice: "Das Fahrzeug ist im Portal aktiv, aber bei Mobile.de nicht auffindbar.",
    urgency: "should",
  },
  orphan_ad: {
    title: "Anzeige ohne Fahrzeug im Portal",
    advice: "Bei Mobile.de läuft eine Anzeige, zu der es hier kein Fahrzeug gibt.",
    urgency: "hint",
  },
};

const SEVERITY_TO_URGENCY: Record<string, UrgencyKey> = {
  error: "must",
  warning: "should",
  info: "hint",
};

/** Fällt auf severity zurück, wenn ein Prüf-Schlüssel noch nicht übersetzt ist. */
export function resolveQualityMessage(
  issueType: string,
  severity: string,
  detail: string | null,
): QualityMessage & { urgency: UrgencyKey } {
  const base = QUALITY_MESSAGES[issueType];
  const number = detail?.match(/\d+/)?.[0] ?? "";
  if (!base) {
    return {
      title: "Angabe unvollständig",
      advice: detail ?? "Bitte die Fahrzeugdaten prüfen.",
      urgency: SEVERITY_TO_URGENCY[severity] ?? "hint",
    };
  }
  return {
    ...base,
    advice: base.advice.replace("{n}", number),
  };
}

export const URGENCY_ORDER: UrgencyKey[] = ["must", "should", "hint"];
