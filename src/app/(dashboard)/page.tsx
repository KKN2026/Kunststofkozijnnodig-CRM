import { getDashboardData, getMedewerkerDashboardData, getProjecten } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import { DashboardView } from './dashboard-view'
import { MedewerkerDashboard } from './medewerker-dashboard'

// Meest bezochte pagina van het CRM — korte cache voorkomt dat elke
// paginaload alle dashboardquery's opnieuw uitvoert (zelfde patroon als
// andere lijstpagina's).
export const revalidate = 15

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let rol = 'gebruiker'
  if (user) {
    const { data: profiel } = await supabase.from('profielen').select('rol').eq('id', user.id).single()
    if (profiel?.rol) rol = profiel.rol
  }

  // De 'taken vragen om opvolging'-banner staat op de taken-pagina, niet hier.
  if (rol === 'medewerker') {
    const medewerkerData = await getMedewerkerDashboardData()
    return <MedewerkerDashboard data={medewerkerData} />
  }

  const [data, projecten] = await Promise.all([getDashboardData(), getProjecten()])

  // Open verkoopkansen (actief + on hold) per medewerker: aantal + offertewaarde.
  // Hergebruikt getProjecten() (dezelfde bron als de verkoopkansen-pagina) i.p.v.
  // de al omvangrijke getDashboardData()-query verder uit te breiden.
  const openProjecten = projecten.filter(p => p.status === 'actief' || p.status === 'on_hold')
  const perMedewerkerMap = new Map<string, { naam: string; aantal: number; waarde: number }>()
  for (const p of openProjecten) {
    const naam = p.medewerker?.naam || 'Niet toegewezen'
    if (!perMedewerkerMap.has(naam)) perMedewerkerMap.set(naam, { naam, aantal: 0, waarde: 0 })
    const entry = perMedewerkerMap.get(naam)!
    entry.aantal++
    entry.waarde += p.laatste_offerte_bedrag || 0
  }
  const verkoopkansenPerMedewerker = [...perMedewerkerMap.values()].sort((a, b) => b.waarde - a.waarde)

  // Trend: nieuwe verkoopkansen per medewerker, laatste 6 maanden (op
  // aanmaakdatum, alle statussen) — zelfde berekening als op /projecten.
  const MAAND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  const nu = new Date()
  const laatste6Maanden = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(nu.getFullYear(), nu.getMonth() - (5 - i), 1)
    return { sleutel: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MAAND_KORT[d.getMonth()] }
  })
  const namenPerMaand = [...new Set(projecten.map(p => p.medewerker?.naam || 'Niet toegewezen'))].sort()
  const verkoopkansenPerMedewerkerPerMaand = namenPerMaand.map(naam => ({
    naam,
    maanden: laatste6Maanden.map(({ sleutel }) => {
      const inMaand = projecten.filter(p => (p.medewerker?.naam || 'Niet toegewezen') === naam && (p.created_at || '').slice(0, 7) === sleutel)
      return { aantal: inMaand.length, waarde: inMaand.reduce((s, p) => s + (p.laatste_offerte_bedrag || 0), 0) }
    }),
  }))

  return (
    <DashboardView
      data={data}
      verkoopkansenPerMedewerker={verkoopkansenPerMedewerker}
      verkoopkansenPerMedewerkerPerMaand={verkoopkansenPerMedewerkerPerMaand}
      laatste6Maanden={laatste6Maanden}
    />
  )
}
