// Regressietest: EKO-Okna oud format met verschoven prijsvakken.
//
// In sommige OFAL-exports staat het prijsvak in een aparte layout-kolom die
// bij de pdfjs-tekstreconstructie door de elementtekst heen schuift. Drie
// faalvormen, alle drie aanwezig in de Bowgroep-test-PDF:
//   1. spec-regels tussen "Deurprijs" en het bedrag (Deur 008/009);
//   2. prijs schuift vóórbij de sectiegrens en belandt ná de header van het
//      volgende element, dat daardoor zelf de verkeerde prijs pakt
//      (Deur 010 → Element 011);
//   3. prijs van het laatste element staat tussen het totalenblok
//      (Element 013).
//
// Slaagt als: 13 elementen, géén €0-prijzen, en de som van de
// elementprijzen wijkt < 2% af van het documenttotaal (verschil = losse
// transportpost die geen element is).
//
// Gebruik: node scripts/test-eko-prijsvakken.mjs
// Test-PDF ontbreekt? Vul scripts/data opnieuw met:
//   node scripts/download-test-leverancier-pdfs.mjs 80
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseLeverancierPdfText, detectLeverancierFromText } from '../src/lib/pdf-parser.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pad = resolve(__dirname, 'data', 'leverancier-pdfs', '2026-06-03__Bowgroep Peters - Regenboogflat Vlissingen.pdf')

if (!existsSync(pad)) {
  console.error(`Test-PDF ontbreekt: ${pad}\nVul aan met: node scripts/download-test-leverancier-pdfs.mjs 80`)
  process.exit(1)
}

// Zelfde pdfjs-tekstreconstructie als de wizard en test-parser-regressie.mjs
const data = new Uint8Array(readFileSync(pad))
const pdf = await getDocument({ data, verbosity: 0 }).promise
let text = ''
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p)
  const tc = await page.getTextContent()
  let pageText = ''
  let lastY = null
  for (const item of tc.items) {
    if (!('str' in item) || !item.str) continue
    const y = Math.round(item.transform[5])
    const nl = lastY !== null && Math.abs(y - lastY) > 3
    pageText += nl ? '\n' : (pageText && !pageText.endsWith('\n') ? ' ' : '')
    pageText += item.str
    lastY = y
    if (item.hasEOL) { pageText += '\n'; lastY = null }
  }
  text += pageText + '\n\n'
}

const detectie = detectLeverancierFromText(text)
const r = parseLeverancierPdfText(text, detectie || undefined)
const som = r.elementen.reduce((s, e) => s + e.prijs * e.hoeveelheid, 0)
const nulPrijzen = r.elementen.filter(e => e.prijs <= 0)
const afwijkingPct = r.totaal > 0 ? Math.abs(som - r.totaal) / r.totaal * 100 : 100

let fouten = 0
const check = (ok, msg) => {
  console.log(`${ok ? '  OK ' : 'FOUT '} ${msg}`)
  if (!ok) fouten++
}

check(detectie === 'eko-okna', `detectie = ${detectie} (verwacht eko-okna)`)
check(r.elementen.length === 13, `${r.elementen.length} elementen (verwacht 13)`)
check(nulPrijzen.length === 0, `${nulPrijzen.length} elementen met €0 (verwacht 0)${nulPrijzen.length ? ': ' + nulPrijzen.map(e => e.naam).join(', ') : ''}`)
check(afwijkingPct < 2, `som €${som.toFixed(2)} vs totaal €${r.totaal.toFixed(2)} — afwijking ${afwijkingPct.toFixed(1)}% (verwacht < 2%)`)

if (fouten) {
  console.error(`\n${fouten} check(s) gefaald`)
  process.exit(1)
}
console.log('\nAlles groen')
