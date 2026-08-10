// Draai de echte parser over één PDF: node scripts/_run-schuco-parse.mjs [pad]
// Zonder argument: de encoded Schüco-testcase (Merron) uit scripts/data.
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseLeverancierPdfText } from '../src/lib/pdf-parser.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pad = process.argv[2] || resolve(__dirname, 'data', 'leverancier-pdfs', '2026-04-24__Merron .pdf')
const data = new Uint8Array(readFileSync(pad))
const pdf = await getDocument({ data }).promise
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

const result = parseLeverancierPdfText(text)
console.log('Totaal: €' + result.totaal)
console.log('Aantal elementen:', result.elementen.length)
for (const e of result.elementen) {
  console.log(`  ${e.naam} — ${e.hoeveelheid}× "${e.systeem}" — €${e.prijs}`)
}
