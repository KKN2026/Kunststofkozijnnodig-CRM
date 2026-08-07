// TIJDELIJK — rebrand-aankondiging.
//
// Deze melding staat voorlopig standaard op elke offerte-PDF (banner bovenaan,
// zie src/lib/pdf/offerte-template.tsx) én in elke offerte-mail (regel onder de
// begroeting, zie getOfferteEmailDefaults in src/lib/actions.ts).
//
// Verwijderen zodra de naamswijziging niet meer aangekondigd hoeft te worden:
// haal dit bestand weg en de twee verwijzingen ernaar (offerte-template.tsx en
// actions.ts). Losse module zonder @react-pdf-afhankelijkheid, zodat de
// server-action-bundel niet onnodig de PDF-renderer inlaadt.
export const NAAM_WIJZIGING_MELDING =
  'Let op: wij zijn van naam veranderd. Rebu Kozijnen gaat vanaf nu verder onder de naam Kunststofkozijnnodig.nl.'
