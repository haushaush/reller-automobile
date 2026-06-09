import { sendLovableEmail } from 'npm:@lovable.dev/email-js'

// Minimal valid PDF containing the text "Test"
const MINIMAL_PDF = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 24 Tf 50 100 Td (Test) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000053 00000 n
0000000098 00000 n
0000000183 00000 n
0000000260 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
320
%%EOF`

function toBase64(str: string): string {
  return btoa(str)
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const apiKey = Deno.env.get('LOVABLE_API_KEY')!
  const url = new URL(req.url)
  const variant = url.searchParams.get('variant') ?? 'attachments'

  const base64Pdf = toBase64(MINIMAL_PDF)
  const results: Record<string, unknown> = { variant }

  // Build payload with extra attachment field — library passes through extra fields via JSON.stringify
  const basePayload: Record<string, unknown> = {
    to: 'khalifabenameur@yahoo.de',
    from: 'noreply@notify.viral-connect.de',
    sender_domain: 'notify.viral-connect.de',
    subject: `Attachment-Test (${variant})`,
    html: '<p>Test ob Anhang ankommt</p>',
    text: 'Test ob Anhang ankommt',
    purpose: 'transactional',
    label: 'attachment-test',
    idempotency_key: `attachment-test-${variant}-${Date.now()}`,
    message_id: `attachment-test-${variant}-${crypto.randomUUID()}`,
    unsubscribe_token: `test-token-${crypto.randomUUID().replaceAll('-', '')}`,
  }


  const attachmentObj = {
    filename: 'test.pdf',
    content: base64Pdf,
    contentType: 'application/pdf',
    content_type: 'application/pdf',
    type: 'application/pdf',
  }

  // Try several field-name variants
  switch (variant) {
    case 'attachments':
      basePayload.attachments = [attachmentObj]
      break
    case 'attachment':
      basePayload.attachment = [attachmentObj]
      break
    case 'files':
      basePayload.files = [attachmentObj]
      break
    case 'none':
      // no attachment, sanity check
      break
    default:
      basePayload.attachments = [attachmentObj]
  }

  try {
    // @ts-expect-error — passing through extra field not in declared type
    const res = await sendLovableEmail(basePayload, { apiKey })
    console.log('ATTACHMENT TEST RESULT:', JSON.stringify({ variant, ok: true, res }))
    results.ok = true
    results.response = res
  } catch (e) {
    const err = e as { name?: string; message?: string; status?: number; retryAfterSeconds?: number | null }
    console.log('ATTACHMENT TEST RESULT:', JSON.stringify({
      variant,
      ok: false,
      name: err?.name,
      status: err?.status,
      message: err?.message,
      retryAfterSeconds: err?.retryAfterSeconds,
    }))
    results.ok = false
    results.error = {
      name: err?.name,
      status: err?.status,
      message: err?.message,
      retryAfterSeconds: err?.retryAfterSeconds,
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
