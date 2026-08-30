import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateVervallenFacturen } from '@/lib/actions'
import { stuurCronFoutAlert } from '@/lib/cron-alert'
import { logAudit } from '@/lib/audit'

// Zet facturen op 'vervallen' (of terug naar 'verzonden') puur op basis van de
// vervaldatum + respijtperiode — losstaand van de SnelStart-sync, die hier niet
// voor nodig is en soms zelf niet beschikbaar is. Draait voor elke administratie.
//
// Vercel cron schedule: '0 6 * * *' (dagelijks 06:00).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()
  const { data: administraties } = await sb.from('administraties').select('id')

  const resultaten: { administratieId: string; vervallen: number; hersteld: number; error?: string }[] = []
  for (const admin of administraties || []) {
    const result = await updateVervallenFacturen(admin.id)
    resultaten.push({
      administratieId: admin.id,
      vervallen: 'vervallen' in result ? result.vervallen : 0,
      hersteld: 'hersteld' in result ? result.hersteld : 0,
      error: 'error' in result ? result.error : undefined,
    })
  }

  const fouten = resultaten.filter(r => r.error)
  if (fouten.length > 0) {
    const details = fouten.map(f => `administratie ${f.administratieId}: ${f.error}`)
    await stuurCronFoutAlert('factuur-vervallen-check', details)
    await logAudit({
      actie: 'cron.factuur_vervallen_check_fouten',
      details: { fouten: details },
      administratieId: fouten[0].administratieId,
    })
  }

  return NextResponse.json({ resultaten }, { status: fouten.length > 0 ? 207 : 200 })
}
