import { createImapClient } from '@/lib/imap'

/**
 * Kopie van een verstuurd bericht in de Verzonden-map zetten.
 *
 * Sinds er via Resend wordt verstuurd, komt uitgaande post niet meer langs
 * Gmail en belandt er dus ook niets meer in Verzonden — bij verzenden via
 * smtp.gmail.com deed Gmail dat automatisch. Daarom plaatst het CRM de kopie
 * nu zelf via IMAP.
 *
 * De kopie komt in de mailbox waarmee we IMAP-verbinding maken (SMTP_USER),
 * ongeacht welk afzenderadres in de mail staat.
 */

export interface VerzondenBericht {
  from: string
  to: string[]
  bcc?: string[]
  replyTo?: string
  subject: string
  html: string
  text: string
  attachments?: { filename: string; content: Buffer | string; encoding?: string }[]
}

/** Zoekt de Verzonden-map op; namen verschillen per provider en per taal. */
async function vindVerzondenMap(client: {
  list: () => Promise<unknown[]>
}): Promise<string> {
  const handmatig = (process.env.MAIL_VERZONDEN_MAP || '').trim()
  if (handmatig) return handmatig

  try {
    const mappen = (await client.list()) as { path?: string; name?: string; specialUse?: string }[]
    // Voorkeur: de map die de server zelf als \Sent aanmerkt.
    const speciaal = mappen.find(m => (m.specialUse || '').toLowerCase() === '\\sent')
    if (speciaal?.path) return speciaal.path

    const namen = ['verzonden berichten', 'verzonden items', 'sent mail', 'verzonden', 'sent']
    for (const naam of namen) {
      const treffer = mappen.find(m => (m.path || '').toLowerCase().endsWith(naam))
      if (treffer?.path) return treffer.path
    }
  } catch {
    // Val terug op de Gmail-standaard.
  }
  return '[Gmail]/Verzonden berichten'
}

/**
 * Bouwt het MIME-bericht opnieuw op en zet het in de Verzonden-map.
 * Gooit nooit: mislukt het archiveren, dan is de mail zelf al verstuurd en
 * mag dat niet alsnog als fout eindigen.
 */
export async function bewaarInVerzonden(bericht: VerzondenBericht): Promise<void> {
  if ((process.env.MAIL_ARCHIVEER_VERZONDEN || '').toLowerCase() === 'uit') return
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return

  const start = Date.now()
  let client: ReturnType<typeof createImapClient> | null = null
  try {
    const MailComposer = (await import('nodemailer/lib/mail-composer')).default
    const raw: Buffer = await new Promise((resolve, reject) => {
      new MailComposer({
        from: bericht.from,
        to: bericht.to,
        bcc: bericht.bcc,
        replyTo: bericht.replyTo,
        subject: bericht.subject,
        html: bericht.html,
        text: bericht.text,
        attachments: bericht.attachments,
      })
        .compile()
        .build((err: Error | null, message: Buffer) => (err ? reject(err) : resolve(message)))
    })

    client = createImapClient()
    await client.connect()
    const map = await vindVerzondenMap(client as unknown as { list: () => Promise<unknown[]> })
    // \Seen: een eigen verstuurd bericht hoort niet als ongelezen te tellen.
    await client.append(map, raw, ['\\Seen'])
    console.log(
      `[mail-archief] kopie in "${map}" gezet (${(raw.length / 1024 / 1024).toFixed(1)}MB) in ${Date.now() - start}ms`,
    )
  } catch (err) {
    console.error('[mail-archief] kopie in Verzonden zetten mislukt:', err)
  } finally {
    try { await client?.logout() } catch { /* verbinding al weg */ }
  }
}
