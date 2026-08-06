// Elektro-spezifische Felder dürfen nur an Fahrzeuge mit elektrischem oder
// hybridem Antrieb gesendet werden. Sonst antwortet Mobile.de mit
// "vehicle-not-eligible-for-e-car-attributes" und echte Hinweise gehen unter.

/** Feldnamen der Seller-API, die nur bei Elektro-/Hybridantrieb erlaubt sind. */
export const E_CAR_FIELDS = [
  "chargingTime",
  "chargingTimeQuick",
  "plugTypes",
  "batteryWarranty",
  "batteryCapacity",
  "batteryCertificate",
  "batteryOwnership",
  "batteryRentalPrice",
  "electricRange",
  "electricRangeCity",
  "electricEnergyConsumption",
  "eCarAttributes",
];

function fuelKey(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.toUpperCase();
  if (typeof value === "object" && typeof (value as { key?: string }).key === "string") {
    return (value as { key: string }).key.toUpperCase();
  }
  return String(value).toUpperCase();
}

/** true, wenn der Antrieb elektrisch, hybrid oder Wasserstoff ist. */
export function isECarEligible(fuel: unknown): boolean {
  const key = fuelKey(fuel);
  return /ELECTR|HYBRID|HYDROG/.test(key);
}

/**
 * Entfernt Elektro-Felder aus dem Payload, wenn der Antrieb nicht passt.
 * Liefert die Namen der entfernten Felder für das Protokoll.
 */
export function stripECarFields(
  body: Record<string, unknown>,
  fuel: unknown,
): string[] {
  if (isECarEligible(fuel ?? body.fuel)) return [];
  const removed: string[] = [];
  for (const field of E_CAR_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) {
      delete body[field];
      continue;
    }
    delete body[field];
    removed.push(field);
  }
  return removed;
}
