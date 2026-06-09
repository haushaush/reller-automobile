import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Reller Automobile'

interface Story {
  imageUrl: string
  title?: string
  brand?: string
  price?: string
  exposeUrl?: string
}

interface StoriesDigestProps {
  stories?: Story[]
  note?: string
  count?: number
}


const StoriesDigestEmail = ({ stories = [], note, count }: StoriesDigestProps) => {
  const total = count ?? stories.length
  return (
    <Html lang="de" dir="ltr">
      <Head />
      <Preview>{total} Story{total === 1 ? '' : 'ies'} zum Speichern – Reller Automobile</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            {total} Story{total === 1 ? '' : 'ies'} zum Speichern
          </Heading>
          <Text style={text}>
            So speicherst du das Bild in die Galerie:
          </Text>
          <Section style={howBox}>
            <Text style={howText}>📱 <b>iPhone:</b> lange auf das Bild tippen → „In Fotos sichern"</Text>
            <Text style={howText}>📱 <b>Android:</b> lange auf das Bild tippen → „Bild herunterladen"</Text>
            <Text style={howText}>💻 <b>Desktop:</b> Rechtsklick → „Bild speichern unter…"</Text>
          </Section>
          {note ? (
            <Section style={noteBox}>
              <Text style={noteText}>{note}</Text>
            </Section>
          ) : null}
          {stories.map((s, i) => (
            <Section key={i} style={item}>
              {s.brand ? <Text style={meta}>{s.brand}</Text> : null}
              {s.title ? <Heading as="h2" style={h2}>{s.title}</Heading> : null}
              {s.price ? <Text style={price}>{s.price}</Text> : null}
              <Img src={s.imageUrl} alt={s.title ?? 'Story'} width="280" style={img} />
              <Text style={small}>
                <Link href={s.imageUrl} style={button}>Bild im Browser öffnen</Link>
              </Text>
              <Text style={hint}>
                Falls das Speichern aus der Mail nicht klappt: Button antippen, dann im Browser lange auf das Bild tippen → „In Fotos sichern".
              </Text>
            </Section>
          ))}
          <Text style={footer}>
            Automatisch versendet aus dem {SITE_NAME} Story-Archiv.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: StoriesDigestEmail,
  subject: (data: Record<string, any>) => {
    const c = data?.count ?? (Array.isArray(data?.stories) ? data.stories.length : 0)
    return `${c} neue Stor${c === 1 ? 'y' : 'ies'} – Reller Story-Archiv`
  },
  displayName: 'Story-Archiv Digest',
  previewData: {
    count: 2,
    note: 'Bitte heute noch posten.',
    stories: [
      { imageUrl: 'https://placehold.co/240x426', title: 'BMW M3', brand: 'BMW', price: '89.900 €' },
      { imageUrl: 'https://placehold.co/240x426', title: 'Audi RS6', brand: 'Audi', price: '124.500 €' },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '640px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#000', margin: '0 0 12px' }
const h2 = { fontSize: '16px', fontWeight: '600' as const, color: '#000', margin: '4px 0' }
const text = { fontSize: '14px', color: '#555', lineHeight: '1.5', margin: '0 0 16px' }
const noteBox = { padding: '12px', backgroundColor: '#f7f7f5', borderLeft: '3px solid #999', margin: '0 0 20px' }
const noteText = { fontSize: '14px', color: '#333', margin: 0 }
const item = { marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #eee' }
const meta = { fontSize: '12px', color: '#777', textTransform: 'uppercase' as const, margin: 0 }
const price = { fontSize: '14px', color: '#444', margin: '0 0 8px' }
const img = { maxWidth: '280px', width: '100%', borderRadius: '12px', display: 'block', height: 'auto' }
const small = { margin: '12px 0 0', fontSize: '13px' }
const link = { color: '#000', textDecoration: 'underline' }
const button = {
  display: 'inline-block',
  padding: '12px 18px',
  backgroundColor: '#000',
  color: '#fff',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 600 as const,
  fontSize: '14px',
}
const howBox = { padding: '14px 16px', backgroundColor: '#f7f7f5', borderRadius: '8px', margin: '0 0 20px' }
const howText = { fontSize: '13px', color: '#333', margin: '4px 0', lineHeight: '1.5' }
const hint = { fontSize: '12px', color: '#888', margin: '8px 0 0', lineHeight: '1.4' }
const footer = { fontSize: '12px', color: '#888', marginTop: '24px' }
