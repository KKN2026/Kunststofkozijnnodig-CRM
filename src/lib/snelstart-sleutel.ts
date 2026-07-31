/**
 * Bewaakt de houdbaarheid van de SnelStart-ontwikkelsleutel.
 *
 * De testsleutel uit het product "Ontwikkeling & Test" is 90 dagen geldig.
 * Toen hij in juli verliep, viel de synchronisatie stilletjes om: de cron
 * faalde in de achtergrond en niemand zag het, waardoor betalingen dagenlang
 * niet meer binnenkwamen. Daarom telt het CRM nu zelf af en waarschuwt het
 * ruim op tijd.
 *
 * Vernieuwen is gratis en duurt twee minuten:
 *   developer-portaal → Products → Ontwikkeling & Test → naam invullen,
 *   voorwaarden aanvinken, Subscribe → primary key kopiëren →
 *   SNELSTART_SUBSCRIPTION_KEY + SNELSTART_KEY_VERVALT bijwerken.
 */

export interface SleutelStatus {
  vervaltOp: string | null
  dagenResterend: number | null
  /** true zodra we binnen de waarschuwingstermijn zitten of al verlopen zijn */
  waarschuwen: boolean
  verlopen: boolean
  bericht: string | null
}

const WAARSCHUW_VANAF_DAGEN = 21

export function snelstartSleutelStatus(nu: Date = new Date()): SleutelStatus {
  const ruw = (process.env.SNELSTART_KEY_VERVALT || '').trim()
  if (!ruw) {
    return { vervaltOp: null, dagenResterend: null, waarschuwen: false, verlopen: false, bericht: null }
  }

  const vervalt = new Date(ruw + 'T23:59:59')
  if (Number.isNaN(vervalt.getTime())) {
    return { vervaltOp: null, dagenResterend: null, waarschuwen: false, verlopen: false, bericht: null }
  }

  const dagen = Math.ceil((vervalt.getTime() - nu.getTime()) / (1000 * 60 * 60 * 24))
  const datumNl = vervalt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

  if (dagen < 0) {
    return {
      vervaltOp: ruw,
      dagenResterend: dagen,
      waarschuwen: true,
      verlopen: true,
      bericht:
        `De SnelStart-sleutel is verlopen op ${datumNl}. De koppeling met de boekhouding ligt stil: ` +
        `betalingen komen niet meer binnen en facturen worden niet doorgezet. ` +
        `Maak een nieuwe testsleutel aan in het developer-portaal (Products → Ontwikkeling & Test → Subscribe).`,
    }
  }

  if (dagen <= WAARSCHUW_VANAF_DAGEN) {
    return {
      vervaltOp: ruw,
      dagenResterend: dagen,
      waarschuwen: true,
      verlopen: false,
      bericht:
        `De SnelStart-sleutel verloopt over ${dagen} ${dagen === 1 ? 'dag' : 'dagen'} (${datumNl}). ` +
        `Vernieuw hem op tijd, anders stopt de koppeling met de boekhouding. ` +
        `Het is gratis: developer-portaal → Products → Ontwikkeling & Test → Subscribe.`,
    }
  }

  return { vervaltOp: ruw, dagenResterend: dagen, waarschuwen: false, verlopen: false, bericht: null }
}
