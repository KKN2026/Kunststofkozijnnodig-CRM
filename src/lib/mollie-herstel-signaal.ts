import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Signaleert facturen die telkens opnieuw afgeboekt moeten worden.
 *
 * Achtergrond (augustus 2026, in het Rebu-CRM): de Mollie-webhook boekte betalingen keurig af,
 * maar de SnelStart-sync zette ze een paar minuten later weer op 'verzonden' —
 * het geld staat immers pas dagen later op de bank en dus in de boekhouding.
 * Het gevecht herhaalde zich elke sync-ronde. Zes facturen à € 28.630,71 leken
 * daardoor wekenlang open te staan, terwijl de klant al betaald had én een
 * betalingsbevestiging had gekregen. Niemand zag het, omdat elke afzonderlijke
 * stap 'geslaagd' rapporteerde.
 *
 * Eén afboeking per factuur is normaal. Een tweede of derde betekent dat iets
 * de betaling terugdraait. Daar slaan we op aan.
 */

const DAGEN_TERUG = 7
const DREMPEL = 2

export interface HerstelSignaal {
  waarschuwen: boolean
  bericht: string | null
  facturen: { factuurnummer: string; keren: number }[]
}

export async function mollieHerstelSignaal(): Promise<HerstelSignaal> {
  const leeg: HerstelSignaal = { waarschuwen: false, bericht: null, facturen: [] }
  try {
    const sinds = new Date(Date.now() - DAGEN_TERUG * 24 * 60 * 60 * 1000).toISOString()
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('audit_log')
      .select('details')
      .eq('actie', 'factuur.mollie_sync')
      .gte('created_at', sinds)
      .limit(1000)
    if (error || !data) return leeg

    const tellingen = new Map<string, number>()
    for (const rij of data) {
      const nummer = (rij.details as { factuurnummer?: string } | null)?.factuurnummer
      if (nummer) tellingen.set(nummer, (tellingen.get(nummer) || 0) + 1)
    }

    const herhaald = [...tellingen.entries()]
      .filter(([, keren]) => keren >= DREMPEL)
      .map(([factuurnummer, keren]) => ({ factuurnummer, keren }))
      .sort((a, b) => b.keren - a.keren)

    if (herhaald.length === 0) return leeg

    const namen = herhaald.slice(0, 5).map(h => h.factuurnummer).join(', ')
    const rest = herhaald.length > 5 ? ` en ${herhaald.length - 5} andere` : ''
    return {
      waarschuwen: true,
      facturen: herhaald,
      bericht:
        `${herhaald.length === 1 ? 'Factuur' : 'Facturen'} ${namen}${rest} ${herhaald.length === 1 ? 'is' : 'zijn'} ` +
        `de afgelopen ${DAGEN_TERUG} dagen meermaals opnieuw afgeboekt vanuit Mollie. ` +
        `Dat betekent dat iets de betaling telkens terugzet — controleer de koppeling met de boekhouding ` +
        `voordat er onterecht aanmaningen uitgaan.`,
    }
  } catch {
    // Signalering mag de facturatiepagina nooit stukmaken.
    return leeg
  }
}
