import { createDbClient } from './db.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '082_profiel_toegestane_modules.sql')
const sql = readFileSync(sqlPath, 'utf-8')

const db = await createDbClient()
await db.query('BEGIN')
try {
  await db.query(sql)
  await db.query('COMMIT')
  console.log('Migratie 082 toegepast.')
} catch (e) {
  await db.query('ROLLBACK')
  console.error('ROLLBACK:', e.message)
  process.exit(1)
}

const r = await db.query(`
  SELECT column_name, data_type, column_default FROM information_schema.columns
  WHERE table_name = 'profielen' AND column_name = 'toegestane_modules'
`)
console.log('Kolom:', r.rows)
await db.end()
