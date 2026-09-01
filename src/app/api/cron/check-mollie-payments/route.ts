import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncFactuurFromMollie } from '@/lib/mollie-sync'
import { logAudit } from '@/lib/audit'

// Safety-net: webhook van Mollie kan missen (Mollie endpoint down, Vercel cold
// start error, network issue). Mollie retryt zelf tot 3 dagen, dus echt missen
// is zeldzaam. Deze cron draait elke 2 uur en synchroniseert openstaande
// facturen — idempotent. Als de webhook al gelopen is verandert er niks.
//
// Vercel cron schedule: '0 */2 * * *' (elke 2 uur).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()
  const { data: facturen } = await sb
    .from('facturen')
    .select('id, factuurnummer, mollie_payment_id')
    .not('mollie_payment_id', 'is', null)
    .in('status', ['verzonden', 'deels_betaald', 'vervallen', 'concept'])

  if (!facturen || facturen.length === 0) {
    return NextResponse.json({ checked: 0, updated: 0 })
  }

  let updated = 0
  const errors: string[] = []

  for (const f of facturen) {
    try {
      const result = await syncFactuurFromMollie(f.mollie_payment_id as string)
      if (result.updated) updated++
    } catch (e) {
      errors.push(`${f.factuurnummer}: ${e instanceof Error ? e.message : 'fout'}`)
    }
  }

  // Betalingen die het CRM kent, ook in SnelStart afletteren. Zonder deze stap
  // blijft een iDEAL-betaling daar wekenlang openstaan, omdat Mollie pas dagen
  // later uitbetaalt aan de bank. Boekt in het Mollie-dagboek (1104), niet op de
  // bankrekening, en slaat facturen over die in SnelStart al betaald zijn.
  let afgeletterd = 0
  const afletterFouten: string[] = []
  try {
    const { letterMollieBetalingenAf } = await import('@/lib/snelstart-betalingen')
    const res = await letterMollieBetalingenAf()
    afgeletterd = res.geboekt
    afletterFouten.push(...res.fouten)
  } catch (e) {
    afletterFouten.push(e instanceof Error ? e.message : 'afletteren mislukt')
  }

  // Bij losse fouten (bv. Mollie- of SnelStart-API even onbereikbaar) gaf dit
  // altijd status 200 terug — onzichtbaar voor cron-monitoring, ook als élke
  // factuur faalde. Status 207 (partial) bij fouten zodat Vercel Cron-logs het
  // ook zonder de JSON-body te lezen laten zien, plus een audit-log entry.
  // Geen losse mail per fout meer — die worden om 16:00 gebundeld door de
  // dagelijks-overzicht-cron (zie src/app/api/cron/dagelijks-overzicht).
  const heeftFouten = errors.length > 0 || afletterFouten.length > 0
  if (heeftFouten) {
    const alleFouten = [...errors, ...afletterFouten]
    const { data: admins } = await sb.from('administraties').select('id').limit(1)
    await logAudit({
      actie: 'cron.check_mollie_payments_fouten',
      details: { fouten: alleFouten, checked: facturen.length, updated },
      administratieId: admins?.[0]?.id,
    })
  }
  return NextResponse.json({
    checked: facturen.length,
    updated,
    snelstart_afgeletterd: afgeletterd,
    errors: errors.length ? errors : undefined,
    snelstart_errors: afletterFouten.length ? afletterFouten : undefined,
  }, { status: heeftFouten ? 207 : 200 })
}
