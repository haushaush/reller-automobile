import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Reller Automobile Portal'

interface SpecRow { label: string; value?: string | null }

interface MobileAdPublishedProps {
  title?: string
  brand?: string
  model?: string
  modelDescription?: string
  mobileAdId?: string
  specs?: SpecRow[]
  storyImageUrl?: string
  storyDownloadUrl?: string
  storyError?: string
  exposeUrl?: string
  exposeError?: string
  mobileAdUrl?: string
  portalUrl?: string
}

const Email = ({
  title, brand, model, modelDescription, mobileAdId,
  specs = [], storyImageUrl, storyDownloadUrl, storyError,
  exposeUrl, exposeError, mobileAdUrl, portalUrl,
}: MobileAdPublishedProps) => {
  const headline = title || [brand, model].filter(Boolean).join(' ') || 'Fahrzeug'
  return (
    <Html lang="de" dir="ltr">
      <Head />
      <Preview>Neues Mobile.de-Inserat veröffentlicht: {headline}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Neues Fahrzeug wurde bei Mobile.de veröffentlicht</Heading>
          <Heading as="h2" style={h2}>{headline}</Heading>
          {modelDescription ? <Text style={meta}>{modelDescription}</Text> : null}

          <Section style={card}>
            {specs.filter((s) => s.value).map((s, i) => (
              <Text key={i} style={specLine}>
                <span style={specLabel}>{s.label}:</span> <span style={specValue}>{s.value}</span>
              </Text>
            ))}
            {mobileAdId ? (
              <Text style={specLine}>
                <span style={specLabel}>Mobile.de-ID:</span> <span style={specValue}>{mobileAdId}</span>
              </Text>
            ) : null}
          </Section>

          <Hr style={hr} />

          <Heading as="h3" style={h3}>WhatsApp-Story</Heading>
          {storyImageUrl ? (
            <>
              <Img src={storyImageUrl} alt="WhatsApp Story" width="320" style={storyImg} />
              {storyDownloadUrl ? (
                <Text style={small}>
                  <Link href={storyDownloadUrl} style={primaryButton}>WhatsApp-Story herunterladen</Link>
                </Text>
              ) : null}
              <Text style={hint}>
                Der Bild-Link ist zeitlich begrenzt gültig (ca. 7 Tage). Bitte zeitnah speichern.
              </Text>
            </>
          ) : (
            <Text style={notice}>
              {storyError || 'WhatsApp-Story konnte nicht automatisch erzeugt werden.'}
            </Text>
          )}

          <Hr style={hr} />

          <Heading as="h3" style={h3}>Links</Heading>
          {mobileAdUrl ? (
            <Text style={small}><Link href={mobileAdUrl} style={primaryButton}>Mobile.de Inserat öffnen</Link></Text>
          ) : null}
          {exposeUrl ? (
            <Text style={small}><Link href={exposeUrl} style={secondaryButton}>Exposé öffnen</Link></Text>
          ) : exposeError ? (
            <Text style={notice}>{exposeError}</Text>
          ) : null}
          {portalUrl ? (
            <Text style={small}><Link href={portalUrl} style={secondaryButton}>Im Portal öffnen</Link></Text>
          ) : null}

          <Text style={footer}>
            Diese Nachricht wurde automatisch vom {SITE_NAME} erstellt.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const brand = data?.brand || ''
    const model = data?.model || ''
    const t = [brand, model].filter(Boolean).join(' ') || data?.title || 'Fahrzeug'
    return `Neues Mobile.de-Inserat veröffentlicht: ${t}`
  },
  displayName: 'Mobile.de Inserat veröffentlicht',
  previewData: {
    brand: 'BMW',
    model: 'M3',
    modelDescription: 'Competition Touring',
    mobileAdId: '123456789',
    specs: [
      { label: 'Preis', value: '89.900 €' },
      { label: 'Kilometerstand', value: '12.500 km' },
      { label: 'Erstzulassung', value: '03/2023' },
      { label: 'Kraftstoff', value: 'Benzin' },
    ],
    storyImageUrl: 'https://placehold.co/320x568',
    storyDownloadUrl: 'https://placehold.co/320x568',
    mobileAdUrl: 'https://suchen.mobile.de/fahrzeuge/details.html?id=123456789',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '640px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#000', margin: '0 0 8px' }
const h2 = { fontSize: '18px', fontWeight: 600 as const, color: '#000', margin: '0 0 4px' }
const h3 = { fontSize: '15px', fontWeight: 600 as const, color: '#000', margin: '16px 0 8px' }
const meta = { fontSize: '13px', color: '#666', margin: '0 0 12px' }
const card = { padding: '14px 16px', backgroundColor: '#f7f7f5', borderRadius: '8px', margin: '8px 0 16px' }
const specLine = { fontSize: '13px', color: '#222', margin: '3px 0', lineHeight: '1.5' }
const specLabel = { color: '#666' }
const specValue = { color: '#111', fontWeight: 600 as const }
const hr = { borderColor: '#eee', margin: '16px 0' }
const storyImg = { maxWidth: '320px', width: '100%', borderRadius: '16px', display: 'block', height: 'auto', margin: '8px 0' }
const small = { margin: '10px 0', fontSize: '13px' }
const hint = { fontSize: '12px', color: '#888', margin: '6px 0 0' }
const notice = { fontSize: '13px', color: '#a15a00', backgroundColor: '#fff7e6', padding: '10px 12px', borderRadius: '6px', margin: '8px 0' }
const primaryButton = {
  display: 'inline-block',
  padding: '12px 18px',
  backgroundColor: '#000',
  color: '#fff',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 600 as const,
  fontSize: '14px',
}
const secondaryButton = {
  display: 'inline-block',
  padding: '10px 16px',
  backgroundColor: '#c0392b',
  color: '#fff',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 600 as const,
  fontSize: '13px',
}
const footer = { fontSize: '12px', color: '#888', marginTop: '24px' }
