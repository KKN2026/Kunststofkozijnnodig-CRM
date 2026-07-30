import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Centrale registry van alle instelbare voorkeuren.
 *
 * Eén plek waar een instelling wordt gedefinieerd (type, default, uitleg,
 * groep). De instellingen-pagina rendert zichzelf op basis van deze lijst,
 * dus een nieuwe instelling toevoegen = hier een regel bijzetten en 'm
 * uitlezen op de plek waar het gedrag zit. Geen migratie nodig.
 *
 * Alleen afwijkingen van de default staan in de tabel `instellingen`.
 */

// 'lijst' = meerdere waarden, in de UI één per regel in een textarea. Wordt
// opgeslagen als string[] en altijd lowercase/getrimd teruggegeven.
export type InstellingType = 'boolean' | 'number' | 'text' | 'select' | 'lijst'

export interface InstellingDef {
  sleutel: string
  label: string
  uitleg: string
  type: InstellingType
  groep: InstellingGroep
  standaard: boolean | number | string | string[]
  /** Alleen voor type 'number' */
  min?: number
  max?: number
  eenheid?: string
  /** Alleen voor type 'select' */
  opties?: { value: string; label: string }[]
  /** Alleen voor type 'lijst': placeholder-tekst in de textarea */
  voorbeeld?: string
  /** Toon deze instelling alleen als de genoemde boolean-instelling aan staat */
  afhankelijkVan?: string
}

export type InstellingGroep =
  | 'email'
  | 'offertes'
  | 'facturatie'
  | 'herinneringen'
  | 'relaties'

export const instellingGroepen: { key: InstellingGroep; label: string; uitleg: string }[] = [
  { key: 'email', label: 'E-mail', uitleg: 'Binnenkomende post, kopieën en automatische verwerking.' },
  { key: 'relaties', label: 'Relaties', uitleg: 'Hoe klanten worden aangemaakt en gecontroleerd op duplicaten.' },
  { key: 'offertes', label: 'Offertes', uitleg: 'Standaardwaarden voor nieuwe offertes.' },
  { key: 'facturatie', label: 'Facturatie', uitleg: 'Betaaltermijnen en betaallinks.' },
  { key: 'herinneringen', label: 'Herinneringen & opvolging', uitleg: 'Automatische mails die het CRM zelf verstuurt.' },
]

export const INSTELLINGEN: InstellingDef[] = [
  // === RELATIES ===
  {
    sleutel: 'relatie_auto_aanmaken_uit_email',
    label: 'Klant automatisch aanmaken uit e-mail',
    uitleg:
      'Staat dit aan, dan maakt het CRM bij het omzetten van een binnengekomen e-mail naar een offerte-aanvraag automatisch een nieuwe relatie aan als de afzender nog onbekend is. Standaard uit: u koppelt de klant zelf, zodat er geen ongewenste relaties bij komen.',
    type: 'boolean',
    groep: 'relaties',
    standaard: false,
  },
  {
    sleutel: 'relatie_auto_type',
    label: 'Type voor automatisch aangemaakte klanten',
    uitleg: 'Als een klant uit een e-mail wordt aangemaakt, krijgt hij dit type.',
    type: 'select',
    groep: 'relaties',
    standaard: 'particulier',
    opties: [
      { value: 'particulier', label: 'Particulier' },
      { value: 'zakelijk', label: 'Zakelijk' },
    ],
    afhankelijkVan: 'relatie_auto_aanmaken_uit_email',
  },
  {
    sleutel: 'relatie_auto_herkomst',
    label: 'Herkomst voor automatisch aangemaakte klanten',
    uitleg: 'Waarde die in het herkomst-filter verschijnt bij klanten die uit e-mail ontstaan.',
    type: 'select',
    groep: 'relaties',
    standaard: 'eigen_klant',
    opties: [
      { value: 'eigen_klant', label: 'Eigen klant' },
      { value: 'linkedin', label: 'Via LinkedIn' },
      { value: 'psa', label: 'Via PSA' },
    ],
    afhankelijkVan: 'relatie_auto_aanmaken_uit_email',
  },

  // === E-MAIL ===
  {
    sleutel: 'email_bcc_actief',
    label: 'Blinde kopie van uitgaande mail',
    uitleg: 'Stuurt van elke mail die het CRM verstuurt een kopie naar een vast adres, zodat u alles in uw eigen mailbox terugziet.',
    type: 'boolean',
    groep: 'email',
    standaard: false,
  },
  {
    sleutel: 'email_bcc_adres',
    label: 'BCC-adres',
    uitleg: 'Het adres dat de blinde kopie ontvangt.',
    type: 'text',
    groep: 'email',
    standaard: '',
    afhankelijkVan: 'email_bcc_actief',
  },
  {
    sleutel: 'email_sync_actief',
    label: 'Postvak automatisch ophalen',
    uitleg: 'Haalt periodiek nieuwe e-mail op via IMAP en koppelt die aan de juiste klant. Uit betekent: geen nieuwe mail in het CRM.',
    type: 'boolean',
    groep: 'email',
    standaard: true,
  },
  {
    sleutel: 'eigen_email_adressen',
    label: 'Onze eigen e-mailadressen',
    uitleg:
      'Waaraan het CRM ziet of een bericht uitgaand of inkomend is. Zet hier elk adres neer waarmee jullie mailen — staat een collega er niet bij, dan wordt zijn verzonden post als inkomende klantmail behandeld. Het SMTP-afzenderadres telt altijd mee.',
    type: 'lijst',
    groep: 'email',
    standaard: [
      'info@kunststofkozijnnodig.nl',
      'nick@kunststofkozijnnodig.nl',
      'n.burgers@kunststofkozijnnodig.nl',
      'verkoop@kunststofkozijnnodig.nl',
    ],
    voorbeeld: 'info@kunststofkozijnnodig.nl',
  },
  {
    sleutel: 'eigen_mailbox_adressen',
    label: 'Adressen met een eigen mailbox',
    uitleg:
      'Medewerkers uit deze lijst versturen offertes en facturen vanuit hún eigen adres, zodat antwoorden bij hen binnenkomen. Alle andere medewerkers versturen vanaf de gedeelde info@-postbus.',
    type: 'lijst',
    groep: 'email',
    standaard: ['verkoop@kunststofkozijnnodig.nl'],
    voorbeeld: 'verkoop@kunststofkozijnnodig.nl',
  },

  {
    sleutel: 'email_herkenning_actief',
    label: 'Binnenkomende mail automatisch beoordelen',
    uitleg:
      'Staat dit aan, dan plakt het CRM een label op elke binnenkomende mail (offerte-aanvraag, reactie op offerte, onzeker) en vinkt het nieuwsbrieven, no-reply- en bounce-mail meteen af als verwerkt. Staat het uit, dan komt alle post ongesorteerd binnen en beoordeelt u zelf wat er relevant is.',
    type: 'boolean',
    groep: 'email',
    standaard: false,
  },

  // === OFFERTES ===
  {
    sleutel: 'offerte_geldigheid_dagen',
    label: 'Standaard geldigheidsduur offerte',
    uitleg: 'Aantal dagen dat een nieuwe offerte geldig is. Vult automatisch het veld "geldig tot".',
    type: 'number',
    groep: 'offertes',
    standaard: 30,
    min: 1,
    max: 365,
    eenheid: 'dagen',
  },
  // === FACTURATIE ===
  {
    sleutel: 'factuur_betaaltermijn_dagen',
    label: 'Standaard betaaltermijn',
    uitleg: 'Aantal dagen na factuurdatum dat de vervaldatum komt te liggen, als u zelf geen vervaldatum invult.',
    type: 'number',
    groep: 'facturatie',
    standaard: 7,
    min: 0,
    max: 180,
    eenheid: 'dagen',
  },
  {
    sleutel: 'factuur_betaallink_actief',
    label: 'Betaallink (iDEAL) op facturen',
    uitleg: 'Zet een betaalknop in de factuurmail en op de online factuurpagina. Vereist een werkend Mollie-account.',
    type: 'boolean',
    groep: 'facturatie',
    standaard: true,
  },

  // === HERINNERINGEN ===
  {
    sleutel: 'offerte_followup_actief',
    label: 'Offertes automatisch opvolgen',
    uitleg: 'Stuurt eenmalig een vriendelijke herinnering naar klanten die niet op een verzonden offerte reageren.',
    type: 'boolean',
    groep: 'herinneringen',
    standaard: true,
  },
  {
    sleutel: 'offerte_followup_na_dagen',
    label: 'Opvolgen na',
    uitleg: 'Zoveel dagen na verzending gaat de herinnering eruit.',
    type: 'number',
    groep: 'herinneringen',
    standaard: 7,
    min: 1,
    max: 90,
    eenheid: 'dagen',
    afhankelijkVan: 'offerte_followup_actief',
  },
  {
    sleutel: 'offerte_followup_tot_dagen',
    label: 'Niet meer opvolgen na',
    uitleg: 'Offertes ouder dan dit aantal dagen worden met rust gelaten.',
    type: 'number',
    groep: 'herinneringen',
    standaard: 30,
    min: 2,
    max: 365,
    eenheid: 'dagen',
    afhankelijkVan: 'offerte_followup_actief',
  },
  {
    sleutel: 'aanmaningen_actief',
    label: 'Betalingsherinneringen versturen',
    uitleg:
      'Stuurt automatisch herinneringen bij openstaande facturen na de vervaldatum. LET OP: dit gaat rechtstreeks naar uw klanten — zet dit pas aan als u de teksten en betaaltermijnen gecontroleerd heeft.',
    type: 'boolean',
    groep: 'herinneringen',
    standaard: false,
  },
  {
    sleutel: 'aanmaning_1_dagen',
    label: '1e herinnering na',
    uitleg: 'Dagen na de vervaldatum voor de eerste, vriendelijke herinnering.',
    type: 'number',
    groep: 'herinneringen',
    standaard: 7,
    min: 1,
    max: 180,
    eenheid: 'dagen',
    afhankelijkVan: 'aanmaningen_actief',
  },
  {
    sleutel: 'aanmaning_2_dagen',
    label: '2e herinnering na',
    uitleg: 'Dagen na de vervaldatum voor de tweede, dringender herinnering.',
    type: 'number',
    groep: 'herinneringen',
    standaard: 14,
    min: 1,
    max: 180,
    eenheid: 'dagen',
    afhankelijkVan: 'aanmaningen_actief',
  },
  {
    sleutel: 'aanmaning_3_dagen',
    label: '3e herinnering na',
    uitleg: 'Dagen na de vervaldatum voor de laatste herinnering met aankondiging incasso.',
    type: 'number',
    groep: 'herinneringen',
    standaard: 30,
    min: 1,
    max: 365,
    eenheid: 'dagen',
    afhankelijkVan: 'aanmaningen_actief',
  },
]

export type InstellingWaarde = boolean | number | string | string[]
export type InstellingWaarden = Record<string, InstellingWaarde>

/** Alle defaults als platte map. Lijsten worden gekopieerd zodat een aanroeper
 *  die de array aanpast niet de registry-default zelf overschrijft. */
export function standaardInstellingen(): InstellingWaarden {
  const out: InstellingWaarden = {}
  for (const def of INSTELLINGEN) {
    out[def.sleutel] = Array.isArray(def.standaard) ? [...def.standaard] : def.standaard
  }
  return out
}

const defsBySleutel = new Map(INSTELLINGEN.map(d => [d.sleutel, d]))

/**
 * Zet een opgeslagen waarde om naar het type dat de definitie verwacht.
 * Beschermt tegen oude/rommelige rijen in de tabel.
 */
function normaliseer(def: InstellingDef, waarde: unknown): InstellingWaarde {
  if (def.type === 'boolean') return waarde === true || waarde === 'true'
  if (def.type === 'number') {
    const n = typeof waarde === 'number' ? waarde : parseFloat(String(waarde))
    if (!Number.isFinite(n)) return def.standaard
    if (def.min !== undefined && n < def.min) return def.min
    if (def.max !== undefined && n > def.max) return def.max
    return n
  }
  if (def.type === 'select') {
    const s = String(waarde ?? '')
    return def.opties?.some(o => o.value === s) ? s : def.standaard
  }
  if (def.type === 'lijst') {
    // Accepteert zowel een array als een tekstblok met regels (uit de textarea).
    const ruw = Array.isArray(waarde)
      ? waarde.map(v => String(v))
      : String(waarde ?? '').split('\n')
    const seen = new Set<string>()
    const uit: string[] = []
    for (const r of ruw) {
      const v = r.trim().toLowerCase()
      if (!v || seen.has(v)) continue
      seen.add(v)
      uit.push(v)
    }
    return uit
  }
  return typeof waarde === 'string' ? waarde : String(waarde ?? '')
}

/** Valideer een inkomende waarde uit de UI. Geeft null bij onbekende sleutel. */
export function valideerInstelling(sleutel: string, waarde: unknown): InstellingWaarde | null {
  const def = defsBySleutel.get(sleutel)
  if (!def) return null
  return normaliseer(def, waarde)
}

/**
 * Lees de instellingen voor een administratie. Werkt met zowel de gewone
 * (RLS-)client als de admin-client, zodat cron-jobs dezelfde waarden zien.
 * Ontbrekende of kapotte rijen vallen terug op de default.
 */
export async function getInstellingen(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  administratieId: string,
): Promise<InstellingWaarden> {
  const waarden = standaardInstellingen()
  if (!administratieId) return waarden

  const { data } = await supabase
    .from('instellingen')
    .select('sleutel, waarde')
    .eq('administratie_id', administratieId)

  for (const rij of data || []) {
    const def = defsBySleutel.get(rij.sleutel)
    if (!def) continue // instelling is uit de code verwijderd → negeren
    waarden[rij.sleutel] = normaliseer(def, rij.waarde)
  }
  return waarden
}

// Kleine getypeerde helpers zodat aanroepers geen casts hoeven te schrijven.
export function bool(w: InstellingWaarden, sleutel: string): boolean {
  return w[sleutel] === true
}
export function num(w: InstellingWaarden, sleutel: string): number {
  const v = w[sleutel]
  return typeof v === 'number' ? v : Number(defsBySleutel.get(sleutel)?.standaard ?? 0)
}
export function tekst(w: InstellingWaarden, sleutel: string): string {
  const v = w[sleutel]
  return typeof v === 'string' ? v : String(defsBySleutel.get(sleutel)?.standaard ?? '')
}
export function lijst(w: InstellingWaarden, sleutel: string): string[] {
  const v = w[sleutel]
  if (Array.isArray(v)) return v
  const std = defsBySleutel.get(sleutel)?.standaard
  return Array.isArray(std) ? [...std] : []
}
