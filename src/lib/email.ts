import nodemailer from 'nodemailer'
import { Resend } from 'resend'

// Verzendlaag. Voorkeur = Resend (betere deliverability: domein-DKIM/SPF, en je
// mag vanuit elk geverifieerd @kunststofkozijnnodig.nl-adres versturen — geen Gmail
// "verzenden als"-gedoe meer). Zolang RESEND_API_KEY niet gezet is, valt de
// functie terug op de oude SMTP-transport, zodat de overgang risicoloos is:
// deploy de code, zet de env-var, en het schakelt vanzelf om.
const resendApiKey = process.env.RESEND_API_KEY
const resend = resendApiKey ? new Resend(resendApiKey) : null

// Strakke timeouts zodat de request niet 60+ seconden blijft hangen als SMTP
// traag/niet bereikbaar is (bv. bij een login-flow waar de user onmiddellijke
// feedback nodig heeft). Alleen relevant in de SMTP-fallback.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 10000, // 10s voor TCP-connect
  greetingTimeout: 10000,   // 10s voor EHLO/HELO
  socketTimeout: 15000,     // 15s voor data-transfer
})

// Genereert een leesbare platte-tekst-variant uit HTML. HTML-only mail telt
// mee als spamsignaal; een multipart-bericht met text-alternatief scoort beter
// bij spamfilters (en is leesbaar in clients die geen HTML tonen).
function htmlNaarTekst(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map(l => l.trim()).join('\n')
    .trim()
}

// Normaliseert één of meer ontvangers naar een nette lijst: accepteert een
// array of een string met komma/puntkomma-gescheiden adressen. Ontdubbelt
// hoofdletterongevoelig (Jan@X.nl == jan@x.nl) zodat niemand de mail dubbel krijgt.
export function normaliseerOntvangers(to: string | string[]): string[] {
  const lijst = Array.isArray(to) ? to : to.split(/[,;]/)
  const seen = new Set<string>()
  const result: string[] = []
  for (const e of lijst) {
    const adres = e.trim()
    if (!adres.includes('@') || seen.has(adres.toLowerCase())) continue
    seen.add(adres.toLowerCase())
    result.push(adres)
  }
  return result
}

// Ontleedt een from-adres in weergavenaam + e-mailadres, of het nu los
// ("info@x.nl") of al geformatteerd ("Naam <info@x.nl>") is aangeleverd. Zonder
// dit brak SMTP_FROM (dat als "Kunststofkozijnnodig.nl <info@...>" in de env
// staat) de domeincheck hieronder en werd de From-header dubbel genest —
// "Naam" <Kunststofkozijnnodig.nl <info@...>> — een ongeldige header die door
// strengere mailservers geweigerd of stilzwijgend gecorrumpeerd kan worden,
// wat klanten hinderde bij het reageren op offerte/factuur-mail (12-08-2026).
function ontleedAdres(waarde: string): { naam?: string; adres: string } {
  const match = waarde.match(/^"?([^"<]*)"?\s*<([^>]+)>\s*$/)
  if (match) {
    const naam = match[1].trim()
    return { naam: naam || undefined, adres: match[2].trim() }
  }
  return { adres: waarde.trim() }
}

export async function sendEmail(options: {
  to: string | string[]
  subject: string
  html: string
  text?: string
  bcc?: string[]
  attachments?: { filename: string; content: Buffer | string; encoding?: string }[]
  replyTo?: string
  fromName?: string
  // Toon-adres in From-veld. We kunnen het zichtbare afzender-adres overschrijven
  // mits het binnen het eigen domein valt (anders DMARC-fail). Default = RESEND_FROM
  // of SMTP_FROM.
  fromEmail?: string
  // Meegeven zodat de ingestelde blinde kopie (Instellingen → E-mail) van deze
  // administratie automatisch wordt toegevoegd. Zonder dit veld gaat er geen
  // extra BCC mee — alleen wat de aanroeper zelf opgeeft.
  administratieId?: string
  // Extra kopregels, o.a. List-Unsubscribe bij bulkmail. Zonder afmeldkop
  // beschouwen Gmail en Yahoo massamail als spam, en dat straft de reputatie
  // van het hele domein af — dus ook gewone offerte- en factuurmail.
  headers?: Record<string, string>
}) {
  const defaultFromRaw = process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || 'info@kunststofkozijnnodig.nl'
  const { naam: defaultFromNaam, adres: defaultFromAdres } = ontleedAdres(defaultFromRaw)
  // Alleen overschrijven binnen eigen domein, anders DMARC fail.
  const eigenDomain = defaultFromAdres.split('@')[1]
  const useFromAdres = options.fromEmail && options.fromEmail.endsWith('@' + eigenDomain)
    ? options.fromEmail
    : defaultFromAdres
  const fromNaam = options.fromName || defaultFromNaam
  const from = fromNaam ? `"${fromNaam}" <${useFromAdres}>` : useFromAdres
  const text = options.text || htmlNaarTekst(options.html)
  // Default replyTo = de afzender (zodat reactie bij medewerker terechtkomt)
  const replyTo = options.replyTo || options.fromEmail || undefined
  const to = normaliseerOntvangers(options.to)
  if (to.length === 0) throw new Error('Geen geldig e-mailadres opgegeven')

  // Universele blinde kopie (env MAIL_BCC): van élk bericht dat het CRM
  // verstuurt gaat een kopie naar dit adres, zodat je kunt controleren of er
  // daadwerkelijk en correct verzonden is. Geldt ook voor cron-mails en
  // portaalberichten, omdat alles hier langskomt. Niet gezet = uit.
  let bcc = options.bcc
  const universeleBcc = (process.env.MAIL_BCC || '').trim()
  if (universeleBcc.includes('@')) {
    const bestaand = new Set([...to, ...(bcc || [])].map(a => a.toLowerCase()))
    if (!bestaand.has(universeleBcc.toLowerCase())) bcc = [...(bcc || []), universeleBcc]
  }

  // Daarnaast kan per administratie nog een eigen BCC-adres ingesteld zijn
  // (Instellingen → E-mail). Dubbele adressen worden hier weggefilterd.
  if (options.administratieId) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { getInstellingen, bool, tekst } = await import('@/lib/instellingen')
      const ins = await getInstellingen(createAdminClient(), options.administratieId)
      const adres = tekst(ins, 'email_bcc_adres').trim()
      if (bool(ins, 'email_bcc_actief') && adres.includes('@')) {
        const bestaand = new Set([...to, ...(bcc || [])].map(a => a.toLowerCase()))
        if (!bestaand.has(adres.toLowerCase())) bcc = [...(bcc || []), adres]
      }
    } catch (err) {
      // Instellingen niet leesbaar → gewoon versturen zonder extra BCC.
      console.error('BCC-instelling lezen mislukt:', err)
    }
  }

  if (resend) {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: options.subject,
      html: options.html,
      text,
      bcc,
      replyTo,
      headers: options.headers,
      attachments: options.attachments?.map(a => ({
        filename: a.filename,
        content: typeof a.content === 'string' ? Buffer.from(a.content, (a.encoding as BufferEncoding) || 'base64') : a.content,
      })),
    })
    // Resend gooit niet maar geeft { error } terug — door te throwen blijft de
    // bestaande try/catch in de callers werken (die rekenen op een exception).
    if (error) {
      throw new Error(`Resend: ${error.message || JSON.stringify(error)}`)
    }
    // Resend komt niet langs Gmail, dus zonder dit blijft de Verzonden-map leeg.
    const { bewaarInVerzonden } = await import('@/lib/mail-archief')
    await bewaarInVerzonden({ from, to, bcc, replyTo, subject: options.subject, html: options.html, text, attachments: options.attachments })
    return
  }

  // SMTP-fallback (zolang RESEND_API_KEY niet gezet is)
  const info = await transporter.sendMail({
    from,
    to,
    subject: options.subject,
    html: options.html,
    text,
    bcc,
    replyTo,
    headers: options.headers,
    attachments: options.attachments,
  })
  // sendMail() gooit alleen als ALLE ontvangers geweigerd worden. Met een
  // universele BCC staat er altijd minstens één extra ontvanger bij, waardoor
  // een geweigerd klantadres (bv. dichtgetimmerde mailbox, typo, greylisting)
  // stilzwijgend als succes doorkomt terwijl de klant niets ontvangt. Expliciet
  // op info.rejected checken zodat dit alsnog als fout naar boven komt.
  if (info.rejected && info.rejected.length > 0) {
    throw new Error(`SMTP heeft ${info.rejected.length} ontvanger(s) geweigerd: ${info.rejected.join(', ')}`)
  }
}
