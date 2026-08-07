// Draait de Rebu-migratie van 7 aug 2026 terug: alles wat uit Rebu is
// overgenomen gaat weer uit KKN; alles wat in KKN zelf is aangemaakt blijft.
//
// Afbakening is ID-gebaseerd: een rij wordt alleen verwijderd als hetzelfde
// ID óók in de Rebu-database bestaat. KKN-eigen offertes/taken/verkoopkansen
// (met eigen gegenereerde UUID's) kunnen dus nooit geraakt worden.
//
// Blijft bewust staan:
//   - het klantenbestand van de oorspronkelijke juli-import (1693 zakelijke
//     relaties) + de vandaag bijgesyncte herkomst-labels
//   - de acceptatie-bewaking (cron) — taken daarvan melden voortaan dat de
//     offerte handmatig moet worden overgezet
//
//   DRY_RUN=1 node scripts/verwijder-rebu-migratie.mjs
//   node scripts/verwijder-rebu-migratie.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSupabaseAdmin } from './db.mjs'

const dryRun = process.env.DRY_RUN === '1'
const __dirname = dirname(fileURLToPath(import.meta.url))

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

async function alleIds(client, table) {
  const ids = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select('id').range(from, from + 999).order('id')
    if (error) throw new Error(`${table}: ${error.message}`)
    ids.push(...(data || []).map(r => r.id))
    if (!data || data.length < 1000) return ids
  }
}

// Doorsnede: rijen die in béide systemen bestaan = de gemigreerde rijen
async function gemigreerd(table) {
  const rebuIds = new Set(await alleIds(rebu, table))
  const kknIds = await alleIds(kkn, table)
  return kknIds.filter(id => rebuIds.has(id))
}

const offertes = await gemigreerd('offertes')
const taken = await gemigreerd('taken')
const projecten = await gemigreerd('projecten')
const notities = await gemigreerd('notities')

// Relaties: doorsnede MINUS het oorspronkelijke juli-klantenbestand
const juliExport = join(__dirname, 'data', 'zakelijke-klanten-export.json')
const juliIds = new Set(
  existsSync(juliExport)
    ? JSON.parse(readFileSync(juliExport, 'utf8')).relaties.map(r => r.id)
    : []
)
if (juliIds.size === 0) throw new Error('juli-export niet gevonden — kan het eigen klantenbestand niet beschermen')
const relatiesDoorsnede = await gemigreerd('relaties')
const relaties = relatiesDoorsnede.filter(id => !juliIds.has(id))

console.log(`Te verwijderen uit KKN (alles bestaat ook in Rebu):
  offertes:      ${offertes.length}
  taken:         ${taken.length}
  verkoopkansen: ${projecten.length}
  notities:      ${notities.length}
  relaties:      ${relaties.length}  (juli-klantenbestand van ${juliIds.size} blijft staan)
`)

if (dryRun) { console.log('DRY_RUN — niets verwijderd.'); process.exit(0) }

const perChunk = async (arr, fn) => {
  for (let i = 0; i < arr.length; i += 100) await fn(arr.slice(i, i + 100))
}

// 1. Overige KKN-taken loskoppelen van te verwijderen offertes/projecten
//    (bv. de bewakingstaken van de cron) — FK's blokkeren anders.
await perChunk(offertes, async deel => {
  await kkn.from('taken').update({ offerte_id: null }).in('offerte_id', deel)
})
await perChunk(projecten, async deel => {
  await kkn.from('taken').update({ project_id: null }).in('project_id', deel)
})

// 2. Misleidende bewakingstaken ("staat in KKN en kan gefactureerd worden")
//    voor offertes die nu verdwijnen: verwijderen.
const { data: bewakingstaken } = await kkn.from('taken').select('id, titel').like('titel', 'Rebu-offerte %')
for (const t of bewakingstaken || []) {
  await kkn.from('taken').delete().eq('id', t.id)
}
console.log(`Bewakingstaken verwijderd: ${(bewakingstaken || []).length}`)

// 3. Gemigreerde taken (taak_notities casceren mee)
let n = 0
await perChunk(taken, async deel => {
  const { data, error } = await kkn.from('taken').delete().in('id', deel).select('id')
  if (error) throw new Error('taken: ' + error.message)
  n += data?.length || 0
})
console.log(`Taken verwijderd: ${n}`)

// 4. Documenten-rijen + storage van gemigreerde offertes
const docTypes = ['offerte', 'offerte_leverancier', 'offerte_leverancier_data', 'offerte_leverancier_parsed']
n = 0
await perChunk(offertes, async deel => {
  const { data, error } = await kkn.from('documenten').delete().in('entiteit_id', deel).in('entiteit_type', docTypes).select('id')
  if (error) throw new Error('documenten: ' + error.message)
  n += data?.length || 0
})
let bestanden = 0
for (const id of offertes) {
  const { data: files } = await kkn.storage.from('documenten').list(`leverancier-pdfs/${id}`, { limit: 200 })
  if (files?.length) {
    await kkn.storage.from('documenten').remove(files.map(f => `leverancier-pdfs/${id}/${f.name}`))
    bestanden += files.length
  }
}
console.log(`Documenten verwijderd: ${n} rijen, ${bestanden} storage-bestanden`)

// 5. Offertes (regels casceren mee); eventuele resterende orders eerst
await perChunk(offertes, async deel => {
  await kkn.from('orders').delete().in('offerte_id', deel)
})
n = 0
await perChunk(offertes, async deel => {
  const { data, error } = await kkn.from('offertes').delete().in('id', deel).select('id')
  if (error) throw new Error('offertes: ' + error.message)
  n += data?.length || 0
})
console.log(`Offertes verwijderd: ${n}`)

// 6. Relatie-notities
n = 0
await perChunk(notities, async deel => {
  const { data, error } = await kkn.from('notities').delete().in('id', deel).select('id')
  if (error) throw new Error('notities: ' + error.message)
  n += data?.length || 0
})
console.log(`Notities verwijderd: ${n}`)

// 7. Verkoopkansen — documenten eerst, dan het project zelf. Een project dat
//    nog ergens aan vastzit (KKN-eigen offerte/taak) wordt overgeslagen.
n = 0
let projectOver = 0
for (const id of projecten) {
  await kkn.from('documenten').delete().eq('entiteit_id', id).eq('entiteit_type', 'project')
  const { error } = await kkn.from('projecten').delete().eq('id', id)
  if (error) projectOver++
  else n++
}
console.log(`Verkoopkansen verwijderd: ${n}${projectOver ? ` (${projectOver} overgeslagen: nog in gebruik door eigen KKN-data)` : ''}`)

// 8. Vandaag toegevoegde relaties — alleen als er niets meer naar verwijst.
n = 0
let relatieOver = 0
for (const id of relaties) {
  const checks = await Promise.all([
    kkn.from('offertes').select('id').eq('relatie_id', id).limit(1),
    kkn.from('projecten').select('id').eq('relatie_id', id).limit(1),
    kkn.from('taken').select('id').eq('relatie_id', id).limit(1),
    kkn.from('notities').select('id').eq('relatie_id', id).limit(1),
    kkn.from('orders').select('id').eq('relatie_id', id).limit(1),
    kkn.from('facturen').select('id').eq('relatie_id', id).limit(1),
  ])
  if (checks.some(c => (c.data || []).length > 0)) { relatieOver++; continue }
  await kkn.from('contactpersonen').delete().eq('relatie_id', id)
  const { error } = await kkn.from('relaties').delete().eq('id', id)
  if (error) relatieOver++
  else n++
}
console.log(`Relaties verwijderd: ${n}${relatieOver ? ` (${relatieOver} blijven staan: nog in gebruik)` : ''}`)

console.log('\nKlaar — KKN bevat alleen nog eigen werk; Rebu-historie leeft in Rebu.')
