// Zet het volledige databaseschema op in het NIEUWE (verse) Supabase-project
// door alle migraties uit supabase/migrations/ in volgorde af te spelen, en
// maakt daarna de administratie-rij voor Kunststofkozijnnodig.nl aan.
//
// Verbinding (kies één):
//   TARGET_DATABASE_URL = de volledige Postgres-URI uit Supabase → Settings →
//                         Database → Connection string (Session pooler).  (aanbevolen)
// óf:
//   TARGET_SUPABASE_URL          + TARGET_SUPABASE_DB_PASSWORD  (+ optioneel
//   TARGET_POOLER_HOST, standaard aws-1-eu-west-1.pooler.supabase.com)
//
// Draaien vanuit de fork-map (heeft `pg` + de migraties):
//   TARGET_DATABASE_URL='postgres://...' node scripts/setup-new-db.mjs
import pg from 'pg'
import { readFileSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase', 'migrations')

function buildClient() {
  const dbUrl = process.env.TARGET_DATABASE_URL
  if (dbUrl) return new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  const url = process.env.TARGET_SUPABASE_URL
  const pw = process.env.TARGET_SUPABASE_DB_PASSWORD
  const ref = url?.match(/https:\/\/([^.]+)/)?.[1]
  if (!ref || !pw) {
    console.error('Geef TARGET_DATABASE_URL, óf TARGET_SUPABASE_URL + TARGET_SUPABASE_DB_PASSWORD.')
    process.exit(1)
  }
  return new pg.Client({
    host: process.env.TARGET_POOLER_HOST || 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432, database: 'postgres', user: `postgres.${ref}`, password: pw,
    ssl: { rejectUnauthorized: false },
  })
}

const client = buildClient()
await client.connect()
console.log('Verbonden met doel-database.')

// Hervatbaar: houd bij welke migraties al gedraaid zijn, zodat opnieuw draaien
// veilig is (verse Supabase-projecten initialiseren storage soms iets later).
await client.query(`create table if not exists _setup_migraties (
  bestand text primary key, status text not null, gedraaid_op timestamptz default now()
)`)
const { rows: gedaan } = await client.query('select bestand from _setup_migraties')
const alGedaan = new Set(gedaan.map(r => r.bestand))

const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
console.log(`${files.length} migraties gevonden. Afspelen…`)
const AL_AANWEZIG = /already exists|duplicate|already a|multiple primary keys/i
const STORAGE_ONKLAAR = /relation "storage\.\w+" does not exist/i
for (const f of files) {
  if (alGedaan.has(f)) { console.log(`  · ${f} (overgeslagen — al gedaan)`); continue }
  const sql = readFileSync(join(migrationsDir, f), 'utf8')
  try {
    await client.query(sql)
    await client.query('insert into _setup_migraties(bestand,status) values($1,$2) on conflict(bestand) do update set status=$2', [f, 'ok'])
    console.log(`  ✓ ${f}`)
  } catch (e) {
    if (AL_AANWEZIG.test(e.message)) {
      await client.query('insert into _setup_migraties(bestand,status) values($1,$2) on conflict(bestand) do nothing', [f, 'al-aanwezig'])
      console.log(`  ~ ${f} (was al toegepast)`)
    } else if (STORAGE_ONKLAAR.test(e.message)) {
      await client.query('insert into _setup_migraties(bestand,status) values($1,$2) on conflict(bestand) do nothing', [f, 'storage-uitgesteld'])
      console.log(`  ⧗ ${f} (storage nog niet klaar — bucket wordt later apart aangemaakt)`)
    } else {
      console.error(`  ✗ ${f}: ${e.message}`)
      console.error('Gestopt. Los dit op en draai opnieuw.')
      await client.end()
      process.exit(1)
    }
  }
}

// Administratie-rij voor Kunststofkozijnnodig.nl. KVK/BTW/IBAN blijven leeg tot
// je de definitieve gegevens aanlevert (later te vullen via instellingen).
const { rows: bestaand } = await client.query(
  `select id from administraties where naam ilike '%Kunststofkozijnnodig%' limit 1`
)
let adminId
if (bestaand[0]) {
  adminId = bestaand[0].id
  console.log(`Administratie bestaat al: ${adminId}`)
} else {
  const { rows } = await client.query(
    `insert into administraties (naam, adres, postcode, plaats, land, telefoon, email, website)
     values ('Kunststofkozijnnodig.nl','Samsonweg 26F','1521 RM','Wormerveer','Nederland',
             '+31 6 58 86 60 70','info@kunststofkozijnnodig.nl','www.kunststofkozijnnodig.nl')
     returning id`
  )
  adminId = rows[0].id
  console.log(`Administratie aangemaakt: ${adminId}`)
}
console.log(`\nKlaar. Gebruik dit id voor de import:\n  TARGET_ADMINISTRATIE_ID=${adminId}`)
await client.end()
