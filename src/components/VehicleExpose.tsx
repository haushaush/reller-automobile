import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Vehicle } from "@/hooks/useVehicles";
import {
  getBodyTypeLabel,
  getFuelLabel,
  getGearboxLabel,
  getClimatisationLabel,
  getConditionLabel,
} from "@/lib/mobileDeLabels";

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#222" },
  header: { marginBottom: 20, borderBottom: "2px solid #c0392b", paddingBottom: 12 },
  companyName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#c0392b", marginBottom: 2 },
  companyInfo: { fontSize: 8, color: "#666", lineHeight: 1.5 },
  mainImage: { width: "100%", height: 260, objectFit: "cover", borderRadius: 6, marginBottom: 16 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  price: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#c0392b", marginBottom: 16 },
  tableRow: { flexDirection: "row", borderBottom: "1px solid #eee", paddingVertical: 5 },
  tableLabel: { width: "40%", fontFamily: "Helvetica-Bold", fontSize: 9, color: "#555" },
  tableValue: { width: "60%", fontSize: 9 },
  sectionTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 8, marginTop: 16 },
  description: { fontSize: 9, lineHeight: 1.6, color: "#444", marginTop: 12 },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  gridImage: { width: "48%", height: 140, objectFit: "cover", borderRadius: 4 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, borderTop: "1px solid #ddd", paddingTop: 8, fontSize: 7, color: "#999", textAlign: "center" },
});

interface VehicleExposeProps {
  vehicle: Vehicle;
}

const VehicleExpose = ({ vehicle }: VehicleExposeProps) => {
  const mainImage = vehicle.image_urls?.[0];
  const additionalImages = vehicle.image_urls?.slice(1, 7) || [];
  const ps = vehicle.power ? Math.round(vehicle.power * 1.36) : null;
  const formattedPrice = vehicle.price
    ? vehicle.price.toLocaleString("de-DE") + " " + (vehicle.currency || "€")
    : null;
  const today = new Date().toLocaleDateString("de-DE");

  const specs: [string, string][] = [
    ["Baujahr", vehicle.year || "–"],
    ["Kilometerstand", vehicle.mileage ? vehicle.mileage.toLocaleString("de-DE") + " km" : "–"],
    ["Leistung", vehicle.power ? `${vehicle.power} kW (${ps} PS)` : "–"],
    ["Hubraum", vehicle.cubic_capacity ? vehicle.cubic_capacity.toLocaleString("de-DE") + " cm³" : "–"],
    ["Getriebe", vehicle.gearbox ? getGearboxLabel(vehicle.gearbox) : "–"],
    ["Kraftstoff", vehicle.fuel ? getFuelLabel(vehicle.fuel) : "–"],
    ["Karosserie", vehicle.body_type ? getBodyTypeLabel(vehicle.body_type) : "–"],
    ["Farbe außen", vehicle.exterior_color || "–"],
    ["Farbe innen", vehicle.interior_color || "–"],
    ["Sitze", vehicle.num_seats?.toString() || "–"],
    ["Klimaanlage", vehicle.climatisation ? getClimatisationLabel(vehicle.climatisation) : "–"],
    ["Zustand", vehicle.condition ? getConditionLabel(vehicle.condition) : "–"],
    ["MwSt. ausweisbar", vehicle.vatable === true ? "Ja" : vehicle.vatable === false ? "Nein" : "–"],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.companyName}>Reller Automobile GmbH</Text>
          <Text style={styles.companyInfo}>
            Steinbruchweg 16-22, 33106 Paderborn | Tel: 05251 69 42 40 | info@reller-automobile.de
          </Text>
        </View>

        {mainImage && <Image src={mainImage} style={styles.mainImage} />}
        <Text style={styles.title}>{vehicle.title}</Text>
        {formattedPrice && <Text style={styles.price}>{formattedPrice}</Text>}

        <Text style={styles.sectionTitle}>Technische Daten</Text>
        {specs.map(([label, value]) => (
          <View key={label} style={styles.tableRow}>
            <Text style={styles.tableLabel}>{label}</Text>
            <Text style={styles.tableValue}>{value}</Text>
          </View>
        ))}

        {vehicle.description && (
          <>
            <Text style={styles.sectionTitle}>Beschreibung</Text>
            <Text style={styles.description}>{vehicle.description}</Text>
          </>
        )}

        <View style={styles.footer}>
          <Text>
            Dieses Exposé wurde automatisch erstellt. Alle Angaben ohne Gewähr. Stand: {today}
          </Text>
          <Text>Reller Automobile GmbH – Steinbruchweg 16-22, 33106 Paderborn – 05251 69 42 40</Text>
        </View>
      </Page>

      {additionalImages.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Weitere Bilder</Text>
          <View style={styles.imageGrid}>
            {additionalImages.map((url, i) => (
              <Image key={i} src={url} style={styles.gridImage} />
            ))}
          </View>
          <View style={styles.footer}>
            <Text>Reller Automobile GmbH – Steinbruchweg 16-22, 33106 Paderborn – 05251 69 42 40</Text>
          </View>
        </Page>
      )}
    </Document>
  );
};

export default VehicleExpose;
