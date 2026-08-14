import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Lettert Mollie-betalingen af in SnelStart.
 *
 * Waarom dit bestaat: een iDEAL-betaling komt binnen bij Mollie, maar Mollie
 * betaalt pas dagen later in batches uit aan de bank. Tot die tijd zag SnelStart
 * de factuur als volledig openstaand, terwijl de klant allang betaald had. Dat
 * gat werd handmatig gedicht — of helemaal niet. Nu boeken we de betaling
 * meteen in het Mollie-dagboek, waarmee de factuur is afgeletterd; de latere
 * uitbetaling van Mollie naar de bank valt daar via de kruisposten tegen weg.
 *
 * DUBBELBOEKEN IS DE GROOTSTE RISICOFACTOR. Deze routine draait periodiek, en
 * een dubbele boeking betekent een klant die volgens de boekhouding twee keer
 * betaald heeft. Daarom:
 *   1. `snelstart_betaling_id` wordt op 'bezig:<tijd>' gezet vóór de API-call;
 *   2. lukt de call, dan komt het echte boekings-id er te staan;
 *   3. mislukt de call, dan controleren we bij SnelStart of de boeking tóch is
 *      geland (openstaand gedaald) en pas als dat níét zo is geven we 'm vrij
 *      voor een nieuwe poging.
 * Alleen facturen met `snelstart_betaling_id IS NULL` komen in aanmerking.
 */

export interface AfletterResultaat {
  factuurnummer: string
  bedrag: number
  geboekt: boolean
  reden?: string
  boekingId?: string
}

export interface AfletterSamenvatting {
  bekeken: number
  geboekt: number
  overgeslagen: number
  fouten: string[]
  regels: AfletterResultaat[]
}

export async function letterMollieBetalingenAf(opties: { dryRun?: boolean } = {}): Promise<AfletterSamenvatting> {
  const dryRun = opties.dryRun ?? false
  const sb = createAdminClient()
  const samenvatting: AfletterSamenvatting = { bekeken: 0, geboekt: 0, overgeslagen: 0, fouten: [], regels: [] }

  const { isSnelStartEnabled, boekMollieBetaling, listAllVerkoopfacturen } = await import('@/lib/snelstart')
  if (!isSnelStartEnabled()) {
    samenvatting.fouten.push('SnelStart niet geconfigureerd')
    return samenvatting
  }

  // Kandidaten: in het CRM betaald via Mollie, wél doorgezet naar SnelStart,
  // maar daar nog niet afgeletterd door ons.
  const { data: kandidaten, error } = await sb
    .from('facturen')
    .select('id, factuurnummer, totaal, betaald_bedrag, status, mollie_payment_id, snelstart_boeking_id, snelstart_betaling_id')
    .eq('status', 'betaald')
    .not('mollie_payment_id', 'is', null)
    .not('snelstart_boeking_id', 'is', null)
    .is('snelstart_betaling_id', null)

  if (error) {
    samenvatting.fouten.push(`facturen ophalen mislukt: ${error.message}`)
    return samenvatting
  }
  if (!kandidaten || kandidaten.length === 0) return samenvatting

  // Openstaand saldo uit SnelStart: alleen facturen die daar écht nog openstaan
  // hoeven afgeletterd. Staat er al 0, dan is de betaling langs de bank
  // binnengekomen en zouden wij dubbel boeken.
  let ssOpenstaand: Map<string, number>
  try {
    const lijst = await listAllVerkoopfacturen()
    ssOpenstaand = new Map(lijst.map(v => [v.factuurnummer, v.openstaand]))
  } catch (e) {
    samenvatting.fouten.push(`SnelStart-saldi ophalen mislukt: ${e instanceof Error ? e.message : 'fout'}`)
    return samenvatting
  }

  const { getMolliePaymentStatus } = await import('@/lib/mollie')

  for (const f of kandidaten) {
    samenvatting.bekeken++
    const factuurnummer = f.factuurnummer as string
    const openstaand = ssOpenstaand.get(factuurnummer)

    if (openstaand === undefined) {
      samenvatting.overgeslagen++
      samenvatting.regels.push({ factuurnummer, bedrag: 0, geboekt: false, reden: 'niet gevonden in SnelStart' })
      continue
    }
    if (openstaand <= 0.01) {
      samenvatting.overgeslagen++
      samenvatting.regels.push({ factuurnummer, bedrag: 0, geboekt: false, reden: 'staat in SnelStart al op betaald' })
      continue
    }

    // Mollie is de bron van waarheid voor 'is er echt geld binnengekomen'.
    let mollie: { status: string; amount: number; paidAt: Date | string | null | undefined }
    try {
      mollie = await getMolliePaymentStatus(f.mollie_payment_id as string)
    } catch (e) {
      samenvatting.fouten.push(`${factuurnummer}: Mollie-status ophalen mislukt — ${e instanceof Error ? e.message : 'fout'}`)
      continue
    }
    if (mollie.status !== 'paid') {
      samenvatting.overgeslagen++
      samenvatting.regels.push({ factuurnummer, bedrag: 0, geboekt: false, reden: `Mollie meldt status '${mollie.status}'` })
      continue
    }

    // Nooit méér afletteren dan er in SnelStart openstaat.
    const bedrag = Math.round(Math.min(Number(mollie.amount), openstaand) * 100) / 100
    if (bedrag <= 0) {
      samenvatting.overgeslagen++
      samenvatting.regels.push({ factuurnummer, bedrag, geboekt: false, reden: 'bedrag is nul' })
      continue
    }

    const paidAt = mollie.paidAt ? new Date(mollie.paidAt) : new Date()
    const datum = paidAt.toISOString().slice(0, 10)
    const omschrijving = `Mollie iDEAL-betaling factuur ${factuurnummer}`

    if (dryRun) {
      samenvatting.regels.push({ factuurnummer, bedrag, geboekt: false, reden: `zou boeken op ${datum}` })
      continue
    }

    // Stap 1: claim de factuur vóór de API-call, zodat een gelijktijdige of
    // volgende ronde 'm niet nog eens pakt.
    const claim = `bezig:${new Date().toISOString()}`
    const { error: claimFout } = await sb
      .from('facturen')
      .update({ snelstart_betaling_id: claim })
      .eq('id', f.id)
      .is('snelstart_betaling_id', null)
    if (claimFout) {
      samenvatting.fouten.push(`${factuurnummer}: claimen mislukt — ${claimFout.message}`)
      continue
    }

    // Stap 2: boeken.
    try {
      const boeking = await boekMollieBetaling({
        verkoopboekingId: f.snelstart_boeking_id as string,
        bedrag,
        datum,
        omschrijving,
      })
      await sb.from('facturen').update({ snelstart_betaling_id: boeking.id }).eq('id', f.id)
      samenvatting.geboekt++
      samenvatting.regels.push({ factuurnummer, bedrag, geboekt: true, boekingId: boeking.id })

      try {
        const { logAudit } = await import('@/lib/audit')
        await logAudit({
          actie: 'factuur.snelstart_betaling_geboekt',
          entiteitType: 'factuur',
          entiteitId: f.id as string,
          details: { factuurnummer, bedrag, datum, boeking_id: boeking.id, dagboek: 'Mollie (1104)' },
        })
      } catch { /* audit mag het boeken niet blokkeren */ }
    } catch (e) {
      // Stap 3: de call mislukte — maar landde de boeking misschien tóch?
      // Alleen als SnelStart de factuur nog steeds als openstaand ziet, geven we
      // 'm vrij voor een nieuwe poging. Anders blijft de claim staan zodat er
      // nooit een tweede boeking overheen gaat.
      const melding = e instanceof Error ? e.message : 'onbekende fout'
      let vrijgeven = false
      try {
        const opnieuw = await listAllVerkoopfacturen()
        const nu = opnieuw.find(v => v.factuurnummer === factuurnummer)
        vrijgeven = nu ? nu.openstaand > 0.01 : false
      } catch { vrijgeven = false }

      if (vrijgeven) {
        await sb.from('facturen').update({ snelstart_betaling_id: null }).eq('id', f.id)
        samenvatting.fouten.push(`${factuurnummer}: boeken mislukt (${melding}) — vrijgegeven voor een volgende poging`)
      } else {
        await sb.from('facturen').update({ snelstart_betaling_id: `controleren:${melding.slice(0, 80)}` }).eq('id', f.id)
        samenvatting.fouten.push(
          `${factuurnummer}: boeken mislukt (${melding}) en SnelStart meldt de factuur niet meer als openstaand — ` +
          `handmatig controleren of de boeking er wél in staat. Niet automatisch opnieuw geboekt.`
        )
      }
    }
  }

  return samenvatting
}
