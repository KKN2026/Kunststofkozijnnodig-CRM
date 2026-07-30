import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { buildRebuEmailHtml } from '@/lib/email-template'
import { getInstellingen, bool, num, type InstellingWaarden } from '@/lib/instellingen'

// Auto-follow-up cron voor verzonden offertes:
// - Voor verzonden offertes met klantadres
// - Verstuurd 7-30 dagen geleden
// - Geen reactie ontvangen (geen status-wijziging in die periode)
// - Geen eerdere reminder verstuurd
// → Stuur 1 vriendelijke reminder, log in email_log met type 'reminder'
//
// Draait dagelijks via Vercel cron (vercel.json schedule '0 9 * * *' = 09:00).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()
  const now = Date.now()

  // Het opvolgvenster is instelbaar (Instellingen → Herinneringen). We halen de
  // offertes op met het ruimst mogelijke venster over alle administraties en
  // filteren per offerte op de instellingen van háár administratie.
  const insCache = new Map<string, InstellingWaarden>()
  async function insVoor(administratieId: string): Promise<InstellingWaarden> {
    const bestaand = insCache.get(administratieId)
    if (bestaand) return bestaand
    const ins = await getInstellingen(sb, administratieId)
    insCache.set(administratieId, ins)
    return ins
  }

  const { data: administraties } = await sb.from('administraties').select('id')
  let ruimsteNa = Number.MAX_SAFE_INTEGER
  let ruimsteTot = 0
  for (const a of administraties || []) {
    const ins = await insVoor(a.id as string)
    if (!bool(ins, 'offerte_followup_actief')) continue
    ruimsteNa = Math.min(ruimsteNa, num(ins, 'offerte_followup_na_dagen'))
    ruimsteTot = Math.max(ruimsteTot, num(ins, 'offerte_followup_tot_dagen'))
  }
  if (ruimsteTot === 0) {
    // Geen enkele administratie heeft opvolging aan staan.
    return NextResponse.json({ disabled: true, checked: 0, reminders_sent: 0 })
  }

  const zevenDagenGeleden = new Date(now - ruimsteNa * 24 * 60 * 60 * 1000).toISOString()
  const dertigDagenGeleden = new Date(now - ruimsteTot * 24 * 60 * 60 * 1000).toISOString()

  // Verzonden offertes binnen het venster — exclusief offertes die we al
  // gerappelleerd hebben (track via email_log met onderwerp prefix 'Reminder:').
  const { data: offertes } = await sb
    .from('offertes')
    .select('id, offertenummer, onderwerp, totaal, datum, updated_at, administratie_id, relatie:relaties(id, contactpersoon, bedrijfsnaam, email), project:projecten(naam)')
    .eq('status', 'verzonden')
    .gte('updated_at', dertigDagenGeleden)
    .lte('updated_at', zevenDagenGeleden)

  if (!offertes || offertes.length === 0) {
    return NextResponse.json({ checked: 0, reminders_sent: 0 })
  }

  let remindersSent = 0
  const errors: string[] = []

  for (const offerte of offertes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const relatie = (offerte as any).relatie
    if (!relatie?.email) continue

    // Het opgehaalde venster is het ruimste over alle administraties; toets hier
    // tegen de eigen instellingen van deze offerte.
    const ins = await insVoor(offerte.administratie_id as string)
    if (!bool(ins, 'offerte_followup_actief')) continue
    const dagenSinds = Math.floor((now - new Date(offerte.updated_at as string).getTime()) / 86400000)
    if (dagenSinds < num(ins, 'offerte_followup_na_dagen')) continue
    if (dagenSinds > num(ins, 'offerte_followup_tot_dagen')) continue

    // Skip wanneer er al een reminder is verstuurd
    const { data: prevReminders } = await sb
      .from('email_log')
      .select('id')
      .eq('aan', relatie.email)
      .ilike('onderwerp', `Herinnering offerte ${offerte.offertenummer}%`)
      .limit(1)
    if (prevReminders && prevReminders.length > 0) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project = (offerte as any).project
    const projectNaam = project?.naam || offerte.onderwerp || ''
    const subject = `Herinnering offerte ${offerte.offertenummer}${projectNaam ? ` — ${projectNaam}` : ''}`

    const body = `Beste ${relatie.contactpersoon || relatie.bedrijfsnaam || ''},

Onlangs hebben wij u onze offerte ${offerte.offertenummer}${projectNaam ? ` voor ${projectNaam}` : ''} toegestuurd.
Wij zijn benieuwd of u de offerte heeft kunnen bekijken en of u nog vragen heeft.

Mocht u akkoord zijn, dan kunt u eenvoudig digitaal akkoord geven via de link in onze eerdere e-mail.
Heeft u aanvullingen of wijzigingen? Laat het gerust weten — wij helpen u graag verder.

Met vriendelijke groet,
Kunststofkozijnnodig.nl`

    try {
      await sendEmail({
        to: relatie.email,
        subject,
        html: buildRebuEmailHtml(body),
        fromName: 'Kunststofkozijnnodig.nl',
      })
      // Log
      await sb.from('email_log').insert({
        administratie_id: offerte.administratie_id,
        aan: relatie.email,
        onderwerp: subject,
        body_html: buildRebuEmailHtml(body),
        offerte_id: offerte.id,
        relatie_id: relatie.id,
      })
      remindersSent++
    } catch (e) {
      errors.push(`${offerte.offertenummer}: ${e instanceof Error ? e.message : 'fout'}`)
    }
  }

  return NextResponse.json({
    checked: offertes.length,
    reminders_sent: remindersSent,
    errors: errors.length ? errors : undefined,
  })
}
