// Importeert de geëxporteerde zakelijke relaties + contactpersonen in de
// NIEUWE (lege) Kunststofkozijnnodig-database. Draai dit NA het opzetten van
// het nieuwe Supabase-project en het aanmaken van de administratie-rij.
//
// Vereist (env of inline export):
//   TARGET_SUPABASE_URL              = URL van het NIEUWE Supabase-project
//   TARGET_SUPABASE_SERVICE_ROLE_KEY = service-role key van dat project
//   TARGET_ADMINISTRATIE_ID          = id van de nieuwe administratie-rij
//
// Draaien:
//   node scripts/import-zakelijke-klanten.mjs            (echt importeren)
//   DRY_RUN=1 node scripts/import-zakelijke-klanten.mjs  (alleen tellen)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const url = process.env.TARGET_SUPABASE_URL
const key = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY
const adminId = process.env.TARGET_ADMINISTRATIE_ID
const dryRun = process.env.DRY_RUN === '1'

if (!dryRun && (!url || !key || !adminId)) {
  console.error('Ontbrekend: TARGET_SUPABASE_URL / TARGET_SUPABASE_SERVICE_ROLE_KEY / TARGET_ADMINISTRATIE_ID.')
  process.exit(1)
}

const file = join(dirname(fileURLToPath(import.meta.url)), 'data', 'zakelijke-klanten-export.json')
const payload = JSON.parse(readFileSync(file, 'utf8'))
console.log(`Bestand: ${payload.aantallen.relaties} relaties, ${payload.aantallen.contactpersonen} contactpersonen (export ${payload.exportedAt})`)

if (dryRun) {
  console.log('DRY_RUN — niets geïmporteerd.')
  process.exit(0)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

async function upsertAll(table, rows) {
  const BATCH = 500
  let done = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map(r => ({ ...r, administratie_id: adminId }))
    const { error } = await sb.from(table).upsert(chunk, { onConflict: 'id' })
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`)
    done += chunk.length
    console.log(`  ${table}: ${done}/${rows.length}`)
  }
}

await upsertAll('relaties', payload.relaties)
await upsertAll('contactpersonen', payload.contactpersonen)
console.log('Import klaar.')
