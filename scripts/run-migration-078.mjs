import { createDbClient } from './db.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '078_vrije_dagen_goedkeurder.sql')
const sql = readFileSync(sqlPath, 'utf-8')

const db = await createDbClient()
await db.query('BEGIN')
try {
  await db.query(sql)
  await db.query('COMMIT')
  console.log('Migratie 078 toegepast.')
} catch (e) {
  await db.query('ROLLBACK')
  console.error('ROLLBACK:', e.message)
  process.exit(1)
}

const r = await db.query(`SELECT naam, email, mag_vrije_dagen_goedkeuren FROM profielen ORDER BY mag_vrije_dagen_goedkeuren DESC`)
console.log('Profielen:')
for (const row of r.rows) console.log(`  ${row.naam} <${row.email}> — mag_goedkeuren: ${row.mag_vrije_dagen_goedkeuren}`)
await db.end()
