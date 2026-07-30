import { createDbClient } from './db.mjs'
import fs from 'fs'
const c = await createDbClient()
await c.query(fs.readFileSync('./supabase/migrations/069_instellingen.sql', 'utf-8'))
console.log('Migratie 069 toegepast (tabel instellingen)')
await c.end()
