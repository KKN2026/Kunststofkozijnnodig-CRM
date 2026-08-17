import { getFacturen, getInkoopfacturen, getUren, getConversieFunnelDashboard, getMedewerkers } from '@/lib/actions'
import { RapportagesView } from './rapportages-view'

export const revalidate = 15

export default async function RapportagesPage() {
  const [facturen, inkoopfacturen, uren, funnel, medewerkers] = await Promise.all([
    getFacturen(),
    getInkoopfacturen(),
    getUren(),
    getConversieFunnelDashboard(),
    getMedewerkers(),
  ])
  return <RapportagesView facturen={facturen} inkoopfacturen={inkoopfacturen} uren={uren} funnel={funnel} medewerkers={medewerkers} />
}
