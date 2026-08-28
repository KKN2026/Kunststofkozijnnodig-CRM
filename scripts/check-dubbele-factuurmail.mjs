#!/usr/bin/env node
/**
 * Vindt facturen waarbij binnen een kort tijdsbestek (default 30 min) 2+ keer
 * een factuurmail (mét PDF-bijlage) gelogd staat in email_log.
 *
 * BELANGRIJKE BEPERKING: email_log wordt pas geschreven NA een succesvolle
 * sendEmail()-call (zie src/lib/actions.ts, sendFactuurEmail, regel ~3129).
 * Een mislukte of door Vercel afgekapte eerste poging laat GEEN spoor achter
 * — noch hier, noch in audit_log, noch in de 'emails'-tabel. Dit script vindt
 * dus alleen de gevallen waarbij de EERSTE poging alsnog (deels) succesvol
 * was (mail is verstuurd, maar de medewerker kreeg door de ontbrekende
 * try/catch geen bevestiging en verstuurde een tweede keer) — d.w.z. de
 * situaties waarin de klant een DUBBELE mail kan hebben gehad. Facturen waar
 * de eerste poging écht nergens is aangekomen (bv. Vercel killte de request
 * vóór de SMTP-call) blijven per definitie onzichtbaar voor dit script.
 *
 * Usage:
 *   node scripts/check-dubbele-factuurmail.mjs [minuten]
 *   (default minuten = 30)
 */
import { createDbClient } from './db.mjs'

const minuten = Number(process.argv[2]) || 30

const sql = `
WITH factuurmails AS (
  SELECT
    el.id,
    el.factuur_id,
    el.aan,
    el.onderwerp,
    el.verstuurd_op,
    el.verstuurd_door
  FROM email_log el
  WHERE el.factuur_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(el.bijlagen) AS b
      WHERE b->>'kind' = 'factuur_pdf'
    )
),
met_vorige AS (
  SELECT
    fm.*,
    LAG(fm.id)           OVER (PARTITION BY fm.factuur_id ORDER BY fm.verstuurd_op) AS vorige_id,
    LAG(fm.verstuurd_op) OVER (PARTITION BY fm.factuur_id ORDER BY fm.verstuurd_op) AS vorige_verstuurd_op,
    LAG(fm.aan)          OVER (PARTITION BY fm.factuur_id ORDER BY fm.verstuurd_op) AS vorige_aan
  FROM factuurmails fm
)
SELECT
  f.factuurnummer,
  r.bedrijfsnaam,
  r.contactpersoon,
  COALESCE(r.email, '') AS relatie_email,
  mv.vorige_aan            AS poging_1_aan,
  mv.vorige_verstuurd_op   AS poging_1_op,
  mv.aan                   AS poging_2_aan,
  mv.verstuurd_op          AS poging_2_op,
  ROUND(EXTRACT(EPOCH FROM (mv.verstuurd_op - mv.vorige_verstuurd_op)) / 60, 1) AS minuten_ertussen,
  mv.onderwerp,
  mv.factuur_id
FROM met_vorige mv
JOIN facturen f ON f.id = mv.factuur_id
LEFT JOIN relaties r ON r.id = f.relatie_id
WHERE mv.vorige_verstuurd_op IS NOT NULL
  AND (mv.verstuurd_op - mv.vorige_verstuurd_op) <= INTERVAL '${minuten} minutes'
ORDER BY mv.verstuurd_op DESC;
`

const client = await createDbClient()
try {
  const { rows } = await client.query(sql)
  if (rows.length === 0) {
    console.log(`Geen facturen gevonden met 2+ factuurmail-verzendingen binnen ${minuten} minuten.`)
  } else {
    console.log(`${rows.length} verdachte factuur-verzendpaar(en) binnen ${minuten} minuten:\n`)
    for (const row of rows) {
      console.log(`Factuur ${row.factuurnummer} — ${row.bedrijfsnaam || row.contactpersoon || '(onbekende klant)'} (${row.relatie_email || 'geen email'})`)
      console.log(`  poging 1: ${row.poging_1_op} → ${row.poging_1_aan}`)
      console.log(`  poging 2: ${row.poging_2_op} → ${row.poging_2_aan}`)
      console.log(`  tussenpoos: ${row.minuten_ertussen} minuten | onderwerp: "${row.onderwerp}"`)
      console.log(`  factuur_id: ${row.factuur_id}\n`)
    }
  }
} finally {
  await client.end()
}
