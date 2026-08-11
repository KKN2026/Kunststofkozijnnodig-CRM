// RLS aanzetten op _setup_migraties (Security Advisor-melding). Idempotent;
// draai hem gerust op elke database die de melding toont.
import { createDbClient } from './db.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '073_rls_setup_migraties.sql')
const sql = readFileSync(sqlPath, 'utf-8')

const db = await createDbClient()
await db.query(sql)
const r = await db.query(
  `SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='_setup_migraties'`
)
console.log(r.rows.length === 0
  ? 'Tabel _setup_migraties bestaat niet in deze database — niets te doen.'
  : `Migratie 073 toegepast. RLS aan: ${r.rows[0].rowsecurity}`)
await db.end()
