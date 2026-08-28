#!/usr/bin/env node
/**
 * Verstuurt één test-mail via Resend om te checken dat de key + domeinverificatie
 * werken, VOORDAT we erop vertrouwen voor echte klantmail (offertes/facturen).
 *
 * Draait los van de app-code (geen SMTP-fallback, geen instellingen-BCC) —
 * puur een directe Resend-call met dezelfde 'from'-logica als src/lib/email.ts.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx node scripts/test-resend-verzending.mjs jouw@adres.nl
 *
 * (Of zet RESEND_API_KEY eerst lokaal in .env.local en draai zonder prefix.)
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const content = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const val = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  }
} catch {}

const to = process.argv[2]
if (!to) {
  console.error('Gebruik: node scripts/test-resend-verzending.mjs jouw@adres.nl')
  process.exit(1)
}

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.error('RESEND_API_KEY ontbreekt (zet hem in .env.local of geef hem mee als env-var).')
  process.exit(1)
}

const { Resend } = await import('resend')
const resend = new Resend(apiKey)

const fromRaw = process.env.RESEND_FROM || process.env.SMTP_FROM || 'Kunststofkozijnnodig.nl <info@kunststofkozijnnodig.nl>'

console.log(`Versturen via Resend, from: ${fromRaw}, to: ${to} ...`)
const { data, error } = await resend.emails.send({
  from: fromRaw,
  to: [to],
  subject: 'Testmail — Resend-koppeling KKN CRM',
  html: '<p>Dit is een testmail om te checken dat de Resend-koppeling werkt.</p><p>Komt deze mail normaal binnen (niet in spam)? Dan staat de deliverability goed.</p>',
  text: 'Dit is een testmail om te checken dat de Resend-koppeling werkt. Komt deze mail normaal binnen (niet in spam)? Dan staat de deliverability goed.',
})

if (error) {
  console.error('MISLUKT:', error)
  process.exit(1)
}
console.log('Verstuurd! Resend id:', data?.id)
console.log('Check nu de inbox van', to, '(en de spamfolder, voor de zekerheid).')
