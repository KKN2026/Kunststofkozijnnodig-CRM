import { createDbClient } from './db.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '074_doorverwijzing_gevraagd.sql')
const sql = readFileSync(sqlPath, 'utf-8')

const db = await createDbClient()
await db.query('BEGIN')
try {
  await db.query(sql)
  await db.query('COMMIT')
  console.log('Migratie 074 toegepast.')
} catch (e) {
  await db.query('ROLLBACK')
  console.error('ROLLBACK:', e.message)
  process.exit(1)
}

const r = await db.query(`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'relaties'
    AND column_name IN ('om_referentie_gevraagd', 'om_doorverwijzing_gevraagd')
`)
console.log('Kolommen:', r.rows.map((c) => `${c.column_name} (${c.data_type}, default ${c.column_default})`).join('\n  '))
await db.end()
