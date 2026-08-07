// Gedeelde rekenlogica voor het offerte-dashboard: gebruikt door het scherm
// én door de PDF-rapportage (api/pdf/offerte-dashboard), zodat beide exact
// dezelfde cijfers laten zien en er maar één plek is om te onderhouden.
import type { OfferteDashboardRij } from '@/lib/actions'

export type DashboardPeriode = '30' | '90' | 'jaar'

export const dashboardPeriodeLabels: Record<DashboardPeriode, string> = {
  '30': 'Laatste 30 dagen',
  '90': 'Laatste 90 dagen',
  jaar: 'Dit jaar',
}

export interface StatusTelling {
  totaal: number
  akkoord: number
  afgewezen: number
  openstaand: number
}

export function telStatussen(rijen: OfferteDashboardRij[]): StatusTelling {
  const t: StatusTelling = { totaal: rijen.length, akkoord: 0, afgewezen: 0, openstaand: 0 }
  for (const r of rijen) {
    if (r.status === 'geaccepteerd') t.akkoord++
    else if (r.status === 'afgewezen') t.afgewezen++
    else t.openstaand++
  }
  return t
}

// Conversie = akkoord als aandeel van wat beslist is (akkoord + afgewezen).
// Openstaande offertes tellen niet mee: daar is nog niets over te zeggen.
export function conversiePct(t: StatusTelling): number | null {
  const beslist = t.akkoord + t.afgewezen
  return beslist > 0 ? Math.round((t.akkoord / beslist) * 100) : null
}

// Grens van de gekozen periode plus een even lang venster ervoor, voor de
// vergelijking met de vorige periode.
export function periodeVenster(periode: DashboardPeriode): { vanaf: number; vorigeVanaf: number } {
  const nu = Date.now()
  const dag = 24 * 60 * 60 * 1000
  if (periode === 'jaar') {
    const start = new Date(new Date().getFullYear(), 0, 1).getTime()
    return { vanaf: start, vorigeVanaf: start - (nu - start || dag) }
  }
  const dagen = periode === '30' ? 30 : 90
  return { vanaf: nu - dagen * dag, vorigeVanaf: nu - 2 * dagen * dag }
}

// 'onbekend' matcht rijen zonder herkomst, zodat die niet onzichtbaar worden.
export function matchtHerkomst(r: OfferteDashboardRij, filter: string): boolean {
  return filter === 'alle' || (filter === 'onbekend' ? !r.herkomst : r.herkomst === filter)
}

// Gemiddelde doorlooptijd van versturen tot beslissing, in dagen.
export function gemiddeldeDoorlooptijdDagen(rijen: OfferteDashboardRij[]): number | null {
  const duren = rijen
    .filter(r => r.beslistOp && r.verstuurdOp)
    .map(r => (new Date(r.beslistOp!).getTime() - new Date(r.verstuurdOp!).getTime()) / (24 * 60 * 60 * 1000))
    .filter(d => d >= 0)
  if (duren.length === 0) return null
  return duren.reduce((a, b) => a + b, 0) / duren.length
}
