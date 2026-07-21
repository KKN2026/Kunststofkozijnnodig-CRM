import { createDbClient } from './db.mjs'
import fs from 'fs'
const c = await createDbClient()
await c.query(fs.readFileSync('./supabase/migrations/066_offerte_verwachte_valdatum.sql', 'utf-8'))
console.log('Migratie 066 toegepast (offertes.verwachte_valdatum)')
await c.end()
