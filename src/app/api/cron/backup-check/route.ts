import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit'

// Controleert of de dagelijkse database-backup (/api/admin/backup-db, draait
// 03:00 UTC) gisteren daadwerkelijk een bestand heeft weggeschreven naar de
// 'db-backups'-bucket. Zonder deze controle merk je een mislukte backup pas
// als je 'm nodig hebt — precies wat er sinds 7 augustus stilzwijgend misging
// door een verkeerde auth-header in backup-db/route.ts (gefixt 30-08-2026).
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()
  // backup-db schrijft naar pad `${YYYY-MM-DD}/backup-*.json` op basis van de
  // UTC-datum op het moment van schrijven (03:00 UTC) — dus "gisteren" in UTC.
  const gisteren = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: files, error } = await sb.storage.from('db-backups').list(gisteren)
  const ok = !error && !!files?.some(f => f.name.startsWith('backup-') && f.name.endsWith('.json'))

  if (!ok) {
    // Geen losse mail meer per fout — die worden om 16:00 gebundeld door de
    // dagelijks-overzicht-cron (zie src/app/api/cron/dagelijks-overzicht).
    const { data: admins } = await sb.from('administraties').select('id').limit(1)
    await logAudit({
      actie: 'cron.backup_check_mislukt',
      details: { datum: gisteren, bericht: `Database-backup voor ${gisteren} niet aangetroffen in db-backups/${gisteren}/` },
      administratieId: admins?.[0]?.id,
    })
  }

  return NextResponse.json({ datum: gisteren, ok })
}
