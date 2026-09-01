import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stuurCronDagOverzicht } from '@/lib/cron-alert'

// Bundelt alle cron-fouten van de afgelopen 24 uur (audit_log, actie
// 'cron.%' — zie logAudit-aanroepen in de losse cron-routes) tot 1 mail per
// dag, i.p.v. een losse mail per mislukte run. Stuurt niets als er niets mis
// ging.
//
// Vercel Cron plant altijd in UTC, zonder zomertijd-correctie. vercel.json
// staat op '0 14 * * *' = 16:00 in Nederland tijdens zomertijd (CEST,
// eind maart–eind oktober); in de winter (CET) is dat dan 15:00 lokaal. Wil
// je het hele jaar exact 16:00, dan moet de schedule 2x per jaar handmatig
// mee-verschuiven met de klok.
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()
  const sinds = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: rows, error } = await sb
    .from('audit_log')
    .select('actie, details, created_at')
    .like('actie', 'cron.%')
    .gte('created_at', sinds)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Groeperen per actie; per groep max 3 voorbeeld-regels in de mail (anders
  // wordt een dag met honderden identieke fouten onleesbaar).
  const perActie = new Map<string, { aantal: number; voorbeelden: string[] }>()
  for (const r of rows || []) {
    const entry = perActie.get(r.actie) || { aantal: 0, voorbeelden: [] }
    entry.aantal++
    if (entry.voorbeelden.length < 3) {
      const details = r.details as Record<string, unknown> | null
      const tekst = details ? JSON.stringify(details).slice(0, 300) : '(geen details)'
      entry.voorbeelden.push(`${r.created_at}: ${tekst}`)
    }
    perActie.set(r.actie, entry)
  }

  const fouten = [...perActie.entries()].map(([actie, v]) => ({ actie, aantal: v.aantal, voorbeelden: v.voorbeelden }))
  await stuurCronDagOverzicht(fouten)

  return NextResponse.json({ periode_vanaf: sinds, aantal_actietypes: fouten.length, totaal_fouten: fouten.reduce((s, f) => s + f.aantal, 0) })
}
