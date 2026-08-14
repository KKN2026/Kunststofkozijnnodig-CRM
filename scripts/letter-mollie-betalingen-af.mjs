// Lettert Mollie-betalingen af in SnelStart: boekt het ontvangen bedrag in het
// Mollie-dagboek (1104) tegen de openstaande verkoopboeking.
//
// Waarom niet op de bankrekening: Mollie betaalt in batches uit aan de bank,
// dagen later. Boek je meteen op de ING-rekening, dan sluit het bankafschrift
// niet meer aan. Het Mollie-dagboek vangt dat op; de uitbetaling loopt daarna
// via de kruisposten tegen elkaar weg.
//
// Transactiekosten worden hier NIET verrekend — het brutobedrag lettert de
// factuur volledig af. De kosten horen bij de uitbetaling (grootboek 4758).
//
// Gebruik (MOLLIE_ENV_FILE wijst naar een env-bestand met de productiesleutels,
// bijv. via: vercel env pull .env.prod --environment=production):
//   node scripts/letter-mollie-betalingen-af.mjs        → dry-run
//   node scripts/letter-mollie-betalingen-af.mjs boek   → boekt daadwerkelijk

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createDbClient } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function laadEnv(pad) {
  try {
    for (const line of readFileSync(pad, 'utf-8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (!m) continue
      const k = m[1].trim()
      const v = m[2].trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').trim()
      if (!process.env[k]) process.env[k] = v
    }
  } catch { /* bestand hoeft niet te bestaan */ }
}
laadEnv(resolve(__dirname, '..', '.env.local'))
laadEnv(process.env.MOLLIE_ENV_FILE || resolve(__dirname, '..', '.env.prod'))

const schoon = (v) => (v || '').replace(/\\[rn]/g, '').replace(/\s/g, '').replace(/^["']|["']$/g, '')
const SUB = schoon(process.env.SNELSTART_SUBSCRIPTION_KEY)
const CLIENT = schoon(process.env.SNELSTART_CLIENT_KEY)
const MOLLIE_KEY = (process.env.MOLLIE_API_KEY || '').replace(/\\n/g, '\n').trim().replace(/[\r\n]/g, '')
if (!SUB || !CLIENT || !MOLLIE_KEY) {
  console.error('Sleutels ontbreken (SNELSTART_SUBSCRIPTION_KEY / SNELSTART_CLIENT_KEY / MOLLIE_API_KEY).')
  process.exit(1)
}

const MOLLIE_DAGBOEK_NUMMER = 1104
const boekEcht = process.argv[2] === 'boek'

// ---------- SnelStart ----------
let token = null
async function ss(pad, opties = {}) {
  if (!token) {
    const a = await fetch('https://auth.snelstart.nl/b2b/token', {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': SUB, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'clientkey', clientkey: CLIENT }).toString(),
    })
    if (!a.ok) throw new Error(`SnelStart auth mislukt (${a.status})`)
    token = (await a.json()).access_token
  }
  const r = await fetch(`https://b2bapi.snelstart.nl/v2${pad}`, {
    ...opties,
    headers: {
      Authorization: `Bearer ${token}`,
      'Ocp-Apim-Subscription-Key': SUB,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(opties.headers || {}),
    },
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`${r.status}: ${txt.slice(0, 300)}`)
  return txt ? JSON.parse(txt) : null
}

async function alleVerkoopfacturen() {
  const uit = new Map()
  for (let skip = 0; skip < 20000; skip += 100) {
    const lijst = await ss(`/verkoopfacturen?$top=100&$skip=${skip}`)
    if (!Array.isArray(lijst) || lijst.length === 0) break
    for (const v of lijst) if (v.factuurnummer) uit.set(v.factuurnummer, Number(v.openstaandSaldo ?? 0))
    if (lijst.length < 100) break
  }
  return uit
}

// ---------- Mollie ----------
async function mollieLinkStatus(plId) {
  const r = await fetch(`https://api.mollie.com/v2/payment-links/${plId}`, {
    headers: { Authorization: `Bearer ${MOLLIE_KEY}` },
  })
  const link = await r.json()
  if (!r.ok) throw new Error(link?.detail || `HTTP ${r.status}`)
  let betaald = 0
  let paidAt = link.paidAt || null
  try {
    const s = await fetch(`https://api.mollie.com/v2/payment-links/${plId}/payments`, {
      headers: { Authorization: `Bearer ${MOLLIE_KEY}` },
    })
    const j = await s.json()
    for (const p of (j?._embedded?.payments || [])) {
      if (p.status === 'paid') { betaald += parseFloat(p.amount.value); paidAt = p.paidAt || paidAt }
    }
  } catch { /* optioneel */ }
  return {
    betaald: Boolean(link.paidAt) || betaald > 0,
    bedrag: betaald > 0 ? betaald : parseFloat(link.amount?.value || '0'),
    paidAt,
  }
}

// ---------- Uitvoeren ----------
const db = await createDbClient()

const dagboeken = await ss('/dagboeken?$top=200')
const dagboek = dagboeken.find(d => Number(d.nummer) === MOLLIE_DAGBOEK_NUMMER)
if (!dagboek) {
  console.error(`Dagboek ${MOLLIE_DAGBOEK_NUMMER} (Mollie) niet gevonden — gestopt.`)
  await db.end(); process.exit(1)
}
console.log(`Dagboek: ${dagboek.nummer} ${dagboek.omschrijving}\n`)

const { rows } = await db.query(`
  select f.id, f.factuurnummer, f.totaal, f.mollie_payment_id, f.snelstart_boeking_id, r.bedrijfsnaam
  from facturen f
  left join relaties r on r.id = f.relatie_id
  where f.status = 'betaald'
    and f.mollie_payment_id like 'pl_%'
    and f.snelstart_boeking_id is not null
    and f.snelstart_betaling_id is null
  order by f.datum desc
`)

const openstaand = await alleVerkoopfacturen()
console.log(`${rows.length} kandidaten${boekEcht ? '  (BOEKEN)' : '  (DRY-RUN)'}\n`)

let geboekt = 0, som = 0
for (const f of rows) {
  const open = openstaand.get(f.factuurnummer)
  if (open === undefined) { console.log(`  – ${f.factuurnummer}: niet gevonden in SnelStart`); continue }
  if (open <= 0.01) { console.log(`  – ${f.factuurnummer}: staat in SnelStart al op betaald`); continue }

  let m
  try { m = await mollieLinkStatus(f.mollie_payment_id) } catch (e) { console.log(`  ! ${f.factuurnummer}: Mollie-fout — ${e.message}`); continue }
  if (!m.betaald) { console.log(`  – ${f.factuurnummer}: bij Mollie niet betaald`); continue }

  const bedrag = Math.round(Math.min(m.bedrag, open) * 100) / 100
  const datum = new Date(m.paidAt || Date.now()).toISOString().slice(0, 10)
  const omschrijving = `Mollie iDEAL-betaling factuur ${f.factuurnummer}`

  console.log(`  ${f.factuurnummer}  ${f.bedrijfsnaam}`)
  console.log(`      € ${bedrag.toFixed(2)} op ${datum}  →  dagboek ${dagboek.nummer} ${dagboek.omschrijving}  (openstaand in SnelStart: € ${open.toFixed(2)})`)

  if (!boekEcht) { som += bedrag; continue }

  // Claim vóór de call: nooit dubbel boeken.
  const claim = await db.query(
    `update facturen set snelstart_betaling_id = $1 where id = $2 and snelstart_betaling_id is null returning id`,
    [`bezig:${new Date().toISOString()}`, f.id]
  )
  if (claim.rowCount === 0) { console.log('      (al geclaimd door een andere ronde — overgeslagen)'); continue }

  try {
    const boeking = await ss('/bankboekingen', {
      method: 'POST',
      body: JSON.stringify({
        datum,
        dagboek: { id: dagboek.id },
        omschrijving,
        bedragOntvangen: bedrag,
        bedragUitgegeven: 0,
        verkoopboekingBoekingsRegels: [
          { boekingId: { id: f.snelstart_boeking_id }, omschrijving, debet: 0, credit: bedrag },
        ],
      }),
    })
    await db.query(`update facturen set snelstart_betaling_id = $1 where id = $2`, [boeking.id, f.id])
    console.log(`      geboekt, id ${boeking.id}`)
    geboekt++; som += bedrag
  } catch (e) {
    // Landde de boeking tóch? Alleen vrijgeven als de factuur nog openstaat.
    let nogOpen = false
    try { nogOpen = (await alleVerkoopfacturen()).get(f.factuurnummer) > 0.01 } catch { nogOpen = false }
    if (nogOpen) {
      await db.query(`update facturen set snelstart_betaling_id = null where id = $1`, [f.id])
      console.log(`      MISLUKT (${e.message}) — vrijgegeven voor een volgende poging`)
    } else {
      await db.query(`update facturen set snelstart_betaling_id = $1 where id = $2`, [`controleren:${String(e.message).slice(0, 80)}`, f.id])
      console.log(`      MISLUKT (${e.message}) maar factuur staat niet meer open — HANDMATIG CONTROLEREN`)
    }
  }
}

console.log(`\n${boekEcht ? `Geboekt: ${geboekt} betalingen` : 'Zou boeken'}, € ${som.toFixed(2)}`)
if (!boekEcht) console.log('Draai opnieuw met "boek" om het door te voeren.')
await db.end()
