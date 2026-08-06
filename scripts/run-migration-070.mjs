import { createDbClient } from './db.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '070_orders_wacht_op_betaling.sql')
const sql = readFileSync(sqlPath, 'utf-8')

const db = await createDbClient()
const c = await db.query('SELECT count(*)::int AS n FROM orders')
console.log('orders in DB:', c.rows[0].n)

await db.query('BEGIN')
try {
  await db.query(sql)
  await db.query('COMMIT')
  console.log('Migratie 070 toegepast.')
} catch (e) {
  await db.query('ROLLBACK')
  console.error('ROLLBACK:', e.message)
  process.exit(1)
}

const r = await db.query(
  `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
   WHERE conname='orders_status_check' AND conrelid='orders'::regclass`
)
console.log('Nieuwe constraint:', r.rows[0].def)
await db.end()
