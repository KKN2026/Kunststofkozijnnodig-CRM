import { createDbClient } from './db.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '081_ontbrekende_rls_policies.sql')
const sql = readFileSync(sqlPath, 'utf-8')

const db = await createDbClient()
await db.query('BEGIN')
try {
  await db.query(sql)
  await db.query('COMMIT')
  console.log('Migratie 081 toegepast.')
} catch (e) {
  await db.query('ROLLBACK')
  console.error('ROLLBACK:', e.message)
  process.exit(1)
}

const r = await db.query(`
  SELECT tablename, policyname, cmd FROM pg_policies
  WHERE policyname IN ('documenten_update', 'nummering_delete', 'email_sync_state_delete')
`)
console.log('Policies:', r.rows)
await db.end()
