import { getAgendaItems, getAfspraken, getRelaties, getLeads, getProjecten, getVrijeDagen, getMedewerkers } from '@/lib/actions'
import { AgendaTabsView } from './agenda-tabs-view'

export const revalidate = 20

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const [agendaItems, afspraken, relaties, leads, projecten, vrijeDagenData, medewerkers] = await Promise.all([
    getAgendaItems(),
    getAfspraken(),
    getRelaties(),
    getLeads(),
    getProjecten(),
    getVrijeDagen(),
    getMedewerkers(),
  ])

  return (
    <AgendaTabsView
      initialTab={tab === 'vrije-dagen' ? 'vrije-dagen' : 'agenda'}
      agendaProps={{ agendaItems, afspraken, relaties, leads, projecten }}
      vrijeDagenProps={{
        items: vrijeDagenData.items as never[],
        rol: vrijeDagenData.rol,
        magGoedkeuren: vrijeDagenData.magGoedkeuren,
        eigenMedewerkerId: vrijeDagenData.eigenMedewerkerId,
        medewerkers: medewerkers.map(m => ({ id: m.id as string, naam: (m.naam as string) || 'Onbekend', kleur: (m.kleur as string) || undefined })),
      }}
    />
  )
}
