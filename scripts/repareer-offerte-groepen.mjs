// Repareert offerteversies die niet aan elkaar gekoppeld zijn.
//
// Versies van dezelfde offerte delen hun offertenummer, maar sommige
// aanmaakroutes lieten groep_id leeg en versie_nummer op 1 staan. Daardoor
// telde dezelfde deal dubbel in het offerte-dashboard, de conversie-funnel en
// de omzetprognose (die per groep de laatste versie pakken).
//
// Dit script koppelt per (administratie, offertenummer) alle rijen aan één
// groep (de groep van de oudste rij) en hernummert de versies chronologisch.
//
// Gebruik:
//   node scripts/repareer-offerte-groepen.mjs            → dry-run
//   node scripts/repareer-offerte-groepen.mjs repareer   → voert het uit
import { createDbClient } from './db.mjs'

const doeHet = process.argv[2] === 'repareer'
const db = await createDbClient()

const { rows } = await db.query(`
  select administratie_id, offertenummer,
         array_agg(id order by created_at) as ids,
         array_agg(coalesce(groep_id::text, '') order by created_at) as groepen,
         array_agg(versie_nummer order by created_at) as versies,
         array_agg(status order by created_at) as statussen
  from offertes
  where offertenummer is not null and offertenummer <> ''
  group by administratie_id, offertenummer
  having count(*) > 1
  order by offertenummer
`)

console.log(`${rows.length} offertenummers met meerdere rijen${doeHet ? '  (REPAREREN)' : '  (DRY-RUN)'}\n`)

let gerepareerd = 0
for (const g of rows) {
  // De groep van de oudste rij is leidend; heeft die er geen, dan wordt de
  // oudste rij zelf de groep (zelfde regel als het vangnet in saveOfferte).
  const groepId = g.groepen[0] || g.ids[0]
  const wijzigingen = []
  for (let i = 0; i < g.ids.length; i++) {
    const wilVersie = i + 1
    const wilGroep = groepId
    if (g.groepen[i] !== wilGroep || Number(g.versies[i] || 0) !== wilVersie) {
      wijzigingen.push({ id: g.ids[i], versie: wilVersie })
    }
  }
  if (wijzigingen.length === 0) continue

  console.log(`  ${g.offertenummer}: ${g.ids.length} rijen [${g.statussen.join(', ')}] → groep ${groepId.slice(0, 8)}…, versies 1..${g.ids.length}`)
  if (!doeHet) { gerepareerd++; continue }

  for (const w of wijzigingen) {
    await db.query(`update offertes set groep_id = $1, versie_nummer = $2 where id = $3`, [groepId, w.versie, w.id])
  }
  gerepareerd++
}

console.log(`\n${doeHet ? 'Gerepareerd' : 'Zou repareren'}: ${gerepareerd} offertenummers`)
if (!doeHet && gerepareerd > 0) console.log('Draai opnieuw met "repareer" om het door te voeren.')
await db.end()
