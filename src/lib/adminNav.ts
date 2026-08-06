import {
  LayoutDashboard,
  Car,
  PlusCircle,
  Mail,
  ImageIcon,
  Settings as SettingsIcon,
  Users,
  Activity,
  ShieldCheck,
  MailCheck,
  Bell,
  FileText,
  Images,
  ListChecks,
  Unlink,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavEntry {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Kurzer erklärender Halbsatz für die Werkzeug-Übersicht */
  description: string;
  exact?: boolean;
  badgeKey?: "inquiries" | "tasks";
  adminOnly?: boolean;
}

/** Hauptmenü — bewusst kurz gehalten */
export const MAIN_NAV: AdminNavEntry[] = [
  {
    label: "Übersicht",
    path: "/admin",
    icon: LayoutDashboard,
    exact: true,
    description: "Startseite mit Kennzahlen, neuesten Anfragen und allen Werkzeugen",
  },
  {
    label: "Fahrzeuge",
    path: "/admin/fahrzeuge",
    icon: Car,
    description: "Alle Fahrzeuge ansehen, bearbeiten, reservieren oder verkauft melden",
  },
  {
    label: "Fahrzeug anlegen",
    path: "/admin/fahrzeug-anlegen",
    icon: PlusCircle,
    description: "Ein neues Fahrzeug mit allen Daten und Fotos erfassen",
  },
  {
    label: "Anfragen",
    path: "/admin/anfragen",
    icon: Mail,
    badgeKey: "inquiries",
    description: "Kundenanfragen lesen und deren Bearbeitungsstand pflegen",
  },
  {
    label: "Offene Aufgaben",
    path: "/admin/zu-erledigen",
    icon: ListChecks,
    badgeKey: "tasks",
    description: "Handgriffe, die Sie auf AutoScout24 oder Kleinanzeigen selbst machen müssen",
  },
  {
    label: "Marketing-Materialien",
    path: "/admin/storys",
    icon: ImageIcon,
    description: "Bilder für WhatsApp und Social Media erstellen und wiederfinden",
  },
];

/** Unterpunkte der Einstellungen */
export const SETTINGS_NAV: AdminNavEntry[] = [
  {
    label: "Accounts",
    path: "/admin/einstellungen/accounts",
    icon: Users,
    adminOnly: true,
    description: "Zugänge für Mitarbeiter anlegen und Rechte vergeben",
  },
  {
    label: "Status-Log",
    path: "/admin/einstellungen/status-log",
    icon: Activity,
    description: "Zeigt, ob der Abgleich mit Mobile.de erfolgreich gelaufen ist",
  },
  {
    label: "Datenqualität",
    path: "/admin/einstellungen/datenqualitaet",
    icon: ShieldCheck,
    description: "Fahrzeuge, bei denen Fotos, Preis oder Angaben fehlen",
  },
  {
    label: "Abgleich Mobile.de",
    path: "/admin/einstellungen/abgleich",
    icon: Unlink,
    description: "Inserate ohne Fahrzeug und Angaben, die von Mobile.de abweichen",
  },
  {
    label: "Mail-Verlauf",
    path: "/admin/einstellungen/mail-verlauf",
    icon: MailCheck,
    description: "Alle versendeten E-Mails nachlesen und erneut verschicken",
  },
  {
    label: "Benachrichtigungen",
    path: "/admin/einstellungen/benachrichtigungen",
    icon: Bell,
    description: "Absenderadresse festlegen und einstellen, wer welche Mail bekommt",
  },
  {
    label: "Allgemeine Einstellungen",
    path: "/admin/einstellungen",
    icon: SettingsIcon,
    exact: true,
    description: "Empfänger, automatische Mails und Grundeinstellungen des Portals",
  },
];

/** Werkzeuge ohne eigenen Menüpunkt — nur über die Startseite erreichbar */
export const EXTRA_TOOLS: AdminNavEntry[] = [
  {
    label: "Suchaufträge",
    path: "/admin/suchauftraege",
    icon: Bell,
    description: "Kunden, die auf ein passendes Fahrzeug warten",
  },
  {
    label: "Exposé-Archiv",
    path: "/admin/expose-archiv",
    icon: FileText,
    description: "Erstellte Fahrzeug-PDFs erneut herunterladen oder teilen",
  },
  {
    label: "Collage",
    path: "/admin/collage",
    icon: Images,
    description: "Mehrere Fahrzeugfotos zu einem Bild zusammenstellen",
  },
];

/** Vollständige Werkzeug-Übersicht für die Startseite */
export const ALL_TOOLS: AdminNavEntry[] = [
  ...MAIN_NAV.filter((e) => !e.exact),
  ...EXTRA_TOOLS,
  ...SETTINGS_NAV,
];
