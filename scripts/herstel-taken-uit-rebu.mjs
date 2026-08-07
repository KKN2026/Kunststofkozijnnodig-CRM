// Zet de open taken + taaknotities uit Rebu (terug) in KKN. De takenlijst is
// de dagelijkse werklijst van het team en hoort in KKN te staan, ook nu de
// rest van de Rebu-historie bewust in Rebu blijft.
//
// Verwijzingen naar offertes/verkoopkansen die niet in KKN staan worden
// leeggemaakt; relatie-koppelingen blijven werken via het klantenbestand.
//
//   DRY_RUN=1 node scripts/herstel-taken-uit-rebu.mjs
//   node scripts/herstel-taken-uit-rebu.mjs
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

async function fetchAll(client, table, applyFilters) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    let q = client.from(table).select('*').range(from, from + 999).order('id')
    if (applyFilters) q = applyFilters(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

async function bestaandeIds(table, ids) {
  const set = new Set()
  const uniq = [...new Set(ids.filter(Boolean))]
  for (let i = 0; i < uniq.length; i += 100) {
    const { data } = await kkn.from(table).select('id').in('id', uniq.slice(i, i + 100))
    for (const r of data || []) set.add(r.id)
  }
  return set
}

// Medewerker-/profielmapping op naam (zelfde als migreer-rebu-lopend.mjs)
const rebuMedewerkers = await fetchAll(rebu, 'medewerkers')
const { data: kknMedewerkers } = await kkn.from('medewerkers').select('id, naam, profiel_id')
const medewerkerMap = new Map()
const profielMap = new Map()
for (const rm of rebuMedewerkers) {
  const naam = (rm.naam || '').trim().toLowerCase()
  let match = (kknMedewerkers || []).find(k => k.naam.trim().toLowerCase() === naam)
  if (!match && naam && !naam.includes(' ')) {
    const opVoornaam = (kknMedewerkers || []).filter(k => k.naam.trim().toLowerCase().split(/\s+/)[0] === naam)
    if (opVoornaam.length === 1) match = opVoornaam[0]
  }
  if (match) {
    medewerkerMap.set(rm.id, match.id)
    if (rm.profiel_id && match.profiel_id) profielMap.set(rm.profiel_id, match.profiel_id)
  }
}
const fallbackProfiel = (kknMedewerkers || []).find(m => m.profiel_id)?.profiel_id

const openTaken = await fetchAll(rebu, 'taken', q => q.neq('status', 'afgerond'))
const notities = await fetchAll(rebu, 'taak_notities')
const taakIds = new Set(openTaken.map(t => t.id))
const bijbehorendeNotities = notities.filter(n => taakIds.has(n.taak_id))

const kknOffertes = await bestaandeIds('offertes', openTaken.map(t => t.offerte_id))
const kknProjecten = await bestaandeIds('projecten', openTaken.map(t => t.project_id))
const kknRelaties = await bestaandeIds('relaties', openTaken.map(t => t.relatie_id))

console.log(`Open taken in Rebu: ${openTaken.length}  (+${bijbehorendeNotities.length} notities)`)
if (dryRun) { console.log('DRY_RUN — niets geschreven.'); process.exit(0) }

let fkLeeg = 0
for (let i = 0; i < openTaken.length; i += 500) {
  const chunk = openTaken.slice(i, i + 500).map(t => {
    const rij = { ...t, administratie_id: ADMIN_ID }
    if (rij.offerte_id && !kknOffertes.has(rij.offerte_id)) { rij.offerte_id = null; fkLeeg++ }
    if (rij.project_id && !kknProjecten.has(rij.project_id)) { rij.project_id = null; fkLeeg++ }
    if (rij.relatie_id && !kknRelaties.has(rij.relatie_id)) { rij.relatie_id = null; fkLeeg++ }
    rij.medewerker_id = (rij.medewerker_id && medewerkerMap.get(rij.medewerker_id)) || null
    rij.toegewezen_aan = (rij.toegewezen_aan && profielMap.get(rij.toegewezen_aan)) || null
    return rij
  })
  const { error } = await kkn.from('taken').upsert(chunk, { onConflict: 'id' })
  if (error) throw new Error(`taken batch ${i}: ${error.message}`)
}
console.log(`Taken teruggezet: ${openTaken.length} (${fkLeeg} verwijzingen naar niet-aanwezige offertes/kansen/relaties leeggemaakt)`)

for (let i = 0; i < bijbehorendeNotities.length; i += 500) {
  const chunk = bijbehorendeNotities.slice(i, i + 500).map(n => ({
    ...n,
    administratie_id: ADMIN_ID,
    gebruiker_id: profielMap.get(n.gebruiker_id) || fallbackProfiel,
  }))
  const { error } = await kkn.from('taak_notities').upsert(chunk, { onConflict: 'id' })
  if (error) throw new Error(`notities batch ${i}: ${error.message}`)
}
console.log(`Taaknotities teruggezet: ${bijbehorendeNotities.length}`)
console.log('Klaar — de takenlijst staat weer compleet in KKN.')
