// Maakt het KKN-klantenbestand compleet vanuit Rebu (alleen AANVULLEN, er
// wordt niets verwijderd of overschreven):
//   1. relaties die in Rebu bestaan maar in KKN ontbreken → toevoegen
//      (zelfde ID's, incl. herkomst-label; zonder SnelStart-koppelvelden)
//   2. contactpersonen van die relaties
//   3. herkomst-labels aanvullen op bestaande relaties waar KKN er nog geen heeft
//   4. taken in KKN die hun klant-koppeling kwijt zijn (leeggemaakt toen de
//      relatie ontbrak) → koppeling herstellen vanuit de Rebu-bron
//
// Draai hierna `node scripts/migreer-rebu-notities.mjs` om de klantnotities
// aan te vullen (idempotent).
//
//   DRY_RUN=1 node scripts/sync-klantenbestand-uit-rebu.mjs
//   node scripts/sync-klantenbestand-uit-rebu.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { createSupabaseAdmin } from './db.mjs'

const dryRun = process.env.DRY_RUN === '1'

function rebuEnv() {
  if (process.env.REBU_SUPABASE_URL && process.env.REBU_SUPABASE_SERVICE_ROLE_KEY) {
    return { url: process.env.REBU_SUPABASE_URL, key: process.env.REBU_SUPABASE_SERVICE_ROLE_KEY }
  }
  const env = {}
  for (const line of readFileSync(join(homedir(), 'projects', 'Rebucrm', '.env.local'), 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
}

const { url, key } = rebuEnv()
const rebu = createClient(url, key, { auth: { persistSession: false } })
const kkn = await createSupabaseAdmin()
const { data: adminRow } = await kkn.from('administraties').select('id').limit(1).single()
const ADMIN_ID = adminRow.id

async function fetchAll(client, table, select = '*') {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(select).range(from, from + 999).order('id')
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

// 1+2: ontbrekende relaties + hun contactpersonen
const rebuRelaties = await fetchAll(rebu, 'relaties')
const kknRelatieRows = await fetchAll(kkn, 'relaties', 'id, herkomst')
const kknIds = new Set(kknRelatieRows.map(r => r.id))
const ontbrekend = rebuRelaties.filter(r => !kknIds.has(r.id))
const ontbrekendIds = ontbrekend.map(r => r.id)

const contactpersonen = []
for (let i = 0; i < ontbrekendIds.length; i += 100) {
  const { data } = await rebu.from('contactpersonen').select('*').in('relatie_id', ontbrekendIds.slice(i, i + 100))
  contactpersonen.push(...(data || []))
}

// 3: labels aanvullen op bestaande relaties
const kknHerkomst = new Map(kknRelatieRows.map(r => [r.id, r.herkomst]))
const labelUpdates = rebuRelaties.filter(r => r.herkomst && kknIds.has(r.id) && !kknHerkomst.get(r.id))

// 4: klant-koppeling van taken herstellen
const kknTaken = await fetchAll(kkn, 'taken', 'id, relatie_id')
const zonderRelatie = kknTaken.filter(t => !t.relatie_id)
const rebuTaakRelatie = new Map()
for (let i = 0; i < zonderRelatie.length; i += 100) {
  const { data } = await rebu.from('taken').select('id, relatie_id').in('id', zonderRelatie.slice(i, i + 100).map(t => t.id))
  for (const t of data || []) if (t.relatie_id) rebuTaakRelatie.set(t.id, t.relatie_id)
}

console.log(`Aan te vullen:
  relaties:            ${ontbrekend.length}  (Rebu ${rebuRelaties.length}, KKN had ${kknIds.size})
  contactpersonen:     ${contactpersonen.length}
  herkomst-labels:     ${labelUpdates.length}  (op bestaande relaties)
  taak-koppelingen:    ${rebuTaakRelatie.size}  (van ${zonderRelatie.length} taken zonder klant)
`)
if (dryRun) { console.log('DRY_RUN — niets geschreven.'); process.exit(0) }

for (let i = 0; i < ontbrekend.length; i += 500) {
  const chunk = ontbrekend.slice(i, i + 500).map(r => {
    const rij = { ...r, administratie_id: ADMIN_ID }
    delete rij.snelstart_relatie_id
    delete rij.snelstart_synced_at
    return rij
  })
  const { error } = await kkn.from('relaties').upsert(chunk, { onConflict: 'id' })
  if (error) throw new Error(`relaties batch ${i}: ${error.message}`)
}
console.log(`Relaties toegevoegd: ${ontbrekend.length}`)

for (let i = 0; i < contactpersonen.length; i += 500) {
  const chunk = contactpersonen.slice(i, i + 500).map(c => ({ ...c, administratie_id: ADMIN_ID }))
  const { error } = await kkn.from('contactpersonen').upsert(chunk, { onConflict: 'id' })
  if (error) throw new Error(`contactpersonen batch ${i}: ${error.message}`)
}
console.log(`Contactpersonen toegevoegd: ${contactpersonen.length}`)

for (const r of labelUpdates) {
  const { error } = await kkn.from('relaties').update({ herkomst: r.herkomst }).eq('id', r.id)
  if (error) throw new Error(`label ${r.id}: ${error.message}`)
}
console.log(`Labels aangevuld: ${labelUpdates.length}`)

let gekoppeld = 0
const alleKknIds = new Set([...kknIds, ...ontbrekendIds])
for (const [taakId, relatieId] of rebuTaakRelatie) {
  if (!alleKknIds.has(relatieId)) continue
  const { error } = await kkn.from('taken').update({ relatie_id: relatieId }).eq('id', taakId)
  if (!error) gekoppeld++
}
console.log(`Taak-koppelingen hersteld: ${gekoppeld}`)
console.log('\nKlaar — draai nu: node scripts/migreer-rebu-notities.mjs')
