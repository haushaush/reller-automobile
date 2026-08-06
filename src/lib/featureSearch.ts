/**
 * Suche über die Ausstattungsmerkmale im Fahrzeug-Assistenten.
 *
 * Gesucht wird über die deutsche Bezeichnung und über gebräuchliche
 * Alternativbegriffe ("Navi", "AHK", "PDC" …). Die Regeln entsprechen der
 * Fahrzeugsuche in der Liste: Groß-/Kleinschreibung egal, Umlaute und deren
 * Umschreibung gleichwertig, bei mehreren Wörtern müssen alle treffen.
 */

/** Umlaute und Sonderzeichen vereinheitlichen. */
export function normalizeSearchText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s\-_/.,;:!?()'"`]+/g, "");
}

/** Gebräuchliche Alternativbegriffe je Merkmal. */
export const FEATURE_SYNONYMS: Record<string, string[]> = {
  navigationSystem: ["navi", "navigation", "gps", "kartenmaterial"],
  electricHeatedSeats: ["sitzheizung", "beheizbare sitze", "sitze beheizt"],
  electricAdjustableSeats: ["sitzverstellung", "elektrische sitze"],
  electricWindows: ["fensterheber", "efh"],
  electricExteriorMirrors: ["spiegel", "aussenspiegel"],
  centralLocking: ["zv", "zentralverriegelung", "funkschluessel"],
  alloyWheels: ["alufelgen", "alus", "lm felgen", "felgen"],
  roofRack: ["dachtraeger", "dachreling", "reling"],
  panoramicGlassRoof: ["panoramadach", "glasdach", "panorama"],
  sunroof: ["schiebedach", "sd"],
  multifunctionalSteeringWheel: ["mfl", "lenkrad"],
  handsFreePhoneSystem: ["freisprech", "telefon", "bluetooth telefon"],
  bluetooth: ["bt", "freisprech"],
  carplay: ["carplay", "apple", "iphone"],
  androidAuto: ["android", "handyanbindung"],
  touchscreen: ["display", "bildschirm"],
  soundSystem: ["soundsystem", "boxen", "hifi", "musik"],
  usb: ["usb", "anschluss", "ladeanschluss"],
  onBoardComputer: ["bordcomputer", "bc"],
  powerSteering: ["servo", "servolenkung", "lenkhilfe"],
  ambientLighting: ["ambiente", "innenbeleuchtung"],
  tintedWindows: ["getoente scheiben", "tönung", "privacy", "abgedunkelt"],
  hillStartAssist: ["berganfahrhilfe", "anfahrassistent"],
  winterPackage: ["winterpaket", "winter"],
  summerTires: ["sommerreifen", "sommer"],
  winterTires: ["winterreifen", "winter"],
  allSeasonTires: ["ganzjahresreifen", "allwetter"],
  daytimeRunningLamps: ["tagfahrlicht", "trl", "led tagfahrlicht"],
  abs: ["antiblockiersystem", "bremse"],
  esp: ["fahrstabilitaet", "stabilitaetskontrolle", "asr"],
  isofix: ["kindersitz", "kindersitzbefestigung"],
  immobilizer: ["wegfahrsperre", "diebstahlschutz"],
  highBeamAssistant: ["fernlicht", "lichtassistent"],
  fatigueWarningSystem: ["muedigkeitswarner", "aufmerksamkeitsassistent"],
  emergencyBrakeAssistant: ["notbremse", "bremsassistent", "city notbremse"],
  emergencyCallSystem: ["ecall", "notruf"],
  rainSensor: ["regensensor", "scheibenwischer automatik"],
  tirePressureMonitoring: ["rdks", "reifendruck", "tpms"],
  laneDepartureWarning: ["spurhalte", "spurassistent", "lka"],
  startStopSystem: ["start stopp", "stopp automatik"],
  trafficSignRecognition: ["verkehrszeichen", "schilder", "tempolimit erkennung"],
};

/** Alternativbegriffe für Felder außerhalb der Merkmalsliste. */
export const EXTRA_SEARCH_TERMS: Record<string, string[]> = {
  climatisation: ["klima", "klimaanlage", "klimaautomatik", "ac", "aircondition"],
  parkingAssistants: ["pdc", "einparkhilfe", "parksensoren", "rueckfahrkamera", "parkassistent"],
  speedControl: ["tempomat", "geschwindigkeitsregelanlage", "gra", "cruise control", "acc"],
  trailerCouplingType: ["ahk", "anhaengerkupplung", "haken", "anhaenger"],
};

/** Alle Suchbegriffe eines Merkmals zu einem Vergleichstext zusammenfassen. */
export function featureHaystack(key: string, label: string, extra: string[] = []): string {
  return [label, key, ...(FEATURE_SYNONYMS[key] ?? []), ...extra]
    .map(normalizeSearchText)
    .join(" ");
}

/** Trifft die Suche? Mehrere Wörter müssen alle enthalten sein. */
export function matchesSearch(haystack: string, query: string): boolean {
  const words = query.trim().split(/\s+/).map(normalizeSearchText).filter(Boolean);
  if (words.length === 0) return true;
  return words.every((w) => haystack.includes(w));
}
