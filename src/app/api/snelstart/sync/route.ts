import { NextResponse } from 'next/server'
import { syncSnelstartBetalingen } from '@/lib/actions'
import { createAdminClient } from '@/lib/supabase/admin'

// Gebruikt door de cron én door de handmatige "Sync SnelStart" knop.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  // Cron-auth: Vercel Cron stuurt automatisch Authorization: Bearer CRON_SECRET
  // (LET OP: hier stond eerder ook een check op 'x-vercel-cron' — die header
  // bestaat niet, zelfde fout als in backup-db/route.ts, hier verwijderd
  // omdat 'ie toch nooit iets deed: isCron bepaalde alleen of adminIdOverride
  // werd opgezocht, een handmatige aanroep zonder sessie faalt sowieso via
  // getAdministratieId() in syncSnelstartBetalingen hieronder).
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const isCron = !!cronSecret && auth === `Bearer ${cronSecret}`

  try {
    // Cron-requests hebben geen user-sessie → administratieId expliciet opzoeken
    // (zelfde patroon als /api/email/sync). Bij handmatige aanroep door een
    // ingelogde gebruiker valt de actie zelf terug op getAdministratieId().
    let adminIdOverride: string | undefined
    if (isCron) {
      const supabase = createAdminClient()
      const { data: administraties } = await supabase
        .from('administraties')
        .select('id')
        .ilike('naam', '%Kunststofkozijnnodig%')
        .limit(1)
      if (administraties?.length) {
        adminIdOverride = administraties[0].id
      } else {
        return NextResponse.json({ error: 'Geen administratie gevonden voor cron-sync', isCron }, { status: 404 })
      }
    }

    const result = await syncSnelstartBetalingen(adminIdOverride)
    // Een inhoudelijke fout (bv. SnelStart-API onbereikbaar, niet ingelogd bij
    // handmatige aanroep) gaf hier altijd status 200 terug — onzichtbaar voor
    // monitoring/cron-logs, zelfde patroon als de eerder gevonden backup-bug.
    // 'result' bevat hier geen 'error' bij een menselijke frontend-aanroep
    // (die roept syncSnelstartBetalingen rechtstreeks aan, niet deze route).
    const status = 'error' in result && result.error ? 502 : 200
    return NextResponse.json({ ...result, isCron }, { status })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
