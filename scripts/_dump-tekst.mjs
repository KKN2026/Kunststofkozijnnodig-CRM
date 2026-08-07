// Dump de geëxtraheerde tekst van een test-PDF (na Schüco-decode-simulatie)
import { readFileSync } from 'fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const path = process.argv[2]
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
  text += `\n===== PAGINA ${p} =====\n` + pageText
}
// Maak control chars zichtbaar
const zichtbaar = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, (c) => `⟨${c.charCodeAt(0).toString(16)}⟩`)
console.log(zichtbaar.slice(0, Number(process.argv[3] || 6000)))
