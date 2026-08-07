// Migreert de relatie-/verkoopkansnotities (tabel `notities`) uit Rebu naar
// KKN — vergeten in de eerste migratieronde. Alleen notities waarvan de
// relatie in KKN bestaat (relatie_id is NOT NULL met FK); een verwijzing
// naar een niet-gemigreerde verkoopkans wordt leeggemaakt.
//
//   DRY_RUN=1 node scripts/migreer-rebu-notities.mjs
//   node scripts/migreer-rebu-notities.mjs
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

async function all(client, table, select) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(select).range(from, from + 999).order('id')
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

// Profiel-mapping op naam (zelfde aanpak als zet-verkopers-uit-rebu.mjs)
const { data: rebuProfielen } = await rebu.from('profielen').select('id, naam')
const { data: kknProfielen } = await kkn.from('profielen').select('id, naam')
const { data: kknMedewerkers } = await kkn.from('medewerkers').select('naam, profiel_id')
const profielMap = new Map()
for (const rp of rebuProfielen || []) {
  const naam = (rp.naam || '').trim().toLowerCase()
  let doel = (kknProfielen || []).find(p => p.naam.trim().toLowerCase() === naam)
  if (!doel && naam && !naam.includes(' ')) {
    const opVoornaam = (kknProfielen || []).filter(p => p.naam.trim().toLowerCase().split(/\s+/)[0] === naam)
    if (opVoornaam.length === 1) doel = opVoornaam[0]
  }
  if (!doel) {
    const med = (kknMedewerkers || []).find(m => m.naam.trim().toLowerCase() === naam && m.profiel_id)
    if (med) doel = { id: med.profiel_id }
  }
  if (doel) profielMap.set(rp.id, doel.id)
}
const fallbackProfiel = (kknMedewerkers || []).find(m => m.profiel_id)?.profiel_id

const notities = await all(rebu, 'notities', '*')
const kknRelaties = new Set((await all(kkn, 'relaties', 'id')).map(r => r.id))
const kknProjecten = new Set((await all(kkn, 'projecten', 'id')).map(p => p.id))

const mee = []
let zonderRelatie = 0
let projectLos = 0
for (const n of notities) {
  if (!n.relatie_id || !kknRelaties.has(n.relatie_id)) { zonderRelatie++; continue }
  const rij = { ...n, administratie_id: ADMIN_ID }
  delete rij.bron // Rebu-kolom die in het KKN-schema niet bestaat
  rij.gebruiker_id = profielMap.get(n.gebruiker_id) || fallbackProfiel
  if (rij.project_id && !kknProjecten.has(rij.project_id)) { rij.project_id = null; projectLos++ }
  mee.push(rij)
}
console.log(`Rebu-notities: ${notities.length} — mee naar KKN: ${mee.length} (${zonderRelatie} overgeslagen: relatie niet in KKN; ${projectLos} verkoopkans-verwijzingen leeggemaakt)`)

if (dryRun) { console.log('DRY_RUN — niets geschreven.'); process.exit(0) }

for (let i = 0; i < mee.length; i += 500) {
  const { error } = await kkn.from('notities').upsert(mee.slice(i, i + 500), { onConflict: 'id' })
  if (error) throw new Error(`batch ${i}: ${error.message}`)
  console.log(`  ${Math.min(i + 500, mee.length)}/${mee.length}`)
}
console.log('Klaar.')
