import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateVerlopenOffertes } from '@/lib/actions'

// Zet verstuurde offertes op 'verlopen' zodra 'geldig_tot' (standaard 30 dagen
// na versturen/laatste bewerking) verstreken is — en weer terug als de
// geldigheid alsnog verlengd is. Draait voor elke administratie.
//
// Vercel cron schedule: '0 6 * * *' (dagelijks 06:00, samen met de
// vergelijkbare factuur-vervallen-check).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()
  const { data: administraties } = await sb.from('administraties').select('id')

  const resultaten: { administratieId: string; verlopen: number; hersteld: number; error?: string }[] = []
  for (const admin of administraties || []) {
    const result = await updateVerlopenOffertes(admin.id)
    resultaten.push({
      administratieId: admin.id,
      verlopen: 'verlopen' in result ? result.verlopen : 0,
      hersteld: 'hersteld' in result ? result.hersteld : 0,
      error: 'error' in result ? result.error : undefined,
    })
  }

  return NextResponse.json({ resultaten })
}
