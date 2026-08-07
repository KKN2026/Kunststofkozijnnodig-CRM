// Download recente leveranciers-PDF's uit Rebu's documenten-bucket als lokaal
// testmateriaal voor de parser (scripts/data/ staat buiten git — klantdata).
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, 'data', 'leverancier-pdfs')
mkdirSync(outDir, { recursive: true })

const env = {}
for (const line of readFileSync('/Users/nickhouter/projects/Rebucrm/.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}
const rebu = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const aantal = Number(process.argv[2] || 30)
const { data: rows, error } = await rebu
  .from('documenten')
  .select('naam, storage_path, created_at')
  .eq('entiteit_type', 'offerte_leverancier')
  .order('created_at', { ascending: false })
  .limit(aantal)
if (error) throw error

let ok = 0
for (const row of rows) {
  const { data, error: dlErr } = await rebu.storage.from('documenten').download(row.storage_path)
  if (dlErr) {
    console.warn(`OVERGESLAGEN ${row.naam}: ${dlErr.message}`)
    continue
  }
  const safe = row.naam.replace(/^Leverancier PDF - /, '').replace(/[^\w.() +-]/g, '_')
  const dest = resolve(outDir, `${row.created_at.slice(0, 10)}__${safe}`)
  writeFileSync(dest, Buffer.from(await data.arrayBuffer()))
  ok++
}
console.log(`${ok}/${rows.length} PDF's gedownload naar ${outDir}`)
