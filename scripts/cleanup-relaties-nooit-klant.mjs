// Verwijdert relaties (bedrijfsnamen/instanties) die NOOIT een verkoopkans
// (projecten) of offerte hebben gehad ÉN geen enkel contactveld hebben (geen
// e-mail/telefoon/adres/postcode/plaats/kvk/website) — resten van een oude
// SnelStart-boekhoudkoppeling (supermarkten, tankstations, leveranciers,
// overheid, verzekeraars etc.), geen echte klanten of leads.
//
// Van de losse persoonsnamen in die groep blijven alleen de 5 daadwerkelijke
// klanten staan (Brett Nolthuis, Jurrien Steunebrink, Koen Bakker, Dennis de
// Boer, Familie Fidder) — bevestigd door de klant op 12-08-2026. De rest gaat
// ook weg.
//
//   node scripts/cleanup-relaties-nooit-klant.mjs            # dry run
//   node scripts/cleanup-relaties-nooit-klant.mjs --execute   # echt verwijderen
import { createSupabaseAdmin } from './db.mjs'

const sb = await createSupabaseAdmin()
const execute = process.argv.includes('--execute')

const { data: admin } = await sb.from('administraties').select('id, naam').single()

async function alleRijen(table, select) {
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from(table).select(select).eq('administratie_id', admin.id).order('id').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

// Sommige namen bevatten een non-breaking space of andere unicode-witruimte
// (kopieerresten uit de oorspronkelijke import) i.p.v. een gewone spatie —
// normaliseer daarom vóór het vergelijken, anders mist een exacte match.
const WHITESPACE_RE = new RegExp('[\\s\\u00A0\\u2000-\\u200B\\u202F\\u205F\\u3000]+', 'g')
function norm(s) {
  return (s || '').replace(WHITESPACE_RE, ' ').trim().toLowerCase()
}

// Losse persoonsnamen — bewust NIET verwijderen. Op verzoek (12-08) beperkt
// tot de 5 die daadwerkelijk klant zijn; de overige persoonsnamen uit de
// eerdere lijst zijn alsnog geen klant en mogen ook weg.
const PERSOONSNAMEN = new Set([
  'Brett Nolthuis', 'Jurrien Steunebrink', 'Koen Bakker', 'Dennis de Boer', 'Familie Fidder',
].map(norm))

const relaties = await alleRijen('relaties', 'id, bedrijfsnaam, contactpersoon, email, telefoon, adres, postcode, plaats, kvk_nummer, website')
const projecten = await alleRijen('projecten', 'relatie_id')
const offertes = await alleRijen('offertes', 'relatie_id')

const linked = new Set()
projecten.forEach(p => { if (p.relatie_id) linked.add(p.relatie_id) })
offertes.forEach(o => { if (o.relatie_id) linked.add(o.relatie_id) })

function isLeeg(r) {
  return !r.contactpersoon && !r.email && !r.telefoon && !r.adres && !r.postcode && !r.plaats && !r.kvk_nummer && !r.website
}

const kandidaten = relaties.filter(r => !linked.has(r.id) && isLeeg(r))
const teVerwijderen = kandidaten.filter(r => !PERSOONSNAMEN.has(norm(r.bedrijfsnaam)))
const gevondenPersonen = new Set(kandidaten.filter(r => PERSOONSNAMEN.has(norm(r.bedrijfsnaam))).map(r => norm(r.bedrijfsnaam)))
const nietMatchendePersonen = [...PERSOONSNAMEN].filter(naam => !gevondenPersonen.has(naam))

console.log(`Administratie: ${admin.naam}`)
console.log(`Totaal relaties: ${relaties.length}`)
console.log(`Kandidaten (geen verkoopkans/offerte, geen contactveld): ${kandidaten.length}`)
console.log(`  - waarvan persoonsnaam (blijft staan): ${kandidaten.length - teVerwijderen.length}`)
console.log(`  - te verwijderen (bedrijf/instantie): ${teVerwijderen.length}`)
if (nietMatchendePersonen.length > 0) {
  console.log(`\nWAARSCHUWING — deze namen uit PERSOONSNAMEN kwamen niet meer voor in de kandidatenlijst (typo, of niet meer kandidaat):`)
  nietMatchendePersonen.forEach(n => console.log(`  "${n}"`))
}

if (!execute) {
  console.log('\nDRY RUN — geen wijzigingen. Voer met --execute uit om echt te verwijderen.')
  console.log(`\nAlle ${teVerwijderen.length} te verwijderen:`)
  teVerwijderen.forEach(r => console.log(`  ${r.bedrijfsnaam}`))
  process.exit(0)
}

console.log('\nVerwijderen...')
const ids = teVerwijderen.map(r => r.id)
let removed = 0
for (let i = 0; i < ids.length; i += 500) {
  const batch = ids.slice(i, i + 500)
  const { error } = await sb.from('relaties').delete().in('id', batch)
  if (error) {
    console.error(`Fout bij batch ${i}-${i + batch.length}:`, error.message)
    continue
  }
  removed += batch.length
}
console.log(`Klaar. ${removed} relaties verwijderd.`)
