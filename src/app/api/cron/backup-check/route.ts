import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'

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
    const ontvanger = process.env.BACKUP_ALERT_EMAIL || 'info@kunststofkozijnnodig.nl'
    try {
      await sendEmail({
        to: ontvanger,
        subject: `⚠️ Database-backup mislukt of ontbreekt — ${gisteren}`,
        html: `
          <p>De dagelijkse database-backup voor <strong>${gisteren}</strong> is niet aangetroffen in de
          <code>db-backups</code>-opslag (map <code>${gisteren}/</code>).</p>
          <p>Mogelijke oorzaken: de backup-cron faalde, de Supabase Storage-bucket is niet bereikbaar,
          of er is een fout in <code>/api/admin/backup-db</code>.</p>
          <p>Handmatig opnieuw proberen: <code>curl -X POST -H "x-admin-key: &lt;SUPABASE_SERVICE_ROLE_KEY&gt;"
          https://kunststofkozijnnodig-crm.vercel.app/api/admin/backup-db</code></p>
        `,
      })
    } catch (e) {
      console.error('Backup-alert versturen mislukt:', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({ datum: gisteren, ok })
}
