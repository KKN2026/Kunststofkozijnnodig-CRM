// Exporteert ALLEEN de zakelijke relaties (type='zakelijk') + hun
// contactpersonen uit de BRON-database (Rebu CRM) naar een JSON-bestand.
// Dit is de enige data die meegaat naar het nieuwe Kunststofkozijnnodig-CRM;
// offertes, facturen, projecten en taken blijven bewust achter (schone lei).
//
// Draaien vanuit een omgeving met toegang tot de BRON-DB, bv.:
//   cd ~/projects/Rebucrm
//   set -a && source .env.local && set +a
//   node ~/projects/KunststofkozijnnodigCRM/scripts/export-zakelijke-klanten.mjs
//
// Output: scripts/data/zakelijke-klanten-export.json (naast dit script).
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Ontbrekend: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (bron-DB).')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

// Velden die NIET meegaan: administratie_id (nieuwe admin krijgt eigen id bij
// import) en snelstart_* (nieuw SnelStart-account). ID's blijven behouden zodat
// contactpersonen.relatie_id blijft kloppen in de nieuwe (lege) database.
const RELATIE_DROP = new Set(['administratie_id', 'snelstart_relatie_id', 'snelstart_synced_at'])
const CONTACT_DROP = new Set(['administratie_id'])

async function fetchAll(table, filter) {
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select('*').range(from, from + PAGE - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

const relatiesRaw = await fetchAll('relaties', q => q.eq('type', 'zakelijk'))
const relatieIds = new Set(relatiesRaw.map(r => r.id))

// Contactpersonen ophalen en filteren op de geëxporteerde relaties.
const contactenRaw = (await fetchAll('contactpersonen')).filter(c => relatieIds.has(c.relatie_id))

const strip = (row, drop) => Object.fromEntries(Object.entries(row).filter(([k]) => !drop.has(k)))
const relaties = relatiesRaw.map(r => strip(r, RELATIE_DROP))
const contactpersonen = contactenRaw.map(c => strip(c, CONTACT_DROP))

const payload = {
  exportedAt: new Date().toISOString(),
  bron: url,
  aantallen: { relaties: relaties.length, contactpersonen: contactpersonen.length },
  relaties,
  contactpersonen,
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'data')
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, 'zakelijke-klanten-export.json')
writeFileSync(outFile, JSON.stringify(payload, null, 2))
console.log(`Geëxporteerd: ${relaties.length} zakelijke relaties + ${contactpersonen.length} contactpersonen`)
console.log(`→ ${outFile}`)
