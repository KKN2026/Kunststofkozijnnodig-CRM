// Zet de herkomst-labels (eigen_klant / linkedin / psa) van Rebu-relaties
// over naar KKN. De relatie-export dateert van 21 juli; labels die daarna in
// Rebu zijn toegekend ontbreken in KKN. Alleen relaties waar KKN nog géén
// herkomst heeft worden gevuld — handmatig gezette labels blijven staan.
//
//   DRY_RUN=1 node scripts/sync-herkomst-uit-rebu.mjs
//   node scripts/sync-herkomst-uit-rebu.mjs
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

async function all(client, table, applyFilters) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    let q = client.from(table).select('id, herkomst').range(from, from + 999).order('id')
    if (applyFilters) q = applyFilters(q)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

const rebuMetLabel = await all(rebu, 'relaties', q => q.not('herkomst', 'is', null))
const kknRelaties = await all(kkn, 'relaties')
const kknById = new Map(kknRelaties.map(r => [r.id, r.herkomst]))

const perLabel = {}
const bijwerken = []
let nietInKkn = 0
let alGezet = 0
for (const r of rebuMetLabel) {
  if (!kknById.has(r.id)) { nietInKkn++; continue }
  const huidige = kknById.get(r.id)
  if (huidige) { alGezet++; continue }
  bijwerken.push(r)
  perLabel[r.herkomst] = (perLabel[r.herkomst] || 0) + 1
}
console.log(`Rebu-relaties met herkomst: ${rebuMetLabel.length}`)
console.log(`Bij te werken in KKN: ${bijwerken.length}  (${alGezet} hadden al een label in KKN, ${nietInKkn} bestaan niet in KKN)`)
console.log('Per label:', JSON.stringify(perLabel))

if (dryRun) { console.log('DRY_RUN — niets geschreven.'); process.exit(0) }

for (const r of bijwerken) {
  const { error } = await kkn.from('relaties').update({ herkomst: r.herkomst }).eq('id', r.id)
  if (error) throw new Error(`${r.id}: ${error.message}`)
}
console.log('Klaar.')
