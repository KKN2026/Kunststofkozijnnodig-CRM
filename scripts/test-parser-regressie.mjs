// Regressietest: draai detectie + parser over alle test-PDF's in
// scripts/data/leverancier-pdfs (echte leveranciers-PDF's, buiten git).
// Gebruikt dezelfde pdfjs-tekstreconstructie als de wizard (y-coördinaten).
import { readFileSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseLeverancierPdfText, detectLeverancierFromText } from '../src/lib/pdf-parser.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dir = resolve(__dirname, 'data', 'leverancier-pdfs')

async function extractText(path) {
  const data = new Uint8Array(readFileSync(path))
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
  return { text, pages: pdf.numPages }
}

const files = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf')).sort()
console.log(`${files.length} test-PDF's\n`)
const perLeverancier = {}
for (const f of files) {
  try {
    const { text, pages } = await extractText(resolve(dir, f))
    const detectie = detectLeverancierFromText(text)
    const r = parseLeverancierPdfText(text, detectie || undefined)
    const som = r.elementen.reduce((s, e) => s + e.prijs * e.hoeveelheid, 0)
    const nulPrijzen = r.elementen.filter(e => e.prijs <= 0).length
    const zonderAfm = r.elementen.filter(e => !e.afmetingen).length
    const key = detectie || 'GEEN'
    perLeverancier[key] = (perLeverancier[key] || 0) + 1
    const afwijking = r.totaal > 0 ? Math.round(Math.abs(som - r.totaal) / r.totaal * 100) : null
    console.log(`${f.slice(0, 55).padEnd(56)} ${String(key).padEnd(10)} ${String(r.elementen.length).padStart(2)} elem  tot €${r.totaal.toFixed(2).padStart(10)}  som €${som.toFixed(2).padStart(10)}${afwijking !== null && afwijking > 5 ? ` ⚠ ${afwijking}% afw.` : ''}${nulPrijzen ? ` ⚠ ${nulPrijzen}×€0` : ''}${zonderAfm ? ` (${zonderAfm} z. afm)` : ''} [${pages}p]`)
  } catch (e) {
    console.log(`${f.slice(0, 55).padEnd(56)} FOUT: ${e.message}`)
  }
}
console.log('\nPer leverancier:', JSON.stringify(perLeverancier))
