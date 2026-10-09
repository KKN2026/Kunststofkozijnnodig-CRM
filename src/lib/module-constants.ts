// Losstaand van rechten.ts (dat server-only code importeert) zodat deze
// lijst ook in client components (zoals het toegang-paneel bij een
// medewerker) gebruikt kan worden.
export const TOEGEEFBARE_MODULES: { key: string; label: string }[] = [
  { key: '/relatiebeheer', label: 'Relatiebeheer' },
  { key: '/leads', label: 'Leads' },
  { key: '/offertes', label: 'Offertes & Orders' },
  { key: '/offertes/concepten', label: 'Concept offertes' },
  { key: '/facturatie', label: 'Facturatie' },
  { key: '/producten', label: 'Producten' },
  { key: '/projecten', label: 'Verkoopkansen' },
  { key: '/medewerkers', label: 'Medewerkers' },
  { key: '/email', label: 'E-mail' },
  { key: '/faalkosten', label: 'Faalkosten' },
  { key: '/rapportages', label: 'Rapportages' },
  { key: '/offerte-dashboard', label: 'Offerte-dashboard' },
  { key: '/logboek', label: 'Logboek' },
  { key: '/archief', label: 'Archief' },
  { key: '/instellingen', label: 'Instellingen' },
]
