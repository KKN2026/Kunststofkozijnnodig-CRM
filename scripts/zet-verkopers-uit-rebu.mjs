// Vult offertes.verkoper_id in KKN voor gemigreerde Rebu-offertes.
// Bron (in volgorde): wie de offerte in Rebu verstuurde (email_log,
// laatste verzending wint), anders de medewerker op de verkoopkans.
// Alleen offertes waarvan verkoper_id nog leeg is worden aangeraakt.
//
//   DRY_RUN=1 node scripts/zet-verkopers-uit-rebu.mjs
//   node scripts/zet-verkopers-uit-rebu.mjs
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

// ---- Rebu-profiel → KKN-profiel mapping op naam ----
const { data: rebuProfielen } = await rebu.from('profielen').select('id, naam')
const { data: kknProfielen } = await kkn.from('profielen').select('id, naam')
const { data: kknMedewerkers } = await kkn.from('medewerkers').select('naam, profiel_id')

const profielMap = new Map()
const onbekend = []
for (const rp of rebuProfielen || []) {
  const naam = (rp.naam || '').trim().toLowerCase()
  // 1. exacte naam-match op profielen
  let doel = (kknProfielen || []).find(p => p.naam.trim().toLowerCase() === naam)
  // 2. alléén-voornaam mag op voornaam matchen (mits uniek)
  if (!doel && naam && !naam.includes(' ')) {
    const opVoornaam = (kknProfielen || []).filter(p => p.naam.trim().toLowerCase().split(/\s+/)[0] === naam)
    if (opVoornaam.length === 1) doel = opVoornaam[0]
  }
  // 3. via de medewerkers-tabel (bv. "Nick Burgers" → info@-profiel)
  if (!doel) {
    const med = (kknMedewerkers || []).find(m => m.naam.trim().toLowerCase() === naam && m.profiel_id)
    if (med) doel = { id: med.profiel_id, naam: med.naam }
  }
  if (doel) profielMap.set(rp.id, { id: doel.id, naam: doel.naam })
  else onbekend.push(rp.naam)
}
console.log('Profiel-mapping:')
for (const rp of rebuProfielen || []) {
  const d = profielMap.get(rp.id)
  console.log(`  ${rp.naam.padEnd(14)} → ${d ? d.naam : 'GEEN MATCH'}`)
}
if (onbekend.length) console.log(`  (geen match: ${onbekend.join(', ')} — die offertes blijven leeg)`)

// ---- Rebu-medewerker → profiel (voor de verkoopkans-fallback) ----
const { data: rebuMedewerkers } = await rebu.from('medewerkers').select('id, profiel_id')
const medewerkerNaarProfiel = new Map((rebuMedewerkers || []).map(m => [m.id, m.profiel_id]))

// ---- KKN-offertes zonder verkoper die uit Rebu komen ----
const zonderVerkoper = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await kkn.from('offertes')
    .select('id, offertenummer, project_id')
    .is('verkoper_id', null)
    .range(from, from + 999)
  if (error) throw new Error(error.message)
  zonderVerkoper.push(...(data || []))
  if (!data || data.length < 1000) break
}

let viaMail = 0
let viaVerkoopkans = 0
let geen = 0
const perVerkoper = new Map()

for (const off of zonderVerkoper) {
  // Alleen offertes die in Rebu bestaan (gemigreerd) — KKN-eigen niet aanraken
  const { data: rebuOff } = await rebu.from('offertes').select('id, project_id').eq('id', off.id).maybeSingle()
  if (!rebuOff) continue

  // 1. laatste verzender uit het Rebu-e-maillog
  let profielId = null
  const { data: mails } = await rebu.from('email_log')
    .select('verstuurd_door, verstuurd_op')
    .eq('offerte_id', off.id)
    .not('verstuurd_door', 'is', null)
    .order('verstuurd_op', { ascending: false })
    .limit(1)
  if (mails?.[0]?.verstuurd_door) {
    profielId = profielMap.get(mails[0].verstuurd_door)?.id || null
    if (profielId) viaMail++
  }

  // 2. fallback: medewerker op de Rebu-verkoopkans
  if (!profielId && rebuOff.project_id) {
    const { data: proj } = await rebu.from('projecten').select('medewerker_id').eq('id', rebuOff.project_id).maybeSingle()
    const viaMedewerker = proj?.medewerker_id ? medewerkerNaarProfiel.get(proj.medewerker_id) : null
    profielId = viaMedewerker ? profielMap.get(viaMedewerker)?.id || null : null
    if (profielId) viaVerkoopkans++
  }

  if (!profielId) { geen++; continue }
  const naam = [...profielMap.values()].find(v => v.id === profielId)?.naam || profielId
  perVerkoper.set(naam, (perVerkoper.get(naam) || 0) + 1)
  if (!dryRun) {
    const { error } = await kkn.from('offertes').update({ verkoper_id: profielId }).eq('id', off.id)
    if (error) throw new Error(`${off.offertenummer}: ${error.message}`)
  }
}

console.log(`\nToegewezen: ${viaMail} via e-maillog + ${viaVerkoopkans} via verkoopkans; ${geen} zonder bron (blijven leeg)`)
for (const [naam, n] of [...perVerkoper.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${naam}: ${n} offertes`)
}
if (dryRun) console.log('\nDRY_RUN — niets geschreven.')
