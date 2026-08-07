import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// Bewaakt het oude Rebu-CRM tijdens de overstap: oude offerte-mails bevatten
// acceptatielinks naar de Rebu-app, dus een late acceptatie komt alléén in de
// Rebu-database terecht. Deze cron pollt daarop en:
//   1. zet de KKN-kopie van de offerte (zelfde UUID, gemigreerd via
//      scripts/migreer-rebu-lopend.mjs) ook op 'geaccepteerd' — daarmee
//      verschijnt hij in de notificaties en is hij direct factureerbaar;
//   2. maakt een taak "factureren via KKN?" aan (met dedup).
//
// Checkpoint (laatst verwerkte updated_at) staat in de instellingen-tabel.
// Uit te zetten door de REBU_SUPABASE_*-env-variabelen te verwijderen zodra
// Rebu definitief op slot gaat.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CHECKPOINT_SLEUTEL = 'rebu_acceptaties_checkpoint'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const rebuUrl = process.env.REBU_SUPABASE_URL
  const rebuKey = process.env.REBU_SUPABASE_SERVICE_ROLE_KEY
  if (!rebuUrl || !rebuKey) {
    return NextResponse.json({ disabled: true, reden: 'REBU_SUPABASE_* env ontbreekt' })
  }

  const kkn = createAdminClient()
  const rebu = createClient(rebuUrl, rebuKey, { auth: { persistSession: false } })

  const { data: adminRow } = await kkn.from('administraties').select('id').limit(1).single()
  if (!adminRow) return NextResponse.json({ error: 'geen administratie' }, { status: 500 })
  const adminId = adminRow.id as string

  // Checkpoint lezen; eerste run kijkt 24 uur terug.
  const { data: cpRow } = await kkn
    .from('instellingen')
    .select('waarde')
    .eq('administratie_id', adminId)
    .eq('sleutel', CHECKPOINT_SLEUTEL)
    .maybeSingle()
  const checkpoint = typeof cpRow?.waarde === 'string'
    ? cpRow.waarde
    : new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const { data: acceptaties, error: rebuErr } = await rebu
    .from('offertes')
    .select('id, offertenummer, onderwerp, totaal, relatie_id, updated_at')
    .eq('status', 'geaccepteerd')
    .gt('updated_at', checkpoint)
    .order('updated_at', { ascending: true })
    .limit(50)
  if (rebuErr) {
    return NextResponse.json({ error: `Rebu-DB onbereikbaar: ${rebuErr.message}` }, { status: 502 })
  }

  let statusGesynct = 0
  let takenAangemaakt = 0

  for (const off of acceptaties || []) {
    // 1. KKN-kopie (zelfde UUID) meezetten naar geaccepteerd
    const { data: kknOff } = await kkn
      .from('offertes')
      .select('id, status')
      .eq('id', off.id)
      .maybeSingle()
    if (kknOff && kknOff.status !== 'geaccepteerd') {
      await kkn.from('offertes').update({ status: 'geaccepteerd' }).eq('id', off.id)
      statusGesynct++
    }

    // 2. Taak met dedup (titel is de sleutel; ook afgeronde taken tellen mee
    //    zodat een afgevinkte taak niet opnieuw verschijnt)
    const titel = `Rebu-offerte ${off.offertenummer} geaccepteerd — factureren via KKN?`
    const { data: bestaandeTaak } = await kkn
      .from('taken')
      .select('id')
      .eq('administratie_id', adminId)
      .eq('titel', titel)
      .limit(1)
      .maybeSingle()
    if (bestaandeTaak) continue

    // Relatie alleen koppelen als hij in KKN bestaat (zelfde UUID)
    let relatieId: string | null = null
    let klantNaam = ''
    if (off.relatie_id) {
      const { data: rel } = await kkn.from('relaties').select('id, bedrijfsnaam').eq('id', off.relatie_id).maybeSingle()
      if (rel) {
        relatieId = rel.id
        klantNaam = rel.bedrijfsnaam || ''
      } else {
        const { data: rebuRel } = await rebu.from('relaties').select('bedrijfsnaam').eq('id', off.relatie_id).maybeSingle()
        klantNaam = rebuRel?.bedrijfsnaam || ''
      }
    }

    // Taaknummer: zelfde formaat als getVolgendTaaknummer in actions.ts
    const jaar = new Date().getFullYear().toString()
    const { data: laatste } = await kkn
      .from('taken')
      .select('taaknummer')
      .like('taaknummer', `${jaar}-%`)
      .order('taaknummer', { ascending: false })
      .limit(1)
    const volgend = laatste?.[0]?.taaknummer ? parseInt(laatste[0].taaknummer.split('-')[1]) + 1 : 1

    await kkn.from('taken').insert({
      administratie_id: adminId,
      taaknummer: `${jaar}-${String(volgend).padStart(5, '0')}`,
      titel,
      omschrijving: `De klant heeft offerte ${off.offertenummer}${klantNaam ? ` (${klantNaam})` : ''} geaccepteerd via de oude Rebu-acceptatielink (€ ${Number(off.totaal || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}).${kknOff ? ' De offerte staat in KKN en kan daar gefactureerd worden.' : ' Deze offerte is NIET gemigreerd naar KKN — handmatig overzetten of in Rebu afhandelen.'}${off.onderwerp ? `\nOnderwerp: ${off.onderwerp}` : ''}`,
      prioriteit: 'hoog',
      status: 'open',
      relatie_id: relatieId,
      offerte_id: kknOff ? off.id : null,
    })
    takenAangemaakt++
  }

  // Checkpoint bijwerken naar de laatst verwerkte acceptatie
  const laatsteUpdatedAt = acceptaties?.length ? acceptaties[acceptaties.length - 1].updated_at : null
  if (laatsteUpdatedAt) {
    await kkn.from('instellingen').upsert(
      { administratie_id: adminId, sleutel: CHECKPOINT_SLEUTEL, waarde: laatsteUpdatedAt },
      { onConflict: 'administratie_id,sleutel' },
    )
  }

  return NextResponse.json({
    checked: acceptaties?.length || 0,
    status_gesynct: statusGesynct,
    taken_aangemaakt: takenAangemaakt,
    checkpoint: laatsteUpdatedAt || checkpoint,
  })
}
