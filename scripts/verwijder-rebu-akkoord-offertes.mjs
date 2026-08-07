// Verwijdert uit KKN de gemigreerde offertes die in Rebu op 'geaccepteerd'
// staan (incl. hun orders, regels, documenten en storage-bestanden).
// Die klussen worden — vanwege aanbetalingen op Rebu's rekening — volledig
// in Rebu afgewikkeld en horen niet dubbel in KKN te staan.
//
// Afbakening is exact: alleen KKN-offertes waarvan het id in Rebu bestaat
// mét status 'geaccepteerd'. KKN-eigen offertes worden dus nooit geraakt.
//
//   DRY_RUN=1 node scripts/verwijder-rebu-akkoord-offertes.mjs
//   node scripts/verwijder-rebu-akkoord-offertes.mjs
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

// Alle Rebu-offertes met status geaccepteerd (gepagineerd)
const geaccepteerdIds = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await rebu.from('offertes').select('id').eq('status', 'geaccepteerd').range(from, from + 999)
  if (error) throw new Error(error.message)
  geaccepteerdIds.push(...(data || []).map(r => r.id))
  if (!data || data.length < 1000) break
}
console.log(`Rebu: ${geaccepteerdIds.length} geaccepteerde offertes`)

// Welke daarvan staan in KKN?
const inKkn = []
for (let i = 0; i < geaccepteerdIds.length; i += 100) {
  const { data, error } = await kkn.from('offertes').select('id, offertenummer, status').in('id', geaccepteerdIds.slice(i, i + 100))
  if (error) throw new Error(error.message)
  inKkn.push(...(data || []))
}
console.log(`KKN: ${inKkn.length} daarvan aanwezig — worden verwijderd:`)
console.log('  ' + inKkn.map(o => o.offertenummer).join(', '))
const ids = inKkn.map(o => o.id)

if (ids.length === 0) { console.log('Niets te doen.'); process.exit(0) }
if (dryRun) { console.log('\nDRY_RUN — niets verwijderd.'); process.exit(0) }

const chunk = (arr, fn) => Promise.all(
  Array.from({ length: Math.ceil(arr.length / 100) }, (_, i) => fn(arr.slice(i * 100, i * 100 + 100)))
)

// 1. Taken loskoppelen (FK zonder cascade)
let takenLos = 0
await chunk(ids, async deel => {
  const { data } = await kkn.from('taken').update({ offerte_id: null }).in('offerte_id', deel).select('id')
  takenLos += data?.length || 0
})
console.log(`Taken losgekoppeld: ${takenLos}`)

// 2. Bewakingstaken voor deze offertes verwijderen (misleidend: "factureren
//    via KKN" geldt niet voor klussen die in Rebu blijven)
const nummers = inKkn.map(o => o.offertenummer)
let bewakingstakenWeg = 0
for (const nr of nummers) {
  const { data } = await kkn.from('taken').delete().eq('titel', `Rebu-offerte ${nr} geaccepteerd — factureren via KKN?`).select('id')
  bewakingstakenWeg += data?.length || 0
}
console.log(`Bewakingstaken verwijderd: ${bewakingstakenWeg}`)

// 3. Orders + regels (regels casceren mee)
let ordersWeg = 0
await chunk(ids, async deel => {
  const { data, error } = await kkn.from('orders').delete().in('offerte_id', deel).select('id')
  if (error) throw new Error('orders: ' + error.message)
  ordersWeg += data?.length || 0
})
console.log(`Orders verwijderd: ${ordersWeg}`)

// 4. Documenten-rijen + storage-bestanden
const docTypes = ['offerte', 'offerte_leverancier', 'offerte_leverancier_data', 'offerte_leverancier_parsed']
let docsWeg = 0
await chunk(ids, async deel => {
  const { data, error } = await kkn.from('documenten').delete().in('entiteit_id', deel).in('entiteit_type', docTypes).select('id')
  if (error) throw new Error('documenten: ' + error.message)
  docsWeg += data?.length || 0
})
let bestandenWeg = 0
for (const id of ids) {
  const { data: files } = await kkn.storage.from('documenten').list(`leverancier-pdfs/${id}`, { limit: 200 })
  if (files?.length) {
    await kkn.storage.from('documenten').remove(files.map(f => `leverancier-pdfs/${id}/${f.name}`))
    bestandenWeg += files.length
  }
}
console.log(`Documenten verwijderd: ${docsWeg} rijen, ${bestandenWeg} storage-bestanden`)

// 5. Offertes (offerte_regels casceren mee)
let offertesWeg = 0
await chunk(ids, async deel => {
  const { data, error } = await kkn.from('offertes').delete().in('id', deel).select('id')
  if (error) throw new Error('offertes: ' + error.message)
  offertesWeg += data?.length || 0
})
console.log(`Offertes verwijderd: ${offertesWeg}`)
console.log('\nKlaar. Akkoord-klussen leven alleen nog in Rebu.')
