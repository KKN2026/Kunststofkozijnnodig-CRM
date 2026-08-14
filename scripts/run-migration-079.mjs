import { createDbClient } from './db.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '079_snelstart_betaling_boeking.sql')
const sql = readFileSync(sqlPath, 'utf-8')

const db = await createDbClient()
await db.query('BEGIN')
try {
  await db.query(sql)
  await db.query('COMMIT')
  console.log('Migratie 079 toegepast.')
} catch (e) {
  await db.query('ROLLBACK')
  console.error('ROLLBACK:', e.message)
  process.exit(1)
}

const r = await db.query(`select column_name from information_schema.columns where table_name='facturen' and column_name='snelstart_betaling_id'`)
console.log('Kolom snelstart_betaling_id:', r.rows.length ? 'aanwezig' : 'ONTBREEKT')
await db.end()
