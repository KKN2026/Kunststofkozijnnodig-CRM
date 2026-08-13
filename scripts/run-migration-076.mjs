import { createDbClient } from './db.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '076_productiviteit.sql')
const sql = readFileSync(sqlPath, 'utf-8')

const db = await createDbClient()
await db.query('BEGIN')
try {
  await db.query(sql)
  await db.query('COMMIT')
  console.log('Migratie 076 toegepast.')
} catch (e) {
  await db.query('ROLLBACK')
  console.error('ROLLBACK:', e.message)
  process.exit(1)
}

const r = await db.query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_name IN ('medewerker_doelen', 'medewerker_activiteiten')
  ORDER BY table_name, ordinal_position
`)
console.log('Kolommen:', r.rows.map((c) => `${c.table_name}.${c.column_name} (${c.data_type})`).join('\n  '))
await db.end()
