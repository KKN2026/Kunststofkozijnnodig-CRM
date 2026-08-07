// Migreert LOPEND werk uit het Rebu-CRM naar dit KKN-CRM (zelfde UUID's,
// idempotent via upsert). Scope zoals afgestemd:
//   - offertes: concept/verzonden vanaf 1 juni 2026 (niet gearchiveerd)
//     + alle offertes met een nog lopende order (ongeacht datum/status)
//   - bijbehorende offerte_regels, projecten (verkoopkansen), ontbrekende
//     relaties + contactpersonen, lopende orders + order_regels,
//     open taken + taak_notities, documenten-rijen + storage-bestanden
//     (leverancier-PDF's en kozijntekeningen)
//   - GEEN facturen (open facturen worden in Rebu geïnd) en geen email_log.
//
// Draaien:
//   DRY_RUN=1 node scripts/migreer-rebu-lopend.mjs   (alleen tellen/rapport)
//   node scripts/migreer-rebu-lopend.mjs             (echt migreren)
//
// Rebu-credentials: env REBU_SUPABASE_URL / REBU_SUPABASE_SERVICE_ROLE_KEY,
// anders worden ze uit ~/projects/Rebucrm/.env.local gelezen.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { createSupabaseAdmin } from './db.mjs'

const dryRun = process.env.DRY_RUN === '1'
const OFFERTE_VANAF = '2026-06-01'

function rebuEnv() {
  if (process.env.REBU_SUPABASE_URL && process.env.REBU_SUPABASE_SERVICE_ROLE_KEY) {
    return { url: process.env.REBU_SUPABASE_URL, key: process.env.REBU_SUPABASE_SERVICE_ROLE_KEY }
  }
  const env = {}
  const content = readFileSync(join(homedir(), 'projects', 'Rebucrm', '.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
}

const { url: rebuUrl, key: rebuKey } = rebuEnv()
const rebu = createClient(rebuUrl, rebuKey, { auth: { persistSession: false } })
const kkn = await createSupabaseAdmin()

const { data: adminRow, error: adminErr } = await kkn.from('administraties').select('id').limit(1).single()
if (adminErr || !adminRow) throw new Error('KKN administratie niet gevonden: ' + adminErr?.message)
const ADMIN_ID = adminRow.id
console.log(`Doel-administratie: ${ADMIN_ID}${dryRun ? '  (DRY RUN — er wordt niets geschreven)' : ''}\n`)

// ---------- helpers ----------
const PAGE = 1000
async function fetchAll(client, table, applyFilters) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select('*').range(from, from + PAGE - 1).order('id')
    if (applyFilters) q = applyFilters(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < PAGE) return rows
  }
}

async function fetchByIds(client, table, column, ids, extraFilter) {
  const rows = []
  const uniq = [...new Set(ids.filter(Boolean))]
  for (let i = 0; i < uniq.length; i += 100) {
    let q = client.from(table).select('*').in(column, uniq.slice(i, i + 100))
    if (extraFilter) q = extraFilter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
  }
  return rows
}

async function upsertAll(table, rows, transform) {
  if (rows.length === 0) return
  if (dryRun) return
  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map(r => {
      const rij = { ...r }
      if ('administratie_id' in rij) rij.administratie_id = ADMIN_ID
      return transform ? transform(rij) : rij
    })
    const { error } = await kkn.from(table).upsert(chunk, { onConflict: 'id' })
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`)
  }
}

// ---------- medewerker-/profiel-mapping (Rebu-id → KKN-id) ----------
const rebuMedewerkers = await fetchAll(rebu, 'medewerkers')
const { data: kknMedewerkers } = await kkn.from('medewerkers').select('id, naam, email, profiel_id')
const medewerkerMap = new Map()   // rebu medewerker_id → kkn medewerker_id
const profielMap = new Map()      // rebu profiel_id → kkn profiel_id
const nietGematcht = []
for (const rm of rebuMedewerkers) {
  const naam = (rm.naam || '').trim().toLowerCase()
  // Volledige naam exact; alléén-voornaam mag op voornaam matchen (uniek).
  let match = (kknMedewerkers || []).find(k => k.naam.trim().toLowerCase() === naam)
  if (!match && naam && !naam.includes(' ')) {
    const opVoornaam = (kknMedewerkers || []).filter(k => k.naam.trim().toLowerCase().split(/\s+/)[0] === naam)
    if (opVoornaam.length === 1) match = opVoornaam[0]
  }
  if (match) {
    medewerkerMap.set(rm.id, match.id)
    if (rm.profiel_id && match.profiel_id) profielMap.set(rm.profiel_id, match.profiel_id)
  } else {
    nietGematcht.push(rm.naam)
  }
}
console.log(`Medewerkers gematcht: ${medewerkerMap.size}/${rebuMedewerkers.length}${nietGematcht.length ? ` — geen match voor: ${nietGematcht.join(', ')} (velden worden leeg)` : ''}`)
const mapMedewerker = (id) => (id && medewerkerMap.get(id)) || null
const mapProfiel = (id) => (id && profielMap.get(id)) || null

// ---------- 1. lopende orders + hun offertes ----------
const lopendeOrders = await fetchAll(rebu, 'orders', q => q.not('status', 'in', '(geannuleerd,gefactureerd)'))
const orderOfferteIds = lopendeOrders.map(o => o.offerte_id).filter(Boolean)

// ---------- 2. offertes: recent concept/verzonden + offertes van lopende orders ----------
const recenteOffertes = await fetchAll(rebu, 'offertes', q => q
  .in('status', ['concept', 'verzonden'])
  .gte('created_at', OFFERTE_VANAF)
  .or('gearchiveerd.is.null,gearchiveerd.eq.false'))
const orderOffertes = await fetchByIds(rebu, 'offertes', 'id', orderOfferteIds)
const offertesById = new Map()
for (const o of [...recenteOffertes, ...orderOffertes]) offertesById.set(o.id, o)
const offertes = [...offertesById.values()]
const offerteIds = offertes.map(o => o.id)

// ---------- 3. regels, taken, notities ----------
const offerteRegels = await fetchByIds(rebu, 'offerte_regels', 'offerte_id', offerteIds)
const orderRegels = await fetchByIds(rebu, 'order_regels', 'order_id', lopendeOrders.map(o => o.id))
const openTaken = await fetchAll(rebu, 'taken', q => q.neq('status', 'afgerond'))
const taakNotities = await fetchByIds(rebu, 'taak_notities', 'taak_id', openTaken.map(t => t.id))

// ---------- 4. projecten (verkoopkansen) waar alles naar verwijst ----------
const projectIds = [
  ...offertes.map(o => o.project_id),
  ...openTaken.map(t => t.project_id),
].filter(Boolean)
const projecten = await fetchByIds(rebu, 'projecten', 'id', projectIds)

// ---------- 5. ontbrekende relaties + contactpersonen ----------
const relatieIds = [...new Set([
  ...offertes.map(o => o.relatie_id),
  ...lopendeOrders.map(o => o.relatie_id),
  ...openTaken.map(t => t.relatie_id),
  ...projecten.map(p => p.relatie_id),
].filter(Boolean))]
const bestaandeRelaties = new Set((await fetchByIds(kkn, 'relaties', 'id', relatieIds)).map(r => r.id))
const ontbrekendeRelatieIds = relatieIds.filter(id => !bestaandeRelaties.has(id))
const nieuweRelaties = await fetchByIds(rebu, 'relaties', 'id', ontbrekendeRelatieIds)
const nieuweContactpersonen = await fetchByIds(rebu, 'contactpersonen', 'relatie_id', ontbrekendeRelatieIds)

// ---------- 6. documenten-rijen ----------
const offerteDocTypes = ['offerte', 'offerte_leverancier', 'offerte_leverancier_data', 'offerte_leverancier_parsed']
const offerteDocs = await fetchByIds(rebu, 'documenten', 'entiteit_id', offerteIds,
  q => q.in('entiteit_type', offerteDocTypes))
const projectDocs = await fetchByIds(rebu, 'documenten', 'entiteit_id', projecten.map(p => p.id),
  q => q.eq('entiteit_type', 'project'))
const documenten = [...offerteDocs, ...projectDocs]

// ---------- rapport vooraf ----------
console.log(`
Te migreren:
  offertes:         ${offertes.length}  (${recenteOffertes.length} recent concept/verzonden + ${orderOffertes.length} via lopende orders, ontdubbeld)
  offerte_regels:   ${offerteRegels.length}
  projecten:        ${projecten.length}
  relaties (nieuw): ${nieuweRelaties.length}  (+${nieuweContactpersonen.length} contactpersonen; ${bestaandeRelaties.size} bestonden al)
  orders (lopend):  ${lopendeOrders.length}  + ${orderRegels.length} regels
  taken (open):     ${openTaken.length}  + ${taakNotities.length} notities
  documenten:       ${documenten.length}  (waarvan ${offerteDocs.filter(d => d.entiteit_type === 'offerte_leverancier').length} met leveranciers-PDF in storage)
`)

// Waarschuwing: lopende orders waar in Rebu al facturen aan hangen
const rebuFacturen = await fetchByIds(rebu, 'facturen', 'order_id', lopendeOrders.map(o => o.id))
const rebuFacturenOfferte = await fetchByIds(rebu, 'facturen', 'offerte_id', offerteIds)
const factuurWaarschuwingen = new Map()
for (const f of [...rebuFacturen, ...rebuFacturenOfferte]) {
  const key = f.order_id || f.offerte_id
  if (!factuurWaarschuwingen.has(key)) factuurWaarschuwingen.set(key, [])
  factuurWaarschuwingen.get(key).push(`${f.factuurnummer} (${f.status})`)
}
if (factuurWaarschuwingen.size > 0) {
  console.log(`LET OP — ${factuurWaarschuwingen.size} gemigreerde orders/offertes hebben al facturen in Rebu (aanbetalingen!).`)
  console.log('Die financieel in Rebu afronden, of bewust handmatig in KKN verder:')
  for (const [id, nrs] of factuurWaarschuwingen) {
    const order = lopendeOrders.find(o => o.id === id)
    const offerte = offertesById.get(id) || offertesById.get(order?.offerte_id)
    console.log(`  - ${order ? `order ${order.ordernummer}` : ''}${offerte ? ` offerte ${offerte.offertenummer}` : ''}: ${nrs.join(', ')}`)
  }
  console.log('')
}

if (dryRun) {
  console.log('DRY_RUN — niets geschreven.')
  process.exit(0)
}

// ---------- schrijven (FK-volgorde) ----------
console.log('Schrijven...')
await upsertAll('relaties', nieuweRelaties, r => {
  delete r.snelstart_relatie_id
  delete r.snelstart_synced_at
  return r
})
console.log(`  relaties: ${nieuweRelaties.length}`)
await upsertAll('contactpersonen', nieuweContactpersonen)
console.log(`  contactpersonen: ${nieuweContactpersonen.length}`)
await upsertAll('projecten', projecten, p => {
  if ('medewerker_id' in p) p.medewerker_id = mapMedewerker(p.medewerker_id)
  return p
})
console.log(`  projecten: ${projecten.length}`)
await upsertAll('offertes', offertes)
console.log(`  offertes: ${offertes.length}`)
await upsertAll('offerte_regels', offerteRegels, r => {
  r.product_id = null // KKN heeft andere product-id's; omschrijving/prijs staan op de regel
  return r
})
console.log(`  offerte_regels: ${offerteRegels.length}`)
await upsertAll('orders', lopendeOrders)
console.log(`  orders: ${lopendeOrders.length}`)
await upsertAll('order_regels', orderRegels, r => {
  r.product_id = null
  return r
})
console.log(`  order_regels: ${orderRegels.length}`)

// Taken: FK's naar offertes die niet meekomen (ouder dan de cutoff en ook al
// in KKN afwezig) leegmaken, anders klapt de insert.
const kknOfferteIds = new Set([
  ...offerteIds,
  ...(await fetchByIds(kkn, 'offertes', 'id', openTaken.map(t => t.offerte_id))).map(o => o.id),
])
const kknProjectIds = new Set([
  ...projecten.map(p => p.id),
  ...(await fetchByIds(kkn, 'projecten', 'id', openTaken.map(t => t.project_id))).map(p => p.id),
])
const kknRelatieIds = new Set([
  ...relatieIds,
  ...(await fetchByIds(kkn, 'relaties', 'id', openTaken.map(t => t.relatie_id))).map(r => r.id),
])
let fkLeeggemaakt = 0
await upsertAll('taken', openTaken, t => {
  if (t.offerte_id && !kknOfferteIds.has(t.offerte_id)) { t.offerte_id = null; fkLeeggemaakt++ }
  if (t.project_id && !kknProjectIds.has(t.project_id)) { t.project_id = null; fkLeeggemaakt++ }
  if (t.relatie_id && !kknRelatieIds.has(t.relatie_id)) { t.relatie_id = null; fkLeeggemaakt++ }
  t.medewerker_id = mapMedewerker(t.medewerker_id)
  t.toegewezen_aan = mapProfiel(t.toegewezen_aan)
  return t
})
console.log(`  taken: ${openTaken.length} (${fkLeeggemaakt} verwijzingen naar niet-gemigreerde items leeggemaakt)`)
// gebruiker_id is NOT NULL — onbekende Rebu-profielen vallen terug op het
// eerste KKN-profiel zodat de notitie (met tekst en datum) behouden blijft.
const fallbackProfiel = (kknMedewerkers || []).find(m => m.profiel_id)?.profiel_id || null
await upsertAll('taak_notities', taakNotities, n => {
  n.gebruiker_id = mapProfiel(n.gebruiker_id) || fallbackProfiel
  return n
})
console.log(`  taak_notities: ${taakNotities.length}`)
await upsertAll('documenten', documenten, d => {
  d.geupload_door = mapProfiel(d.geupload_door)
  return d
})
console.log(`  documenten: ${documenten.length}`)

// ---------- storage: leveranciers-PDF's + kozijntekeningen kopiëren ----------
// Alle bestanden onder leverancier-pdfs/<offerteId>/ (PDF + tekening-images).
console.log('Storage kopiëren (leverancier-pdfs)...')
let bestandenOk = 0
let bestandenFout = 0
const leverancierOffertes = [...new Set(offerteDocs.filter(d => d.entiteit_type === 'offerte_leverancier').map(d => d.entiteit_id))]
for (const offerteId of leverancierOffertes) {
  const map = `leverancier-pdfs/${offerteId}`
  const { data: files, error: listErr } = await rebu.storage.from('documenten').list(map, { limit: 200 })
  if (listErr || !files) { console.warn(`  OVERGESLAGEN ${map}: ${listErr?.message}`); continue }
  for (const f of files) {
    const pad = `${map}/${f.name}`
    const { data: blob, error: dlErr } = await rebu.storage.from('documenten').download(pad)
    if (dlErr || !blob) { console.warn(`  fout bij downloaden ${pad}: ${dlErr?.message}`); bestandenFout++; continue }
    const { error: upErr } = await kkn.storage.from('documenten')
      .upload(pad, Buffer.from(await blob.arrayBuffer()), { upsert: true, contentType: blob.type || undefined })
    if (upErr) { console.warn(`  fout bij uploaden ${pad}: ${upErr.message}`); bestandenFout++; continue }
    bestandenOk++
  }
}
console.log(`  storage: ${bestandenOk} bestanden gekopieerd${bestandenFout ? `, ${bestandenFout} FOUTEN` : ''} (${leverancierOffertes.length} offertes met leverancier-PDF)`)

console.log('\nMigratie klaar.')
