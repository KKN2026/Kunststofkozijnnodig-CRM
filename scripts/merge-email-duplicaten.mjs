import { createSupabaseAdmin } from './db.mjs'

// Voegt dubbele relaties samen die hetzelfde e-mailadres delen.
// Bedoeld om de duplicaten op te ruimen die de e-mailsync automatisch
// aanmaakte (zelfde afzender-e-mail -> steeds een nieuwe relatie).
//
// Standaard DRY-RUN (toont alleen wat er zou gebeuren).
// Voer uit met:  node scripts/merge-email-duplicaten.mjs --apply

const APPLY = process.argv.includes('--apply')

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase
  .from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// Alle relaties ophalen (gepagineerd, >1000)
const relaties = []
let from = 0
while (true) {
  const { data: batch, error } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam, type, email, telefoon, adres, postcode, plaats, contactpersoon, created_at')
    .eq('administratie_id', adminId)
    .order('created_at', { ascending: true })
    .range(from, from + 999)
  if (error) { console.error('Batch error:', error.message); process.exit(1) }
  if (!batch || batch.length === 0) break
  relaties.push(...batch)
  from += 1000
}
console.log(`Opgehaald: ${relaties.length} relaties`)

const normEmail = (s) => (s || '').toLowerCase().trim()

// Groepeer op exact e-mailadres
const emailIdx = new Map()
for (const r of relaties) {
  const ne = normEmail(r.email)
  if (!ne || !ne.includes('@')) continue
  if (!emailIdx.has(ne)) emailIdx.set(ne, [])
  emailIdx.get(ne).push(r)
}

const dupGroepen = [...emailIdx.entries()].filter(([, g]) => g.length > 1)
const teMergen = dupGroepen.reduce((s, [, g]) => s + g.length - 1, 0)
console.log(`\nGevonden: ${dupGroepen.length} e-mailadressen met dubbele relaties, ${teMergen} te mergen\n`)

// Master = OUDSTE relatie (de klant die er al was). Nieuwere duplicaten gaan eraan.
function kiesMaster(groep) {
  return groep.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0]
}

// Preview
for (const [email, groep] of dupGroepen) {
  const master = kiesMaster(groep)
  console.log(`  ${email}`)
  for (const r of groep) {
    const mark = r.id === master.id ? 'BEHOUD ' : 'merge ->'
    console.log(`    ${mark} ${r.bedrijfsnaam || '(geen naam)'} | ${r.plaats || '-'} | aangemaakt ${r.created_at?.slice(0, 10)}`)
  }
}

if (!APPLY) {
  console.log('\n[DRY RUN] Geen wijzigingen. Voer uit met --apply om te mergen.')
  process.exit(0)
}

console.log('\n--- MERGE STARTEN ---\n')

let merged = 0
let errors = 0

const tables = [
  { table: 'projecten', column: 'relatie_id' },
  { table: 'offertes', column: 'relatie_id' },
  { table: 'facturen', column: 'relatie_id' },
  { table: 'orders', column: 'relatie_id' },
  { table: 'taken', column: 'relatie_id' },
  { table: 'notities', column: 'relatie_id' },
  { table: 'emails', column: 'relatie_id' },
  { table: 'email_log', column: 'relatie_id' },
  { table: 'berichten', column: 'relatie_id' },
  { table: 'contactpersonen', column: 'relatie_id' },
  { table: 'afspraken', column: 'relatie_id' },
]

for (const [, groep] of dupGroepen) {
  const master = kiesMaster(groep)
  const duplicaten = groep.filter(r => r.id !== master.id)

  for (const dup of duplicaten) {
    for (const { table, column } of tables) {
      await supabase.from(table).update({ [column]: master.id }).eq(column, dup.id)
    }
    // documenten gekoppeld aan de relatie
    await supabase.from('documenten')
      .update({ entiteit_id: master.id })
      .eq('entiteit_id', dup.id)
      .eq('entiteit_type', 'relatie')
    // klant_relaties duplicaat opruimen
    await supabase.from('klant_relaties').delete().eq('relatie_id', dup.id)

    const { error: delErr } = await supabase.from('relaties').delete().eq('id', dup.id)
    if (delErr) {
      console.error(`  FOUT bij verwijderen "${dup.bedrijfsnaam}" (${dup.id}): ${delErr.message}`)
      errors++
    } else {
      merged++
    }
  }

  // Master aanvullen met ontbrekende velden uit de duplicaten
  const upd = {}
  if (!master.telefoon) { const r = groep.find(x => x.telefoon); if (r) upd.telefoon = r.telefoon }
  if (!master.contactpersoon) { const r = groep.find(x => x.contactpersoon); if (r) upd.contactpersoon = r.contactpersoon }
  if (!master.adres) {
    const r = groep.find(x => x.adres)
    if (r) { upd.adres = r.adres; upd.postcode = r.postcode; upd.plaats = r.plaats }
  }
  if (Object.keys(upd).length > 0) {
    await supabase.from('relaties').update(upd).eq('id', master.id)
  }
}

console.log(`\nKlaar. Samengevoegd: ${merged}, fouten: ${errors}`)

const { count } = await supabase
  .from('relaties')
  .select('id', { count: 'exact', head: true })
  .eq('administratie_id', adminId)
console.log(`Totaal relaties nu: ${count}`)
