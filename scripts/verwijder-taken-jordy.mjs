// Verwijdert alle KKN-taken op naam van Jordy — mét reservekopie vooraf.
// De kopie (taken + bijbehorende taaknotities) komt in scripts/data/
// (buiten git) en kan met herstel-taken-backup.mjs teruggezet worden.
//
//   DRY_RUN=1 node scripts/verwijder-taken-jordy.mjs
//   node scripts/verwijder-taken-jordy.mjs
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSupabaseAdmin } from './db.mjs'

const dryRun = process.env.DRY_RUN === '1'
const __dirname = dirname(fileURLToPath(import.meta.url))
const kkn = await createSupabaseAdmin()

// Jordy van der Kelen
const { data: med } = await kkn.from('medewerkers').select('id, profiel_id, naam').ilike('naam', 'Jordy%').single()
if (!med) throw new Error('Medewerker Jordy niet gevonden')
console.log(`Medewerker: ${med.naam}`)

const taken = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await kkn.from('taken')
    .select('*')
    .or(`medewerker_id.eq.${med.id},toegewezen_aan.eq.${med.profiel_id}`)
    .range(from, from + 999)
    .order('id')
  if (error) throw new Error(error.message)
  taken.push(...(data || []))
  if (!data || data.length < 1000) break
}

const taakIds = taken.map(t => t.id)
const notities = []
for (let i = 0; i < taakIds.length; i += 100) {
  const { data } = await kkn.from('taak_notities').select('*').in('taak_id', taakIds.slice(i, i + 100))
  notities.push(...(data || []))
}

// Reservekopie ALTIJD eerst — ook bij dry run, zodat je hem kunt inzien.
const backupPad = resolve(__dirname, 'data', `backup-taken-jordy-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`)
writeFileSync(backupPad, JSON.stringify({ geexporteerd: new Date().toISOString(), taken, taak_notities: notities }, null, 2))
console.log(`Reservekopie: ${taken.length} taken + ${notities.length} notities → ${backupPad}`)

if (dryRun) { console.log('DRY_RUN — niets verwijderd.'); process.exit(0) }

let weg = 0
for (let i = 0; i < taakIds.length; i += 100) {
  const { data, error } = await kkn.from('taken').delete().in('id', taakIds.slice(i, i + 100)).select('id')
  if (error) throw new Error(error.message)
  weg += data?.length || 0
}
console.log(`Verwijderd: ${weg} taken (notities casceren mee). Terugzetten kan met de reservekopie.`)
