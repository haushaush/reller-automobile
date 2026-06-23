import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Link, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Reller Automobile'

export interface ReportVehicleListItem {
  id: string
  brand?: string | null
  model?: string | null
  modelDescription?: string | null
  priceFormatted?: string | null
  mileageFormatted?: string | null
  firstRegistration?: string | null
  soldAtFormatted?: string | null
  url?: string | null
}

export interface DailyBusinessReportProps {
  dateLabel?: string
  periodLabel?: string
  kpis?: {
    newVehiclesCount?: number
    soldVehiclesCount?: number
    currentInventoryCount?: number
    inventoryValueFormatted?: string
    salesValue24hFormatted?: string
    avgSalePriceFormatted?: string | null
  }
  newVehicles?: ReportVehicleListItem[]
  newVehiclesMore?: number
  soldVehicles?: ReportVehicleListItem[]
  soldVehiclesMore?: number
  vehiclesWithoutPriceCount?: number
  vehiclesWithoutImagesCount?: number
  lastSyncLabel?: string | null
  syncErrors?: Array<{ syncName: string; when: string; message?: string | null }>
  warnings?: string[]
  includeNewVehicles?: boolean
  includeSoldVehicles?: boolean
  includeInventoryValue?: boolean
  includeSyncStatus?: boolean
}

const DailyBusinessReportEmail = (props: DailyBusinessReportProps) => {
  const {
    dateLabel = '',
    periodLabel = 'Zeitraum: letzte 24 Stunden',
    kpis = {},
    newVehicles = [],
    newVehiclesMore = 0,
    soldVehicles = [],
    soldVehiclesMore = 0,
    vehiclesWithoutPriceCount = 0,
    vehiclesWithoutImagesCount = 0,
    lastSyncLabel = null,
    syncErrors = [],
    warnings = [],
    includeNewVehicles = true,
    includeSoldVehicles = true,
    includeInventoryValue = true,
    includeSyncStatus = true,
  } = props

  const kpiCards: Array<{ label: string; value: string }> = []
  kpiCards.push({ label: 'Neue Fahrzeuge', value: String(kpis.newVehiclesCount ?? 0) })
  kpiCards.push({ label: 'Verkaufte Fahrzeuge', value: String(kpis.soldVehiclesCount ?? 0) })
  kpiCards.push({ label: 'Aktueller Bestand', value: String(kpis.currentInventoryCount ?? 0) })
  if (includeInventoryValue) {
    kpiCards.push({ label: 'Bestandswert', value: kpis.inventoryValueFormatted ?? '–' })
  }
  kpiCards.push({ label: 'Verkaufswert 24h', value: kpis.salesValue24hFormatted ?? '–' })
  if (kpis.avgSalePriceFormatted) {
    kpiCards.push({ label: 'Ø Verkaufspreis', value: kpis.avgSalePriceFormatted })
  }

  return (
    <Html lang="de" dir="ltr">
      <Head />
      <Preview>Tagesreport {SITE_NAME} – {dateLabel}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Täglicher Kennzahlenbericht</Heading>
          <Text style={subtitle}>{periodLabel}</Text>
          {dateLabel ? <Text style={subtleText}>Stand: {dateLabel}</Text> : null}

          <Section style={kpiGrid}>
            {kpiCards.map((c, i) => (
              <Section key={i} style={kpiCard}>
                <Text style={kpiLabel}>{c.label}</Text>
                <Text style={kpiValue}>{c.value}</Text>
              </Section>
            ))}
          </Section>

          <Text style={infoNote}>
            Einzelne neue Fahrzeuge werden separat per Sync-Mail verschickt.
            Dieser Bericht fasst die Kennzahlen des Tages zusammen.
          </Text>

          {includeNewVehicles && newVehicles.length > 0 ? (
            <Section style={listSection}>
              <Heading as="h2" style={h2}>Neue Fahrzeuge</Heading>
              {newVehicles.map((v) => (
                <Section key={v.id} style={listItem}>
                  <Text style={listTitle}>
                    {[v.brand, v.model].filter(Boolean).join(' ')}
                  </Text>
                  {v.modelDescription ? (
                    <Text style={listMeta}>{v.modelDescription}</Text>
                  ) : null}
                  <Text style={listMeta}>
                    {[v.priceFormatted, v.mileageFormatted, v.firstRegistration]
                      .filter(Boolean).join(' · ')}
                  </Text>
                  {v.url ? (
                    <Text style={listLink}>
                      <Link href={v.url} style={linkStyle}>Fahrzeug ansehen</Link>
                    </Text>
                  ) : null}
                </Section>
              ))}
              {newVehiclesMore > 0 ? (
                <Text style={listMore}>+ {newVehiclesMore} weitere neue Fahrzeuge</Text>
              ) : null}
            </Section>
          ) : null}

          {includeSoldVehicles && soldVehicles.length > 0 ? (
            <Section style={listSection}>
              <Heading as="h2" style={h2}>Verkaufte Fahrzeuge</Heading>
              {soldVehicles.map((v) => (
                <Section key={v.id} style={listItem}>
                  <Text style={listTitle}>
                    {[v.brand, v.model].filter(Boolean).join(' ')}
                  </Text>
                  {v.modelDescription ? (
                    <Text style={listMeta}>{v.modelDescription}</Text>
                  ) : null}
                  <Text style={listMeta}>
                    {[v.priceFormatted, v.soldAtFormatted ? `verkauft am ${v.soldAtFormatted}` : null]
                      .filter(Boolean).join(' · ')}
                  </Text>
                  {v.url ? (
                    <Text style={listLink}>
                      <Link href={v.url} style={linkStyle}>Fahrzeug ansehen</Link>
                    </Text>
                  ) : null}
                </Section>
              ))}
              {soldVehiclesMore > 0 ? (
                <Text style={listMore}>+ {soldVehiclesMore} weitere verkaufte Fahrzeuge</Text>
              ) : null}
            </Section>
          ) : null}

          <Hr style={hr} />
          <Section style={hintsSection}>
            <Heading as="h2" style={h2}>Hinweise</Heading>
            <Text style={hintText}>
              Fahrzeuge ohne Preis: <b>{vehiclesWithoutPriceCount}</b>
            </Text>
            <Text style={hintText}>
              Fahrzeuge ohne Bilder: <b>{vehiclesWithoutImagesCount}</b>
            </Text>
            {includeSyncStatus ? (
              <Text style={hintText}>
                Letzter erfolgreicher Sync: <b>{lastSyncLabel ?? 'keine Daten'}</b>
              </Text>
            ) : null}
            {includeSyncStatus && syncErrors.length > 0 ? (
              <>
                <Text style={hintTextWarn}>Sync-Fehler der letzten 24 Stunden:</Text>
                {syncErrors.map((e, i) => (
                  <Text key={i} style={hintTextSmall}>
                    {e.syncName} ({e.when}){e.message ? ` – ${e.message}` : ''}
                  </Text>
                ))}
              </>
            ) : null}
            {warnings.length > 0 ? (
              <>
                <Text style={hintTextWarn}>Verarbeitungshinweise:</Text>
                {warnings.map((w, i) => (
                  <Text key={i} style={hintTextSmall}>{w}</Text>
                ))}
              </>
            ) : null}
          </Section>

          <Text style={footer}>
            Automatisch generierter Tagesreport von {SITE_NAME}.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: DailyBusinessReportEmail,
  subject: (data: Record<string, any>) => {
    const d = data?.dateLabel ?? ''
    return `Tagesreport ${SITE_NAME}${d ? ` – ${d}` : ''}`
  },
  displayName: 'Täglicher Kennzahlenbericht',
  previewData: {
    dateLabel: '23.06.2026',
    periodLabel: 'Zeitraum: letzte 24 Stunden',
    kpis: {
      newVehiclesCount: 3,
      soldVehiclesCount: 1,
      currentInventoryCount: 42,
      inventoryValueFormatted: '1.234.500 €',
      salesValue24hFormatted: '24.900 €',
      avgSalePriceFormatted: '24.900 €',
    },
    newVehicles: [
      { id: '1', brand: 'Volkswagen', model: 'Golf', modelDescription: '2.0 TDI', priceFormatted: '19.900 €', mileageFormatted: '42.521 km', firstRegistration: '02/2024', url: '#' },
    ],
    soldVehicles: [
      { id: '2', brand: 'Audi', model: 'A4', modelDescription: 'Avant', priceFormatted: '24.900 €', soldAtFormatted: '23.06.2026, 08:15', url: '#' },
    ],
    vehiclesWithoutPriceCount: 0,
    vehiclesWithoutImagesCount: 2,
    lastSyncLabel: 'sync-vehicles · 23.06.2026, 07:55',
    syncErrors: [],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '680px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#000', margin: '0 0 6px' }
const h2 = { fontSize: '16px', fontWeight: '600' as const, color: '#000', margin: '0 0 10px' }
const subtitle = { fontSize: '14px', color: '#444', margin: '0 0 4px' }
const subtleText = { fontSize: '12px', color: '#888', margin: '0 0 18px' }
const kpiGrid = { margin: '0 0 18px' }
const kpiCard = {
  display: 'inline-block',
  width: '46%',
  margin: '0 2% 10px 0',
  padding: '10px 12px',
  border: '1px solid #eee',
  borderRadius: '8px',
  backgroundColor: '#fafafa',
  verticalAlign: 'top' as const,
}
const kpiLabel = { fontSize: '11px', color: '#666', textTransform: 'uppercase' as const, margin: 0 }
const kpiValue = { fontSize: '18px', fontWeight: 'bold' as const, color: '#000', margin: '4px 0 0' }
const infoNote = { fontSize: '12px', color: '#666', fontStyle: 'italic' as const, margin: '4px 0 18px' }
const listSection = { margin: '0 0 18px' }
const listItem = { padding: '8px 0', borderBottom: '1px solid #eee' }
const listTitle = { fontSize: '14px', fontWeight: 600 as const, color: '#000', margin: 0 }
const listMeta = { fontSize: '12px', color: '#555', margin: '2px 0 0' }
const listLink = { fontSize: '12px', margin: '4px 0 0' }
const listMore = { fontSize: '12px', color: '#666', margin: '8px 0 0', fontStyle: 'italic' as const }
const linkStyle = { color: '#000', textDecoration: 'underline' }
const hr = { borderColor: '#eee', margin: '18px 0' }
const hintsSection = { margin: '0 0 18px' }
const hintText = { fontSize: '13px', color: '#333', margin: '4px 0' }
const hintTextWarn = { fontSize: '13px', color: '#c0392b', margin: '10px 0 4px', fontWeight: 600 as const }
const hintTextSmall = { fontSize: '12px', color: '#555', margin: '2px 0' }
const footer = { fontSize: '11px', color: '#999', marginTop: '20px' }
